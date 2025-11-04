import path from "node:path";
import dotenv from "dotenv";
import { BooleanLike, notEmpty } from "./utils/other.js";
import { findFile } from "./utils/fs.js";

dotenv.config({ quiet: true });

const config = {
  HOST: process.env.HOST || "127.0.0.1",
  PORT: Number(process.env.PORT) || 3050,
  JWT_SECRET: process.env.JWT_SECRET ?? "supersecretkey",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "changeme123!",
  SENTRY_DSN: process.env.SENTRY_DSN,
  CACHE_FOLDER: path.resolve(
    process.env.CACHE_FOLDER || path.join(process.cwd(), "cache")
  ),
  /// Separated by commas
  EXTERNAL_CACHE_ENDPOINTS:
    process.env.EXTERNAL_CACHE_ENDPOINTS?.split(",").filter(notEmpty) ?? [],
  YTDLP_COOKIES_PATH: process.env.YTDLP_COOKIES_PATH
    ? await findFile("cookies.txt", [""])
    : await findFile("cookies.txt", [
        process.cwd(),
        path.join(import.meta.dirname, ".."),
      ]),
  LOGGER_PRETTY: BooleanLike(process.env.LOGGER_PRETTY),
  DEBUG: BooleanLike(process.env.DEBUG),
  /// paths
  FFMPEG_PATH: process.env.FFMPEG_PATH,
  YTDLP_PATH: process.env.YTDLP_PATH,
  DATABASE_FILE: path.resolve(
    process.env.DATABASE_FILE || path.join(process.cwd(), "floxy.sqlite")
  ),
  LOGS_PATH: process.env.LOGS_PATH ?? path.join(process.cwd(), "logs"),
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}


export default config;
