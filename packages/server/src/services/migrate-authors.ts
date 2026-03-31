import { books } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { syncBookAuthors } from "./sync-book-authors.js";
import { enrichAuthor } from "./enrich-author.js";

/**
 * One-time migration: scan all books, create author records, and link them.
 * Call this on server startup if bookAuthors table is empty.
 */
export async function migrateExistingAuthors(
  db: BetterSQLite3Database<any>,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<number> {
  const allBooks = await db.select({ id: books.id, author: books.author }).from(books);

  let authorCount = 0;
  const enriched = new Set<string>();

  for (const book of allBooks) {
    if (!book.author) continue;
    const syncedAuthors = await syncBookAuthors(db, book.id, book.author);
    authorCount += syncedAuthors.length;

    // Enrich each new author (with a 1s delay between requests)
    for (const a of syncedAuthors) {
      if (a.isNew && !enriched.has(a.id)) {
        enriched.add(a.id);
        enrichAuthor(db, a.id, a.name, storage).catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  return enriched.size;
}
