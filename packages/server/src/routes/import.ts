import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { createAdminAuthHook } from "../middleware/auth.js";
import { fetchOpdsCatalog, downloadBook } from "../services/opds-client.js";
import { convertToEpub, extractMetadata, extractCover } from "../services/calibre.js";
import { restoreLibrary } from "../services/library-import.js";
import type { MetadataExport, AnnotationsExport, ProgressExport } from "../services/library-import.js";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import sharp from "sharp";
import yauzl from "yauzl-promise";
import path from "node:path";
import os from "node:os";
import { writeFile, unlink as unlinkFile, readFile } from "node:fs/promises";

interface OpdsBrowseBody {
  url: string;
  username?: string;
  password?: string;
}

interface OpdsStreamEntry {
  id: string;
  title: string;
  author?: string;
  acquisitionUrl: string;
  coverUrl?: string;
  format?: string;
}

interface OpdsStreamBody {
  username?: string;
  password?: string;
  entries: OpdsStreamEntry[];
}

export function registerImportRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAdminAuthHook(config);

  // POST /api/import/opds/browse — Browse OPDS catalog
  app.post<{ Body: OpdsBrowseBody }>(
    "/api/import/opds/browse",
    { preHandler: authHook },
    async (req, reply) => {
      const { url, username, password } = req.body;
      if (!url) {
        return reply.status(400).send({ error: "url is required" });
      }

      const credentials =
        username && password ? { username, password } : undefined;

      try {
        const catalog = await fetchOpdsCatalog(url, credentials);
        return reply.send(catalog);
      } catch (err: any) {
        return reply.status(502).send({ error: err.message || "Failed to fetch OPDS catalog" });
      }
    }
  );

  // POST /api/import/opds/stream — Import books via SSE
  app.post<{ Body: OpdsStreamBody }>(
    "/api/import/opds/stream",
    { preHandler: authHook },
    async (req, reply) => {
      const user = req.user!;
      const { username, password, entries } = req.body;

      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return reply.status(400).send({ error: "entries array is required" });
      }

      const credentials =
        username && password ? { username, password } : undefined;

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");

      const sendEvent = (data: object) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let completed = 0;
      let failed = 0;

      for (const entry of entries) {
        const { id, title, acquisitionUrl, format } = entry;

        try {
          sendEvent({ type: "progress", id, title, status: "downloading" });

          const { buffer, contentType } = await downloadBook(acquisitionUrl, credentials);

          sendEvent({ type: "progress", id, title, status: "processing" });

          // Determine source extension from format or content type
          let srcExt: string;
          if (format) {
            srcExt = format.toLowerCase();
          } else if (contentType.includes("epub")) {
            srcExt = "epub";
          } else if (contentType.includes("pdf")) {
            srcExt = "pdf";
          } else if (contentType.includes("mobi") || contentType.includes("x-mobipocket")) {
            srcExt = "mobi";
          } else {
            srcExt = "epub"; // default
          }

          const bookId = crypto.randomUUID();
          const tmpDir = os.tmpdir();
          const tmpInput = path.join(tmpDir, `verso-import-${bookId}.${srcExt}`);
          const tmpEpub = path.join(tmpDir, `verso-import-${bookId}-out.epub`);
          const tmpCover = path.join(tmpDir, `verso-cover-${bookId}.jpg`);

          try {
            // Write downloaded buffer to temp file
            await writeFile(tmpInput, buffer);

            // Determine output format: PDFs stay as PDF, everything else converts to EPUB
            const isPdf = srcExt === "pdf";
            let outputExt: string;
            let finalBuffer: Buffer;

            if (isPdf) {
              outputExt = "pdf";
              finalBuffer = buffer;
            } else {
              // Convert to EPUB (handles epub->epub cleanup and other formats)
              await convertToEpub(tmpInput, tmpEpub);
              finalBuffer = await readFile(tmpEpub);
              outputExt = "epub";
            }

            const fileHash = createHash("sha256").update(finalBuffer).digest("hex");
            const filePath = `books/${bookId}/book.${outputExt}`;
            await storage.put(filePath, finalBuffer);

            // Extract metadata using Calibre
            const metadataSource = isPdf ? tmpInput : tmpEpub;
            let metadata: any;
            try {
              metadata = await extractMetadata(metadataSource);
            } catch {
              metadata = {
                title: title || "Unknown Title",
                author: entry.author || "Unknown Author",
              };
            }

            // Extract and process cover using Calibre
            let coverPath: string | undefined;
            try {
              const hasCover = await extractCover(metadataSource, tmpCover);
              if (hasCover) {
                const coverBuffer = await sharp(tmpCover)
                  .resize(600, undefined, { withoutEnlargement: true })
                  .jpeg({ quality: 85 })
                  .toBuffer();
                coverPath = `covers/${bookId}.jpg`;
                await storage.put(coverPath, coverBuffer);
              }
            } catch {
              // Cover processing failed
            }

            await db.insert(books).values({
              id: bookId,
              title: metadata.title || title,
              author: metadata.author || entry.author || "Unknown Author",
              isbn: metadata.isbn,
              publisher: metadata.publisher,
              year: metadata.year,
              language: metadata.language,
              description: metadata.description,
              genre: metadata.genre,
              tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
              coverPath: coverPath || null,
              filePath,
              fileFormat: outputExt,
              fileSize: finalBuffer.length,
              fileHash,
              pageCount: metadata.pageCount,
              series: metadata.series,
              seriesIndex: metadata.seriesIndex,
              addedBy: user.sub,
              metadataSource: "extracted",
            });

            sendEvent({ type: "progress", id, title, status: "done" });
            completed++;
          } finally {
            // Clean up temp files
            await unlinkFile(tmpInput).catch(() => {});
            await unlinkFile(tmpEpub).catch(() => {});
            await unlinkFile(tmpCover).catch(() => {});
          }
        } catch (err: any) {
          sendEvent({
            type: "progress",
            id,
            title,
            status: "failed",
            error: err.message || "Unknown error",
          });
          failed++;
        }
      }

      sendEvent({
        type: "done",
        completed,
        failed,
        total: entries.length,
      });

      reply.raw.end();
    }
  );

  // POST /api/import/restore — Restore library from ZIP
  app.post(
    "/api/import/restore",
    { preHandler: authHook },
    async (req, reply) => {
      const user = req.user!;

      const data = await req.file();
      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const buffer = await data.toBuffer();

      let metadata: MetadataExport | undefined;
      let annotationsData: AnnotationsExport | undefined;
      let progressData: ProgressExport | undefined;
      const bookIdMap: Record<string, string> = {};

      // Write buffer to temp file for yauzl
      const tmpPath = path.join(os.tmpdir(), `verso-restore-${crypto.randomUUID()}.zip`);
      await writeFile(tmpPath, buffer);

      try {
        const zip = await yauzl.open(tmpPath);

        for await (const entry of zip) {
          const entryPath = entry.filename;
          const baseName = path.basename(entryPath);

          // Only process files inside the backup folder (skip directories)
          if (entryPath.endsWith("/")) continue;

          if (baseName === "metadata.json") {
            const stream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
            metadata = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as MetadataExport;
          } else if (baseName === "annotations.json") {
            const stream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
            annotationsData = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as AnnotationsExport;
          } else if (baseName === "progress.json") {
            const stream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
            progressData = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as ProgressExport;
          } else if (entryPath.includes("/books/")) {
            // Extract book file — filename format: {oldId}-{safeName}.{ext}
            const fileBaseName = baseName;
            const dashIdx = fileBaseName.indexOf("-");
            const dotIdx = fileBaseName.lastIndexOf(".");
            if (dashIdx > 0 && dotIdx > dashIdx) {
              const oldId = fileBaseName.slice(0, dashIdx);
              const ext = fileBaseName.slice(dotIdx + 1);
              const newId = crypto.randomUUID();
              bookIdMap[oldId] = newId;
              const newFilePath = `books/${newId}/book.${ext}`;
              const stream = await entry.openReadStream();
              const chunks: Buffer[] = [];
              for await (const chunk of stream) {
                chunks.push(chunk);
              }
              const fileBuffer = Buffer.concat(chunks);
              await storage.put(newFilePath, fileBuffer);

              // Update the metadata book's filePath via bookIdMap so restoreLibrary can use it
              if (metadata) {
                const bookRecord = metadata.books.find((b) => b.id === oldId);
                if (bookRecord) {
                  bookRecord.filePath = newFilePath;
                  bookRecord.fileSize = fileBuffer.length;
                }
              }
            }
          } else if (entryPath.includes("/covers/")) {
            // Extract cover file — filename: {oldId}.jpg
            const fileBaseName = baseName;
            const dotIdx = fileBaseName.lastIndexOf(".");
            const oldId = dotIdx > 0 ? fileBaseName.slice(0, dotIdx) : fileBaseName;
            const newId = bookIdMap[oldId];
            if (newId) {
              const stream = await entry.openReadStream();
              const chunks: Buffer[] = [];
              for await (const chunk of stream) {
                chunks.push(chunk);
              }
              await storage.put(`covers/${newId}.jpg`, Buffer.concat(chunks));
              if (metadata) {
                const bookRecord = metadata.books.find((b) => b.id === oldId);
                if (bookRecord) {
                  bookRecord.coverPath = `covers/${newId}.jpg`;
                }
              }
            }
          }
        }

        await zip.close();
      } finally {
        await unlinkFile(tmpPath).catch(() => {});
      }

      if (!metadata || !annotationsData || !progressData) {
        return reply.status(400).send({
          error: "Invalid backup file: missing metadata.json, annotations.json, or progress.json",
        });
      }

      const result = await restoreLibrary(
        db,
        user.sub,
        metadata,
        annotationsData,
        progressData,
        bookIdMap
      );

      return reply.send({
        success: true,
        imported: {
          books: result.books,
          shelves: result.shelves,
          annotations: result.annotations,
        },
      });
    }
  );
}
