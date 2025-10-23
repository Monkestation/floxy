import bcrypt from "bcrypt";
import fastifyPlugin from "fastify-plugin";
import type Floxy from "../classes/Floxy.js";
import { authMiddleware, authNeedsRoleMiddleware } from "../middleware/auth.js";
import { FloxyUserRole } from "../typings/users.js";
import { isValidEmail } from "../utils/other.js";

export default (floxy: Floxy) =>
  fastifyPlugin((fastify, _opts) => {
    fastify.get(
      "/api/users",
      { preHandler: [authMiddleware] },
      async (_req, _res) => {
        const users = await floxy.database.getAllUsers();

        return users.map((user) => ({
          ...user,
          passwordHash: undefined,
        })) as Omit<DBFloxyUser, "passwordHash">[];
      }
    );
    fastify.get<{
      Params: {
        id: string;
      };
    }>("/api/users/:id", { preHandler: [authMiddleware] }, async (req, res) => {
      const user = await floxy.database.getUserById(req.params.id);
      if (!user) {
        return res.status(404).send({
          message: "User not found.",
        });
      }

      return {
        ...user,
        passwordHash: undefined,
      } as Omit<DBFloxyUser, "passwordHash">;
    });

    fastify.post<{
      Body: {
        username: string;
        email: string;
        password: string;
        role: FloxyUserRole;
      };
    }>("/api/users", { preHandler: [authMiddleware, authNeedsRoleMiddleware(FloxyUserRole.ADMIN)] }, async (req, res) => {
      const { username, email, password, role } = req.body;

      if (!isValidEmail(email)) {
        return res.status(400).send({
          message: "Invalid email address.",
        });
      }

      const existingUser = await floxy.database.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).send({
          message: "Username already exists.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const newUser = await floxy.database.upsertUser({
        username,
        email,
        passwordHash,
        role,
      });

      return {
        ...newUser,
        passwordHash: undefined,
      } as Omit<DBFloxyUser, "passwordHash">;
    });

    fastify.patch<{
      Params: {
        id: string;
      };
      Body: Omit<
        DBFloxyUser,
        "id" | "passwordHash" | "createdAt" | "updatedAt"
      > & {
        password?: string;
        [key: string]: unknown;
      };
    }>(
      "/api/users/:id",
      {
        preHandler: [authMiddleware, authNeedsRoleMiddleware(FloxyUserRole.ADMIN)],
        schema: {
          body: {
            type: "object",
            properties: {
              username: { type: "string" },
              email: { type: "string" },
              role: { type: "string", enum: Object.values(FloxyUserRole) },
              password: { type: "string" },
            },
            additionalProperties: false,
            minProperties: 1,
          },
        },
      },
      async (req, res) => {
        const user =
          (await floxy.database.getUserById(req.params.id)) ||
          (await floxy.database.getUserByUsername(req.params.id));
        if (!user) {
          return res.status(404).send({
            message: "User not found.",
          });
        }

        if (req.body.email && !isValidEmail(req.body.email)) {
          return res.status(400).send({
            message: "Invalid email address.",
          });
        }

        const updatedUser = await floxy.database.updateUserById(req.params.id, {
          ...req.body,
          passwordHash: req.body.password
            ? await bcrypt.hash(req.body.password, 12)
            : undefined,
        });

        return {
          ...updatedUser,
          passwordHash: undefined,
        } as Omit<DBFloxyUser, "passwordHash">;
      }
    );

    fastify.get("/api/users/me", { preHandler: [authMiddleware] }, async (req, _res) => {
      return {
        ...req.user,
        passwordHash: undefined,
      } as Omit<DBFloxyUser, "passwordHash">;
    });

    fastify.delete<{
      Params: {
        id: string;
      };
    }>(
      "/api/users/:id",
      { preHandler: [authMiddleware, authNeedsRoleMiddleware(FloxyUserRole.ADMIN)] },
      async (req, res) => {
        const user = await floxy.database.getUserById(req.params.id);
        if (!user) {
          return res.status(404).send({
            message: "User not found.",
          });
        }

        await floxy.database.deleteUserById(req.params.id);

        return {
          message: "User deleted successfully.",
        };
      }
    );
  });
