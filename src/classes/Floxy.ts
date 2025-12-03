import fastifyCors from "@fastify/cors";
import * as Sentry from "@sentry/node";
import bcrypt from "bcrypt";
import fastify, { type FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { YtDlp } from "./FloxyYtDlp.js";
import AuthRoutes from "../routes/auth.js";
import MediaRoutes from "../routes/media.js";
import OtherRoutes from "../routes/other.js";
import { FloxyUserRole } from "../typings/users.js";
import { dirExistsSync } from "../utils/fs.js";
import logger, { fastifyLogger } from "../utils/logger.js";
import { DatabaseManager } from "./Database.js";
import MediaCacheService from "./MediaCacheService.js";
import which from "which";
import { execFileSync } from "node:child_process";
import { YtdlpMetadataParser } from "./MetadataParser.js";

export default class Floxy {
  fastify: FastifyInstance;
  ytdlp!: YtDlp;
  mediaCacheService: MediaCacheService;
  database: DatabaseManager;
  metadataParser: YtdlpMetadataParser;
  config: {
    adminPassword: string;
    webserverHost: string;
    webserverPort: number;
    ffmpegPath?: string;
    ytdlpPath?: string;
    ytdlpCookiesPath?: string;
    ytdlpExtraArgs?: string;
    cacheFolder: string;
    databaseFilePath: string;
  };

  constructor({
    webserverHost,
    webserverPort = 3050,
    cacheFolder,
    ytdlpPath,
    ffmpegPath,
    ytdlpCookiesPath,
    ytdlpExtraArgs,
    databaseFilePath,
    adminPassword,
  }: {
    webserverHost: string;
    webserverPort?: number;
    cacheFolder: string;
    ytdlpPath?: string;
    ffmpegPath?: string;
    ytdlpCookiesPath?: string;
    ytdlpExtraArgs?: string;
    databaseFilePath: string;
    adminPassword: string;
  }) {
    this.config = {
      webserverHost,
      webserverPort,
      cacheFolder,
      ffmpegPath,
      ytdlpPath,
      ytdlpCookiesPath,
      ytdlpExtraArgs,
      databaseFilePath,
      adminPassword: adminPassword,
    };

    // validate cache folder path
    if (!dirExistsSync(cacheFolder)) {
      mkdirSync(cacheFolder, { recursive: true });
      logger.info(`Created cache folder at ${cacheFolder}`);
    }
    this.mediaCacheService = new MediaCacheService(this, cacheFolder);
    this.fastify = fastify({
      loggerInstance: fastifyLogger,
      disableRequestLogging: true,
    });
    this.database = new DatabaseManager({
      client: "better-sqlite3",
      connection: {
        filename: this.config.databaseFilePath,
      },
      useNullAsDefault: true,
    });
    this.metadataParser = new YtdlpMetadataParser(this);
  }

  public async setup() {
    if (!this.config.ytdlpPath) await this.tryFindYtdlp();
    if (!this.config.ffmpegPath) await this.tryFindFFmpeg();

    this.ytdlp = YtDlp.create({
      binaryPath: this.config.ytdlpPath,
      ffmpegPath: this.config.ffmpegPath,
    }) as YtDlp;

    logger.debug("Setting up Fastify decorations");
    this.fastify.decorate("ytdlp", this.ytdlp);
    this.fastify.decorate("mediaCacheService", this.mediaCacheService);
    this.fastify.decorate("logger", fastifyLogger);
    this.fastify.floxy = this;
    logger.debug("Registering fastify plugins");
    this.registerFastifyPlugins();
    this.setupFastifyLogging();
    logger.debug("Registering fastify Routes");
    await this.registerRoutes();
    await this.database.initSchema();
    logger.debug("Creating base users");
    await this.createBaseUsers();
    logger.debug("Setting up Fastify logging");
  }

  private registerFastifyPlugins() {
    this.fastify.register(fastifyCors, {
      origin: "*",
    });
  }

  private setupFastifyLogging() {
    this.fastify.setNotFoundHandler((request, reply) => {
      this.fastify.logger.debug(`IP: ${request.ip} - ${request.method} - Route not found: ${request.url}`);

      reply.status(404).send({ message: "Not found" });
    });

    // this.fastify.setErrorHandler((error, request, reply) => {
    //   this.fastify.logger.debug(`Request url: ${request.url}` );
    //   this.fastify.logger.debug(`Payload `, request.body);
    //   this.fastify.logger.error(`Error occurred `, error);
    //   // reply.status(500).send({ message: 'Error occurred during request' });
    //   return req
    // });

    Sentry.setupFastifyErrorHandler(this.fastify);
  }

  private async registerRoutes() {
    await this.fastify.register(AuthRoutes(this));
    await this.fastify.register(MediaRoutes(this));
    await this.fastify.register(OtherRoutes(this));
  }

  private async createBaseUsers() {
    const adminUser = await this.database.getUserByUsername("admin");
    if (!adminUser) {
      const newAdmin = await this.database.upsertUser({
        username: "admin",
        email: "admin@floxy",
        passwordHash: await bcrypt.hash(this.config.adminPassword, 12),
        role: FloxyUserRole.ADMIN,
      });
      logger.info(`Created default admin user with username: ${newAdmin.username} and password: ${this.config.adminPassword}`);
    }
  }

  // TODO:(?) Turn these into a two step process. find binary, validate binary and report version info.
  // Cause a user could provide the binary and we'd still want to check the binary versions

  private async tryFindYtdlp() {
    logger.debug("Trying to find yt-dlp binary in PATH");
    try {
      const ytDlpPath = await which("yt-dlp", {
        nothrow: true,
      });

      if (!ytDlpPath) {
        logger.warn("yt-dlp binary not found in PATH. Please set YTDLP_PATH in config.");
        return;
      }
      const version = execFileSync(ytDlpPath, ["--version"]).toString().trim();
      logger.info(`Found yt-dlp binary at ${ytDlpPath}, version ${version}`);

      // check if version is older than 2 months
      const [year, month, day, _hour_minute_second] = version.split(".").map(v => parseInt(v, 10)) as [number, number, number, number];
      const releaseDate = new Date();
      releaseDate.setFullYear(year, month, day);
      const now = new Date();
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
      if (releaseDate < twoMonthsAgo) {
        logger.warn(`yt-dlp version ${version} may be out of date. Consider updating to the latest version for best compatibility.`);
      }
      this.config.ytdlpPath = ytDlpPath;
    } catch (_error) {
      logger.warn(
        "A yt-dlp binary was found in path but we couldn't parse the version. Please update yt-dlp, or set YTDLP_PATH in config.",
      );
      logger.debug(_error);
    }
  }

  private async tryFindFFmpeg() {
    logger.debug("Trying to find ffmpeg binary in PATH");
    let ffmpegPath: string | null = null;
    try {
      ffmpegPath = await which("ffmpeg", {
        nothrow: true,
      });

      if (!ffmpegPath) {
        logger.warn("ffmpeg binary not found in PATH. Please set FFMPEG_PATH in config.");
        return;
      }
      const outputStringFirstLine = (execFileSync(ffmpegPath, ["-version"]).toString().trim().split(/\n/) as [string])[0];
      const [_, version] = /ffmpeg version ((n?[\d.]+)-?(\d+)?\+?([\w]+))?/.exec(outputStringFirstLine) as unknown as [string, string];
      if (!version) {
        throw new Error(`Version was null. Parsed: ${outputStringFirstLine}`);
      }
      logger.info(`Found ffmpeg binary at ${ffmpegPath}, version ${version}`);
      this.config.ffmpegPath = ffmpegPath;
    } catch (_error) {
      logger.warn(
        `An FFmpeg binary was found in PATH (${ffmpegPath}) but we couldn't parse the version. Please update FFmpeg, or set FFMPEG_PATH in config.`,
      );
      logger.debug(_error);
    }
  }

  public async start() {
    try {
      await this.fastify.listen({
        host: this.config.webserverHost,
        port: this.config.webserverPort,
      });
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exitCode = 1;
    }
  }
}
