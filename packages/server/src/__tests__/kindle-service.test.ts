import { describe, it, expect } from "vitest";
import { encryptPassword, decryptPassword } from "../services/kindle.js";

const TEST_SECRET = "test-secret-that-is-at-least-32-characters-long-for-testing";

describe("kindle service", () => {
  describe("encryptPassword / decryptPassword", () => {
    it("round-trips a password through encrypt and decrypt", async () => {
      const plaintext = "my-app-password-123";
      const encrypted = await encryptPassword(plaintext, TEST_SECRET);
      const decrypted = await decryptPassword(encrypted, TEST_SECRET);
      expect(decrypted).toBe(plaintext);
    });

    it("produces format iv:authTag:ciphertext in hex", async () => {
      const encrypted = await encryptPassword("test", TEST_SECRET);
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // IV is 12 bytes = 24 hex chars
      expect(parts[0]).toHaveLength(24);
      // Auth tag is 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      // Ciphertext is non-empty
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it("produces different ciphertexts for the same input (random IV)", async () => {
      const a = await encryptPassword("same-password", TEST_SECRET);
      const b = await encryptPassword("same-password", TEST_SECRET);
      expect(a).not.toBe(b);
    });

    it("fails to decrypt with wrong secret", async () => {
      const encrypted = await encryptPassword("secret", TEST_SECRET);
      await expect(
        decryptPassword(encrypted, "wrong-secret-that-is-at-least-32-characters-long")
      ).rejects.toThrow();
    });

    it("fails to decrypt tampered ciphertext", async () => {
      const encrypted = await encryptPassword("secret", TEST_SECRET);
      const parts = encrypted.split(":");
      // Flip a byte in ciphertext
      const tampered = parts[0] + ":" + parts[1] + ":ff" + parts[2].slice(2);
      await expect(decryptPassword(tampered, TEST_SECRET)).rejects.toThrow();
    });
  });
});
