import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, readingProgress } from "@verso/shared";

describe("progress router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;
  let bookId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${bookId}.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe("get", () => {
    it("returns null when no progress exists", async () => {
      const result = await authedCaller.progress.get({ bookId });
      expect(result).toBeNull();
    });

    it("returns progress after sync", async () => {
      await authedCaller.progress.sync({
        bookId,
        percentage: 25,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
      });
      const result = await authedCaller.progress.get({ bookId });
      expect(result).not.toBeNull();
      expect(result!.percentage).toBe(25);
      expect(result!.cfiPosition).toBe("epubcfi(/6/4!/4/2/1:0)");
    });
  });

  describe("sync", () => {
    it("creates progress on first sync and sets startedAt", async () => {
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 10,
      });
      expect(result.percentage).toBe(10);
      expect(result.startedAt).not.toBeNull();
      expect(result.finishedAt).toBeNull();
      expect(result.lastReadAt).not.toBeNull();
    });

    it("updates existing progress on subsequent sync", async () => {
      await authedCaller.progress.sync({ bookId, percentage: 10 });
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 50,
        cfiPosition: "epubcfi(/6/10!/4/2/1:0)",
      });
      expect(result.percentage).toBe(50);
      expect(result.cfiPosition).toBe("epubcfi(/6/10!/4/2/1:0)");
    });

    it("auto-finishes at 98% or above", async () => {
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 99,
      });
      expect(result.finishedAt).not.toBeNull();
    });

    it("does not auto-finish below 98%", async () => {
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 97,
      });
      expect(result.finishedAt).toBeNull();
    });

    it("preserves startedAt on subsequent syncs", async () => {
      const first = await authedCaller.progress.sync({ bookId, percentage: 5 });
      const second = await authedCaller.progress.sync({ bookId, percentage: 20 });
      expect(second.startedAt).toBe(first.startedAt);
    });
  });
});
