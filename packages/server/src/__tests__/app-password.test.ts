import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { users } from "@verso/shared";
import { eq } from "drizzle-orm";

describe("app password router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;
  });

  describe("status", () => {
    it("returns false when no app password set", async () => {
      const result = await authedCaller.appPassword.status();
      expect(result.hasPassword).toBe(false);
    });
  });

  describe("set", () => {
    it("sets app password and stores both hashes", async () => {
      const result = await authedCaller.appPassword.set({ password: "mysyncpass" });
      expect(result.success).toBe(true);

      const user = await ctx.db.select().from(users).where(eq(users.id, userId)).get();
      expect(user!.appPasswordHash).toBeTruthy();
      expect(user!.appPasswordMd5).toBeTruthy();
      expect(user!.appPasswordMd5).toHaveLength(32);
    });

    it("rejects password shorter than 8 characters", async () => {
      await expect(
        authedCaller.appPassword.set({ password: "short" })
      ).rejects.toThrow();
    });

    it("status returns true after setting", async () => {
      await authedCaller.appPassword.set({ password: "mysyncpass" });
      const result = await authedCaller.appPassword.status();
      expect(result.hasPassword).toBe(true);
    });
  });

  describe("clear", () => {
    it("clears app password", async () => {
      await authedCaller.appPassword.set({ password: "mysyncpass" });
      const result = await authedCaller.appPassword.clear();
      expect(result.success).toBe(true);

      const user = await ctx.db.select().from(users).where(eq(users.id, userId)).get();
      expect(user!.appPasswordHash).toBeNull();
      expect(user!.appPasswordMd5).toBeNull();
    });
  });
});
