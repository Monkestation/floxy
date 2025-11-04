export function validateMimeType(mimeType: string): boolean {
  const mimeTypePattern = /(?<type>\w+)\/(?<subtype>[\w.-]+)(?:\+(?<suffix>[\w.-]+))*(?:\s*;\s*(?<key>[^=]+?)(?:=""?(?<value>[\S.-]+?)""?)?)*$/;
  return mimeTypePattern.test(mimeType);
}
export function decodeMimeTypeWithParams(mimeType: string): { type: string; params: Record<string, string> } | undefined {
  if (!validateMimeType(mimeType)) {
    return undefined;
  }
  const [type, ...paramPairs] = mimeType?.split(";") || [];

  if (!type) { 
    return undefined;
  }
  
  const params: Record<string, string> = {};

  for (const pair of paramPairs) {
    const [key, value] = pair.trim().split("=");
    if (key && value) {
      params[key] = value;
    }
  }

  return { type: type.trim(), params };
}

export const mimeTypeMap = {
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  mid: 'audio/midi',
  midi: 'audio/midi',
  amr: 'audio/amr',
  aiff: 'audio/aiff',

  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  mkv: 'video/x-matroska',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  m4v: 'video/x-m4v',
  "3gp": 'video/3gpp',
  "3g2": 'video/3gpp2',
};

export interface BitrateRange {
  min: number; // bits per second
  max: number;
  default: number;
}

export interface EncodingProfile {
  format: string; // container (mp4, ogg, etc)
  codec: string; // h264, opus,
  type: "video" | "audio";
  bitrate: BitrateRange;
  description?: string;
  // extra?: Record<string, any>;
}

export const VIDEO_PROFILES = {
  "mp4-h264": {
    format: "mp4",
    codec: "h264",
    type: "video",
    bitrate: { min: 500_000, max: 8_000_000, default: 2_000_000 },
    description: "Standard MP4 container with H.264 (AVC) video.",
  } as const,
  "mp4-hevc": {
    format: "mp4",
    codec: "hevc",
    type: "video",
    bitrate: { min: 400_000, max: 6_000_000, default: 1_500_000 },
    description: "MP4 container with HEVC (H.265), efficient compression.",
  } as const,
  "webm-vp9": {
    format: "webm",
    codec: "vp9",
    type: "video",
    bitrate: { min: 300_000, max: 6_000_000, default: 1_200_000 },
    description: "WebM container with VP9 video (modern, open codec).",
  } as const,
  "webm-av1": {
    format: "webm",
    codec: "av1",
    type: "video",
    bitrate: { min: 200_000, max: 5_000_000, default: 1_000_000 },
    description: "WebM container with AV1 (next-gen open codec).",
  } as const,
};

export const AUDIO_PROFILES = {
  mp3: {
    format: "mp3",
    codec: "mp3",
    type: "audio",
    bitrate: { min: 64_000, max: 320_000, default: 192_000 },
    description: "MPEG Layer III audio (legacy but widely supported).",
  } as const,
  "ogg-opus": {
    format: "opus",
    codec: "opus",
    type: "audio",
    bitrate: { min: 48_000, max: 256_000, default: 128_000 },
    description: "Opus in Ogg container (modern, efficient speech/music).",
  } as const,
  "aac-m4a": {
    format: "m4a",
    codec: "aac",
    type: "audio",
    bitrate: { min: 64_000, max: 320_000, default: 192_000 },
    description: "AAC audio in M4A container (used in MP4 and iTunes).",
  } as const,
  flac: {
    format: "flac",
    codec: "flac",
    type: "audio",
    bitrate: { min: 500_000, max: 1_500_000, default: 1_000_000 },
    description: "Lossless FLAC compression (for archival or high quality).",
  } as const,
} ;

export type AUDIO_PROFILE_FORMATS =
  (typeof AUDIO_PROFILES)[keyof typeof AUDIO_PROFILES]["format"];

export type VIDEO_PROFILE_FORMATS =
  (typeof VIDEO_PROFILES)[keyof typeof VIDEO_PROFILES]["format"];

export const PROFILES = {
  ...VIDEO_PROFILES,
  ...AUDIO_PROFILES,
} as const;

export function getProfile(id?: "AUDIO" | "VIDEO" | string): EncodingProfile
export function getProfile(id?: "AUDIO" | "VIDEO" | keyof typeof PROFILES | string): EncodingProfile | undefined {
  if (id === "AUDIO") {
    return AUDIO_PROFILES["mp3"];
  } else if (id === "VIDEO") {
    return VIDEO_PROFILES["mp4-h264"];
  } else {
    return PROFILES[id as keyof typeof PROFILES];
  }
}

export function validateProfileBitrate(profileId: string, bitrate: number): boolean {
  const p = getProfile(profileId);
  if (!p) return false;
  return bitrate >= p.bitrate.min && bitrate <= p.bitrate.max;
}

export function parseBitrate(bitrate: string | number): number {
  // Define a safe maximum bitrate (1 Gbps)
  const MAX_BITRATE_BITS = 1_000_000_000;

  let bits: number;

  if (typeof bitrate === "number") {
    // If the input is already a number, it's assumed to be in bits.
    bits = bitrate;
  } else {
    // Convert the string to lowercase for case-insensitive matching.
    const lowerBitrate = bitrate.toLowerCase().trim();
    const match = lowerBitrate.match(/^(\d+(\.\d+)?)([kmg])$/);

    if (match) {
      const value = parseFloat(match[1]!);
      const unit = match[3];

      switch (unit) {
        case "k": // Kilobits
          bits = value * 1000;
          break;
        case "m": // Megabits
          bits = value * 1000 * 1000;
          break;
        case "g": // Gigabits
          bits = value * 1000 * 1000 * 1000;
          break;
        default:
          // Fallback if regex matched the number but somehow missed the unit
          bits = value;
          break;
      }
    } else {
      // If no unit is found or the format is invalid, attempt to parse the entire string as a number
      bits = parseFloat(lowerBitrate);
    }
  }

  if (Number.isNaN(bits)) {
    return 0;
  }

  return Math.min(bits, MAX_BITRATE_BITS);
}
export const PROFILE_SPECIFIER_REGEX = /([a-z-]+)@((\d+(\.\d+)?)([kmg])?)/i;

export class MediaProfileError extends Error {
  constructor(profile: string) {
    super(`Profile ${profile} is not a valid profile.`);
  }

}
export class MediaBitrateOutOfRangeError extends Error {
  constructor(profile: string, bitrate: number) {
    const {
      bitrate: {
        min: minBitrate,
        max: maxBitrate
      }
    } = getProfile(profile);
    super(`Bitrate ${bitrate} is not a valid bitrate for profile '${profile}' (Min: ${minBitrate} Max: ${maxBitrate}).`);
  }

}