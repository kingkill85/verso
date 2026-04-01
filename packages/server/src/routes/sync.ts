import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  devices, books, bookHashes, pageStats, readingSessions, readingProgress, annotations,
  koinsightDeviceInput, koinsightImportInput,
} from "@verso/shared";
import { createAppPasswordAuthHook } from "../middleware/app-password-auth.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";
import { logActivity } from "../services/activity-log.js";

const MIN_VERSION = [0, 3, 0];

function isVersionValid(version: string): boolean {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_VERSION[i]) return true;
    if (parts[i] < MIN_VERSION[i]) return false;
  }
  return true; // equal
}

export function registerSyncRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config,
) {
  const authHook = createAppPasswordAuthHook(db);

  // GET /api/sync/health — no auth
  app.get("/api/sync/health", async (_req, reply) => {
    return reply.send({ status: "ok", version: "0.3.0" });
  });

  // POST /api/sync/device — register device
  app.post("/api/sync/device", { preHandler: authHook }, async (req, reply) => {
    const parsed = koinsightDeviceInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid request body" });
    }

    const { version, id, model } = parsed.data;
    if (!isVersionValid(version)) {
      return reply.code(400).send({ message: `Plugin version ${version} is below minimum 0.3.0` });
    }

    const userId = req.user!.sub;
    const now = new Date().toISOString();

    const existing = await db.select().from(devices).where(eq(devices.id, id)).get();
    if (existing) {
      await db.update(devices).set({ model, lastSeen: now }).where(eq(devices.id, id));
    } else {
      await db.insert(devices).values({ id, userId, model, lastSeen: now });
    }

    return reply.send({ message: "Device registered successfully" });
  });

  // POST /api/sync/import — import stats + annotations
  app.post("/api/sync/import", { preHandler: authHook }, async (req, reply) => {
    const parsed = koinsightImportInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid request body" });
    }

    const { version, device_id: bodyDeviceId, books: importBooks, stats, annotations: importAnnotations } = parsed.data;
    if (!isVersionValid(version)) {
      return reply.code(400).send({ message: `Plugin version ${version} is below minimum 0.3.0` });
    }

    const userId = req.user!.sub;

    // Resolve device_id: from body, from first stat entry, or null
    const device_id = bodyDeviceId
      || (stats.length > 0 ? stats[0].device_id : undefined)
      || null;

    // If we have a device_id, verify it belongs to this user
    if (device_id) {
      const device = await db.select().from(devices).where(and(eq(devices.id, device_id), eq(devices.userId, userId))).get();
      if (!device) {
        return reply.code(403).send({ message: "Device not registered to this user" });
      }
    }

    // Build MD5 → bookId map
    const md5ToBookId = new Map<string, string>();
    for (const b of importBooks) {
      let matched = await db.select({ id: books.id }).from(books).where(eq(books.md5Hash, b.md5)).get();
      if (!matched) {
        try {
          const hashEntry = await db
            .select({ bookId: bookHashes.bookId })
            .from(bookHashes)
            .where(eq(bookHashes.md5Hash, b.md5))
            .get();
          if (hashEntry) matched = { id: hashEntry.bookId };
        } catch { /* table may not exist yet */ }
      }
      if (matched) {
        md5ToBookId.set(b.md5, matched.id);
      }
    }

    // Insert page stats (ON CONFLICT DO NOTHING)
    for (const stat of stats) {
      try {
        await db.insert(pageStats).values({
          userId,
          bookId: md5ToBookId.get(stat.book_md5) || null,
          bookMd5: stat.book_md5,
          deviceId: device_id || stat.device_id || "unknown",
          page: stat.page,
          startTime: stat.start_time,
          duration: stat.duration,
          totalPages: stat.total_pages,
        }).onConflictDoNothing();
      } catch {
        // Ignore duplicate
      }
    }

    // Synthesize reading sessions from page stats
    const statsByBook = new Map<string, typeof stats>();
    for (const stat of stats) {
      const existing = statsByBook.get(stat.book_md5) || [];
      existing.push(stat);
      statsByBook.set(stat.book_md5, existing);
    }

    const SESSION_GAP_SECONDS = 5 * 60;

    for (const [md5, bookStats] of statsByBook) {
      const sorted = [...bookStats].sort((a, b) => a.start_time - b.start_time);
      const bookId = md5ToBookId.get(md5) || null;

      // Only create sessions for matched books (bookId NOT NULL constraint on readingSessions)
      if (!bookId) continue;

      // Group into sessions
      const sessionGroups: (typeof sorted)[] = [];
      let currentGroup: typeof sorted = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (curr.start_time - (prev.start_time + prev.duration) > SESSION_GAP_SECONDS) {
          sessionGroups.push(currentGroup);
          currentGroup = [curr];
        } else {
          currentGroup.push(curr);
        }
      }
      sessionGroups.push(currentGroup);

      // Create sessions
      for (const group of sessionGroups) {
        const first = group[0];
        const last = group[group.length - 1];
        const totalDuration = group.reduce((sum, s) => sum + s.duration, 0);
        const durationMinutes = Math.ceil(totalDuration / 60);

        const startedAt = new Date(first.start_time * 1000).toISOString();
        const endedAt = new Date((last.start_time + last.duration) * 1000).toISOString();

        // Check for existing session to avoid duplicates
        const existingSession = await db
          .select()
          .from(readingSessions)
          .where(
            and(
              eq(readingSessions.userId, userId),
              eq(readingSessions.bookId, bookId),
              eq(readingSessions.startedAt, startedAt),
            ),
          )
          .get();

        if (!existingSession) {
          await db.insert(readingSessions).values({
            userId,
            bookId,
            startedAt,
            endedAt,
            durationMinutes,
            deviceId: device_id,
            source: "koinsight",
            bookTitle: null,
          });
        }
      }

      // Update readingProgress for matched books
      const totalTime = sorted.reduce((sum, s) => sum + s.duration, 0);
      const lastStat = sorted[sorted.length - 1];
      const percentage = lastStat.total_pages > 0
        ? Math.min(100, Math.round((lastStat.page / lastStat.total_pages) * 100))
        : 0;
      const now = new Date().toISOString();

      const existingProgress = await db
        .select()
        .from(readingProgress)
        .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, bookId)))
        .get();

      // Look up book title for logging
      const bookRecord = await db.select({ title: books.title }).from(books).where(eq(books.id, bookId)).get();
      const bookTitle = bookRecord?.title ?? md5;

      if (existingProgress) {
        // Only update position if the incoming data is newer than what's stored
        const lastStatTime = new Date(lastStat.start_time * 1000);
        const storedTime = existingProgress.lastReadAt ? new Date(existingProgress.lastReadAt) : new Date(0);
        const isNewer = lastStatTime > storedTime;

        logActivity(db, {
          type: "sync.import.progress",
          userId,
          bookId,
          bookTitle,
          level: isNewer ? "info" : "warn",
          details: {
            action: isNewer ? "updated" : "skipped_stale",
            incomingPercentage: percentage,
            incomingPage: lastStat.page,
            incomingTotalPages: lastStat.total_pages,
            incomingLastStatTime: lastStatTime.toISOString(),
            storedPercentage: existingProgress.percentage,
            storedLastReadAt: existingProgress.lastReadAt,
            storedCfi: existingProgress.cfiPosition ?? null,
            storedKosync: existingProgress.kosyncProgress ?? null,
          },
        });

        await db.update(readingProgress).set({
          // Always update time spent (additive stat)
          timeSpentMinutes: Math.ceil(totalTime / 60),
          // Only update position if KOReader data is newer
          ...(isNewer ? {
            percentage,
            currentPage: lastStat.page,
            totalPages: lastStat.total_pages,
            lastReadAt: now,
            deviceId: device_id,
            finishedAt: existingProgress.finishedAt ?? (percentage >= 98 ? now : null),
          } : {}),
        }).where(eq(readingProgress.id, existingProgress.id));
      } else {
        logActivity(db, {
          type: "sync.import.progress",
          userId,
          bookId,
          bookTitle,
          details: {
            action: "created",
            percentage,
            page: lastStat.page,
            totalPages: lastStat.total_pages,
            lastStatTime: new Date(lastStat.start_time * 1000).toISOString(),
          },
        });

        await db.insert(readingProgress).values({
          userId, bookId, percentage,
          currentPage: lastStat.page,
          totalPages: lastStat.total_pages,
          timeSpentMinutes: Math.ceil(totalTime / 60),
          startedAt: now, lastReadAt: now,
          deviceId: device_id,
          finishedAt: percentage >= 98 ? now : null,
        });
      }
    }

    // Import annotations — replace per book_md5 + device
    for (const [md5, anns] of Object.entries(importAnnotations)) {
      const bookId = md5ToBookId.get(md5);
      if (!bookId) continue;

      // Delete existing annotations from this device for this book
      if (device_id) {
        await db.delete(annotations).where(
          and(
            eq(annotations.userId, userId),
            eq(annotations.bookId, bookId),
            eq(annotations.deviceId, device_id),
            eq(annotations.source, "koinsight"),
          ),
        );
      }

      // Insert new annotations
      for (const ann of anns) {
        await db.insert(annotations).values({
          userId, bookId,
          type: ann.type || "highlight",
          content: ann.text || null,
          note: ann.note || null,
          cfiPosition: null,
          pageNumber: String(ann.page),
          chapter: ann.chapter || null,
          deviceId: device_id,
          source: "koinsight",
        });
      }
    }

    return reply.send({ message: "Upload successful" });
  });
}
