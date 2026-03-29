import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { buildApp } from "../app.js";
import { createApiKey } from "../services/api-keys.js";
import { books, readingProgress, kosyncProgress, devices } from "@verso/shared";
import type { FastifyInstance } from "fastify";

describe("kosync endpoints", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let userEmail: string;
  let apiKey: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";
    const { plainKey } = await createApiKey(ctx.db, userId, "KOReader", ["kosync"]);
    apiKey = plainKey;
    app = await buildApp(ctx.config, ctx.db);
  });

  describe("GET /users/auth", () => {
    it("returns 200 with valid credentials", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/users/auth",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": apiKey,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ authorized: "OK" });
    });

    it("returns 401 without headers", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/users/auth",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with wrong key", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/users/auth",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": "vso_wrongkey12345678901234567890",
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /users/create", () => {
    it("returns 201 with valid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/users/create",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": apiKey,
        },
        payload: { username: userEmail, password: "anything" },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body)).toEqual({ username: userEmail });
    });

    it("returns 401 with invalid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/users/create",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": "vso_bad",
        },
        payload: { username: userEmail, password: "anything" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("PUT /syncs/progress", () => {
    it("saves progress for a matched book", async () => {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId, title: "Test Book", author: "Author",
        filePath: "books/test.epub", fileFormat: "epub",
        fileSize: 1000, fileHash: "sha256hash",
        md5Hash: "abc123def456abc123def456abc12345",
        addedBy: userId,
      });

      const res = await app.inject({
        method: "PUT", url: "/syncs/progress",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
        payload: {
          document: "abc123def456abc123def456abc12345",
          progress: "/body/chapter[3]/p[5]",
          percentage: 0.42,
          device: "Kindle Paperwhite",
          device_id: "kindle-001",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.document).toBe("abc123def456abc123def456abc12345");
      expect(body.timestamp).toBeDefined();

      const progress = await ctx.db.select().from(readingProgress).all();
      expect(progress).toHaveLength(1);
      expect(progress[0].bookId).toBe(bookId);
      expect(progress[0].percentage).toBe(42);

      const deviceRows = await ctx.db.select().from(devices).all();
      expect(deviceRows).toHaveLength(1);
      expect(deviceRows[0].id).toBe("kindle-001");
    });

    it("saves to kosyncProgress for unmatched book", async () => {
      const res = await app.inject({
        method: "PUT", url: "/syncs/progress",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
        payload: {
          document: "unmatched_hash_1234567890abcdef",
          progress: "page-10",
          percentage: 0.1,
          device: "Kindle", device_id: "kindle-001",
        },
      });
      expect(res.statusCode).toBe(200);

      const kp = await ctx.db.select().from(kosyncProgress).all();
      expect(kp).toHaveLength(1);
      expect(kp[0].documentHash).toBe("unmatched_hash_1234567890abcdef");
      expect(kp[0].percentage).toBe(0.1);
    });

    it("sets finishedAt when percentage >= 0.98", async () => {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId, title: "Done Book", author: "Author",
        filePath: "books/done.epub", fileFormat: "epub",
        fileSize: 1000, fileHash: "sha",
        md5Hash: "finished_hash_abcdef1234567890",
        addedBy: userId,
      });

      await app.inject({
        method: "PUT", url: "/syncs/progress",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
        payload: {
          document: "finished_hash_abcdef1234567890",
          progress: "end", percentage: 0.99,
          device: "Kindle", device_id: "kindle-001",
        },
      });

      const progress = await ctx.db.select().from(readingProgress).all();
      expect(progress[0].finishedAt).not.toBeNull();
    });
  });

  describe("GET /syncs/progress/:document", () => {
    it("returns progress for matched book", async () => {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId, title: "Test", author: "Author",
        filePath: "books/test.epub", fileFormat: "epub",
        fileSize: 1000, fileHash: "sha",
        md5Hash: "pull_test_hash_abcdef123456789",
        addedBy: userId,
      });
      await ctx.db.insert(devices).values({
        id: "kindle-001", userId,
        model: "Kindle", lastSeen: new Date().toISOString(),
      });
      await ctx.db.insert(readingProgress).values({
        userId, bookId, percentage: 42,
        lastReadAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        deviceId: "kindle-001",
      });

      const res = await app.inject({
        method: "GET",
        url: "/syncs/progress/pull_test_hash_abcdef123456789",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.document).toBe("pull_test_hash_abcdef123456789");
      expect(body.percentage).toBe(0.42);
    });

    it("returns progress from kosyncProgress for unmatched book", async () => {
      await ctx.db.insert(kosyncProgress).values({
        userId,
        documentHash: "unmatched_pull_hash_abcdef12345",
        progress: "page-10", percentage: 0.1,
        deviceId: "kindle-001", device: "Kindle",
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/syncs/progress/unmatched_pull_hash_abcdef12345",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.document).toBe("unmatched_pull_hash_abcdef12345");
      expect(body.percentage).toBe(0.1);
      expect(body.progress).toBe("page-10");
    });

    it("returns 404 when no progress exists", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/syncs/progress/nonexistent_hash_12345678901234",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
