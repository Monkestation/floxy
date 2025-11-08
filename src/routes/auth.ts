import * as bcrypt from "bcrypt";
import fastifyPlugin from "fastify-plugin";
import * as jwt from "jose";
import type Floxy from "../classes/Floxy.js";
import config from "../config.js";
import { authMiddleware, authNeedsRoleMiddleware } from "../middleware/auth.js";
import { FloxyUserRole } from "../typings/users.js";

export default (floxy: Floxy) => fastifyPlugin((fastify, __opts) => {
  fastify.post<{
    Body: {
      username: string;
      password: string;
    };
  }>("/api/login", {
    schema: {
      body: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string" },
        },
      },
    },
  }, async (req, res) => {
    const { username, password } = req.body;

    const user = await floxy.database.getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).send({
        message: "Invalid username or password.",
      });
    }

    const token = await new jwt.SignJWT({
      id: user.id,
      username: user.username,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(new TextEncoder().encode(config.JWT_SECRET));

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    };
  });

  fastify.post<{
    Body: {
      username: string;
      durationHours?: number | null;
    };
  }>(
    "/api/token",
    {
      preValidation: [authMiddleware, authNeedsRoleMiddleware(FloxyUserRole.ADMIN)],
    },
    async (req, res) => {
      const requestingUser = req.user;
      if (!requestingUser || requestingUser.role !== "admin") {
        return res.status(403).send({ message: "Forbidden." });
      }

      const { username, durationHours } = req.body;
      const user = await floxy.database.getUserByUsername(username);
      if (!user) return res.status(404).send({ message: "User not found." });

      const maxDurationHours = 24 * 30; // 30 days max
      const hours =
        durationHours && durationHours > 0
          ? Math.min(durationHours, maxDurationHours)
          : maxDurationHours;

      const token = await new jwt.SignJWT({
        id: user.id,
        username: user.username,
        role: user.role,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${hours}h`)
        .sign(new TextEncoder().encode(config.JWT_SECRET));

      return {
        token,
        expiresIn: hours * 3600,
        expiresAt: Date.now() + (hours * 3600 * 1000),
      };
    }
  );


});