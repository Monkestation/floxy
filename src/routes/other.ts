import fastifyPlugin from "fastify-plugin";
import packageData from "../../package.json" with { type: "json" };
import type Floxy from "../classes/Floxy.js";
import config from "../config.js";

export default (floxy: Floxy) => fastifyPlugin((fastify, __opts) => {
  fastify.get("/api", async (_req, _res) => {
    return {
      status: "OK",
      version: packageData.version,
      cache_stats: floxy.mediaCacheService.getFriendlyStats(),
      cache_endpoints: {
        "_comment": "These are the endpoint roots to caches. Example: https://endpoint/CACHEIDHERE/media.mp3",
        ...config.EXTERNAL_CACHE_ENDPOINTS
      }
    }
  });
});