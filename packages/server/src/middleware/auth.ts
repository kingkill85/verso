import type { FastifyRequest, FastifyReply } from "fastify";
import { jwtVerify } from "jose";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";

export function createAuthHook(config: Config) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing authorization header" });
    }
    const token = authHeader.slice(7);
    try {
      const secret = new TextEncoder().encode(config.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      if (payload.type !== "access") {
        return reply.status(401).send({ error: "Invalid token type" });
      }
      (req as any).user = payload as unknown as TokenPayload;
    } catch {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
  };
}
