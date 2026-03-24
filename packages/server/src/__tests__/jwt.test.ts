import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { signAccessToken, signRefreshToken } from "../trpc/index.js";
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

  describe("signRefreshToken", () => {
    it("signs a valid refresh token", async () => {
      const token = await signRefreshToken(TEST_PAYLOAD, TEST_CONFIG);
      expect(token).toBeTruthy();
      expect(token.split(".")).toHaveLength(3);
    });

    it("token has type refresh", async () => {
      const token = await signRefreshToken(TEST_PAYLOAD, TEST_CONFIG);
      const secret = new TextEncoder().encode(TEST_CONFIG.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      expect(payload.type).toBe("refresh");
      expect(payload.sub).toBe("user-123");
      expect(payload.exp).toBeDefined();
    });
  });

  describe("token differentiation", () => {
    it("access and refresh tokens have different type fields", async () => {
      const accessToken = await signAccessToken(TEST_PAYLOAD, TEST_CONFIG);
      const refreshToken = await signRefreshToken(TEST_PAYLOAD, TEST_CONFIG);
      const secret = new TextEncoder().encode(TEST_CONFIG.JWT_SECRET);

      const access = await jwtVerify(accessToken, secret);
      const refresh = await jwtVerify(refreshToken, secret);

      expect(access.payload.type).toBe("access");
      expect(refresh.payload.type).toBe("refresh");
    });
  });
});
