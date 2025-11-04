import path from "node:path";
import { dirExists } from "../utils/fs.js";
import logger from "../utils/logger.js";
import type Floxy from "./Floxy.js";
import * as Media from "../utils/media.js";
import { promises as fsp } from "node:fs";
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
      // Notes to store about this particular cache, will be stored to the cache_log, not directly to the cache, so we have consistency
      extra?: Record<string, string>;
    }
  ) {
    // no dont do this probably especially if its different encoding data??? i dunno
    const existing = await this.getByUrl(url);
    if (existing) return existing;

    let profile = Media.getProfile(options.reencode?.profile);
    if (options.reencode && !profile) {
      throw new Media.MediaProfileError(options.reencode.profile);
    }
    if (!profile)
      profile = Media.getProfile("AUDIO");

    if (options.reencode?.bitrate && !Media.validateProfileBitrate(options.reencode.profile || "AUDIO", options.reencode.bitrate)) {
      throw new Media.MediaBitrateOutOfRangeError(
        options.reencode.profile || "AUDIO",
        options.reencode.bitrate,
      );
    }


    const entry = new MediaCacheEntry(this.floxy, this, {
      id: crypto.randomUUID(),
      url,
      extension: profile?.format,
      reencode: {
        profile: options.reencode?.profile as keyof typeof Media.PROFILES,
        bitrate: options.reencode?.bitrate
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ttl: options.ttl || 3600,
      status: MediaQueueStatus.PENDING,
    });

    this.cache.set(entry.id, entry);
    return entry;
  }

  public resetTimeout(interval: number) {
    clearTimeout(this._queueTimeout);
    this._queueTimeout = setInterval(this.processQueue, interval);
  }

  private processQueue = async () => {
    const processingCount = Array.from(this.cache.values()).filter(
      (e) => e.status === MediaQueueStatus.PROCESSING
    ).length;

    if (processingCount >= this.maxConcurrentProcesses) return;

    const pendingEntries = Array.from(this.cache.values()).filter(
      (e) => e.status === MediaQueueStatus.PENDING
    );

    for (const entry of pendingEntries) {
      if (processingCount >= this.maxConcurrentProcesses) break;

      if (entry.status !== MediaQueueStatus.PENDING) continue;

      this.processEntry(entry);
    }

    void this.calculateCounts();
  }

  private async processEntry(entry: MediaCacheEntry) {
    entry.status = MediaQueueStatus.PROCESSING;
    entry.updatedAt = Date.now();
    
    try {
      logger.info(`Processing media cache entry ${entry.id} for URL ${entry.url}`, {
        
      });

      const profile = Media.getProfile(entry.reencode.profile) || Media.getProfile("AUDIO");

      // yt-dlp and ffmpeg processing would go here
      const result = await this.floxy.ytdlp.downloadAsync(entry.url, {
        format:
          profile.type === "video"
            ? {
                type: profile.format as Media.VIDEO_PROFILE_FORMATS,
                filter: "mergevideo",
                quality: (entry.reencode.bitrate || profile.bitrate.default) as 0,
              }
            : {
                type: profile.format as Media.AUDIO_PROFILE_FORMATS,
                filter:
                  "audioonly",
                quality: (entry.reencode.bitrate || profile.bitrate.default) as 0,
              },
        
        output: path.join(
          this.floxy.config.cacheFolder,
          entry.id,
          `output.${profile.format}`
        ),
        debugPrintCommandLine: true,
        noAbortOnError: true,
        abortOnError: false, 
        embedMetadata: true,
      });
      await fsp.writeFile(
        path.join(this.cacheFolder, entry.id, "log.txt"),
        result
      );

      // on success
      entry.status = MediaQueueStatus.COMPLETED;
      entry.updatedAt = Date.now();
      await entry.writeToDb();
    } catch (_error) {
      logger.error("Media cache failed", _error);
      console.log(_error);
      entry.status = MediaQueueStatus.FAILED;
      entry.updatedAt = Date.now();
      await entry.writeToDb();
    }
  }

  
  private async calculateCounts() {
    this.cacheCounts = {
      PENDING: this.cache.values().filter(e => e.status === MediaQueueStatus.PENDING).toArray().length,
      PROCESSING: this.cache.values().filter(e => e.status === MediaQueueStatus.PROCESSING).toArray().length,
      COMPLETED: this.cache.values().filter(e => e.status === MediaQueueStatus.COMPLETED).toArray().length,
      FAILED: this.cache.values().filter(e => e.status === MediaQueueStatus.FAILED).toArray().length,
    }
    return this.cacheCounts;
  }

  // Public functions

  public async getByUrl(url: string) {
    return this.cache.values().find((e) => e.url === url);
  }

  public async getById(id: string) {
    return this.cache.get(id);
  }

  public getFriendlyStats() {
    return {
      max_concurrent_processes: this.maxConcurrentProcesses,
      size: this.cache.size,
      counts: this.cacheCounts
    }
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
  extention: string;
  metadata: Record<string, string> = {};
  createdAt: number;
  updatedAt: number;
  liveAt?: number;
  deleted: boolean;
  ttl: number;
  status: MediaQueueStatus;
  // TODO: add extra to the database??? or make extra a part of the log entries?
  // biome-ignore lint/suspicious/noExplicitAny: User can specify any extras that are valid within JSON spec.
  reencode: Record<string, any> & {
    profile?: keyof typeof Media.PROFILES;
    bitrate?: number;
  };;

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
      metadata = {},
      deleted = false,
      status = MediaQueueStatus.PENDING,
      reencode = {},
    }: {
      id: string;
      url: string;
      extension: string;
      metadata?: Record<string, string>;
      createdAt: number;
      updatedAt?: number;
      liveAt?: number;
      deleted?: boolean;
      ttl: number;
      status?: MediaQueueStatus;
      // biome-ignore lint/suspicious/noExplicitAny: see above
      reencode?: {
        profile?: keyof typeof Media.PROFILES;
        bitrate?: number;
      };
    }
  ) {
    this.floxy = floxy;
    this.cacheService = cacheService;
    this.id = id;
    this.url = url;
    this.extention = extension;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt || createdAt;
    this.liveAt = liveAt;
    this.ttl = ttl;
    this.metadata = metadata;
    this.deleted = deleted;
    this.status = status;
    this.reencode = reencode;
  }

  async writeToDb() {
    await this.floxy.database.upsertMediaById(this.id, {
      url: this.url,
      metadata: JSON.stringify(this.metadata),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      ttl: this.ttl,
      deleted: this.deleted,
      status: this.status,
      reencode: JSON.stringify(this.reencode),
      liveAt: this.liveAt,
    })
  }

  async folderExistsOnDisk() {
    return dirExists(path.join(this.cacheService.cacheFolder, this.id));
  }

  async getUrls() {
    return 
  }

  toJSON() {
    return {
      id: this.id,
      url: this.url,
      extension: this.extention,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      liveAt: this.liveAt,
      ttl: this.ttl,
      status: this.status,
      reencode: this.reencode,
      

    };
  }

}

export enum MediaQueueStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}
