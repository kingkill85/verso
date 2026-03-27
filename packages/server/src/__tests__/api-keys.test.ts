import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { createApiKey, verifyApiKey, listApiKeys, revokeApiKey } from "../services/api-keys.js";

describe("api-keys service", () => {
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

  describe("createApiKey", () => {
    it("returns a key starting with vso_", async () => {
      const result = await createApiKey(ctx.db, userId, "Test Key", ["opds"]);
      expect(result.plainKey).toMatch(/^vso_/);
      expect(result.apiKey.name).toBe("Test Key");
      expect(result.apiKey.keyPrefix).toBe(result.plainKey.slice(0, 12));
    });
  });

  describe("verifyApiKey", () => {
    it("returns user info for valid key with matching scope", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "OPDS Key", ["opds"]);
      const result = await verifyApiKey(ctx.db, "test@example.com", plainKey, "opds");
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(userId);
    });

    it("returns null for wrong scope", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "OPDS Key", ["opds"]);
      const result = await verifyApiKey(ctx.db, "test@example.com", plainKey, "api");
      expect(result).toBeNull();
    });

    it("returns null for wrong email", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "Key", ["opds"]);
      const result = await verifyApiKey(ctx.db, "wrong@example.com", plainKey, "opds");
      expect(result).toBeNull();
    });

    it("returns null for expired key", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "Key", ["opds"], "2020-01-01T00:00:00Z");
      const result = await verifyApiKey(ctx.db, "test@example.com", plainKey, "opds");
      expect(result).toBeNull();
    });
  });

  describe("listApiKeys", () => {
    it("returns all keys for user without hashes", async () => {
      await createApiKey(ctx.db, userId, "Key 1", ["opds"]);
      await createApiKey(ctx.db, userId, "Key 2", ["api"]);
      const keys = await listApiKeys(ctx.db, userId);
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toHaveProperty("keyHash");
    });
  });

  describe("revokeApiKey", () => {
    it("deletes the key", async () => {
      const { apiKey } = await createApiKey(ctx.db, userId, "Key", ["opds"]);
      await revokeApiKey(ctx.db, userId, apiKey.id);
      const keys = await listApiKeys(ctx.db, userId);
      expect(keys).toHaveLength(0);
    });
  });
});
