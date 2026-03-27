import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { appRouter } from "./trpc/router.js";
import { createContextFactory } from "./trpc/index.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { backfillDefaultShelves } from "./trpc/routers/seed-shelves.js";
import { StorageService } from "./services/storage.js";
import { registerUploadRoute } from "./routes/upload.js";
import { registerStreamRoute } from "./routes/stream.js";
import { registerCoversRoute } from "./routes/covers.js";
import { registerImportRoutes } from "./routes/import.js";
import { registerExportRoute } from "./routes/export.js";
import { registerOpdsRoutes } from "./routes/opds.js";
import type { Config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(config: Config) {
  const app = Fastify({ logger: true });

  const db = createDb(config);
  runMigrations(db);

  // Backfill any missing default shelves for all existing users
  const { users } = await import("@verso/shared");
  const allUsers = db.select({ id: users.id }).from(users).all();
  for (const u of allUsers) {
    await backfillDefaultShelves(db, u.id);
  }

  const storage = new StorageService(config);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(cors, { origin: config.CORS_ORIGIN });

  if (config.CORS_ORIGIN === "*" && config.NODE_ENV === "production") {
    app.log.warn("CORS_ORIGIN is set to '*' in production — consider restricting to your domain");
  }

  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_SIZE } });

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(db, config, storage),
    },
  });

  registerUploadRoute(app, db, storage, config);
  registerStreamRoute(app, db, storage, config);
  registerCoversRoute(app, db, storage, config);
  registerImportRoutes(app, db, storage, config);
  registerExportRoute(app, db, storage, config);
  registerOpdsRoutes(app, db, config);

  app.get("/health", async (_req, reply) => {
    try {
      db.run(sql`SELECT 1`);
      return reply.send({
        status: "ok",
        version: "1.0.0",
        uptime: Math.floor(process.uptime()),
        database: "connected",
      });
    } catch {
      return reply.status(503).send({
        status: "error",
        version: "1.0.0",
        uptime: Math.floor(process.uptime()),
        database: "disconnected",
      });
    }
  });

  // Serve frontend static files in production
  const webDistPath = path.resolve(__dirname, "../../web/dist");
  if (config.NODE_ENV === "production" && fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      wildcard: false,
    });

    // SPA fallback: serve index.html for all unmatched routes
    app.setNotFoundHandler((_req, reply) => {
      return reply.sendFile("index.html");
    });
  }

  return app;
}
