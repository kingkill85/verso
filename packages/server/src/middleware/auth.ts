import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../services/jwt.js";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";
import { createBasicAuthHook } from "./basic-auth.js";
import type { AppDatabase } from "../db/client.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export function createAuthHook(config: Config) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing authorization header" });
    }
    const token = authHeader.slice(7);
    try {
      req.user = await verifyAccessToken(token, config);
    } catch {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
  };
}

export function createAdminAuthHook(config: Config) {
  const authHook = createAuthHook(config);
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authHook(req, reply);
    if (reply.sent) return;
    if (req.user?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
  };
}

export function createFlexAuthHook(config: Config, db: AppDatabase) {
  const bearerHook = createAuthHook(config);
  const basicHook = createBasicAuthHook(db);

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Basic ")) {
      return basicHook(req, reply);
    }
    return bearerHook(req, reply);
  };
}
