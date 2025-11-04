import path from "node:path";
import { YtDlp } from "ytdlp-nodejs";

const YtInstance = new YtDlp();

try {
  const result = await YtInstance.downloadAsync(
    "https://www.youtube.com/watch?v=qCg-WfAT65Q",
    {
      debugPrintCommandLine: true,
      verbose: true,
      output: path.join(process.cwd(), "cache", "testing", "output.mp3"),
    },
  );
  console.log(result);
} catch (error) {
  console.log(error);
}