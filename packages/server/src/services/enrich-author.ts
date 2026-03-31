import { eq } from "drizzle-orm";
import { authors } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { searchAuthor, fetchAuthorMetadata } from "./openlibrary-authors.js";

export async function enrichAuthor(
  db: BetterSQLite3Database<any>,
  authorId: string,
  authorName: string,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<boolean> {
  try {
    const olKey = await searchAuthor(authorName);
    if (!olKey) return false;

    const meta = await fetchAuthorMetadata(olKey);
    if (!meta) return false;

    let imagePath: string | null = null;
    if (meta.photoUrl) {
      try {
        const photoRes = await fetch(meta.photoUrl);
        if (photoRes.ok) {
          const buffer = Buffer.from(await photoRes.arrayBuffer());
          imagePath = `authors/${authorId}/photo.jpg`;
          await storage.put(imagePath, buffer);
        }
      } catch {
        // Photo download failed — continue without photo
      }
    }

    await db
      .update(authors)
      .set({
        description: meta.description,
        birthDate: meta.birthDate,
        openLibraryKey: olKey,
        imagePath,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(authors.id, authorId));

    return true;
  } catch {
    return false;
  }
}
