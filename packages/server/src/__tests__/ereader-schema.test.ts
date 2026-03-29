import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import {
  books,
  devices,
  kosyncProgress,
  pageStats,
  readingSessions,
  readingProgress,
  annotations,
  createApiKeyInput,
} from "@verso/shared";
import {
  kosyncProgressPushInput,
  kosyncProgressPullParams,
} from "@verso/shared";

describe("e-reader schema", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    userId = reg.user.id;
  });

  it("books table has md5Hash column", async () => {
    const id = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc123",
      md5Hash: "d41d8cd98f00b204e9800998ecf8427e",
      addedBy: userId,
    });
    const book = await ctx.db.select().from(books).get();
    expect(book!.md5Hash).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });

  it("devices table works", async () => {
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "My Kindle",
      model: "Kindle Paperwhite",
      lastSeen: new Date().toISOString(),
    });
    const device = await ctx.db.select().from(devices).get();
    expect(device!.id).toBe("kindle-001");
    expect(device!.model).toBe("Kindle Paperwhite");
  });

  it("kosyncProgress table works with unique constraint", async () => {
    const now = new Date().toISOString();
    await ctx.db.insert(kosyncProgress).values({
      userId,
      documentHash: "abc123def456",
      progress: "50",
      percentage: 0.5,
      deviceId: "kindle-001",
      device: "Kindle",
      updatedAt: now,
    });
    const row = await ctx.db.select().from(kosyncProgress).get();
    expect(row!.documentHash).toBe("abc123def456");
    expect(row!.percentage).toBe(0.5);
  });

  it("pageStats table works with dedup index", async () => {
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "Kindle",
      model: "Kindle",
      lastSeen: new Date().toISOString(),
    });
    await ctx.db.insert(pageStats).values({
      userId,
      bookId: null,
      bookMd5: "abc123",
      deviceId: "kindle-001",
      page: 1,
      startTime: 1700000000,
      duration: 60,
      totalPages: 200,
    });
    const row = await ctx.db.select().from(pageStats).get();
    expect(row!.page).toBe(1);
    expect(row!.duration).toBe(60);
  });

  it("readingSessions has deviceId, source, bookTitle columns", async () => {
    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc",
      addedBy: userId,
    });
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "Kindle",
      model: "Kindle",
      lastSeen: new Date().toISOString(),
    });
    const now = new Date().toISOString();
    await ctx.db.insert(readingSessions).values({
      userId,
      bookId,
      startedAt: now,
      endedAt: now,
      durationMinutes: 10,
      deviceId: "kindle-001",
      source: "koinsight",
      bookTitle: "Fallback Title",
    });
    const session = await ctx.db.select().from(readingSessions).get();
    expect(session!.deviceId).toBe("kindle-001");
    expect(session!.source).toBe("koinsight");
    expect(session!.bookTitle).toBe("Fallback Title");
  });

  it("readingProgress has deviceId column", async () => {
    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc",
      addedBy: userId,
    });
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "Kindle",
      model: "Kindle",
      lastSeen: new Date().toISOString(),
    });
    await ctx.db.insert(readingProgress).values({
      userId,
      bookId,
      percentage: 50,
      deviceId: "kindle-001",
    });
    const progress = await ctx.db.select().from(readingProgress).get();
    expect(progress!.deviceId).toBe("kindle-001");
  });

  it("annotations allows null cfiPosition with pageNumber", async () => {
    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc",
      addedBy: userId,
    });
    await ctx.db.insert(annotations).values({
      userId,
      bookId,
      type: "highlight",
      content: "Some text",
      cfiPosition: null,
      pageNumber: 42,
      source: "koinsight",
    });
    const ann = await ctx.db.select().from(annotations).get();
    expect(ann!.cfiPosition).toBeNull();
    expect(ann!.pageNumber).toBe(42);
    expect(ann!.source).toBe("koinsight");
  });
});

describe("kosync validators", () => {
  it("validates progress push input", () => {
    const result = kosyncProgressPushInput.safeParse({
      document: "d41d8cd98f00b204e9800998ecf8427e",
      progress: "page-42",
      percentage: 0.42,
      device: "Kindle Paperwhite",
      device_id: "kindle-001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects progress push without document", () => {
    const result = kosyncProgressPushInput.safeParse({
      progress: "page-42",
      percentage: 0.42,
      device: "Kindle",
      device_id: "kindle-001",
    });
    expect(result.success).toBe(false);
  });

  it("validates progress pull params", () => {
    const result = kosyncProgressPullParams.safeParse({
      document: "d41d8cd98f00b204e9800998ecf8427e",
    });
    expect(result.success).toBe(true);
  });
});

describe("api key scopes", () => {
  it("accepts kosync scope", () => {
    const result = createApiKeyInput.safeParse({
      name: "KOReader",
      scopes: ["kosync"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts plugin scope", () => {
    const result = createApiKeyInput.safeParse({
      name: "KoInsight",
      scopes: ["plugin"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid scope", () => {
    const result = createApiKeyInput.safeParse({
      name: "Bad",
      scopes: ["invalid"],
    });
    expect(result.success).toBe(false);
  });
});
