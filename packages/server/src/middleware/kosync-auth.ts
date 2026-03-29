import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyApiKey } from "../services/api-keys.js";
import { createAuthHook } from "./auth.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function createPluginAuthHook(config: Config, db: AppDatabase) {
  const bearerHook = createAuthHook(config);

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Basic ")) {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
      const colonIndex = decoded.indexOf(":");
      if (colonIndex === -1) {
        return reply.code(401).send({ message: "Invalid auth format" });
      }
      const email = decoded.slice(0, colonIndex);
      const key = decoded.slice(colonIndex + 1);
      const user = await verifyApiKey(db, email, key, "plugin");
      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      req.user = { sub: user.userId, email: user.email, role: user.role, type: "access" };
      return;
    }
    return bearerHook(req, reply);
  };
}

export function createKosyncAuthHook(db: AppDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const username = req.headers["x-auth-user"] as string | undefined;
    const key = req.headers["x-auth-key"] as string | undefined;

    if (!username || !key) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    const user = await verifyApiKey(db, username, key, "kosync");
    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    req.user = { sub: user.userId, email: user.email, role: user.role, type: "access" };
  };
}
