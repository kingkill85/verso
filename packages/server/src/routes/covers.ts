import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function registerCoversRoute(app: FastifyInstance, db: AppDatabase, storage: StorageService, _config: Config) {
  // No auth — covers are served by unguessable UUID and aren't sensitive.
  // This allows <img src> tags to load covers without Bearer tokens.
  app.get("/api/covers/:bookId", async (req, reply) => {
    const { bookId } = req.params as { bookId: string };

    const book = await db.query.books.findFirst({
      where: eq(books.id, bookId),
    });
    if (!book || !book.coverPath) return reply.status(404).send({ error: "Cover not found" });

    const exists = await storage.exists(book.coverPath);
    if (!exists) return reply.status(404).send({ error: "Cover file not found" });

    const coverData = await storage.get(book.coverPath);
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "no-cache").send(coverData);
  });
}
