/** biome-ignore-all lint/suspicious/noExplicitAny: its a logger... */


import * as Sentry from '@sentry/node';
import { join as pathJoin } from "node:path";
import winston from "winston";
import config from "../config.js";
import { getFilenameFriendlyUTCDate } from "./other.js";
import { SentryTransport } from './WinstonSentryTransport.js';

Error.stackTraceLimit = 100


if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    tracesSampleRate: 1.0,
    maxBreadcrumbs: 100,
    integrations: [
      Sentry.fastifyIntegration()
    ]
  });
}

if (config.DEBUG) {
  console.warn(`Debug mode enabled${config.SENTRY_DSN && !process.env.SENTRY_DEBUG ? "; Sentry debug can be enabled with SENTRY_DEBUG env." : ""}`);
}

const logPath = pathJoin(
  config.LOGS_PATH,
  `${getFilenameFriendlyUTCDate()}${config.DEBUG ? ".debug" : ""}.json`
);

console.log(`"Logging (JSON Lines) to ${logPath}"`);
const transports = [];

const transportLogLevel = config.DEBUG ? "debug" : "info";

transports.push(
  new winston.transports.File({
    filename: logPath,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    level: transportLogLevel,
    handleExceptions: true,
  })
);

if (config.SENTRY_DSN) {
  transports.push(
    new SentryTransport({
      sentry: {
        dsn: config.SENTRY_DSN,
      },
      level: "error", // just errors
    })
  );
}
if (config.LOGGER_PRETTY) {
  const { inspect } = await import("node:util");

  transports.push(
    new winston.transports.Console({
      level: transportLogLevel,
      format: winston.format.combine(
        winston.format.colorize({
          message: true,
          colors: {
            info: "blue",
            trace: "gray",
            fatal: "red"
          },
          level: true,
        }),
        winston.format.timestamp(),
        winston.format.printf((info) => {
          let message = info.message;
          if (typeof message === "object") {
            message = inspect(message, { depth: null, colors: true });
          }
          return `[${info.timestamp}] ${info.level}: ${message}${info.stack ? `\n${info.stack}` : ""
            }`;
        })
      ),
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: transportLogLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

const logger = winston.createLogger({ transports, levels: {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  trace: 4,
  debug: 5
} });

logger.trace = logger.log.bind(logger, 'trace');
logger.fatal = logger.log.bind(logger, 'fatal');

// declare type for missing winston methods
declare module "winston" {
  interface Logger {
    trace: winston.LeveledLogMethod;
    fatal: winston.LeveledLogMethod;
  }
}

// const flush = async () => {
//   const promises = logger.transports.map((transport) => {
//     return new Promise((resolve) => {
//       if (transport._stream?.end) {
//         transport._stream.end(resolve);
//       } else if (transport.close) {
//         transport.close();
//         resolve(void 0);
//       } else {
//         resolve(void 0);
//       }
//     });
//   });
//   await Promise.all(promises);
// };

// globalThis._oldExit = process.exit;
// process.exit = async (...args) => {
//   // Ample amount of time for anything to do it's thing.
//   await sleep(500);
//   await flush();
//   globalThis._oldExit(...args);
// };

export default logger;

export class ContextError extends Error {
  context?: Record<string, any>;
  
  constructor(message: string, context?: Record<string, any>, cause = null) {
    super(message);
    this.name = 'ContextError';
    if (context) this.context = context;
    if (cause) this.cause = cause;
  }
}

export const fastifyLogger = {
  level: 'info',
  info: logger.info.bind(logger),
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  debug: logger.debug.bind(logger),
  trace: logger.trace.bind(logger),
  fatal: logger.fatal.bind(logger),
  silent: logger.debug.bind(logger),
  child: () => fastifyLogger,
};
