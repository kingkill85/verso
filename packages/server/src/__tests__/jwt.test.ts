import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { signAccessToken } from "../services/jwt.js";
import type { Config } from "../config.js";

const TEST_CONFIG = {
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long-for-testing",
  JWT_ACCESS_EXPIRES: "15m",
  JWT_REFRESH_EXPIRES: "7d",
} as Config;

const TEST_PAYLOAD = {
  sub: "user-123",
  email: "test@example.com",
  role: "admin",
  sessionId: "session-456",
};

describe("JWT helpers", () => {
  describe("signAccessToken", () => {
    it("signs a valid access token", async () => {
      const token = await signAccessToken(TEST_PAYLOAD, TEST_CONFIG);
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("token contains correct payload fields", async () => {
      const token = await signAccessToken(TEST_PAYLOAD, TEST_CONFIG);
      const secret = new TextEncoder().encode(TEST_CONFIG.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      expect(payload.sub).toBe("user-123");
      expect(payload.email).toBe("test@example.com");
      expect(payload.role).toBe("admin");
      expect(payload.type).toBe("access");
      expect(payload.sessionId).toBe("session-456");
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });
  });
});
