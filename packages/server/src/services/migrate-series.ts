import { eq, sql } from "drizzle-orm";
import { books, bookSeries } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

/**
 * One-time migration: create bookSeries records from existing book series strings.
 * Idempotent — safe to run multiple times.
 */
export async function migrateSeriesData(db: AppDatabase) {
  const booksWithSeries = db
    .select({ id: books.id, series: books.series })
    .from(books)
    .where(sql`${books.series} IS NOT NULL AND ${books.seriesId} IS NULL`)
    .all();

  const seriesGroups = new Map<string, { name: string; bookIds: string[] }>();
  for (const book of booksWithSeries) {
    if (!book.series?.trim()) continue;
    const key = book.series.trim().toLowerCase();
    const group = seriesGroups.get(key) ?? { name: book.series.trim(), bookIds: [] };
    group.bookIds.push(book.id);
    seriesGroups.set(key, group);
  }

  let count = 0;
  for (const group of seriesGroups.values()) {
    const existing = db
      .select()
      .from(bookSeries)
      .where(sql`${bookSeries.name} COLLATE NOCASE = ${group.name}`)
      .get();

    let seriesId: string;
    let canonicalName: string;
    if (existing) {
      seriesId = existing.id;
      canonicalName = existing.name;
    } else {
      const created = db
        .insert(bookSeries)
        .values({ name: group.name })
        .returning()
        .get();
      seriesId = created.id;
      canonicalName = created.name;
      count++;
    }

    for (const bookId of group.bookIds) {
      db.update(books)
        .set({ seriesId, series: canonicalName })
        .where(eq(books.id, bookId))
        .run();
    }
  }

  if (count > 0) {
    console.log(`Series migration: created ${count} series from ${booksWithSeries.length} books`);
  }

  return count;
}
