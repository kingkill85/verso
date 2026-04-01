import { eq, sql, isNotNull } from "drizzle-orm";
import { books, publishers } from "@verso/shared";
import { normalizeLanguage } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

/**
 * One-time migration: normalize existing language codes and
 * create publisher records from existing book publisher strings.
 * Idempotent — safe to run multiple times.
 */
export async function migratePublishersAndLanguages(db: AppDatabase) {
  // 1. Normalize languages
  const booksWithLang = db
    .select({ id: books.id, language: books.language })
    .from(books)
    .where(isNotNull(books.language))
    .all();

  let langCount = 0;
  for (const book of booksWithLang) {
    if (!book.language) continue;
    const normalized = normalizeLanguage(book.language);
    if (normalized !== book.language) {
      db.update(books)
        .set({ language: normalized })
        .where(eq(books.id, book.id))
        .run();
      langCount++;
    }
  }

  // 2. Create publishers from existing books that don't have a publisherId yet
  const booksWithPub = db
    .select({ id: books.id, publisher: books.publisher })
    .from(books)
    .where(sql`${books.publisher} IS NOT NULL AND ${books.publisherId} IS NULL`)
    .all();

  // Group by case-insensitive name
  const pubGroups = new Map<string, { name: string; bookIds: string[] }>();
  for (const book of booksWithPub) {
    if (!book.publisher?.trim()) continue;
    const key = book.publisher.trim().toLowerCase();
    const group = pubGroups.get(key) ?? { name: book.publisher.trim(), bookIds: [] };
    group.bookIds.push(book.id);
    pubGroups.set(key, group);
  }

  let pubCount = 0;
  for (const group of pubGroups.values()) {
    // Check if publisher already exists (from a previous run or from syncBookPublisher)
    const existing = db
      .select()
      .from(publishers)
      .where(sql`${publishers.name} COLLATE NOCASE = ${group.name}`)
      .get();

    let publisherId: string;
    let canonicalName: string;
    if (existing) {
      publisherId = existing.id;
      canonicalName = existing.name;
    } else {
      const created = db
        .insert(publishers)
        .values({ name: group.name })
        .returning()
        .get();
      publisherId = created.id;
      canonicalName = created.name;
      pubCount++;
    }

    for (const bookId of group.bookIds) {
      db.update(books)
        .set({ publisherId, publisher: canonicalName })
        .where(eq(books.id, bookId))
        .run();
    }
  }

  if (langCount > 0 || pubCount > 0) {
    console.log(
      `Publisher/language migration: normalized ${langCount} languages, created ${pubCount} publishers from ${booksWithPub.length} books`,
    );
  }

  return { langCount, pubCount };
}
