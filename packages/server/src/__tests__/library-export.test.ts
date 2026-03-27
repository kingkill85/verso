import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, shelves, shelfBooks, annotations, readingProgress, readingSessions } from "@verso/shared";
import { buildExportData } from "../services/library-export.js";

describe("buildExportData", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let bookId: string;

  beforeEach(async () => {
    ctx = await createTestContext();

    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    userId = reg.user.id;

    bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Export Test Book",
      author: "Test Author",
      filePath: `books/${bookId}/book.epub`,
      fileFormat: "epub",
      fileSize: 2048,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("returns the correct top-level structure", async () => {
    const result = await buildExportData(ctx.db, userId);

    expect(result).toHaveProperty("metadata");
    expect(result).toHaveProperty("annotations");
    expect(result).toHaveProperty("progress");
  });

  it("metadata has version 1", async () => {
    const result = await buildExportData(ctx.db, userId);
    expect(result.metadata.version).toBe(1);
  });

  it("metadata includes exportedAt timestamp", async () => {
    const result = await buildExportData(ctx.db, userId);
    expect(result.metadata.exportedAt).toBeDefined();
    expect(new Date(result.metadata.exportedAt).getTime()).not.toBeNaN();
  });

  it("metadata includes user's books", async () => {
    const result = await buildExportData(ctx.db, userId);
    expect(result.metadata.books).toHaveLength(1);
    expect(result.metadata.books[0].id).toBe(bookId);
    expect(result.metadata.books[0].title).toBe("Export Test Book");
  });

  it("does not include books from other users", async () => {
    const otherReg = await ctx.caller.auth.register({
      email: "other@example.com",
      password: "password123",
      displayName: "Other User",
    });
    const otherId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: otherId,
      title: "Other User's Book",
      author: "Other Author",
      filePath: `books/${otherId}/book.epub`,
      fileFormat: "epub",
      fileSize: 512,
      addedBy: otherReg.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await buildExportData(ctx.db, userId);
    expect(result.metadata.books).toHaveLength(1);
    expect(result.metadata.books[0].id).toBe(bookId);
  });

  it("includes user's shelves", async () => {
    const result = await buildExportData(ctx.db, userId);
    // Default shelves are created on registration
    expect(result.metadata.shelves.length).toBeGreaterThan(0);
    const shelfUserIds = result.metadata.shelves.map((s) => s.userId);
    expect(shelfUserIds.every((id) => id === userId)).toBe(true);
  });

  it("annotations has version 1", async () => {
    const result = await buildExportData(ctx.db, userId);
    expect(result.annotations.version).toBe(1);
    expect(result.annotations.items).toBeDefined();
  });

  it("progress has version 1", async () => {
    const result = await buildExportData(ctx.db, userId);
    expect(result.progress.version).toBe(1);
    expect(result.progress.readingProgress).toBeDefined();
    expect(result.progress.readingSessions).toBeDefined();
  });

  it("includes user's annotations", async () => {
    await ctx.db.insert(annotations).values({
      id: crypto.randomUUID(),
      userId,
      bookId,
      type: "highlight",
      cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
      content: "Highlighted text",
      color: "yellow",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await buildExportData(ctx.db, userId);
    expect(result.annotations.items).toHaveLength(1);
    expect(result.annotations.items[0].userId).toBe(userId);
  });

  it("includes user's reading progress", async () => {
    await ctx.db.insert(readingProgress).values({
      id: crypto.randomUUID(),
      userId,
      bookId,
      percentage: 55,
      startedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });

    const result = await buildExportData(ctx.db, userId);
    expect(result.progress.readingProgress).toHaveLength(1);
    expect(result.progress.readingProgress[0].percentage).toBe(55);
  });

  it("includes user's reading sessions", async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 30 * 60 * 1000);
    await ctx.db.insert(readingSessions).values({
      id: crypto.randomUUID(),
      userId,
      bookId,
      startedAt: now.toISOString(),
      endedAt: later.toISOString(),
      durationMinutes: 30,
    });

    const result = await buildExportData(ctx.db, userId);
    expect(result.progress.readingSessions).toHaveLength(1);
    expect(result.progress.readingSessions[0].durationMinutes).toBe(30);
  });

  it("returns empty collections for user with no data", async () => {
    const emptyReg = await ctx.caller.auth.register({
      email: "empty@example.com",
      password: "password123",
      displayName: "Empty User",
    });

    const result = await buildExportData(ctx.db, emptyReg.user.id);
    expect(result.metadata.books).toHaveLength(0);
    expect(result.annotations.items).toHaveLength(0);
    expect(result.progress.readingProgress).toHaveLength(0);
    expect(result.progress.readingSessions).toHaveLength(0);
  });
});
