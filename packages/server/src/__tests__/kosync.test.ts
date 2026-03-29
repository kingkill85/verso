import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { buildApp } from "../app.js";
import { createApiKey } from "../services/api-keys.js";
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
});
