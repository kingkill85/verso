import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { parseEpub } from "../services/epub-parser.js";
import { parsePdf } from "../services/pdf-parser.js";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import { createAuthHook } from "../middleware/auth.js";
import sharp from "sharp";

export function registerUploadRoute(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAuthHook(config);

  app.post(
    "/api/upload",
    { preHandler: authHook },
    async (req, reply) => {
      const user = req.user!;
      const data = await req.file();

      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const buffer = await data.toBuffer();

      if (data.file.truncated) {
        return reply.status(413).send({ error: "File exceeds maximum upload size" });
      }

      const filename = data.filename || "";
      const ext = filename.split(".").pop()?.toLowerCase();

      if (!ext || !["epub", "pdf"].includes(ext)) {
        return reply.status(400).send({ error: "Unsupported file format. Use EPUB or PDF." });
      }

      const bookId = crypto.randomUUID();
      const fileHash = createHash("sha256").update(buffer).digest("hex");

      const filePath = `books/${bookId}/book.${ext}`;
      await storage.put(filePath, buffer);

      const fullFilePath = storage.fullPath(filePath);
      let metadata;
      try {
        if (ext === "epub") {
          metadata = await parseEpub(fullFilePath);
        } else {
          metadata = await parsePdf(fullFilePath);
        }
      } catch (err) {
        console.error("Metadata extraction failed:", err);
        metadata = {
          title: filename.replace(/\.[^.]+$/, ""),
          author: "Unknown Author",
        };
      }

      let coverPath: string | undefined;
      if (metadata.coverData) {
        try {
          const coverBuffer = await sharp(metadata.coverData)
            .resize(600, undefined, { withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          coverPath = `covers/${bookId}.jpg`;
          await storage.put(coverPath, coverBuffer);
        } catch {
          // Cover processing failed
        }
      }

      const [book] = await db
        .insert(books)
        .values({
          id: bookId,
          title: metadata.title,
          author: metadata.author,
          isbn: metadata.isbn,
          publisher: metadata.publisher,
          year: metadata.year,
          language: metadata.language,
          description: metadata.description,
          genre: metadata.genre,
          tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
          coverPath: coverPath || null,
          filePath,
          fileFormat: ext,
          fileSize: buffer.length,
          fileHash,
          pageCount: metadata.pageCount,
          series: metadata.series,
          seriesIndex: metadata.seriesIndex,
          addedBy: user.sub,
          metadataSource: "extracted",
        })
        .returning();

      return reply.status(201).send({ book });
    }
  );
}
