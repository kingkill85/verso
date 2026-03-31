import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { createKosyncAuthHook } from "../middleware/kosync-auth.js";
import { books, devices, readingProgress, kosyncProgress, kosyncProgressPushInput, bookHashes } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";
import { convertPosition } from "../services/epub-position.js";
import { logActivity } from "../services/activity-log.js";

export function registerKosyncRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config,
) {
  const authHook = createKosyncAuthHook(db);

  // GET /users/auth — validate credentials
  app.get("/users/auth", { preHandler: authHook }, async (_req, reply) => {
    return reply.send({ authorized: "OK" });
  });

  // POST /users/create — no-op registration, validates credentials
  app.post("/users/create", { preHandler: authHook }, async (req, reply) => {
    return reply.code(201).send({ username: req.user!.email });
  });

  // PUT /syncs/progress — push reading position
  app.put("/syncs/progress", { preHandler: authHook }, async (req, reply) => {
    const parsed = kosyncProgressPushInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid request body" });
    }

    const { document, progress, percentage, device, device_id } = parsed.data;
    const userId = req.user!.sub;
    const now = new Date().toISOString();
    const timestamp = Math.floor(Date.now() / 1000);

    // Upsert device
    const existingDevice = await db.select().from(devices).where(eq(devices.id, device_id)).get();
    if (existingDevice) {
      await db.update(devices).set({ lastSeen: now, model: device }).where(eq(devices.id, device_id));
    } else {
      await db.insert(devices).values({ id: device_id, userId, model: device, lastSeen: now });
    }

    // Try to match book by MD5
    let matchedBook = await db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.md5Hash, document))
      .get();

    // Fallback: check hash history for books that changed after metadata edits
    if (!matchedBook) {
      const hashEntry = await db
        .select({ bookId: bookHashes.bookId })
        .from(bookHashes)
        .where(eq(bookHashes.md5Hash, document))
        .get();
      if (hashEntry) {
        matchedBook = { id: hashEntry.bookId };
      }
    }

    if (matchedBook) {
      const existing = await db
        .select()
        .from(readingProgress)
        .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, matchedBook.id)))
        .get();

      const finishedAt = percentage >= 0.98 ? now : null;

      // Try to convert KOReader XPointer → CFI
      let convertedCfi: string | undefined;
      let conversionError: string | undefined;
      const book = await db.select({ filePath: books.filePath, fileFormat: books.fileFormat }).from(books).where(eq(books.id, matchedBook.id)).get();
      if (book?.fileFormat === "epub" && book.filePath) {
        try {
          convertedCfi = await convertPosition(storage.fullPath(book.filePath), progress, "xpointer");
        } catch (e: any) {
          conversionError = e?.message ?? String(e);
        }
      }

      if (existing) {
        await db.update(readingProgress).set({
          percentage: percentage * 100,
          kosyncProgress: progress,
          ...(convertedCfi ? { cfiPosition: convertedCfi } : {}),
          lastReadAt: now,
          deviceId: device_id,
          finishedAt: existing.finishedAt ?? finishedAt,
        }).where(eq(readingProgress.id, existing.id));
      } else {
        await db.insert(readingProgress).values({
          userId, bookId: matchedBook.id,
          percentage: percentage * 100,
          kosyncProgress: progress,
          cfiPosition: convertedCfi ?? null,
          startedAt: now, lastReadAt: now,
          deviceId: device_id, finishedAt,
        });
      }

      // Log sync event
      const matchedBookTitle = db.select({ title: books.title }).from(books).where(eq(books.id, matchedBook.id)).get();
      logActivity(db, {
        type: "sync.push",
        userId,
        bookId: matchedBook.id,
        bookTitle: matchedBookTitle?.title ?? "Unknown",
        details: {
          device,
          md5: document,
          matched: true,
          percentage: Math.round(percentage * 100),
          xpointer: progress,
          xpointerToCfi: convertedCfi ? "ok" : "failed",
          ...(conversionError ? { conversionError } : {}),
        },
        ...(conversionError ? { level: "warn" as const } : {}),
      });
    } else {
      // Store in kosyncProgress for unmatched books
      const existing = await db
        .select().from(kosyncProgress)
        .where(and(eq(kosyncProgress.userId, userId), eq(kosyncProgress.documentHash, document)))
        .get();

      if (existing) {
        await db.update(kosyncProgress)
          .set({ progress, percentage, deviceId: device_id, device, updatedAt: now })
          .where(eq(kosyncProgress.id, existing.id));
      } else {
        await db.insert(kosyncProgress).values({
          userId, documentHash: document,
          progress, percentage,
          deviceId: device_id, device, updatedAt: now,
        });
      }

      logActivity(db, {
        type: "sync.push",
        userId,
        level: "warn",
        details: {
          device,
          md5: document,
          matched: false,
        },
      });
    }

    return reply.send({ document, timestamp });
  });

  // GET /syncs/progress/:document — pull reading position
  app.get<{ Params: { document: string } }>(
    "/syncs/progress/:document",
    { preHandler: authHook },
    async (req, reply) => {
      const { document } = req.params;
      const userId = req.user!.sub;

      // First check readingProgress via books.md5Hash
      let matchedBook = await db
        .select({ id: books.id })
        .from(books)
        .where(eq(books.md5Hash, document))
        .get();

      // Fallback: check hash history for books that changed after metadata edits
      if (!matchedBook) {
        const hashEntry = await db
          .select({ bookId: bookHashes.bookId })
          .from(bookHashes)
          .where(eq(bookHashes.md5Hash, document))
          .get();
        if (hashEntry) {
          matchedBook = { id: hashEntry.bookId };
        }
      }

      if (matchedBook) {
        const progress = await db
          .select().from(readingProgress)
          .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, matchedBook.id)))
          .get();

        if (progress) {
          const matchedTitle = db.select({ title: books.title }).from(books).where(eq(books.id, matchedBook.id)).get();
          logActivity(db, {
            type: "sync.pull",
            userId,
            bookId: matchedBook.id,
            bookTitle: matchedTitle?.title ?? "Unknown",
            details: {
              md5: document,
              matched: true,
              percentage: Math.round(progress.percentage),
            },
          });

          return reply.send({
            document,
            progress: progress.kosyncProgress || `${progress.percentage / 100}`,
            percentage: progress.percentage / 100,
            device: "",
            device_id: progress.deviceId || "",
            timestamp: progress.lastReadAt
              ? Math.floor(new Date(progress.lastReadAt).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
          });
        }
      }

      // Fallback to kosyncProgress
      const kp = await db
        .select().from(kosyncProgress)
        .where(and(eq(kosyncProgress.userId, userId), eq(kosyncProgress.documentHash, document)))
        .get();

      if (kp) {
        return reply.send({
          document,
          progress: kp.progress,
          percentage: kp.percentage,
          device: kp.device || "",
          device_id: kp.deviceId,
          timestamp: Math.floor(new Date(kp.updatedAt).getTime() / 1000),
        });
      }

      return reply.code(404).send({ message: "No progress found" });
    },
  );
}
