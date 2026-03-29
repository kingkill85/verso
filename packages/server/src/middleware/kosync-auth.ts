import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyApiKey } from "../services/api-keys.js";
import type { AppDatabase } from "../db/client.js";

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
