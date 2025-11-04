/** biome-ignore-all lint/suspicious/noThenProperty: <explanation> */
import type { JsonSchemaToTsProvider, } from "@fastify/type-provider-json-schema-to-ts";
import fastifyPlugin from "fastify-plugin";
import type { JSONSchema } from "json-schema-to-ts";
import type Floxy from "../classes/Floxy.js";
import { authMiddleware } from "../middleware/auth.js";

export default (floxy: Floxy) => fastifyPlugin((fastify, _opts) => {
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
      const entry = await floxy.mediaCacheService.enqueue(req.query.url, {
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
  return true
});