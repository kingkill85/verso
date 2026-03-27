import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { books } from "@verso/shared";
import { verifyAccessToken } from "../services/jwt.js";
import { updateEpubMetadata, getEpubFileHash } from "../services/epub-writer.js";
import sharp from "sharp";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function registerCoversRoute(app: FastifyInstance, db: AppDatabase, storage: StorageService, config: Config) {
  // Serve covers — no auth (unguessable UUID)
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

  // Upload cover — requires auth
  app.post("/api/covers/:bookId", async (req, reply) => {
    const { bookId } = req.params as { bookId: string };

    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ error: "Unauthorized" });
    let user;
    try {
      user = await verifyAccessToken(authHeader.slice(7), config);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const book = await db.query.books.findFirst({
      where: eq(books.id, bookId),
    });
    if (!book) return reply.status(404).send({ error: "Book not found" });

    const file = await req.file();
    if (!file) return reply.status(400).send({ error: "No file uploaded" });

    const buffer = await file.toBuffer();
    const processed = await sharp(buffer)
      .resize(600, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const coverPath = `covers/${bookId}.jpg`;
    await storage.put(coverPath, processed);

    await db.update(books).set({
      coverPath,
      updatedAt: new Date().toISOString(),
    }).where(eq(books.id, bookId));

    // Embed cover in EPUB too
    if (book.fileFormat === "epub") {
      try {
        const filePath = storage.fullPath(book.filePath);
        await updateEpubMetadata(filePath, {
          coverImageBuffer: processed,
          coverMimeType: "image/jpeg",
        }, book.fileHash ?? undefined);
        const newHash = await getEpubFileHash(filePath);
        await db.update(books).set({ fileHash: newHash }).where(eq(books.id, bookId));
      } catch (err) {
        console.error("Failed to embed cover in EPUB:", err);
      }
    }

    return { success: true, coverPath };
  });

  // Delete cover — requires auth
  app.delete("/api/covers/:bookId", async (req, reply) => {
    const { bookId } = req.params as { bookId: string };

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ error: "Unauthorized" });
    let user;
    try {
      user = await verifyAccessToken(authHeader.slice(7), config);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const book = await db.query.books.findFirst({
      where: eq(books.id, bookId),
    });
    if (!book) return reply.status(404).send({ error: "Book not found" });

    if (book.coverPath) {
      await storage.delete(book.coverPath);
      await db.update(books).set({
        coverPath: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(books.id, bookId));
    }

    // Remove cover from EPUB file too
    if (book.fileFormat === "epub") {
      try {
        const filePath = storage.fullPath(book.filePath);
        await updateEpubMetadata(filePath, { removeCover: true }, book.fileHash ?? undefined);
        const newHash = await getEpubFileHash(filePath);
        await db.update(books).set({ fileHash: newHash }).where(eq(books.id, bookId));
      } catch (err) {
        console.error("Failed to remove cover from EPUB:", err);
      }
    }

    return { success: true };
  });
}
