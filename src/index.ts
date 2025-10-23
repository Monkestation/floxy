import Floxy from "./classes/Floxy.js";
import config, { ConfigurationError } from "./config.js";
import logger from "./utils/logger.js";

if (!config.JWT_SECRET || config.JWT_SECRET === "supersecretkey") {
  throw new ConfigurationError(
    "Invalid JWT_SECRET: it is required and cannot be 'supersecretkey'."
  );
}

if (!process.env.EXTERNAL_CACHE_ENDPOINTS) {
  logger.warn(
    "EXTERNAL_CACHE_ENDPOINTS not set."
  );
}

if (!process.env.CACHE_FOLDER) {
  logger.warn(
    `CACHE_FOLDER not set. Defaulting to: ${config.CACHE_FOLDER}`
  );
}

if (!process.env.DATABASE_FILE) {
  logger.warn(
    `DATABASE_FILE not set. Defaulting to: ${config.DATABASE_FILE}`
  );
}

if (!process.env.ADMIN_PASSWORD) {
  logger.warn(
    `ADMIN_PASSWORD not set. Defaulting to ${config.ADMIN_PASSWORD}. Please change this for security reasons.`
  );
}

const floxyInstance = new Floxy({
  cacheFolder: config.CACHE_FOLDER,
  ytdlpPath: config.YTDLP_PATH,
  ffmpegPath: config.FFMPEG_PATH,
  webserverPort: config.PORT,
  databaseFilePath: config.DATABASE_FILE,
  adminPassword: config.ADMIN_PASSWORD,
});

await floxyInstance.setup();
await floxyInstance.start();