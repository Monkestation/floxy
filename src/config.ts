import dotenv from "dotenv";
import { notEmpty } from "./utils/other.js";

dotenv.config()

export default {
  PORT: Number(process.env.PORT) ?? 3050,
  JWT_SECRET: process.env.JWT_SECRET ?? "supersecretkey",
  SENTRY_DSN: process.env.SENTRY_DSN,
  CACHE_FOLDER: process.env.CACHE_FOLDER,
  /// Separated by commas
  EXTERNAL_CACHE_ENDPOINTS: process.env.EXTERNAL_CACHE_ENDPOINT?.split(",").filter(notEmpty) ?? [],
  LOGGER_PRETTY: process.env.LOGGER_PRETTY === "true",
  DEBUG: process.env.DEBUG === "true",
  DATABASE_CLIENT: process.env.DATABASE_CLIENT ?? "sqlite3",
  DATABASE_CONNECTION: process.env.DATABASE_CONNECTION ?? "./data/database.sqlite",
}