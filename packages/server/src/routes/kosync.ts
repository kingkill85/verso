import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { createKosyncAuthHook } from "../middleware/kosync-auth.js";
import { books, devices, readingProgress, kosyncProgress, kosyncProgressPushInput } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";

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
    const matchedBook = await db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.md5Hash, document))
      .get();

    if (matchedBook) {
      const existing = await db
        .select()
        .from(readingProgress)
        .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, matchedBook.id)))
        .get();

      const finishedAt = percentage >= 0.98 ? now : null;

      if (existing) {
        await db.update(readingProgress).set({
          percentage: percentage * 100,
          cfiPosition: null,  // Clear CFI — web reader will recalculate from percentage
          lastReadAt: now,
          deviceId: device_id,
          finishedAt: existing.finishedAt ?? finishedAt,
        }).where(eq(readingProgress.id, existing.id));
      } else {
        await db.insert(readingProgress).values({
          userId, bookId: matchedBook.id,
          percentage: percentage * 100,
          cfiPosition: null,  // No CFI from kosync
          startedAt: now, lastReadAt: now,
          deviceId: device_id, finishedAt,
        });
      }
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
      const matchedBook = await db
        .select({ id: books.id })
        .from(books)
        .where(eq(books.md5Hash, document))
        .get();

      if (matchedBook) {
        const progress = await db
          .select().from(readingProgress)
          .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, matchedBook.id)))
          .get();

        if (progress) {
          return reply.send({
            document,
            progress: `${progress.percentage / 100}`,
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
