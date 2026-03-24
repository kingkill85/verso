import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@verso/shared";
import { appRouter } from "./trpc/router.js";
import { StorageService } from "./services/storage.js";
import type { Config } from "./config.js";
import type { TokenPayload } from "@verso/shared";

const TEST_CONFIG: Config = {
  PORT: 3000,
  HOST: "0.0.0.0",
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long-for-testing",
  JWT_ACCESS_EXPIRES: "15m",
  JWT_REFRESH_EXPIRES: "7d",
  DB_DRIVER: "sqlite",
  DATABASE_URL: ":memory:",
  STORAGE_DRIVER: "local",
  STORAGE_PATH: "./test-data",
  AUTH_MODE: "both",
  MAX_UPLOAD_SIZE: 104857600,
  CORS_ORIGIN: "*",
  NODE_ENV: "test",
};

export async function createTestContext() {
  const sqlite = new BetterSqlite3(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });

  const storage = new StorageService(TEST_CONFIG);

  const caller = appRouter.createCaller({
    db,
    config: TEST_CONFIG,
    storage,
    user: null,
  });

  function createAuthedCaller(accessToken: string) {
    const parts = accessToken.split(".");
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    ) as TokenPayload;
    return appRouter.createCaller({
      db,
      config: TEST_CONFIG,
      storage,
      user: payload,
    });
  }

  return { db, config: TEST_CONFIG, caller, createAuthedCaller };
}
