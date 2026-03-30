import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestContext } from "../test-utils.js";
import { smtpSettings, books } from "@verso/shared";
import { eq } from "drizzle-orm";

// Mock nodemailer so we don't make real SMTP connections
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      verify: vi.fn().mockResolvedValue(true),
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
      close: vi.fn(),
    }),
  },
}));

describe("kindle router", () => {
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

  describe("getSettings", () => {
    it("returns null when no settings configured", async () => {
      const result = await authedCaller.kindle.getSettings();
      expect(result).toBeNull();
    });

    it("returns settings without password", async () => {
      await authedCaller.kindle.saveSettings({
        provider: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        username: "user@gmail.com",
        password: "app-password",
        encryption: "ssl",
        kindleEmail: "user@kindle.com",
      });

      const result = await authedCaller.kindle.getSettings();
      expect(result).toMatchObject({
        provider: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        username: "user@gmail.com",
        encryption: "ssl",
        kindleEmail: "user@kindle.com",
      });
      // Password must not be returned
      expect(result).not.toHaveProperty("encryptedPassword");
    });
  });

  describe("saveSettings", () => {
    it("creates new settings", async () => {
      const result = await authedCaller.kindle.saveSettings({
        provider: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        username: "user@gmail.com",
        password: "app-password",
        encryption: "ssl",
        kindleEmail: "user@kindle.com",
      });
      expect(result.success).toBe(true);

      const row = await ctx.db
        .select()
        .from(smtpSettings)
        .where(eq(smtpSettings.userId, userId))
        .get();
      expect(row).toBeTruthy();
      expect(row!.provider).toBe("gmail");
      expect(row!.encryptedPassword).toBeTruthy();
      expect(row!.encryptedPassword).not.toBe("app-password");
    });

    it("requires password on initial setup", async () => {
      await expect(
        authedCaller.kindle.saveSettings({
          provider: "gmail",
          host: "smtp.gmail.com",
          port: 465,
          username: "user@gmail.com",
          encryption: "ssl",
          kindleEmail: "user@kindle.com",
        })
      ).rejects.toThrow("Password is required");
    });

    it("updates without password, keeping existing", async () => {
      await authedCaller.kindle.saveSettings({
        provider: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        username: "user@gmail.com",
        password: "app-password",
        encryption: "ssl",
        kindleEmail: "user@kindle.com",
      });

      const before = await ctx.db
        .select({ encryptedPassword: smtpSettings.encryptedPassword })
        .from(smtpSettings)
        .where(eq(smtpSettings.userId, userId))
        .get();

      await authedCaller.kindle.saveSettings({
        provider: "outlook",
        host: "smtp-mail.outlook.com",
        port: 587,
        username: "user@outlook.com",
        encryption: "starttls",
        kindleEmail: "user@kindle.com",
      });

      const after = await ctx.db
        .select()
        .from(smtpSettings)
        .where(eq(smtpSettings.userId, userId))
        .get();
      expect(after!.provider).toBe("outlook");
      expect(after!.encryptedPassword).toBe(before!.encryptedPassword);
    });
  });

  describe("deleteSettings", () => {
    it("deletes existing settings", async () => {
      await authedCaller.kindle.saveSettings({
        provider: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        username: "user@gmail.com",
        password: "app-password",
        encryption: "ssl",
        kindleEmail: "user@kindle.com",
      });

      const result = await authedCaller.kindle.deleteSettings();
      expect(result.success).toBe(true);

      const settings = await authedCaller.kindle.getSettings();
      expect(settings).toBeNull();
    });
  });

  describe("testConnection", () => {
    it("returns success with valid settings (mocked)", async () => {
      const result = await authedCaller.kindle.testConnection({
        provider: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        username: "user@gmail.com",
        password: "app-password",
        encryption: "ssl",
        kindleEmail: "user@kindle.com",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("sendBook", () => {
    it("throws when no SMTP settings configured", async () => {
      await expect(
        authedCaller.kindle.sendBook({ bookId: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow("SMTP settings not configured");
    });

    it("throws when book not found", async () => {
      await authedCaller.kindle.saveSettings({
        provider: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        username: "user@gmail.com",
        password: "app-password",
        encryption: "ssl",
        kindleEmail: "user@kindle.com",
      });

      await expect(
        authedCaller.kindle.sendBook({ bookId: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow("Book not found");
    });
  });
});
