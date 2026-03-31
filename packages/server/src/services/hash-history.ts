import { bookHashes } from "@verso/shared";
import { eq, and } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import { logActivity } from "./activity-log.js";

/**
 * Save an MD5 hash to the book's hash history.
 * Silently skips if the hash already exists for this book.
 */
export function saveHash(db: AppDatabase, bookId: string, md5Hash: string, bookTitle?: string): void {
  try {
    const existing = db
      .select()
      .from(bookHashes)
      .where(
        and(
          eq(bookHashes.bookId, bookId),
          eq(bookHashes.md5Hash, md5Hash),
        ),
      )
      .get();
    if (existing) {
      logActivity(db, {
        type: "hash.save",
        bookId,
        bookTitle,
        details: { md5: md5Hash, status: "duplicate" },
      });
      return;
    }

    db.insert(bookHashes)
      .values({
        bookId,
        md5Hash,
        createdAt: new Date().toISOString(),
      })
      .run();

    logActivity(db, {
      type: "hash.save",
      bookId,
      bookTitle,
      details: { md5: md5Hash, status: "saved" },
    });
  } catch (e: any) {
    logActivity(db, {
      type: "hash.save",
      bookId,
      bookTitle,
      level: "error",
      details: { md5: md5Hash, status: "failed", error: e?.message ?? String(e) },
    });
  }
}
