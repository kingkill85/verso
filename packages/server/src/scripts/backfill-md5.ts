import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, isNull } from "drizzle-orm";
import { books } from "@verso/shared";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { loadConfig } from "../config.js";
import { StorageService } from "../services/storage.js";

async function backfillMd5() {
  const config = loadConfig();
  const db = createDb(config);
  runMigrations(db);
  const storage = new StorageService(config);

  const booksWithoutMd5 = await db
    .select({ id: books.id, filePath: books.filePath })
    .from(books)
    .where(isNull(books.md5Hash));

  console.log(`Found ${booksWithoutMd5.length} books without MD5 hash`);

  let updated = 0;
  for (const book of booksWithoutMd5) {
    try {
      const fullPath = storage.fullPath(book.filePath);
      const buffer = readFileSync(fullPath);
      const md5Hash = createHash("md5").update(buffer).digest("hex");
      await db
        .update(books)
        .set({ md5Hash })
        .where(eq(books.id, book.id));
      updated++;
      console.log(`  [${updated}/${booksWithoutMd5.length}] ${book.id} → ${md5Hash}`);
    } catch (err) {
      console.error(`  SKIP ${book.id}: ${(err as Error).message}`);
    }
  }

  console.log(`Done. Updated ${updated}/${booksWithoutMd5.length} books.`);
}

backfillMd5().catch(console.error);
