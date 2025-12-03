/** biome-ignore-all lint/suspicious/noExplicitAny: see below */
// Unfournnately, there will be a  lot of anys in this file because
// ytdlp json is messy and not consistent for urls
// this is a delusional metadata parser made by yours truely.
import logger from "../utils/logger.js";
import type Floxy from "./Floxy.js";

export class YtdlpMetadataParser {
  constructor(private floxy: Floxy) {}

  async parseUrl(url: string, dontCleanTitle = false): Promise<MediaMetadata | MediaMetadata[]> {
    const raw = this.parseYtdlpJson(
      await this.floxy.ytdlp.execAsync(url, {
        dumpJson: true,
        noDownload: true,
        additionalOptions: this.floxy.config.ytdlpExtraArgs ? this.floxy.config.ytdlpExtraArgs.split(" ") : [],
      }),
    );

    if (!raw) {
      throw new Error("No data returned from yt-dlp");
    }

    if ((raw._type === "playlist" || Array.isArray(raw.entries)) && raw.entries?.length) {
      return raw.entries.map((entry: any) => this.normalizeEntry(entry, dontCleanTitle));
    }

    return this.normalizeEntry(raw, dontCleanTitle);
  }

  private detectArtistFromTitle(title: string): string | null {
    const separators = [" - ", " – ", " — ", ":", " | "];

    for (const sep of separators) {
      if (title.includes(sep)) {
        const [artistRaw] = title.split(sep) as [string];
        const cleaned = artistRaw.trim();

        // ignore rndom shit people put at the beginning of titles like "[OFFICIAL MUSIC VIDEO]" i hate you
        if (cleaned.length > 0 && !cleaned.startsWith("[") && !cleaned.startsWith("(")) {
          return cleaned;
        }
      }
    }

    return null;
  }

  private normalizeEntry(raw: any, dontCleanTitle = false): MediaMetadata {
    const title = raw.title || "Unknown Title";
    let artist: string | null = null;
    let albumArtist: string[] | null = null;

    const detectedArtist = this.detectArtistFromTitle(raw.title || "");

    if (this.isOfficialMusicChannel(raw)) {
      artist = raw.artist || raw.uploader || "null";
      logger.debug(`Detected official music channel uploader "${raw.uploader}" as artist "${artist}"`);
    } else {
      if (detectedArtist) {
        artist = detectedArtist;
      } else if (raw.artist) {
        artist = raw.artist;
      } else if (raw.uploader && title.toLowerCase().includes(raw.uploader.toLowerCase())) {
        artist = raw.uploader;
      }
    }

    if (!artist && detectedArtist) {
      logger.debug(`Falling back to detected artist "${detectedArtist}" from title "${raw.title}"`);
      artist = detectedArtist;
    } else if (!artist) {
      artist = raw.artist || raw.uploader || null;
    }

    if (Array.isArray(raw.album_artist)) {
      albumArtist = [...new Set((raw.album_artist as string[]).map(a => a.trim()).filter(Boolean))];
    } else if (typeof raw.album_artist === "string") {
      albumArtist = raw.album_artist
        .split(",")
        .map((a: string) => a.trim())
        .filter(Boolean);
    } else if (artist) {
      albumArtist = [artist];
    }

    const cleanTitle = dontCleanTitle ? title : this.stripArtistPrefix(raw.title || raw.track || "Unknown Title", artist);

    return {
      title: cleanTitle ?? title,
      artist,
      album: raw.album || null,
      albumArtist,
      year: raw.release_year ?? null,
      genre: raw.tags ?? [],
      duration: raw.duration ?? null,
      url: raw.webpage_url || raw.original_url || null,
    };
  }

  private stripArtistPrefix(val: string | null, artist: string | null): string | null {
    if (!val) return val;

    let cleaned = this.cleanJunkFromTitle(val);

    if (!artist) return cleaned;

    const prefix = `${artist} - `;

    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      while (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
        cleaned = cleaned.slice(prefix.length).trim();
      }
    }

    cleaned = this.cleanJunkFromTitle(cleaned);

    return cleaned || val;
  }

  private isOfficialMusicChannel(raw: any): boolean {
    const uploader = raw.uploader || "";
    if (!uploader) return false;

    if (/- topic$/i.test(uploader)) return true;

    if (raw.channel_id?.startsWith("UC")) {
      if (raw.artist && uploader.toLowerCase().includes(raw.artist.toLowerCase())) {
        return true;
      }
    }

    if (raw.extractor_key === "YoutubeMusic" || raw.extractor_key === "YoutubeArtist") {
      return true;
    }

    return false;
  }

  private cleanJunkFromTitle(val: string) {
    if (!val) return val;
    const blacklist = new Set([
      "official",
      "video",
      "music",
      "audio",
      "hd",
      "1080p",
      "4k",
      "free",
      "download",
      "full",
      "album",
      "visualizer",
      "lyric",
      "lyrics",
      "remastered",
      "remaster",
      "clip",
      "cover",
      "audio-only",
      "stream",
      "snippet",
      "teaser",
      "hq",
      "mv",
      "mv.",
      "prod",
      "prod.",
      "produced",
      "instrumentalversion",
    ]);

    // tokens that, if present, mean we should keep the bracketed piece
    const keepTokens = new Set([
      "feat",
      "ft",
      "featuring",
      "remix",
      "live",
      "mix",
      "edit",
      "version",
      "extended",
      "acoustic",
      "instrumental",
    ]);

    const bracketPattern = /[\(\[]\s*([^\])]+?)\s*[\)\]]/gi;
    let out = val.replace(bracketPattern, (_, inner) => {
      const normalized = inner
        .toLowerCase()
        .replace(/[^\w&+#@'’.\- ]+/g, " ")
        .trim();
      if (!normalized) return "";

      const words = normalized.split(/\s+/).filter(Boolean);

      // get rid of "producer" tags
      if (words.some((w: string) => w.replace(/\W/g, "").startsWith("prod"))) {
        return ""; // ALWAYS delete producer tags
      }

      // keep tokens
      for (const w of words) {
        if (keepTokens.has(w.replace(/\W/g, ""))) {
          return `(${inner})`;
        }
      }

      const allBlacklisted = words.every((w: string) => {
        const wclean = w.replace(/[^\w]/g, "");
        return blacklist.has(wclean) || /^\d{3,4}p$/.test(wclean) || /^[0-9]+k$/.test(wclean);
      });

      return allBlacklisted ? "" : `(${inner})`;
    });

    // Remove standalone trailing quality/format tokens like "HD", "1080p", "- Official Video"
    out = out.replace(/(?:[-–—|:]\s*)?(?:hd|audio|video|official|official video|official music video|1080p|720p|4k|320kbps|mp3)\s*$/i, "");

    // collapse whitespace and stray punctuation
    out = out.replace(/\s{2,}/g, " ").trim();
    out = out.replace(/[-–—|:()\[\]]{2,}/g, " ").trim();
    out = out.replace(/\s*[-–—|:]\s*$/g, "").trim();

    return out;
  }

  private parseYtdlpJson(raw: string): any {
    raw = raw.trim();

    try {
      const parsed = JSON.parse(raw);
      if (parsed._type === "playlist" && Array.isArray(parsed.entries)) {
        return parsed;
      }
      return parsed;
    } catch {
      // maybe multiple JSON lines??
      const lines = raw
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      if (lines.length === 1) return lines[0];
      if (lines.length > 1) {
        return { _type: "multi", entries: lines };
      }
      return null;
    }
  }
}

export interface MediaMetadata {
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string[] | null;
  year: number | null;
  genre: string[];
  duration: number | null;
  url: string;
}
