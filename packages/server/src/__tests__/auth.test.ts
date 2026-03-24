import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";

describe("auth router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  describe("register", () => {
    it("creates a new user and returns tokens", async () => {
      const result = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
      });
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.displayName).toBe("Test User");
      expect(result.user.role).toBe("admin"); // First user is admin
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it("second user gets user role", async () => {
      await ctx.caller.auth.register({
        email: "admin@example.com",
        password: "password123",
        displayName: "Admin",
      });
      const result = await ctx.caller.auth.register({
        email: "user@example.com",
        password: "password123",
        displayName: "User",
      });
      expect(result.user.role).toBe("user");
    });

    it("rejects duplicate email", async () => {
      await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      await expect(
        ctx.caller.auth.register({
          email: "test@example.com",
          password: "password123",
          displayName: "Test 2",
        })
      ).rejects.toThrow();
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
    });

    it("returns tokens for valid credentials", async () => {
      const result = await ctx.caller.auth.login({
        email: "test@example.com",
        password: "password123",
      });
      expect(result.user.email).toBe("test@example.com");
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it("rejects invalid password", async () => {
      await expect(
        ctx.caller.auth.login({ email: "test@example.com", password: "wrong" })
      ).rejects.toThrow();
    });

    it("rejects unknown email", async () => {
      await expect(
        ctx.caller.auth.login({ email: "nobody@example.com", password: "password123" })
      ).rejects.toThrow();
    });
  });

  describe("refresh", () => {
    it("issues new token pair and rotates refresh token", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      const result = await ctx.caller.auth.refresh({
        refreshToken: reg.refreshToken,
      });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.refreshToken).not.toBe(reg.refreshToken);
    });
  });

  describe("me", () => {
    it("returns current user when authenticated", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      const authedCaller = ctx.createAuthedCaller(reg.accessToken);
      const user = await authedCaller.auth.me();
      expect(user.email).toBe("test@example.com");
    });
  });

  describe("logout", () => {
    it("deletes the session", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      const authedCaller = ctx.createAuthedCaller(reg.accessToken);
      const result = await authedCaller.auth.logout();
      expect(result.success).toBe(true);
    });
  });

  describe("updateProfile", () => {
    it("updates display name", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      const authedCaller = ctx.createAuthedCaller(reg.accessToken);
      const user = await authedCaller.auth.updateProfile({
        displayName: "New Name",
      });
      expect(user.displayName).toBe("New Name");
    });
  });

  describe("changePassword", () => {
    it("changes password when current is correct", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      const authedCaller = ctx.createAuthedCaller(reg.accessToken);
      const result = await authedCaller.auth.changePassword({
        currentPassword: "password123",
        newPassword: "newpassword456",
      });
      expect(result.success).toBe(true);

      // Verify new password works
      const loginResult = await ctx.caller.auth.login({
        email: "test@example.com",
        password: "newpassword456",
      });
      expect(loginResult.user.email).toBe("test@example.com");
    });

    it("rejects wrong current password", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      const authedCaller = ctx.createAuthedCaller(reg.accessToken);
      await expect(
        authedCaller.auth.changePassword({
          currentPassword: "wrongpassword",
          newPassword: "newpassword456",
        })
      ).rejects.toThrow();
    });
  });

  describe("hasUsers", () => {
    it("returns false when no users exist", async () => {
      const result = await ctx.caller.auth.hasUsers();
      expect(result.hasUsers).toBe(false);
    });

    it("returns true when users exist", async () => {
      await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
      const result = await ctx.caller.auth.hasUsers();
      expect(result.hasUsers).toBe(true);
    });
  });
});
