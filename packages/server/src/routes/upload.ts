import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import {
  convertToEpub,
  convertToPdf,
  extractMetadata,
  extractCover,
} from "../services/calibre.js";
import { books, kosyncProgress, readingProgress } from "@verso/shared";
import { eq } from "drizzle-orm";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import { createAdminAuthHook } from "../middleware/auth.js";
import { partialMd5 } from "../services/partial-md5.js";
import sharp from "sharp";
import { logActivity } from "../services/activity-log.js";
import { saveHash } from "../services/hash-history.js";

const EBOOK_FORMATS = ["epub", "mobi", "azw", "azw3", "fb2", "cbz", "cbr"];
const DOCUMENT_FORMATS = ["docx", "rtf"];
const PDF_FORMAT = "pdf";
const ALL_FORMATS = [...EBOOK_FORMATS, ...DOCUMENT_FORMATS, PDF_FORMAT];

export function registerUploadRoute(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAdminAuthHook(config);

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

      if (!ext || !ALL_FORMATS.includes(ext)) {
        return reply
          .status(400)
          .send({ error: "Unsupported file format. Supported: EPUB, MOBI, AZW, AZW3, FB2, CBZ, CBR, DOCX, RTF, PDF." });
      }

      const bookId = crypto.randomUUID();
      const tempDir = tmpdir();
      const tempUploadPath = path.join(tempDir, `verso-upload-${bookId}.${ext}`);
      const tempConvertedPath = EBOOK_FORMATS.includes(ext)
        ? path.join(tempDir, `verso-converted-${bookId}.epub`)
        : DOCUMENT_FORMATS.includes(ext)
          ? path.join(tempDir, `verso-converted-${bookId}.pdf`)
          : null;
      const tempCoverPath = path.join(tempDir, `verso-cover-${bookId}.jpg`);

      try {
        // Write uploaded file to temp location
        await writeFile(tempUploadPath, buffer);

        let outputFormat: string;
        let storedBuffer: Buffer;

        if (EBOOK_FORMATS.includes(ext)) {
          // Convert to EPUB
          try {
            await convertToEpub(tempUploadPath, tempConvertedPath!);
          } catch (err) {
            console.error("Conversion failed:", err);
            return reply.status(422).send({ error: "Conversion failed" });
          }
          storedBuffer = await readFile(tempConvertedPath!);
          outputFormat = "epub";
        } else if (DOCUMENT_FORMATS.includes(ext)) {
          // Convert to PDF
          try {
            await convertToPdf(tempUploadPath, tempConvertedPath!);
          } catch (err) {
            console.error("Conversion failed:", err);
            return reply.status(422).send({ error: "Conversion failed" });
          }
          storedBuffer = await readFile(tempConvertedPath!);
          outputFormat = "pdf";
        } else {
          // PDF — store directly
          storedBuffer = buffer;
          outputFormat = "pdf";
        }

        const filePath = `books/${bookId}/book.${outputFormat}`;
        await storage.put(filePath, storedBuffer);

        const fileHash = createHash("sha256").update(storedBuffer).digest("hex");
        const md5Hash = partialMd5(storedBuffer);
        const fileSize = storedBuffer.length;

        // Extract metadata from the stored file
        const fullFilePath = storage.fullPath(filePath);
        let metadata;
        try {
          metadata = await extractMetadata(fullFilePath);
        } catch (err) {
          console.error("Metadata extraction failed:", err);
          metadata = {
            title: filename.replace(/\.[^.]+$/, ""),
            author: "Unknown Author",
          };
        }

        // Extract cover
        let coverPath: string | undefined;
        try {
          const hasCover = await extractCover(fullFilePath, tempCoverPath);
          if (hasCover) {
            const coverBuffer = await sharp(tempCoverPath)
              .resize(600, undefined, { withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();
            coverPath = `covers/${bookId}.jpg`;
            await storage.put(coverPath, coverBuffer);
          }
        } catch {
          // Cover extraction/processing failed — continue without cover
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
            fileFormat: outputFormat,
            fileSize,
            fileHash,
            md5Hash,
            pageCount: metadata.pageCount,
            series: metadata.series,
            seriesIndex: metadata.seriesIndex,
            addedBy: user.sub,
            metadataSource: "extracted",
          })
          .returning();

        if (md5Hash) saveHash(db, bookId, md5Hash, metadata.title || data.filename);

        logActivity(db, {
          type: "upload",
          userId: user.sub,
          bookId,
          bookTitle: metadata.title || data.filename,
          details: {
            fileName: data.filename,
            fileSize: data.file.bytesRead,
            fileFormat: outputFormat,
          },
        });

        // Auto-migrate kosyncProgress if a matching document hash exists
        if (md5Hash) {
          const matchedProgress = await db
            .select()
            .from(kosyncProgress)
            .where(eq(kosyncProgress.documentHash, md5Hash))
            .all();

          for (const kp of matchedProgress) {
            await db.insert(readingProgress).values({
              userId: kp.userId,
              bookId,
              percentage: kp.percentage * 100, // kosync uses 0-1, readingProgress uses 0-100
              lastReadAt: kp.updatedAt,
              startedAt: kp.updatedAt,
            }).onConflictDoNothing();

            await db
              .delete(kosyncProgress)
              .where(eq(kosyncProgress.id, kp.id));
          }
        }

        return reply.status(201).send({ book });
      } finally {
        // Clean up all temp files
        const tempFiles = [tempUploadPath, tempConvertedPath, tempCoverPath].filter(
          Boolean
        ) as string[];
        await Promise.allSettled(tempFiles.map((f) => unlink(f).catch(() => {})));
      }
    }
  );
}
