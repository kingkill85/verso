import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";

describe("GET /health", () => {
  it("returns status ok with database connected", async () => {
    const app = await buildApp({
      PORT: 0,
      HOST: "127.0.0.1",
      JWT_SECRET: "a".repeat(32),
      JWT_ACCESS_EXPIRES: "15m",
      JWT_REFRESH_EXPIRES: "7d",
      DB_DRIVER: "sqlite" as const,
      DATABASE_URL: "file::memory:",
      STORAGE_DRIVER: "local" as const,
      STORAGE_PATH: "./test-data",
      AUTH_MODE: "local" as const,
      MAX_UPLOAD_SIZE: 104857600,
      CORS_ORIGIN: "*",
      NODE_ENV: "test" as const,
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("version");

    await app.close();
  });
});
