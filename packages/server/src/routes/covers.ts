import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import { createAuthHook } from "../middleware/auth.js";
import type { TokenPayload } from "@verso/shared";

export function registerCoversRoute(app: FastifyInstance, db: AppDatabase, storage: StorageService, config: Config) {
  const authHook = createAuthHook(config);
  app.get("/api/covers/:bookId", { preHandler: authHook }, async (req, reply) => {
    const user = (req as any).user as TokenPayload;
    const { bookId } = req.params as { bookId: string };

    const book = await db.query.books.findFirst({
      where: and(eq(books.id, bookId), eq(books.addedBy, user.sub)),
    });
    if (!book || !book.coverPath) return reply.status(404).send({ error: "Cover not found" });

    const exists = await storage.exists(book.coverPath);
    if (!exists) return reply.status(404).send({ error: "Cover file not found" });

    const coverData = await storage.get(book.coverPath);
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "public, max-age=86400").send(coverData);
  });
}
