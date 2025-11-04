import fastifyCors from "@fastify/cors";
import * as Sentry from "@sentry/node";
import bcrypt from "bcrypt";
import fastify, { type FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { YtDlp } from "ytdlp-nodejs";
import AuthRoutes from "../routes/auth.js";
import MediaRoutes from "../routes/media.js";
import OtherRoutes from "../routes/other.js";
import { FloxyUserRole } from "../typings/users.js";
import { dirExistsSync } from "../utils/fs.js";
import logger, { fastifyLogger } from "../utils/logger.js";
import { DatabaseManager } from "./Database.js";
import MediaCacheService from "./MediaCacheService.js";

export default class Floxy {
  fastify: FastifyInstance;
  ytdlp: YtDlp
  mediaCacheService: MediaCacheService;
  database: DatabaseManager;
  config: {
    adminPassword: string;
    webserverHost: string;
    webserverPort: number;
    ffmpegPath?: string;
    ytdlpPath?: string;
    cacheFolder: string;
    databaseFilePath: string;
  }

  constructor({
    webserverHost,
    webserverPort = 3050,
    cacheFolder,
    ytdlpPath,
    ffmpegPath,
    databaseFilePath,
    adminPassword
  }: {
    webserverHost: string;
    webserverPort?: number;
    cacheFolder: string;
    ytdlpPath?: string;
    ffmpegPath?: string;
    databaseFilePath: string;
    adminPassword: string;
  }) {
    this.config = {
      webserverHost,
      webserverPort,
      cacheFolder,
      ffmpegPath,
      ytdlpPath,
      databaseFilePath,
      adminPassword: adminPassword,
    }

    // validate cache folder path
    if (!dirExistsSync(cacheFolder)) {
      mkdirSync(cacheFolder, { recursive: true });
      logger.info(`Created cache folder at ${cacheFolder}`);
    }
    this.mediaCacheService = new MediaCacheService(this, cacheFolder);
    this.ytdlp = new YtDlp({
      binaryPath: this.config.ytdlpPath,
      ffmpegPath: this.config.ffmpegPath,
    });
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
  }
  
  public async setup() {
    logger.debug("Setting up Fastify decorations")
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

      reply.status(404).send({ message: 'Not found' });
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