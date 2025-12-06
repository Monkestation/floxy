import { randomUUID } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { ArgsOptions, VideoFormat, VideoProgress } from "ytdlp-nodejs";
import config from "../config.js";
import { dirExists, statExists } from "../utils/fs.js";
import logger from "../utils/logger.js";
import * as Media from "../utils/media.js";
import type Floxy from "./Floxy.js";
import type { MediaMetadata } from "./MetadataParser.js";
import { inspect } from "node:util";

/**
What this does:
  - Manages a cache of media files downloaded and processed via ytdlp and ffmpeg
  - Keeps track of cache entries, their status, and metadata
  - Provides methods to enqueue new media for caching, check status, and retrieve cached media
  - Periodically processes the queue of pending media cache entries

Flow:
  - When a new media URL is requested to be cached, check if it already exists in the cache
  - If not, create a new cache entry with status "pending" and add it to the queue
  - A background process periodically checks the queue for pending entries
  - For each pending entry, it starts downloading and processing the media using ytdlp and ffmpeg
  - Updates the status of the entry as it progresses (processing, completed, failed)
  - Once completed, stores the processed media in the cache folder and updates metadata
*/

export default class MediaCacheService {
  public floxy: Floxy;
  cacheFolder: string;

  // @ts-expect-error FUCK YOU IT'S SET IN this.resetTimeout
  private _queueTimeout: NodeJS.Timeout;
  private lastCacheCheck: number = 0;
  private maxConcurrentProcesses = 2;
  private cache: Map<string, MediaCacheEntry> = new Map();

  private cacheCounts = {} as Record<keyof typeof MediaQueueStatus, number>;

  constructor(floxy: Floxy, cacheFolder: string) {
    this.floxy = floxy;
    this.cacheFolder = cacheFolder;
    this.resetTimeout(1000);
    this.calculateCounts();
  }

  public async enqueue(
    url: string,
    options: {
      ttl?: number;
      // profile to reencode with (for audio it always defaults to mp3@256kbps)
      reencode?: {
        profile: string;
        bitrate?: number;
      };
      dontCleanTitle?: boolean,
      // Notes to store about this particular cache, will be stored to the cache_log, not directly to the cache, so we have consistency
      extra?: Record<string, string>;
    },
  ) {
    // no dont do this probably especially if its different encoding data??? i dunno
    const existing = await this.getByUrl(url);

    let profile = Media.getProfile(options.reencode?.profile);
    if (options.reencode && !profile) {
      throw new Media.MediaProfileError(options.reencode.profile);
    }
    if (!profile) profile = Media.getProfile("AUDIO");

    if (options.reencode?.bitrate && !Media.validateProfileBitrate(options.reencode.profile || "AUDIO", options.reencode.bitrate)) {
      throw new Media.MediaBitrateOutOfRangeError(options.reencode.profile || "AUDIO", options.reencode.bitrate);
    }

    if (existing) {
      const fileState = await existing.getFileState();

      if (fileState & MediaEntryFileState.MISSING) {
        logger.info(`Media files for ${existing.id} are missing. Resetting status to PENDING.`);
        existing.status = MediaQueueStatus.PENDING;
        existing.updatedAt = Date.now();
        existing.error = null;
        existing.progress = undefined;
        void existing.writeToDb();
      } else if (
        options.reencode &&
        (existing.reencode.profile !== options.reencode.profile || existing.reencode.bitrate !== options.reencode.bitrate)
      ) {
        logger.info(`Reencode parameters for ${existing.id} differ. Adding forcerencode flag.`);
        existing.reencode = {
          ...existing.reencode,
          profile: options.reencode.profile as keyof typeof Media.PROFILES,
          bitrate: options.reencode.bitrate,
        };
        existing.extension = profile.format;
        existing.forcerencode = true;
        existing.status = MediaQueueStatus.PENDING;
        existing.updatedAt = Date.now();
        void existing.writeToDb();
      } else if (existing.deleted) {
        logger.info(`Media cache entry ${existing.id} was marked as deleted. Restoring.`);
        await fsp.rename(existing.deletedPath, existing.cachedPath).catch(err => {
          logger.error(`Failed to rename media cache entry ${existing.id}: ${err}`);
        });
        existing.deleted = false;
        existing.updatedAt = Date.now();
        existing.liveAt = Date.now();
        void existing.writeToDb();
      }

      return existing;
    }

    const entry = new MediaCacheEntry(this.floxy, this, {
      id: crypto.randomUUID(),
      url,
      extension: profile?.format,
      reencode: {
        profile: options.reencode?.profile as keyof typeof Media.PROFILES,
        bitrate: options.reencode?.bitrate,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ttl: options.ttl || 3600,
      status: MediaQueueStatus.PENDING,
    });

    this.cache.set(entry.id, entry);
    void entry.writeToDb();
    return entry;
  }

  public resetTimeout(interval: number) {
    clearTimeout(this._queueTimeout);
    this._queueTimeout = setInterval(this.processQueue, interval);
  }

  private processQueue = async () => {
    this.calculateCounts();

    const processingCount = Array.from(this.cache.values()).filter(
      e => e.status === MediaQueueStatus.DOWNLOADING || e.status === MediaQueueStatus.METADATA,
    ).length;

    if (processingCount >= this.maxConcurrentProcesses) return;

    const pendingEntries = Array.from(this.cache.values()).filter(e => e.status === MediaQueueStatus.PENDING);

    for (const entry of pendingEntries) {
      if (processingCount >= this.maxConcurrentProcesses) break;

      if (entry.status !== MediaQueueStatus.PENDING) continue;

      this.processEntry(entry);
    }

    // rough summary of this garbage:
    // Every 5 minutes we check all items in the database that arent deleted, for ttl expiration
    // and "delete" it (rename it to a different filename with our deletion secret so it isnt accessible anymore),
    // Then, if it gets requested again, we just rename it back to the original filename.
    if (Date.now() - this.lastCacheCheck > 60_000) {
      this.lastCacheCheck = Date.now();
      logger.debug("Checking for expired media cache entries...");
      const expiredEntries = await this.floxy.database.getExpiredMediaEntries();
      for (const dbEntry of expiredEntries) {
        logger.info(`Marking media cache entry ${dbEntry.id} as deleted (expired)`);

        await fsp
          .rename(
            path.join(this.cacheFolder, dbEntry.id, `output.${dbEntry.extension}`),
            path.join(this.cacheFolder, dbEntry.id, `output_deleted_${config.DELETION_SECRET}.${dbEntry.extension}`),
          )
          .catch(err => {
            logger.error(`Failed to rename media cache entry ${dbEntry.id}: ${err}`);
          });

        await this.floxy.database.upsertMediaById(dbEntry.id, {
          deleted: true,
        });

        const cached = this.cache.get(dbEntry.id);
        if (cached) cached.deleted = true;
      }
    }
  };

  private async processEntry(entry: MediaCacheEntry) {
    entry.status = MediaQueueStatus.DOWNLOADING;
    entry.updatedAt = Date.now();
    void entry.writeToDb();

    try {
      logger.info(`Processing media cache entry ${entry.id} for URL ${entry.url}`, {
        reencode: entry.reencode,
      });

      const folderPath = path.join(this.cacheFolder, entry.id);

      const folderExists = await entry.folderExistsOnDisk();
      if (!folderExists) {
        await fsp.mkdir(folderPath, { recursive: true });
      }

      if (folderExists) {
        // TODO: make this its own function for entries, like entry.getDeletedPath() or something
        const fileState = await entry.getFileState();

        if (fileState & MediaEntryFileState.AVAILABLE && fileState & MediaEntryFileState.DELETED) {
          // the fuck??...
          await fsp.unlink(entry.cachedPath);
        }

        if (fileState & MediaEntryFileState.DELETED) {
          // rename it back
          await fsp.rename(entry.deletedPath, entry.cachedPath);
        }

        if (fileState & MediaEntryFileState.AVAILABLE && !entry.forcerencode) {
          logger.info(`Media cache entry ${entry.id} already exists on disk, skipping download.`);
          entry.status = MediaQueueStatus.COMPLETED;
          return;
        }

        if (entry.forcerencode) {
          logger.info(`Media cache entry ${entry.id} has force reencode flag set, proceeding with reencoding.`);
          await fsp.unlink(entry.cachedPath).catch(err => {
            logger.warn(`Failed to delete existing file for force reencode of ${entry.id}: ${err}`);
          });
        }
      }

      const profile = Media.getProfile(entry.reencode.profile) || Media.getProfile("AUDIO");

      // yt-dlp and ffmpeg processing would go here
      const opts = buildYtDlpOptions(entry, profile, path.join(this.cacheFolder, entry.id));
      logger.debug(`Built yt-dlp options for ${entry.id} - ${inspect(opts)}`);
      const result = await this.floxy.ytdlp.downloadAsync(entry.url, {
        debugPrintCommandLine: true,
        noAbortOnError: true,
        abortOnError: false,
        progress: true,
        ffmpegLocation: this.floxy.config.ffmpegPath,
        onProgress: p => {
          entry.progress = p;
        },
        cookies: this.floxy.config.ytdlpCookiesPath,
        additionalOptions: this.floxy.config.ytdlpExtraArgs ? this.floxy.config.ytdlpExtraArgs.split(" ") : [],
        ...opts,
      });
      await fsp.writeFile(path.join(this.cacheFolder, entry.id, "log.txt"), result);

      entry.status = MediaQueueStatus.METADATA;

      // set metadata
      const metadata = (await this.floxy.metadataParser.parseUrl(entry.url)) as MediaMetadata;
      entry.metadata = metadata;

      // on success
      entry.status = MediaQueueStatus.COMPLETED;
      entry.progress = undefined;
      entry.updatedAt = Date.now();
      entry.liveAt = Date.now();
      void entry.writeToDb();
    } catch (_error) {
      const errorReference = randomUUID();
      logger.error("Media cache failed", {
        error: _error,
        reference: errorReference,
      });
      console.error(`Error reference: ${errorReference}`, _error);
      entry.status = MediaQueueStatus.FAILED;
      entry.updatedAt = Date.now();
      entry.error = `An error occurred during processing. Reference ID: ${errorReference}`;
      void entry.writeToDb();
    }
  }

  private calculateCounts() {
    this.cacheCounts = {
      PENDING: this.cache
        .values()
        .filter(e => e.status === MediaQueueStatus.PENDING)
        .toArray().length,
      DOWNLOADING: this.cache
        .values()
        .filter(e => e.status === MediaQueueStatus.DOWNLOADING)
        .toArray().length,
      METADATA: this.cache
        .values()
        .filter(e => e.status === MediaQueueStatus.METADATA)
        .toArray().length,
      COMPLETED: this.cache
        .values()
        .filter(e => e.status === MediaQueueStatus.COMPLETED)
        .toArray().length,
      FAILED: this.cache
        .values()
        .filter(e => e.status === MediaQueueStatus.FAILED)
        .toArray().length,
      UNKNOWN: this.cache
        .values()
        .filter(e => Object.values(MediaQueueStatus).includes(e.status as MediaQueueStatus) === false)
        .toArray().length,
    };
  }

  // Public functions

  public async getByUrl(url: string) {
    const inCache = this.cache.values().find(e => e.url === url);
    if (!inCache) {
      const foundEntry = await this.floxy.database.getMediaEntryByUrl(url);
      if (foundEntry) {
        const entry = MediaCacheEntry.fromDb(this.floxy, foundEntry);
        this.cache.set(entry.id, entry);
        return entry;
      }
    }

    return inCache;
  }

  public async getById(id: string): Promise<MediaCacheEntry | undefined> {
    const inCache = this.cache.get(id);
    if (!inCache) {
      const foundEntry = await this.floxy.database.getMediaEntryById(id);
      if (foundEntry) {
        const entry = MediaCacheEntry.fromDb(this.floxy, foundEntry);
        this.cache.set(entry.id, entry);
        return entry;
      }
    }

    return inCache;
  }

  public async getAll(page?: number, limit?: number): Promise<MediaCacheEntry[]> {
    const dbEntries = await this.floxy.database.getAllMediaEntries(page, limit);
    const entries: MediaCacheEntry[] = [];
    for (const dbEntry of dbEntries) {
      let entry = this.cache.get(dbEntry.id);
      if (!entry) {
        entry = MediaCacheEntry.fromDb(this.floxy, dbEntry);
        this.cache.set(entry.id, entry);
      }
      entries.push(entry);
    }
    return entries;
  }

  async deleteById(id: string, hard?: "file" | "entry", force?: boolean) {
    const entry = await this.getById(id);

    if (!entry) return;

    if (entry.deleted && !(force ?? false)) return;

    // delete from disk
    // if (hard) {
    //   logger.debug(`Hard deleting media cache entry ${entry.id} from disk.`);
    //   await fsp.rm(path.join(this.cacheFolder, entry.id), {
    //     recursive: true,
    //     force: true,
    //   });
    // } else {
    //   await fsp.rename(entry.cachedPath, entry.deletedPath).catch((err) => {
    //     logger.error(`Failed to rename media cache entry ${entry.id}: ${err}`);
    //   });

    // }
    switch (hard) {
      // @ts-expect-error fallthrough
      // biome-ignore lint/suspicious/noFallthroughSwitchClause: Intentional fallthrough
      case "file":
        logger.debug(`Hard deleting media cache entry ${entry.id} from disk.`);
        await fsp.rm(path.join(this.cacheFolder, entry.id), {
          recursive: true,
          force: true,
        });
      // fallthrough

      case "entry":
        if (hard === "entry") {
          logger.debug(`Hard deleting media cache entry ${entry.id} from disk and database.`);
          await this.floxy.database.deleteMediaById(entry.id);
          this.cache.delete(entry.id);
          return true;
        }
        break;

      default:
        await fsp.rename(entry.cachedPath, entry.deletedPath).catch(err => {
          logger.error(`Failed to rename media cache entry ${entry.id}: ${err}`);
        });
        break;
    }

    entry.deleted = true;
    void this.floxy.database.upsertMediaById(entry.id, {
      deleted: true,
    });

    return true;
  }

  public getFriendlyStats() {
    return {
      max_concurrent_processes: this.maxConcurrentProcesses,
      size: this.cache.size,
      counts: this.cacheCounts,
    };
  }
}

/**
 * Represents a single media cache entry.
 * Does not have much functionality outside of writing to the database.

 */
class MediaCacheEntry {
  floxy: Floxy;
  cacheService: MediaCacheService;
  id: string;
  url: string;
  extension: string;
  metadata?: MediaMetadata;
  createdAt: number;
  updatedAt: number;
  liveAt?: number;
  deleted: boolean = false;
  ttl: number;
  status: MediaQueueStatus | string;
  error: string | null = null;
  progress?: VideoProgress;
  // TODO: add extra to the database??? or make extra a part of the log entries?
  // biome-ignore lint/suspicious/noExplicitAny: User can specify any extras that are valid within JSON spec.
  reencode: Record<string, any> & {
    profile?: keyof typeof Media.PROFILES;
    bitrate?: number;
  };
  forcerencode: boolean = false;

  constructor(
    floxy: Floxy,
    cacheService: MediaCacheService,
    {
      id,
      url,
      extension,
      createdAt,
      updatedAt,
      liveAt,
      ttl,
      metadata,
      deleted = false,
      status = MediaQueueStatus.PENDING,
      error,
      reencode = {},
    }: {
      id: string;
      url: string;
      extension: string;
      metadata?: MediaMetadata;
      createdAt: number;
      updatedAt?: number;
      liveAt?: number;
      deleted?: boolean;
      ttl: number;
      status?: MediaQueueStatus;
      error?: string | null;
      reencode?: {
        profile?: keyof typeof Media.PROFILES;
        bitrate?: number;
      };
    },
  ) {
    this.floxy = floxy;
    this.cacheService = cacheService;
    this.id = id;
    this.url = url;
    this.extension = extension;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt || createdAt;
    this.liveAt = liveAt;
    this.ttl = ttl;
    this.metadata = metadata;
    this.deleted = deleted;
    this.error = error || null;
    this.status = status;
    this.reencode = reencode;
  }

  static fromDb(floxy: Floxy, dbEntry: DBMediaEntry) {
    return new MediaCacheEntry(floxy, floxy.mediaCacheService, {
      id: dbEntry.id,
      url: dbEntry.url,
      extension: dbEntry.extension,
      metadata: JSON.parse(dbEntry.metadata || "{}"),
      createdAt: dbEntry.createdAt,
      updatedAt: dbEntry.updatedAt,
      liveAt: dbEntry.liveAt || undefined,
      ttl: dbEntry.ttl,
      deleted: !!dbEntry.deleted,
      error: dbEntry.error,
      status: dbEntry.status as MediaQueueStatus,
      reencode: JSON.parse(dbEntry.reencode || "{}"),
    });
  }

  async writeToDb() {
    await this.floxy.database.upsertMediaById(this.id, {
      url: this.url,
      metadata: JSON.stringify(this.metadata),
      extension: this.extension,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      ttl: this.ttl,
      deleted: this.deleted,
      error: this.error,
      status: this.status,
      reencode: JSON.stringify(this.reencode),
      liveAt: this.liveAt,
    });
  }

  async folderExistsOnDisk() {
    return dirExists(path.join(this.cacheService.cacheFolder, this.id));
  }

  async getFileState(): Promise<MediaEntryFileState> {
    const outputPath = this.cachedPath;
    const deletedPath = this.deletedPath;

    const outputExists = await statExists(outputPath);
    const deletedExists = await statExists(deletedPath);

    let state = 0;
    if (outputExists) {
      state |= MediaEntryFileState.AVAILABLE;
    }
    if (deletedExists) {
      state |= MediaEntryFileState.DELETED;
    }
    if (!outputExists && !deletedExists) {
      state |= MediaEntryFileState.MISSING;
    }
    return state;
  }

  get deletedPath() {
    return path.join(this.cacheService.cacheFolder, this.id, `output_deleted_${config.DELETION_SECRET}.${this.extension}`);
  }

  get cachedPath() {
    return path.join(this.cacheService.cacheFolder, this.id, `output.${this.extension}`);
  }

  get directoryPath() {
    return path.join(this.cacheService.cacheFolder, this.id);
  }

  toJSON() {
    return {
      id: this.id,
      url: this.url,
      extension: this.extension,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      liveAt: this.liveAt,
      deleted: this.deleted,
      error: this.error,
      ttl: this.ttl,
      status: this.status,
      reencode: this.reencode,
      progress: this.progress,
      metadata: this.metadata,
    };
  }

  toFastifyJSON() {
    
    return {
      ...this.toJSON(),
      endpoints: this.getEndpoints(),
    }
  }

  getEndpoints(): string[] {
    return config.EXTERNAL_CACHE_ENDPOINTS.map(e =>
      {
        const cachePath = path.posix.join(this.id, `output.${this.extension}`);
        if (!e.endsWith("/")) {
          e += "/";
        }
        return `${e}${cachePath}`;
      },
    );
  }
  IsDoneProcessing() {
    return this.status !== MediaQueueStatus.PENDING && this.status !== MediaQueueStatus.DOWNLOADING && this.status !== MediaQueueStatus.METADATA;
  }

  IsCompleted() {
    return this.status === MediaQueueStatus.COMPLETED;
  }
}

export enum MediaQueueStatus {
  PENDING = "pending",
  DOWNLOADING = "downloading",
  METADATA = "metadata",
  COMPLETED = "completed",
  FAILED = "failed",
  UNKNOWN = "unknown",
}

export enum MediaEntryFileState {
  // File is on disk and available in the cache
  AVAILABLE = 1 << 0,
  // File is on disk but marked as deleted
  DELETED = 1 << 1,
  // Neither the output file nor the deleted file is present on disk
  MISSING = 1 << 2,
}

function buildYtDlpOptions(entry: MediaCacheEntry, profile: Media.EncodingProfile, folderPath: string) {
  const output = path.join(folderPath, `output.${profile.format}`);

  const isVideo = profile.type === "video";

  const format = isVideo ? "bestvideo+bestaudio/best" : "bestaudio/best";

  const ffArgs = [];

  if (profile.type === "video") {
    ffArgs.push(
      "-c:v",
      Media.VIDEO_CODEC_MAP[profile.codec as keyof typeof Media.VIDEO_CODEC_MAP],
      "-crf",
      Media.VIDEO_CRF_DEFAULT[profile.codec as keyof typeof Media.VIDEO_CRF_DEFAULT] || "22",
      "-c:a",
      "aac",
    );
  } else if (profile.type === "audio") {
    ffArgs.push("-vn");

    if (profile.codec === "flac") {
      // lossless: no bitrate
      ffArgs.push("-c:a", "flac");
    } else {
      // biome-ignore lint/style/noNonNullAssertion: lossy profiles always have audio_bitrate
      const bitrate = entry.reencode.bitrate || profile.audio_bitrate!.default;
      ffArgs.push(
        "-c:a",
        Media.AUDIO_CODEC_MAP[profile.codec as keyof typeof Media.AUDIO_CODEC_MAP],
        "-b:a",
        `${Math.floor(bitrate / 1000)}k`,
      );
    }
  }

  return {
    format,
    output,
    embedMetadata: true,
    // because postprocessorArgs is fucked
    postprocessorArgs: {
      FFmpegAudio: ffArgs
    }
  } as ArgsOptions;
}
