import { eq, sql } from "drizzle-orm";
import { books, publishers } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Resolve a publisher string to a publishers record, creating if needed.
 * Updates books.publisherId and books.publisher (canonical name).
 */
export async function syncBookPublisher(
  db: BetterSQLite3Database<any>,
  bookId: string,
  publisherString: string | null,
): Promise<{ id: string; name: string } | null> {
  const trimmed = publisherString?.trim() || null;

  if (!trimmed) {
    await db
      .update(books)
      .set({ publisherId: null, publisher: null })
      .where(eq(books.id, bookId));
    return null;
  }

  // Case-insensitive lookup
  const existing = await db
    .select()
    .from(publishers)
    .where(sql`${publishers.name} COLLATE NOCASE = ${trimmed}`)
    .get();

  let publisherId: string;
  let canonicalName: string;

  if (existing) {
    publisherId = existing.id;
    canonicalName = existing.name;
  } else {
    const [created] = await db
      .insert(publishers)
      .values({
        name: trimmed,
        createdAt: new Date().toISOString(),
      })
      .returning();
    publisherId = created.id;
    canonicalName = created.name;
  }

  await db
    .update(books)
    .set({ publisherId, publisher: canonicalName })
    .where(eq(books.id, bookId));

  return { id: publisherId, name: canonicalName };
}
