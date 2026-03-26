import { eq, and, desc } from "drizzle-orm";
import { readingProgress, readingSessions, progressGetInput, progressSyncInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

const SESSION_GAP_MS = 5 * 60 * 1000; // 5 minutes

export const progressRouter = router({
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
      const [updated] = await ctx.db
        .update(readingProgress)
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          currentPage: input.currentPage ?? existing.currentPage,
          timeSpentMinutes: (existing.timeSpentMinutes ?? 0) + (input.timeSpentMinutes ?? 0),
          lastReadAt: now,
          finishedAt: existing.finishedAt ?? finishedAt,
        })
        .where(eq(readingProgress.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await ctx.db
      .insert(readingProgress)
      .values({
        userId: ctx.user.sub,
        bookId: input.bookId,
        percentage: input.percentage,
        cfiPosition: input.cfiPosition,
        currentPage: input.currentPage,
        timeSpentMinutes: input.timeSpentMinutes ?? 0,
        startedAt: now,
        lastReadAt: now,
        finishedAt,
      })
      .returning();
    return created;
  }),
});
