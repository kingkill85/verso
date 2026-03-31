import { bookHashes } from "@verso/shared";
import { eq, and } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";

/**
 * Save an MD5 hash to the book's hash history.
 * Silently skips if the hash already exists for this book.
 */
export function saveHash(db: AppDatabase, bookId: string, md5Hash: string): void {
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
    if (existing) return;

    db.insert(bookHashes)
      .values({
        bookId,
        md5Hash,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (e) {
    console.error("Failed to save hash history:", e);
  }
}
