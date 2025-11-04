import fastifyPlugin from "fastify-plugin";
import packageData from "../../package.json" with { type: "json" };
import type Floxy from "../classes/Floxy.js";
import config from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import fsp from "node:fs/promises";
import * as Media from "../utils/media.js";

export default (floxy: Floxy) => fastifyPlugin(async (fastify, __opts) => {
  fastify.get("/api", async (_req, _res) => {
    return {
      status: "OK",
      version: packageData.version,
      cache_stats: floxy.mediaCacheService.getFriendlyStats(),
      cache_endpoints: {
        "_comment": "These are the endpoint roots to caches. Example: https://endpoint/CACHEIDHERE/media.mp3",
        ...config.EXTERNAL_CACHE_ENDPOINTS
      },
      media_profiles: Media.PROFILES,
    }
  });
  for (const route of ["/api/ytdlp", "/api/ytdlp/:id"])
    fastify.post<{
      Querystring?: {
        url?: string
      },
      Params: {
        id?: string;
      }
    }>(route, { preHandler: [authMiddleware]}, async (req, res) => {
      let url = req.query?.url;
      if (req.params.id) {
        const entry = await floxy.mediaCacheService.getById(req.params.id);
        if (!entry) {
          return res.status(400).send({
            message: "Media entry not found"
          });
        }
        url = entry?.url;
      }
      if (!url) {
        return res.status(400).send({
          message: "No URL provided, or media entry returned no URL"
        });
      }

      const response = await floxy.ytdlp.getInfoAsync(url, {
        cookies: config.YTDLP_COOKIES_PATH
      });
      await fsp.writeFile("mrrp.txt", JSON.stringify(response));
      return "lol"
    })
});