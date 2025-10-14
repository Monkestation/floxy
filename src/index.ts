import fastify from "fastify";
import config from "./config.js";
import fastifyCors from "@fastify/cors";
import logger from "./utils/logger.js";


const app = fastify({
  logger: true,
});

app.register(fastifyCors, {
  origin: "*"
});

await app.listen({
  port: config.PORT
});
