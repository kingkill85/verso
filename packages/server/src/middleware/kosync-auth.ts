import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

export function createKosyncAuthHook(db: AppDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const email = req.headers["x-auth-user"] as string | undefined;
    const md5Key = req.headers["x-auth-key"] as string | undefined;

    if (!email || !md5Key) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.appPasswordMd5) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    if (md5Key !== user.appPasswordMd5) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    req.user = { sub: user.id, email: user.email, role: user.role, type: "access" };
  };
}
