import { eq, sql } from "drizzle-orm";
import { authors, bookAuthors } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Parse an author string (comma-separated), upsert each author,
 * and replace the bookAuthors links for the given book.
 */
export async function syncBookAuthors(
  db: BetterSQLite3Database<any>,
  bookId: string,
  authorString: string,
): Promise<{ id: string; name: string; isNew: boolean }[]> {
  const names = authorString
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  if (names.length === 0) return [];

  // Delete existing links for this book
  await db.delete(bookAuthors).where(eq(bookAuthors.bookId, bookId));

  const results: { id: string; name: string; isNew: boolean }[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];

    // Case-insensitive lookup
    const existing = await db
      .select()
      .from(authors)
      .where(sql`${authors.name} COLLATE NOCASE = ${name}`)
      .get();

    let authorId: string;
    let isNew = false;
    if (existing) {
      authorId = existing.id;
    } else {
      const [created] = await db
        .insert(authors)
        .values({
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .returning();
      authorId = created.id;
      isNew = true;
    }

    await db.insert(bookAuthors).values({
      bookId,
      authorId,
      position: i,
    });

    results.push({ id: authorId, name, isNew });
  }

  return results;
}
