import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, readingSessions, readingProgress } from "@verso/shared";

describe("stats router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;
  let bookId1: string;
  let bookId2: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    bookId1 = crypto.randomUUID();
    bookId2 = crypto.randomUUID();
    const now = new Date().toISOString();

    await ctx.db.insert(books).values([
      {
        id: bookId1,
        title: "Dune",
        author: "Frank Herbert",
        filePath: `books/${bookId1}.epub`,
        fileFormat: "epub",
        fileSize: 1024,
        addedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: bookId2,
        title: "Neuromancer",
        author: "William Gibson",
        filePath: `books/${bookId2}.epub`,
        fileFormat: "epub",
        fileSize: 2048,
        addedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  describe("overview", () => {
    it("returns zeros when no reading data exists", async () => {
      const result = await authedCaller.stats.overview({ range: "all" });
      expect(result.timeReadMinutes).toBe(0);
      expect(result.booksFinished).toBe(0);
      expect(result.booksInProgress).toBe(0);
      expect(result.currentStreak).toBe(0);
      expect(result.avgMinutesPerDay).toBe(0);
    });

    it("returns correct totals from reading sessions", async () => {
      const today = new Date().toISOString();

      await ctx.db.insert(readingSessions).values([
        {
          userId,
          bookId: bookId1,
          startedAt: today,
          endedAt: today,
          durationMinutes: 30,
        },
        {
          userId,
          bookId: bookId2,
          startedAt: today,
          endedAt: today,
          durationMinutes: 45,
        },
      ]);

      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: bookId1,
        percentage: 100,
        startedAt: today,
        lastReadAt: today,
        finishedAt: today,
        timeSpentMinutes: 30,
      });

      const result = await authedCaller.stats.overview({ range: "all" });
      expect(result.timeReadMinutes).toBe(75);
      expect(result.booksFinished).toBe(1);
    });
  });

  describe("dailyReading", () => {
    it("returns daily breakdown from sessions", async () => {
      const today = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString();

      await ctx.db.insert(readingSessions).values([
        {
          userId,
          bookId: bookId1,
          startedAt: today,
          endedAt: today,
          durationMinutes: 30,
        },
        {
          userId,
          bookId: bookId1,
          startedAt: yesterday,
          endedAt: yesterday,
          durationMinutes: 45,
        },
      ]);

      const result = await authedCaller.stats.dailyReading({ range: "week" });
      expect(result.length).toBeGreaterThanOrEqual(2);
      const totalMinutes = result.reduce((sum, d) => sum + d.minutes, 0);
      expect(totalMinutes).toBe(75);
    });
  });

  describe("distribution", () => {
    it("returns reading time grouped by author", async () => {
      const today = new Date().toISOString();

      await ctx.db.insert(readingSessions).values([
        {
          userId,
          bookId: bookId1,
          startedAt: today,
          endedAt: today,
          durationMinutes: 60,
        },
        {
          userId,
          bookId: bookId2,
          startedAt: today,
          endedAt: today,
          durationMinutes: 30,
        },
      ]);

      const result = await authedCaller.stats.distribution({ range: "all" });
      expect(result).toHaveLength(2);
      const herbert = result.find((d) => d.author === "Frank Herbert");
      expect(herbert).toBeDefined();
      expect(herbert!.minutes).toBe(60);
    });
  });

  describe("readingLog", () => {
    it("returns recent sessions with book info", async () => {
      const today = new Date().toISOString();

      await ctx.db.insert(readingSessions).values({
        userId,
        bookId: bookId1,
        startedAt: today,
        endedAt: today,
        durationMinutes: 30,
      });

      const result = await authedCaller.stats.readingLog({ limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].bookTitle).toBe("Dune");
      expect(result.items[0].durationMinutes).toBe(30);
    });
  });
});
