import { eq, and, gte, sql, desc } from "drizzle-orm";
import {
  readingSessions,
  readingProgress,
  books,
  statsRangeInput,
  statsReadingLogInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

function getRangeStart(range: "week" | "month" | "year" | "all"): string | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "week") now.setDate(now.getDate() - 7);
  else if (range === "month") now.setMonth(now.getMonth() - 1);
  else if (range === "year") now.setFullYear(now.getFullYear() - 1);
  return now.toISOString();
}

function rangeDays(range: "week" | "month" | "year" | "all"): number {
  if (range === "week") return 7;
  if (range === "month") return 30;
  if (range === "year") return 365;
  return 0; // computed from first session for "all"
}

export const statsRouter = router({
  overview: protectedProcedure.input(statsRangeInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const rangeStart = getRangeStart(input.range);

    // Total time from sessions in range
    const timeResult = await ctx.db
      .select({ total: sql<number>`coalesce(sum(${readingSessions.durationMinutes}), 0)` })
      .from(readingSessions)
      .where(
        and(
          eq(readingSessions.userId, userId),
          rangeStart ? gte(readingSessions.startedAt, rangeStart) : undefined,
        )
      );
    const timeReadMinutes = timeResult[0]?.total ?? 0;

    // Books finished in range
    const finishedResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.userId, userId),
          sql`${readingProgress.finishedAt} IS NOT NULL`,
          rangeStart ? gte(readingProgress.finishedAt, rangeStart) : undefined,
        )
      );
    const booksFinished = finishedResult[0]?.count ?? 0;

    // Books in progress
    const inProgressResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.userId, userId),
          sql`${readingProgress.percentage} > 0`,
          sql`${readingProgress.finishedAt} IS NULL`,
        )
      );
    const booksInProgress = inProgressResult[0]?.count ?? 0;

    // Current streak: consecutive days with sessions ending today/yesterday and going back
    const dailySessions = await ctx.db
      .select({
        day: sql<string>`date(${readingSessions.startedAt})`.as("day"),
      })
      .from(readingSessions)
      .where(eq(readingSessions.userId, userId))
      .groupBy(sql`date(${readingSessions.startedAt})`)
      .orderBy(desc(sql`date(${readingSessions.startedAt})`));

    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < dailySessions.length; i++) {
      const sessionDate = new Date(dailySessions[i].day + "T00:00:00");
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);
      expectedDate.setHours(0, 0, 0, 0);

      // Allow streak to start from today or yesterday
      if (i === 0) {
        const diffDays = Math.floor((today.getTime() - sessionDate.getTime()) / 86400000);
        if (diffDays > 1) break; // No recent reading
        if (diffDays === 1) {
          // Started from yesterday — shift expected dates
          expectedDate.setDate(expectedDate.getDate() - 1);
        }
      }

      if (sessionDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Avg per day
    let days = rangeDays(input.range);
    if (input.range === "all" && dailySessions.length > 0) {
      const firstDay = new Date(dailySessions[dailySessions.length - 1].day);
      days = Math.max(1, Math.ceil((Date.now() - firstDay.getTime()) / 86400000));
    }
    const avgMinutesPerDay = days > 0 ? Math.round(timeReadMinutes / days) : 0;

    return { timeReadMinutes, booksFinished, booksInProgress, currentStreak, avgMinutesPerDay };
  }),

  dailyReading: protectedProcedure.input(statsRangeInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const rangeStart = getRangeStart(input.range);

    const rows = await ctx.db
      .select({
        date: sql<string>`date(${readingSessions.startedAt})`.as("date"),
        minutes: sql<number>`sum(${readingSessions.durationMinutes})`.as("minutes"),
      })
      .from(readingSessions)
      .where(
        and(
          eq(readingSessions.userId, userId),
          rangeStart ? gte(readingSessions.startedAt, rangeStart) : undefined,
        )
      )
      .groupBy(sql`date(${readingSessions.startedAt})`)
      .orderBy(sql`date(${readingSessions.startedAt})`);

    return rows.map((r) => ({ date: r.date, minutes: r.minutes }));
  }),

  distribution: protectedProcedure.input(statsRangeInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const rangeStart = getRangeStart(input.range);

    const rows = await ctx.db
      .select({
        author: books.author,
        minutes: sql<number>`sum(${readingSessions.durationMinutes})`.as("minutes"),
      })
      .from(readingSessions)
      .innerJoin(books, eq(readingSessions.bookId, books.id))
      .where(
        and(
          eq(readingSessions.userId, userId),
          rangeStart ? gte(readingSessions.startedAt, rangeStart) : undefined,
        )
      )
      .groupBy(books.author)
      .orderBy(desc(sql`sum(${readingSessions.durationMinutes})`))
      .limit(6);

    const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);
    return rows.map((r) => ({
      author: r.author,
      minutes: r.minutes,
      percentage: totalMinutes > 0 ? Math.round((r.minutes / totalMinutes) * 100) : 0,
    }));
  }),

  readingLog: protectedProcedure.input(statsReadingLogInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const limit = input.limit ?? 20;

    const conditions = [eq(readingSessions.userId, userId)];
    if (input.cursor) {
      conditions.push(sql`${readingSessions.startedAt} < ${input.cursor}`);
    }

    const rows = await ctx.db
      .select({
        id: readingSessions.id,
        bookId: readingSessions.bookId,
        bookTitle: books.title,
        bookAuthor: books.author,
        coverPath: books.coverPath,
        durationMinutes: readingSessions.durationMinutes,
        startedAt: readingSessions.startedAt,
      })
      .from(readingSessions)
      .innerJoin(books, eq(readingSessions.bookId, books.id))
      .where(and(...conditions))
      .orderBy(desc(readingSessions.startedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1].startedAt : undefined;

    return { items, nextCursor };
  }),
});
