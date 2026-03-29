import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import { createAuthHook } from "../middleware/auth.js";
import { createAppPasswordAuthHook } from "../middleware/app-password-auth.js";

const MIME_TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
};

export function registerStreamRoute(app: FastifyInstance, db: AppDatabase, storage: StorageService, config: Config) {
  const bearerHook = createAuthHook(config);
  const basicHook = createAppPasswordAuthHook(db);

  const authHook = async (req: any, reply: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Basic ")) {
      return basicHook(req, reply);
    }
    return bearerHook(req, reply);
  };
  app.get("/api/books/:id/file", { preHandler: authHook }, async (req, reply) => {
    const user = req.user!;
    const { id } = req.params as { id: string };

    const book = await db.query.books.findFirst({
      where: eq(books.id, id),
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
