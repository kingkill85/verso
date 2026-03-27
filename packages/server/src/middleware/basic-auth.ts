import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { compare } from "bcrypt";
import { users } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

export function createBasicAuthHook(db: AppDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Basic ")) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso"')
        .send({ error: "Missing authorization header" });
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return reply.status(401).send({ error: "Invalid Basic auth format" });
    }

    const email = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const user = db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user || !user.passwordHash) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso"')
        .send({ error: "Invalid credentials" });
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso"')
        .send({ error: "Invalid credentials" });
    }

    req.user = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "access",
    };
  };
}
