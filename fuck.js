import path from "node:path";
import { YtDlp } from "ytdlp-nodejs";

const YtInstance = new YtDlp({
  binaryPath: "/home/chen/.local/bin/yt-dlp"
});

try {
  const result = await YtInstance.downloadAsync(
    "https://www.youtube.com/watch?v=qCg-WfAT65Q",
    {
      debugPrintCommandLine: true,
      verbose: "vvv",
      output: path.join(process.cwd(), "cache", "testing", "output.mp3"),
      format: {
        filter: "mergevideo",
        quality: 96_000,
        type: "mp4"
      },
      progress: true,
      onProgress: (p) => {
        console.log(p);
      }
    },
  );
  console.log(result);
} catch (error) {
  console.log(error);
}