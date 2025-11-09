/** biome-ignore-all lint/suspicious/noThenProperty: JSON schema. it's fine, it's an object not a function, and theres no fucking way fstify is going to await a schema. */
import type { JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import fastifyPlugin from "fastify-plugin";
import type { JSONSchema } from "json-schema-to-ts";
import path from "node:path";
import type Floxy from "../classes/Floxy.js";
import config from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { MediaLink } from "../utils/links.js";
import logger from "../utils/logger.js";

export default (floxy: Floxy) => fastifyPlugin((fastify, _opts) => {
  // fastify get all media with paginatoin
  fastify.get<{
    Querystring: {
      page?: number;
      limit?: number;
    }
  }>("/api/media", {
    preValidation: [authMiddleware],
    schema: {
      querystring: {
        type: "object",
        properties: {
          page: {
            type: "number",
            minimum: 1,
            default: 1,
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
      } as const satisfies JSONSchema,
    },
  }, async (req, _res) => {
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;
    
    const entries = await floxy.mediaCacheService.getAll(
      page,
      limit,
    );
    return {
      entries: entries.map((e) => e.toJSON()),
      total: entries.length,
      page,
      limit,
    };
  });

  fastify.withTypeProvider<JsonSchemaToTsProvider>().post(
    "/api/media/queue",
    {
      preValidation: [authMiddleware],
      schema: {
        querystring: {
          type: "object",
          properties: {
            url: {
              type: "string",
            },
            ttl: {
              type: "number",
            },
            profile: {
              type: "string",
            },
            bitrate: {
              type: "number",
            },
            extra: {
              type: "string",
            },
          },
          required: ["url"],
          if: {
            properties: {
              bitrate: {},
            },
            required: ["bitrate"],
          },
          then: {
            required: ["profile"],
          },
        } as const satisfies JSONSchema,
      },
    },
    async (req, res) => {
      let extra: Record<string, string> | undefined;
      if (req.query.extra) {
        try {
          extra = JSON.parse(req.query.extra);
        } catch (error) {
          return res.status(400).send({
            message: "Invalid JSON.",
            error,
          });
        }
      }
      const mediaUrl = new MediaLink(req.query.url);
      if (!mediaUrl.isSingle()) {
        return res.status(400).send({
          message: "Playlists are not supported.",
        });
      }
      mediaUrl.normalize();
      const entry = await floxy.mediaCacheService.enqueue(mediaUrl.url, {
        reencode: req.query.profile
          ? {
              profile: req.query.profile,
              bitrate: req.query.bitrate,
            }
          : undefined,
        extra,
        ttl: req.query.ttl,
      });
      return entry
    }
  );
  fastify.get<{
    Params: {
      id: string;
    }
  }>("/api/media/:id", {
    preValidation: [authMiddleware],
  }, async (req, res) => {
    const { id } = req.params;

    const entry = await floxy.mediaCacheService.getById(id);
    if (!entry) {
      return res.status(404).send({
        error: "Entry not found",
      });
    }

    const endpoints = config.EXTERNAL_CACHE_ENDPOINTS.map((e) =>
      new URL(path.posix.join("/media", entry.id), e).toString()
    );
    return {
      ...entry.toJSON(),
      endpoints: entry.IsCompleted() ? endpoints : null,
    } as ReturnType<typeof entry.toJSON> & {
      endpoints?: string[]
    }

  });

  fastify.delete<{
    Params: { id: string },
    Querystring: {
      hard?: "file" | "entry";
      force?: boolean;
    }
  }>("/api/media/:id", {
    preValidation: [authMiddleware],
    schema: {
      querystring: {
        type: "object",
        properties: {
          hard: {
            type: "string",
            enum: ["file", "entry"],
          },
          force: {
            type: "boolean",
            default: false,
          },
        },
      } as const satisfies JSONSchema,
    },
  }, async (req, res) => {
    const { id } = req.params;
    
    const entry = await floxy.mediaCacheService.getById(id);
    if (!entry) {
      return res.status(404).send({
        error: "Entry not found",
      });
    }

    if (!entry.IsCompleted()) {
      return res.status(400).send({
        error: "Cannot delete an entry that is still processing",
      });
    }

    if (entry.deleted && !(req.query.force ?? false)) {
      return res.status(200).send({
        message: "Entry is already deleted",
      });
    }

    logger.debug(`Deleting media entry ${id}, hard: ${req.query.hard}, force: ${req.query.force ?? false}`);

    void floxy.mediaCacheService.deleteById(id, req.query.hard, req.query.force ?? false);
    return res.status(204).send();

  });

});