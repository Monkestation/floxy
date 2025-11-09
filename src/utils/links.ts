export enum MediaService {
  YouTube = "YouTube",
  YouTubeMusic = "YouTubeMusic",
  Bandcamp = "Bandcamp",
  Spotify = "Spotify",
  SoundCloud = "SoundCloud",
  Unknown = "Unknown",
}

export enum MediaType {
  Track = "Track",
  Album = "Album",
  EP = "EP",
  Playlist = "Playlist",
  Compilation = "Compilation",
  Unknown = "Unknown",
}

export type IsMultipleMediaType<T extends MediaType> = T extends MediaType.Album | MediaType.EP | MediaType.Playlist | MediaType.Compilation
  ? true
  : false;

export class MediaLink {
  url: string;
  service: MediaService;
  type: MediaType;

  constructor(url: string) {
    this.url = url;
    const info = MediaLink.parseUrl(url);
    this.service = info.service;
    this.type = info.type;
  }

  static parseUrl(url: string): { service: MediaService; type: MediaType } {
    try {
      const u = new URL(url);
      const hostname = u.hostname.toLowerCase();
      const pathname = u.pathname.toLowerCase();
      const searchParams = u.searchParams;
      let type: MediaType | null = null;

      if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
        if (searchParams.has("list") || pathname.includes("/playlist")) {
          return { service: MediaService.YouTube, type: MediaType.Playlist };
        } else if (hostname.includes("music.youtube.com")) {
          return { service: MediaService.YouTubeMusic, type: MediaType.Track };
        }
        return { service: MediaService.YouTube, type: MediaType.Track };
      }

      if (hostname.endsWith("bandcamp.com")) {
        if (pathname.includes("/album/")) type = MediaType.Album;
        if (pathname.includes("/track/")) type = MediaType.Track;
        return {
          service: MediaService.Bandcamp,
          type: type || MediaType.Unknown,
        };
      }

      if (hostname.includes("spotify.com")) {
        if (pathname.includes("/album/")) type = MediaType.Album;
        if (pathname.includes("/track/")) type = MediaType.Track;
        if (pathname.includes("/playlist/")) type = MediaType.Playlist;
        if (pathname.includes("/show/")) type = MediaType.Compilation;
        return {
          service: MediaService.Spotify,
          type: type || MediaType.Unknown,
        };
      }

      if (hostname.includes("soundcloud.com")) {
        const segments = pathname.split("/").filter(Boolean);
        if (segments.length === 2) type = MediaType.Track;
        if (segments.length > 2 && segments[2] === "sets") type = MediaType.Playlist;
        return {
          service: MediaService.SoundCloud,
          type: type || MediaType.Unknown,
        };
      }
      // I cant think of any other platforms that you *could* use (maybe im just not that online).
      // also this is ass but I am bad at thinking since
      // I've been coding this entire commit for the last 9 hours.

      return { service: MediaService.Unknown, type: MediaType.Unknown };
    } catch {
      return { service: MediaService.Unknown, type: MediaType.Unknown };
    }
  }

  normalize() {
    try {
      const u = new URL(this.url);

      // normalize hostname
      let host = u.hostname.toLowerCase();
      if (host.startsWith("www.")) host = host.slice(4);
      if (host === "youtu.be") host = "youtube.com";
      u.hostname = host;

      u.protocol = "https:";

      // platform specific shit, half of this does not apply
      // because you can't. maybe ill add squid.wtf support lmaoo
      switch (host) {
        case "youtube.com":
        case "music.youtube.com":
          u.hostname = "youtube.com";
          // keep watchv and canonical path
          if (u.pathname === "/watch") {
            const videoId = u.searchParams.get("v");
            u.search = videoId ? `v=${videoId}` : "";
          } else {
            u.search = "";
          }
          break;

        case "bandcamp.com":
        case "soundcloud.com":
        case "mixcloud.com":
        case "audiomack.com":
        case "reverbnation.com":
        case "deezer.com":
          u.search = "";
          break;

        case "spotify.com":
        case "music.apple.com":
          ["utm_source", "utm_medium", "utm_campaign", "app", "ls"].forEach(p => {
            u.searchParams.delete(p);
          });
          break;

        default:
          break;
      }

      this.url = u.toString();
      return this.url;
    } catch {
      return this.url;
    }
  }

  isTrack(): boolean {
    return this.type === MediaType.Track;
  }

  isAlbum(): boolean {
    return this.type === MediaType.Album;
  }

  isEP(): boolean {
    return this.type === MediaType.EP;
  }

  isPlaylist(): boolean {
    return this.type === MediaType.Playlist;
  }

  isCompilation(): boolean {
    return this.type === MediaType.Compilation;
  }

  isSingle(): boolean {
    return !(
      this.type === MediaType.Album ||
      this.type === MediaType.EP ||
      this.type === MediaType.Playlist ||
      this.type === MediaType.Compilation
    );
  }
}
