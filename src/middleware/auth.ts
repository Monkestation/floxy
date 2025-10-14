import jwt from "jsonwebtoken";
import config from "../config.js";
import type { FastifyReply, FastifyRequest } from "fastify";

export const authMiddleware = async (req: FastifyRequest, res: FastifyReply, next: () => void) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).send({ error: "Unauthorized" });
  }

  jwt.verify(token, config.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};