import { eq, and } from "drizzle-orm";
import { readingProgress, progressGetInput, progressSyncInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

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

    if (existing) {
      const [updated] = await ctx.db
        .update(readingProgress)
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          currentPage: input.currentPage ?? existing.currentPage,
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
        startedAt: now,
        lastReadAt: now,
        finishedAt,
      })
      .returning();
    return created;
  }),
});
