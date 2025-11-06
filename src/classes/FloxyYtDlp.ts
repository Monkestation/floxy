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
}
