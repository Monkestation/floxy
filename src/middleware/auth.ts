import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import config from "../config.js";
import type { FloxyJWTPayload, FloxyUserRole } from "../typings/users.js";

const secretKey = new TextEncoder().encode(config.JWT_SECRET);

export const authMiddleware = async (
  req: FastifyRequest,
  res: FastifyReply,

) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7).trim();

  try {
    const { payload } = await jwtVerify(token, secretKey);
    const jwtPayload = payload as FloxyJWTPayload;

    const dbUser = await req.server.floxy.database.getUserById(jwtPayload.id);
    if (!dbUser) {
      return res.status(403).send({ error: "User not found" });
    }

    req.user = dbUser;
    return
  } catch {
    return res.status(403).send({ error: "Invalid token" });
  }
};

export const authNeedsRoleMiddleware =
  (requiredRole: FloxyUserRole) =>
    async (req: FastifyRequest, res: FastifyReply) => {
      const user = req.user;
      if (!user) {
        return res.status(401).send({ error: "Unauthorized" });
      }

      if (user.role !== requiredRole) {
        return res.status(403).send({ error: "Forbidden" });
      }

    };
