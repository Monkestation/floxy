// biome-ignore lint/correctness/noUnusedImports: neccessary for overriding
import * as fastify from "fastify"

declare module 'fastify' {
  export interface FastifyInstance {
    floxy: import("../classes/Floxy.ts").default
    ytdlp: import("ytdlp-nodejs").YtDlp;
    mediaCacheService: import("../classes/MediaCacheService.ts").default;
    logger: typeof import("../utils/logger.ts").fastifyLogger;
  }

  export interface FastifyRequest {
    user?: DBFloxyUser;
  }
}
