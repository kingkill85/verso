import Fastify from "fastify";
import cors from "@fastify/cors";
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
import type { Config } from "./config.js";

export async function buildApp(config: Config) {
  const app = Fastify({ logger: true });

  const db = createDb(config);
  runMigrations(db);

  const storage = new StorageService(config);

  await app.register(cors, { origin: config.CORS_ORIGIN });
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

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
