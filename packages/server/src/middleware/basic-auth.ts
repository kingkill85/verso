import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyApiKey } from "../services/api-keys.js";
import type { AppDatabase } from "../db/client.js";

export function createBasicAuthHook(db: AppDatabase, requiredScope: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Basic ")) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso OPDS"')
        .send({ error: "Missing authorization header" });
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return reply.status(401).send({ error: "Invalid Basic auth format" });
    }

    const email = decoded.slice(0, colonIndex);
    const key = decoded.slice(colonIndex + 1);

    const result = await verifyApiKey(db, email, key, requiredScope);
    if (!result) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso OPDS"')
        .send({ error: "Invalid credentials or insufficient scope" });
    }

    req.user = {
      sub: result.userId,
      email: result.email,
      role: result.role,
      type: "access",
    };
  };
}
