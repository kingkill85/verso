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
import { registerAuthorPhotosRoute } from "./routes/author-photos.js";
import { registerImportRoutes } from "./routes/import.js";
import { registerExportRoute } from "./routes/export.js";
import { registerOpdsRoutes } from "./routes/opds.js";
import { registerKosyncRoutes } from "./routes/kosync.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { verifyCalibreInstalled } from "./services/calibre.js";
import { migrateExistingAuthors, migrateAuthorDescriptions } from "./services/migrate-authors.js";
import { seedDefaultGenres, migrateExistingGenres } from "./services/seed-genres.js";
import type { Config } from "./config.js";
import type { AppDatabase } from "./db/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(config: Config, externalDb?: AppDatabase) {
  const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 }); // 50MB for e-reader sync payloads

  const db = externalDb ?? createDb(config);
  if (!externalDb) runMigrations(db);

  // Seed default genres and migrate existing genre data
  await seedDefaultGenres(db);
  await migrateExistingGenres(db);

  // Backfill any missing default shelves for all existing users
  const { users } = await import("@verso/shared");
  const allUsers = db.select({ id: users.id }).from(users).all();
  for (const u of allUsers) {
    await backfillDefaultShelves(db, u.id);
  }

  try {
    await verifyCalibreInstalled(config.CALIBRE_PATH);
    console.log("Calibre CLI tools verified");
  } catch (err: any) {
    if (config.NODE_ENV === "test") {
      console.warn("Calibre not available (test mode, skipping)");
    } else {
      console.error(err.message);
      process.exit(1);
    }
  }

  const storage = new StorageService(config);

  // Migrate books that don't have author links yet
  if (!externalDb) {
    const { bookAuthors, books: booksTable } = await import("@verso/shared");
    const unlinkedBooks = db
      .select({ id: booksTable.id })
      .from(booksTable)
      .leftJoin(bookAuthors, sql`${bookAuthors.bookId} = ${booksTable.id}`)
      .where(sql`${bookAuthors.bookId} IS NULL`)
      .limit(1)
      .all();
    if (unlinkedBooks.length > 0) {
      console.log("Migrating books without author links...");
      migrateExistingAuthors(db, storage)
        .then((count) => console.log(`Author migration complete: ${count} authors enriched`))
        .catch((err) => console.error("Author migration failed:", err));
    }

    // Migrate existing author descriptions to localized table
    const descCount = migrateAuthorDescriptions(db);
    if (descCount > 0) {
      console.log(`Migrated ${descCount} author descriptions to localized table`);
    }
  }

  await app.register(rateLimit, {
    max: 500,
    timeWindow: "1 minute",
  });

  const corsOrigin = config.CORS_ORIGIN.includes(",")
    ? config.CORS_ORIGIN.split(",").map((s) => s.trim())
    : config.CORS_ORIGIN;
  await app.register(cors, { origin: corsOrigin });

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

  // Prevent browser/proxy caching of API responses
  app.addHook("onSend", async (request, reply) => {
    if (request.url.startsWith("/trpc/") || request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
    }
  });

  registerUploadRoute(app, db, storage, config);
  registerStreamRoute(app, db, storage, config);
  registerCoversRoute(app, db, storage, config);
  registerAuthorPhotosRoute(app, db, storage, config);
  registerImportRoutes(app, db, storage, config);
  registerExportRoute(app, db, storage, config);
  registerOpdsRoutes(app, db, config);
  registerKosyncRoutes(app, db, storage, config);
  registerSyncRoutes(app, db, storage, config);

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
