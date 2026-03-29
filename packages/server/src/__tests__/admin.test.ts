import { describe, it, expect, beforeEach } from "vitest";
import { sessions, shelves } from "@verso/shared";
import { eq } from "drizzle-orm";
import { createTestContext } from "../test-utils.js";

describe("admin router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let adminUserId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    // First registered user becomes admin
    const reg = await ctx.caller.auth.register({
      email: "admin@example.com",
      password: "password123",
      displayName: "Admin User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    adminUserId = reg.user.id;
  });

  describe("listUsers", () => {
    it("returns all users", async () => {
      // Create a second user via admin
      await authedCaller.admin.createUser({
        email: "user2@example.com",
        password: "password123",
        displayName: "User Two",
        role: "user",
      });

      const users = await authedCaller.admin.listUsers();
      expect(users).toHaveLength(2);
      expect(users[0].email).toBe("admin@example.com");
      expect(users[1].email).toBe("user2@example.com");
    });
  });

  describe("createUser", () => {
    it("creates a user with correct fields and seeds default shelves", async () => {
      const user = await authedCaller.admin.createUser({
        email: "newuser@example.com",
        password: "password123",
        displayName: "New User",
        role: "user",
      });

      expect(user.email).toBe("newuser@example.com");
      expect(user.displayName).toBe("New User");
      expect(user.role).toBe("user");
      // passwordHash should not be exposed
      expect((user as any).passwordHash).toBeUndefined();

      // Verify default shelves were seeded
      const userShelves = await ctx.db
        .select()
        .from(shelves)
        .where(eq(shelves.userId, user.id));
      expect(userShelves.length).toBeGreaterThan(0);
    });

    it("rejects duplicate email", async () => {
      await authedCaller.admin.createUser({
        email: "dupe@example.com",
        password: "password123",
        displayName: "First",
        role: "user",
      });

      await expect(
        authedCaller.admin.createUser({
          email: "dupe@example.com",
          password: "password123",
          displayName: "Second",
          role: "user",
        })
      ).rejects.toThrow("Email already in use");
    });
  });

  describe("updateRole", () => {
    it("changes user role", async () => {
      const created = await authedCaller.admin.createUser({
        email: "user@example.com",
        password: "password123",
        displayName: "Regular User",
        role: "user",
      });

      const updated = await authedCaller.admin.updateRole({
        userId: created.id,
        role: "admin",
      });

      expect(updated.role).toBe("admin");
    });

    it("rejects changing own role", async () => {
      await expect(
        authedCaller.admin.updateRole({
          userId: adminUserId,
          role: "user",
        })
      ).rejects.toThrow("Cannot change your own role");
    });
  });

  describe("deleteUser", () => {
    it("deletes user and sessions", async () => {
      const created = await authedCaller.admin.createUser({
        email: "todelete@example.com",
        password: "password123",
        displayName: "Delete Me",
        role: "user",
      });

      const result = await authedCaller.admin.deleteUser({
        userId: created.id,
      });
      expect(result.success).toBe(true);

      // Verify user is gone from listUsers
      const users = await authedCaller.admin.listUsers();
      expect(users.find((u) => u.id === created.id)).toBeUndefined();

      // Verify sessions are cleaned up
      const remainingSessions = await ctx.db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, created.id));
      expect(remainingSessions).toHaveLength(0);
    });

    it("rejects deleting self", async () => {
      await expect(
        authedCaller.admin.deleteUser({
          userId: adminUserId,
        })
      ).rejects.toThrow("Cannot delete your own account");
    });
  });
});
