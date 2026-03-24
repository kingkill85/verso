import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";
import { createAuthHook } from "../middleware/auth.js";

const MIME_TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
};

export function registerStreamRoute(app: FastifyInstance, db: AppDatabase, storage: StorageService, config: Config) {
  const authHook = createAuthHook(config);
  app.get("/api/books/:id/file", { preHandler: authHook }, async (req, reply) => {
    const user = (req as any).user as TokenPayload;
    const { id } = req.params as { id: string };

    const book = await db.query.books.findFirst({
      where: and(eq(books.id, id), eq(books.addedBy, user.sub)),
    });
    if (!book) return reply.status(404).send({ error: "Book not found" });

    const exists = await storage.exists(book.filePath);
    if (!exists) return reply.status(404).send({ error: "Book file not found" });

    const mimeType = MIME_TYPES[book.fileFormat] || "application/octet-stream";
    const stream = storage.stream(book.filePath);

    return reply
      .header("Content-Type", mimeType)
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(book.title)}.${book.fileFormat}"`)
      .send(stream);
  });
}
