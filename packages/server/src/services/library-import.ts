import {
  books,
  shelves,
  shelfBooks,
  annotations,
  readingProgress,
  readingSessions,
} from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

type BookRow = typeof books.$inferInsert;
type ShelfRow = typeof shelves.$inferInsert;
type ShelfBookRow = typeof shelfBooks.$inferInsert;
type AnnotationRow = typeof annotations.$inferInsert;
type ReadingProgressRow = typeof readingProgress.$inferInsert;
type ReadingSessionRow = typeof readingSessions.$inferInsert;

export interface MetadataExport {
  version: number;
  exportedAt: string;
  books: BookRow[];
  shelves: ShelfRow[];
  shelfBooks: ShelfBookRow[];
}

export interface AnnotationsExport {
  version: number;
  items: AnnotationRow[];
}

export interface ProgressExport {
  version: number;
  readingProgress: ReadingProgressRow[];
  readingSessions: ReadingSessionRow[];
}

/**
 * bookIdMap maps old book IDs (from the export) to new book IDs (in current DB).
 * If a book was already imported/found in storage, its ID mapping is provided here.
 * For book entries without a mapping, we generate a new ID.
 */
export async function restoreLibrary(
  db: AppDatabase,
  userId: string,
  metadata: MetadataExport,
  annotationsData: AnnotationsExport,
  progressData: ProgressExport,
  bookIdMap: Record<string, string>
): Promise<{ books: number; shelves: number; annotations: number }> {
  let importedBooks = 0;
  let importedShelves = 0;
  let importedAnnotations = 0;

  // Remap shelf IDs too
  const shelfIdMap: Record<string, string> = {};

  // Insert books
  for (const book of metadata.books) {
    const oldId = book.id as string;
    const newId = bookIdMap[oldId] || crypto.randomUUID();
    bookIdMap[oldId] = newId;

    const result = await db
      .insert(books)
      .values({
        ...book,
        id: newId,
        addedBy: userId,
      })
      .onConflictDoNothing();

    if (result.changes > 0) {
      importedBooks++;
    }
  }

  // Insert shelves
  for (const shelf of metadata.shelves) {
    const oldId = shelf.id as string;
    const newId = crypto.randomUUID();
    shelfIdMap[oldId] = newId;

    const result = await db
      .insert(shelves)
      .values({
        ...shelf,
        id: newId,
        userId,
      })
      .onConflictDoNothing();

    if (result.changes > 0) {
      importedShelves++;
    }
  }

  // Insert shelf books with remapped IDs
  for (const sb of metadata.shelfBooks) {
    const newShelfId = shelfIdMap[sb.shelfId as string];
    const newBookId = bookIdMap[sb.bookId as string];
    if (!newShelfId || !newBookId) continue;

    await db
      .insert(shelfBooks)
      .values({
        ...sb,
        shelfId: newShelfId,
        bookId: newBookId,
      })
      .onConflictDoNothing();
  }

  // Insert annotations
  for (const annotation of annotationsData.items) {
    const newBookId = bookIdMap[annotation.bookId as string];
    if (!newBookId) continue;

    await db
      .insert(annotations)
      .values({
        ...annotation,
        id: crypto.randomUUID(),
        userId,
        bookId: newBookId,
      })
      .onConflictDoNothing();

    importedAnnotations++;
  }

  // Insert reading progress
  for (const progress of progressData.readingProgress) {
    const newBookId = bookIdMap[progress.bookId as string];
    if (!newBookId) continue;

    await db
      .insert(readingProgress)
      .values({
        ...progress,
        id: crypto.randomUUID(),
        userId,
        bookId: newBookId,
      })
      .onConflictDoNothing();
  }

  // Insert reading sessions
  for (const session of progressData.readingSessions) {
    const newBookId = bookIdMap[session.bookId as string];
    if (!newBookId) continue;

    await db
      .insert(readingSessions)
      .values({
        ...session,
        id: crypto.randomUUID(),
        userId,
        bookId: newBookId,
      })
      .onConflictDoNothing();
  }

  return { books: importedBooks, shelves: importedShelves, annotations: importedAnnotations };
}
