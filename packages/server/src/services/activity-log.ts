import { activityLog } from "@verso/shared";
import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";

const MAX_ENTRIES = 5000;

type LogEntry = {
  type: string;
  userId?: string;
  bookId?: string;
  bookTitle?: string;
  level?: "info" | "warn" | "error";
  details?: Record<string, unknown>;
};

export function logActivity(db: AppDatabase, entry: LogEntry): void {
  const now = new Date().toISOString();
  try {
    db.insert(activityLog)
      .values({
        type: entry.type,
        userId: entry.userId ?? null,
        bookId: entry.bookId ?? null,
        bookTitle: entry.bookTitle ?? null,
        level: entry.level ?? "info",
        details: entry.details ? JSON.stringify(entry.details) : null,
        createdAt: now,
      })
      .run();

    // Prune old entries
    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(activityLog)
      .get();
    if (count && count.count > MAX_ENTRIES) {
      db.run(sql`DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY created_at DESC LIMIT ${MAX_ENTRIES})`);
    }
  } catch (e) {
    // Logging should never break the main flow
    console.error("Failed to write activity log:", e);
  }
}
