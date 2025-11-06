/** biome-ignore-all lint/suspicious/noExplicitAny: see below */
// Unfournnately, there will be a  lot of anys in this file because
// ytdlp json is messy and not consistent for urls
// this is a delusional metadata parser made by yours truely.
import type Floxy from "./Floxy.js";

export class YtdlpMetadataParser {
  constructor(private floxy: Floxy) {}

  async parseUrl(url: string): Promise<MediaMetadata | MediaMetadata[]> {
    const raw = this.parseYtdlpJson(
      await this.floxy.ytdlp.execAsync(url, { dumpJson: true })
    );

    if (
      (raw._type === "playlist" || Array.isArray(raw.entries)) &&
      raw.entries?.length
    ) {
      return raw.entries.map((entry: any) => this.normalizeEntry(entry));
    }

    return this.normalizeEntry(raw);
  }

  private normalizeEntry(raw: any): MediaMetadata {
    const title = raw.title || "Unknown Title";
    const artist = raw.artist || raw.uploader || null;

    const cleanTitle = this.stripArtistPrefix(
      raw.title || raw.track || "Unknown Title",
      artist
    );
    console.log(cleanTitle, title, artist);

    let albumArtist: string[] | null = null;

    if (Array.isArray(raw.album_artist)) {
      albumArtist = [
        ...new Set(
          (raw.album_artist as string[]).map((a) => a.trim()).filter(Boolean)
        ),
      ];
    } else if (typeof raw.album_artist === "string") {
      albumArtist = raw.album_artist
        .split(",")
        .map((a: string) => a.trim())
        .filter(Boolean);
    } else if (artist) {
      albumArtist = [artist];
    }

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

  // normalize title and track: remove "Artist - " prefix
  private stripArtistPrefix(
    val: string | null,
    artist: string | null
  ): string | null {
    if (!val || !artist) return val;

    const prefix = `${artist} - `;
    if (val.toLowerCase().startsWith(prefix.toLowerCase())) {
      let newVal = val;
      while (newVal.toLowerCase().startsWith(prefix.toLowerCase())) {
        newVal = newVal.slice(prefix.length).trim();
      }
      return newVal;
    }
    return val;
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
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
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
