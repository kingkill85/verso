import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { AppDatabase } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(db: AppDatabase) {
  migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
}
