import { eq, and, desc } from "drizzle-orm";
import { readingProgress, readingSessions, progressGetInput, progressSyncInput, books } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";
import { convertPosition } from "../../services/epub-position.js";
import { logActivity } from "../../services/activity-log.js";

const SESSION_GAP_MS = 5 * 60 * 1000; // 5 minutes

export const progressRouter = router({
  allForUser: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        bookId: readingProgress.bookId,
        percentage: readingProgress.percentage,
        finishedAt: readingProgress.finishedAt,
      })
      .from(readingProgress)
      .where(eq(readingProgress.userId, ctx.user.sub));
    return rows;
  }),

  get: protectedProcedure.input(progressGetInput).query(async ({ ctx, input }) => {
    const progress = await ctx.db.query.readingProgress.findFirst({
      where: and(
        eq(readingProgress.bookId, input.bookId),
        eq(readingProgress.userId, ctx.user.sub),
      ),
    });
    return progress ?? null;
  }),

  sync: protectedProcedure.input(progressSyncInput).mutation(async ({ ctx, input }) => {
    const now = new Date().toISOString();
    const existing = await ctx.db.query.readingProgress.findFirst({
      where: and(
        eq(readingProgress.bookId, input.bookId),
        eq(readingProgress.userId, ctx.user.sub),
      ),
    });

    const finishedAt = input.percentage >= 98 ? now : null;

    // Track reading session if time was reported
    if (input.timeSpentMinutes && input.timeSpentMinutes > 0) {
      const lastSession = await ctx.db
        .select()
        .from(readingSessions)
        .where(
          and(
            eq(readingSessions.userId, ctx.user.sub),
            eq(readingSessions.bookId, input.bookId),
          )
        )
        .orderBy(desc(readingSessions.endedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      const nowMs = Date.now();
      const lastEndedMs = lastSession ? new Date(lastSession.endedAt).getTime() : 0;

      if (lastSession && nowMs - lastEndedMs < SESSION_GAP_MS) {
        // Extend existing session
        await ctx.db
          .update(readingSessions)
          .set({
            endedAt: now,
            durationMinutes: lastSession.durationMinutes + input.timeSpentMinutes,
          })
          .where(eq(readingSessions.id, lastSession.id));
      } else {
        // Create new session
        await ctx.db.insert(readingSessions).values({
          userId: ctx.user.sub,
          bookId: input.bookId,
          startedAt: now,
          endedAt: now,
          durationMinutes: input.timeSpentMinutes,
        });
      }
    }

    if (existing) {
      // Try to convert CFI → XPointer for KOReader
      let convertedXPointer: string | undefined;
      if (input.cfiPosition) {
        const book = await ctx.db.select({ filePath: books.filePath, fileFormat: books.fileFormat }).from(books).where(eq(books.id, input.bookId)).get();
        if (book?.fileFormat === "epub" && book.filePath) {
          try {
            convertedXPointer = await convertPosition(ctx.storage.fullPath(book.filePath), input.cfiPosition, "cfi");
          } catch { /* conversion failed — leave kosyncProgress unchanged */ }
        }
      }

      const bookRecord = await ctx.db.select({ title: books.title }).from(books).where(eq(books.id, input.bookId)).get();
      logActivity(ctx.db, {
        type: "progress.sync",
        userId: ctx.user.sub,
        bookId: input.bookId,
        bookTitle: bookRecord?.title ?? "Unknown",
        details: {
          action: "updated",
          cfi: input.cfiPosition ?? null,
          convertedXPointer: convertedXPointer ?? null,
          previousCfi: existing.cfiPosition ?? null,
          previousXPointer: existing.kosyncProgress ?? null,
        },
      });

      const [updated] = await ctx.db
        .update(readingProgress)
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          ...(convertedXPointer ? { kosyncProgress: convertedXPointer } : {}),
          currentPage: input.currentPage ?? existing.currentPage,
          timeSpentMinutes: (existing.timeSpentMinutes ?? 0) + (input.timeSpentMinutes ?? 0),
          lastReadAt: now,
          finishedAt: existing.finishedAt ?? finishedAt,
        })
        .where(eq(readingProgress.id, existing.id))
        .returning();
      return updated;
    }

    // Try to convert CFI → XPointer for KOReader
    let convertedXPointer: string | undefined;
    if (input.cfiPosition) {
      const book = await ctx.db.select({ filePath: books.filePath, fileFormat: books.fileFormat }).from(books).where(eq(books.id, input.bookId)).get();
      if (book?.fileFormat === "epub" && book.filePath) {
        try {
          convertedXPointer = await convertPosition(ctx.storage.fullPath(book.filePath), input.cfiPosition, "cfi");
        } catch { /* conversion failed */ }
      }
    }

    const bookRecord2 = await ctx.db.select({ title: books.title }).from(books).where(eq(books.id, input.bookId)).get();
    logActivity(ctx.db, {
      type: "progress.sync",
      userId: ctx.user.sub,
      bookId: input.bookId,
      bookTitle: bookRecord2?.title ?? "Unknown",
      details: {
        action: "created",
        cfi: input.cfiPosition ?? null,
        convertedXPointer: convertedXPointer ?? null,
      },
    });

    const [created] = await ctx.db
      .insert(readingProgress)
      .values({
        userId: ctx.user.sub,
        bookId: input.bookId,
        percentage: input.percentage,
        cfiPosition: input.cfiPosition,
        kosyncProgress: convertedXPointer ?? null,
        currentPage: input.currentPage,
        timeSpentMinutes: input.timeSpentMinutes ?? 0,
        startedAt: now,
        lastReadAt: now,
        finishedAt,
      })
      .returning();
    return created;
  }),

  finish: protectedProcedure.input(progressGetInput).mutation(async ({ ctx, input }) => {
    const now = new Date().toISOString();
    const existing = await ctx.db.query.readingProgress.findFirst({
      where: and(
        eq(readingProgress.bookId, input.bookId),
        eq(readingProgress.userId, ctx.user.sub),
      ),
    });

    if (existing) {
      const [updated] = await ctx.db
        .update(readingProgress)
        .set({ percentage: 100, finishedAt: existing.finishedAt ?? now, lastReadAt: now })
        .where(eq(readingProgress.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await ctx.db
      .insert(readingProgress)
      .values({
        userId: ctx.user.sub,
        bookId: input.bookId,
        percentage: 100,
        startedAt: now,
        lastReadAt: now,
        finishedAt: now,
      })
      .returning();
    return created;
  }),

  reset: protectedProcedure.input(progressGetInput).mutation(async ({ ctx, input }) => {
    const now = new Date().toISOString();
    const existing = await ctx.db.query.readingProgress.findFirst({
      where: and(
        eq(readingProgress.bookId, input.bookId),
        eq(readingProgress.userId, ctx.user.sub),
      ),
    });

    if (existing) {
      const bookRecord = await ctx.db.select({ title: books.title }).from(books).where(eq(books.id, input.bookId)).get();
      logActivity(ctx.db, {
        type: "progress.reset",
        userId: ctx.user.sub,
        bookId: input.bookId,
        bookTitle: bookRecord?.title ?? "Unknown",
        details: {
          previousCfi: existing.cfiPosition ?? null,
          previousXPointer: existing.kosyncProgress ?? null,
          previousLastReadAt: existing.lastReadAt,
        },
      });

      await ctx.db
        .update(readingProgress)
        .set({
          percentage: 0,
          cfiPosition: null,
          kosyncProgress: null,
          currentPage: null,
          finishedAt: null,
          lastReadAt: now,
        })
        .where(eq(readingProgress.id, existing.id));
    }

    return { success: true };
  }),
});
