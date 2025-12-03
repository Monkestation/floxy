import fastifyPlugin from "fastify-plugin";
import packageData from "../../package.json" with { type: "json" };
import type Floxy from "../classes/Floxy.js";
import config from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import * as Media from "../utils/media.js";
import { YtDlp } from "../classes/FloxyYtDlp.js";
import { error } from "console";

export default (floxy: Floxy) =>
  fastifyPlugin(async (fastify, __opts) => {
    fastify.get("/api", (_req, _res) => (
      {
        status: "OK",
        version: packageData.version,
        cache_stats: floxy.mediaCacheService.getFriendlyStats(),
        cache_endpoints: {
          _comment: "These are the endpoint roots to caches. Example: https://endpoint/CACHEIDHERE/media.mp3",
          ...config.EXTERNAL_CACHE_ENDPOINTS,
        },
        media_profiles: Media.PROFILES,
      }
    ));
    for (const route of ["/api/ytdlp", "/api/ytdlp/:id"]) {
      fastify.get<{
        Querystring?: { url?: string; dontCleanTitle?: boolean };
        Params: { id?: string };
      }>(route, { preHandler: [authMiddleware] }, async (req, res) => {
        let url = req.query?.url;

        if (req.params.id) {
          const entry = await floxy.mediaCacheService.getById(req.params.id);
          if (!entry) {
            return res.status(400).send({ message: "Media entry not found" });
          }
          url = entry.url;
        }

        if (!url) {
          return res.status(400).send({
            message: "No URL provided, or media entry returned no URL",
          });
        }

        try {
          const metadata = await floxy.metadataParser.parseUrl(url, req.query?.dontCleanTitle ?? false);
          return res.send(metadata);
        } catch (err) {
          const e = YtDlp.normalizeError((err as Error).message);
          return res.status(e.status).send({
            code: e.code,
            message: e.message,
            error: e?.error
          });

          // return res.status(500).send({
          //   message: "Failed to parse metadata",
          //   error: (err as Error).message,
          // });
        }
      });
    }
  });
