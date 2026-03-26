import { eq } from "drizzle-orm";
import {
  books,
  shelves,
  shelfBooks,
  annotations,
  readingProgress,
  readingSessions,
} from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

export async function buildExportData(db: AppDatabase, userId: string) {
  const userBooks = await db
    .select()
    .from(books)
    .where(eq(books.addedBy, userId));

  const userShelves = await db
    .select()
    .from(shelves)
    .where(eq(shelves.userId, userId));

  const bookIds = userBooks.map((b) => b.id);

  let userShelfBooks: (typeof shelfBooks.$inferSelect)[] = [];
  if (bookIds.length > 0) {
    // Get all shelf books for the user's shelves
    const shelfIds = userShelves.map((s) => s.id);
    if (shelfIds.length > 0) {
      const allShelfBooks = await db.select().from(shelfBooks);
      userShelfBooks = allShelfBooks.filter(
        (sb) => shelfIds.includes(sb.shelfId) || bookIds.includes(sb.bookId)
      );
    }
  }

  let userAnnotations: (typeof annotations.$inferSelect)[] = [];
  let userProgress: (typeof readingProgress.$inferSelect)[] = [];
  let userSessions: (typeof readingSessions.$inferSelect)[] = [];

  if (bookIds.length > 0) {
    const allAnnotations = await db
      .select()
      .from(annotations)
      .where(eq(annotations.userId, userId));
    userAnnotations = allAnnotations;

    const allProgress = await db
      .select()
      .from(readingProgress)
      .where(eq(readingProgress.userId, userId));
    userProgress = allProgress;

    const allSessions = await db
      .select()
      .from(readingSessions)
      .where(eq(readingSessions.userId, userId));
    userSessions = allSessions;
  }

  return {
    metadata: {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      books: userBooks,
      shelves: userShelves,
      shelfBooks: userShelfBooks,
    },
    annotations: {
      version: 1 as const,
      items: userAnnotations,
    },
    progress: {
      version: 1 as const,
      readingProgress: userProgress,
      readingSessions: userSessions,
    },
  };
}
