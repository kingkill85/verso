import { eq, sql } from "drizzle-orm";
import { books, bookSeries } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Resolve a series string to a bookSeries record, creating if needed.
 * Updates books.seriesId and books.series (canonical name).
 */
export async function syncBookSeries(
  db: BetterSQLite3Database<any>,
  bookId: string,
  seriesString: string | null,
): Promise<{ id: string; name: string } | null> {
  const trimmed = seriesString?.trim() || null;

  if (!trimmed) {
    await db
      .update(books)
      .set({ seriesId: null, series: null })
      .where(eq(books.id, bookId));
    return null;
  }

  // Case-insensitive lookup
  const existing = await db
    .select()
    .from(bookSeries)
    .where(sql`${bookSeries.name} COLLATE NOCASE = ${trimmed}`)
    .get();

  let seriesId: string;
  let canonicalName: string;

  if (existing) {
    seriesId = existing.id;
    canonicalName = existing.name;
  } else {
    const [created] = await db
      .insert(bookSeries)
      .values({
        name: trimmed,
        createdAt: new Date().toISOString(),
      })
      .returning();
    seriesId = created.id;
    canonicalName = created.name;
  }

  await db
    .update(books)
    .set({ seriesId, series: canonicalName })
    .where(eq(books.id, bookId));

  return { id: seriesId, name: canonicalName };
}
