import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./trpc/router.js";
import { createContextFactory } from "./trpc/index.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { StorageService } from "./services/storage.js";
import { registerUploadRoute } from "./routes/upload.js";
import { registerStreamRoute } from "./routes/stream.js";
import { registerCoversRoute } from "./routes/covers.js";
import { registerImportRoutes } from "./routes/import.js";
import { registerExportRoute } from "./routes/export.js";
import { registerOpdsRoutes } from "./routes/opds.js";
import type { Config } from "./config.js";

export async function buildApp(config: Config) {
  const app = Fastify({ logger: true });

  const db = createDb(config);
  runMigrations(db);

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

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
