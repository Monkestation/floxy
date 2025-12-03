/** biome-ignore-all lint/correctness/noUnreachableSuper: explanation below */
import { type YtDlpOptions, YtDlp as YtDlpOriginal } from "ytdlp-nodejs";

// YtDlpNodeJs tries to set executable permissions on ytdlp,
// and tries to download ffmpeg if it doesn't exist, which we don't want.
// So, this class exists as a "factory" to skip that code
// while doing the variable assigns it does before all that crap
export class YtDlp extends YtDlpOriginal {
  static create(opt: YtDlpOptions) {
    const obj = Object.create(YtDlpOriginal.prototype) as YtDlpOriginal;

    // @ts-expect-error see above
    obj.binaryPath = opt?.binaryPath || "";
    // @ts-expect-error see above
    obj.ffmpegPath = opt?.ffmpegPath;

    return obj;
  }

  // Will return an error code with a message based on the yt-dlp error.
  static normalizeError(rawErrorMessage: string): {
    status: number;
    code: string;
    message?: string;
    error?: string;
  } {
    const _rawErrorMessage = rawErrorMessage.toLowerCase();

    if (_rawErrorMessage.includes("youtube:truncated_id"))
      return {
        status: 400,
        code: "INVALID_ID",
        message: "The provided YouTube URL has an complete id (Looks truncated).",
      };
    else if (_rawErrorMessage.includes("youtube:truncated_url"))
      return {
        status: 400,
        code: "INVALID_URL",
        message: "The provided YouTube URL is invalid.",
      };
    else if (_rawErrorMessage.includes("account has been terminated"))
      return {
        status: 404,
        code: "VIDEO_TERMINATED",
        message: "The video is no longer available because the source account has been terminated.",
      };
    else if (_rawErrorMessage.includes("sign in to confirm your age"))
      return {
        status: 403,
        code: "ACCESS_DENIED_AGE_RESTRICTED",
        message: "The requested content is restricted and requires authentication which Floxy is unable to provide at this time.",
      };
    else if (_rawErrorMessage.includes("private video"))
      return {
        status: 403,
        code: "ACCESS_DENIED_PRIVATE_VIDEO",
        message: "The requested video is private and cannot be accessed.",
      };
    else
      return {
        status: 500,
        code: "UNKNOWN_YTDLP_ERROR",
        error: rawErrorMessage,
      };
  }
}
