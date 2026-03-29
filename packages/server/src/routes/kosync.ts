import type { FastifyInstance } from "fastify";
import { createKosyncAuthHook } from "../middleware/kosync-auth.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function registerKosyncRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  config: Config,
) {
  const authHook = createKosyncAuthHook(db);

  // GET /users/auth — validate credentials
  app.get("/users/auth", { preHandler: authHook }, async (_req, reply) => {
    return reply.send({ authorized: "OK" });
  });

  // POST /users/create — no-op registration, validates credentials
  app.post("/users/create", { preHandler: authHook }, async (req, reply) => {
    return reply.code(201).send({ username: req.user!.email });
  });
}
