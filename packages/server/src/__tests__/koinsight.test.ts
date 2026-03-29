import { describe, it, expect, beforeEach } from "vitest";
import {
  koinsightDeviceInput,
  koinsightImportInput,
  koinsightAnnotationInput,
  devices,
  books,
  readingSessions,
  readingProgress,
  pageStats,
  annotations,
  users,
} from "@verso/shared";
import { createTestContext } from "../test-utils.js";
import { buildApp } from "../app.js";
import { createHash } from "node:crypto";
import { hash } from "bcrypt";
import { eq } from "drizzle-orm";

describe("koinsight validators", () => {
  it("validates device registration", () => {
    const result = koinsightDeviceInput.safeParse({
      version: "0.3.0",
      id: "kindle-001",
      model: "Kindle Paperwhite",
    });
    expect(result.success).toBe(true);
  });

  it("validates import input with book_md5", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [{ md5: "abc123", title: "Book", authors: "Author", pages: 200 }],
      stats: [{ book_md5: "abc123", page: 1, start_time: 1700000000, duration: 60, total_pages: 200 }],
      annotations: {},
    });
    expect(result.success).toBe(true);
  });

  it("validates import without device_id", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      books: [],
      stats: [],
      annotations: {},
    });
    expect(result.success).toBe(true);
  });

  it("validates import with annotations", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [],
      stats: [],
      annotations: {
        abc123: [
          { chapter: "Ch 1", text: "highlighted text", page: 5, type: "highlight" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates annotation with string page (EPUB xPointer)", () => {
    const result = koinsightAnnotationInput.safeParse({
      chapter: "Ch 1",
      text: "highlighted",
      page: "/body/DocFragment[17]/body/div/p/text().0",
      type: "highlight",
    });
    expect(result.success).toBe(true);
  });
});

describe("sync endpoints", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let userEmail: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";

    // Set app password
    const appPassword = "mysyncpass";
    const appPasswordHash = await hash(appPassword, 10);
    const appPasswordMd5 = createHash("md5").update(appPassword).digest("hex");
    await ctx.db.update(users).set({ appPasswordHash, appPasswordMd5 }).where(eq(users.id, userId));
  });

  const authHeader = () =>
    `Basic ${Buffer.from(`${userEmail}:mysyncpass`).toString("base64")}`;

  describe("GET /api/sync/health", () => {
    it("returns ok without auth", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({ method: "GET", url: "/api/sync/health" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.3.0");
    });
  });

  describe("POST /api/sync/device", () => {
    it("registers a device", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST",
        url: "/api/sync/device",
        headers: { authorization: authHeader() },
        payload: { version: "0.3.0", id: "kobo-001", model: "Kobo Libra" },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).message).toBe("Device registered successfully");

      const d = await ctx.db.select().from(devices).all();
      expect(d).toHaveLength(1);
      expect(d[0].id).toBe("kobo-001");
    });

    it("rejects version below 0.3.0", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST",
        url: "/api/sync/device",
        headers: { authorization: authHeader() },
        payload: { version: "0.2.0", id: "kobo-001", model: "Kobo" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("accepts version above 0.3.0", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST",
        url: "/api/sync/device",
        headers: { authorization: authHeader() },
        payload: { version: "0.4.1", id: "kobo-001", model: "Kobo" },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /api/sync/import", () => {
    async function registerDevice() {
      await ctx.db.insert(devices).values({
        id: "kobo-001", userId,
        model: "Kobo Libra",
        lastSeen: new Date().toISOString(),
      });
    }

    async function insertBook(md5: string) {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId, title: "Import Test Book", author: "Author",
        filePath: "books/test.epub", fileFormat: "epub",
        fileSize: 1000, fileHash: "sha",
        md5Hash: md5, addedBy: userId,
      });
      return bookId;
    }

    it("imports page stats and synthesizes sessions", async () => {
      await registerDevice();
      const bookMd5 = "import_test_md5_1234567890abcde";
      const bookId = await insertBook(bookMd5);

      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST", url: "/api/sync/import",
        headers: { authorization: authHeader() },
        payload: {
          version: "0.3.0", device_id: "kobo-001",
          books: [{ md5: bookMd5, title: "Import Test Book", authors: "Author", pages: 200 }],
          stats: [
            { book_md5: bookMd5, page: 1, start_time: 1700000000, duration: 60, total_pages: 200 },
            { book_md5: bookMd5, page: 2, start_time: 1700000070, duration: 60, total_pages: 200 },
            { book_md5: bookMd5, page: 3, start_time: 1700000140, duration: 60, total_pages: 200 },
          ],
          annotations: {},
        },
      });
      expect(res.statusCode).toBe(200);

      const stats = await ctx.db.select().from(pageStats).all();
      expect(stats).toHaveLength(3);

      const sessions = await ctx.db.select().from(readingSessions).all();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].source).toBe("koinsight");
      expect(sessions[0].durationMinutes).toBe(3);

      const progress = await ctx.db.select().from(readingProgress).all();
      expect(progress).toHaveLength(1);
      expect(progress[0].bookId).toBe(bookId);
    });

    it("imports annotations with string pageNumber", async () => {
      await registerDevice();
      const bookMd5 = "annotate_test_md5_1234567890abc";
      await insertBook(bookMd5);

      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST", url: "/api/sync/import",
        headers: { authorization: authHeader() },
        payload: {
          version: "0.3.0", device_id: "kobo-001",
          books: [{ md5: bookMd5, title: "Test", authors: "Author", pages: 100 }],
          stats: [],
          annotations: {
            [bookMd5]: [
              { chapter: "Chapter 1", text: "Important passage", page: 15, type: "highlight" },
              { chapter: "Chapter 2", text: "Another bit", note: "my note", page: 30, type: "highlight" },
            ],
          },
        },
      });
      expect(res.statusCode).toBe(200);

      const anns = await ctx.db.select().from(annotations).all();
      expect(anns).toHaveLength(2);
      expect(anns[0].source).toBe("koinsight");
      expect(anns[0].pageNumber).toBe("15"); // stored as text now
      expect(anns[0].cfiPosition).toBeNull();
    });

    it("handles dedup on re-import", async () => {
      await registerDevice();
      const bookMd5 = "dedup_test_md5_1234567890abcdef";
      await insertBook(bookMd5);

      const app = await buildApp(ctx.config, ctx.db);
      const payload = {
        version: "0.3.0", device_id: "kobo-001",
        books: [{ md5: bookMd5, title: "Test", authors: "Author", pages: 100 }],
        stats: [
          { book_md5: bookMd5, page: 1, start_time: 1700000000, duration: 60, total_pages: 100 },
        ],
        annotations: {},
      };

      await app.inject({ method: "POST", url: "/api/sync/import", headers: { authorization: authHeader() }, payload });
      await app.inject({ method: "POST", url: "/api/sync/import", headers: { authorization: authHeader() }, payload });

      const stats = await ctx.db.select().from(pageStats).all();
      expect(stats).toHaveLength(1);
    });

    it("rejects version below 0.3.0", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST", url: "/api/sync/import",
        headers: { authorization: authHeader() },
        payload: {
          version: "0.2.0", device_id: "kobo-001",
          books: [], stats: [], annotations: {},
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
