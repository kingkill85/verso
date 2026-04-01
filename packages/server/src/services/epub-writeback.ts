import { eq } from "drizzle-orm";
import { books } from "@verso/shared";
import { writeMetadata, writeCover, getFileHash } from "./calibre.js";
import { saveHash } from "./hash-history.js";
import { partialMd5 } from "./partial-md5.js";
import { logActivity } from "./activity-log.js";
import { readFile } from "node:fs/promises";
import type { AppDatabase } from "../db/client.js";

type WritebackOptions = {
  db: AppDatabase;
  bookId: string;
  filePath: string;
  oldMd5: string | null;
  bookTitle: string;
  userId?: string;
  metadata?: {
    title?: string | null;
    author?: string | null;
    description?: string | null;
    publisher?: string | null;
    isbn?: string | null;
    year?: number | null;
    language?: string | null;
    genre?: string | null;
    series?: string | null;
    seriesIndex?: number | null;
  };
  coverPath?: string | null;
};

/**
 * Write metadata and/or cover into an EPUB file, then update file hashes.
 * Non-fatal — logs errors but doesn't throw.
 */
export async function epubWriteback(opts: WritebackOptions): Promise<void> {
  const { db, bookId, filePath, oldMd5, bookTitle, userId, metadata, coverPath } = opts;

  try {
    // Write metadata fields into EPUB
    if (metadata) {
      await writeMetadata(filePath, metadata);
    }

    // Write cover into EPUB
    if (coverPath) {
      await writeCover(filePath, coverPath);
    }

    // Save old MD5 to hash history
    if (oldMd5) {
      saveHash(db, bookId, oldMd5, bookTitle);
    }

    // Recompute file hashes
    const newFileHash = await getFileHash(filePath);
    const newFileBuffer = await readFile(filePath);
    const newMd5Hash = partialMd5(newFileBuffer);

    // Save new MD5 to hash history
    saveHash(db, bookId, newMd5Hash, bookTitle);

    // Update DB
    await db
      .update(books)
      .set({ fileHash: newFileHash, md5Hash: newMd5Hash })
      .where(eq(books.id, bookId));

    logActivity(db, {
      type: "epub.writeback",
      userId,
      bookId,
      bookTitle,
      details: { oldMd5, newMd5: newMd5Hash },
    });
  } catch (err: any) {
    logActivity(db, {
      type: "epub.writeback",
      userId,
      bookId,
      bookTitle,
      level: "error",
      details: { error: err?.message ?? String(err), oldMd5 },
    });
  }
}
