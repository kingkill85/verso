import { describe, it, expect, beforeEach } from "vitest";
import {
  koinsightDeviceInput,
  koinsightImportInput,
  devices,
} from "@verso/shared";
import { createTestContext } from "../test-utils.js";
import { buildApp } from "../app.js";
import { createApiKey } from "../services/api-keys.js";

describe("koinsight validators", () => {
  it("validates device registration", () => {
    const result = koinsightDeviceInput.safeParse({
      version: "0.3.0",
      id: "kindle-001",
      model: "Kindle Paperwhite",
    });
    expect(result.success).toBe(true);
  });

  it("validates import input", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [{ md5: "abc123", title: "Book", authors: "Author", pages: 200 }],
      stats: [{ md5: "abc123", page: 1, start_time: 1700000000, duration: 60, total_pages: 200 }],
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
});

describe("koinsight endpoints", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let userEmail: string;
  let apiKey: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";
    const { plainKey } = await createApiKey(ctx.db, userId, "KoInsight", ["plugin"]);
    apiKey = plainKey;
  });

  describe("GET /api/plugin/health", () => {
    it("returns ok without auth", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({ method: "GET", url: "/api/plugin/health" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.3.0");
    });
  });

  describe("POST /api/plugin/device", () => {
    it("registers a device", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/device",
        headers: { authorization: `Basic ${Buffer.from(`${userEmail}:${apiKey}`).toString("base64")}` },
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
        url: "/api/plugin/device",
        headers: { authorization: `Basic ${Buffer.from(`${userEmail}:${apiKey}`).toString("base64")}` },
        payload: { version: "0.2.0", id: "kobo-001", model: "Kobo" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("accepts version above 0.3.0", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/device",
        headers: { authorization: `Basic ${Buffer.from(`${userEmail}:${apiKey}`).toString("base64")}` },
        payload: { version: "0.4.1", id: "kobo-001", model: "Kobo" },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
