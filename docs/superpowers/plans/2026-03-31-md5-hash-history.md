# MD5 Hash History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintain a history of MD5 hashes for each book so KOReader can match books even after metadata/cover edits change the file.

**Architecture:** New `book_hashes` table stores every MD5 a book has ever had. On upload/import: save the original hash. On metadata write-back: save the old hash, compute and save the new one. Kosync lookup falls back to `book_hashes` when `books.md5Hash` doesn't match. Also update `books.md5Hash` to the current file hash after metadata edits.

**Tech Stack:** Drizzle ORM (SQLite), TypeScript

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/schema.ts` | Add `bookHashes` table |
| Create | `packages/server/src/services/hash-history.ts` | `saveHash()` helper |
| Modify | `packages/server/src/routes/upload.ts` | Save original hash on upload |
| Modify | `packages/server/src/routes/import.ts` | Save original hash on OPDS import |
| Modify | `packages/server/src/trpc/routers/metadata.ts` | Save old hash + update md5Hash after edit |
| Modify | `packages/server/src/routes/kosync.ts` | Fallback lookup in `bookHashes` |
| Modify | `packages/server/src/routes/sync.ts` | Fallback lookup in `bookHashes` (Verso sync) |

---

## Task 1: Schema + Hash History Service

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Create: `packages/server/src/services/hash-history.ts`

- [ ] **Step 1: Add bookHashes table**

In `packages/shared/src/schema.ts`, add:

```typescript
export const bookHashes = sqliteTable("book_hashes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  md5Hash: text("md5_hash", { length: 32 }).notNull(),
  createdAt: text("created_at").notNull(),
});
```

- [ ] **Step 2: Build shared**

```bash
cd packages/shared && pnpm build
```

- [ ] **Step 3: Generate migration**

```bash
cd packages/server && npx drizzle-kit generate
```

- [ ] **Step 4: Create hash-history service**

Create `packages/server/src/services/hash-history.ts`:

```typescript
import { bookHashes } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

/**
 * Save an MD5 hash to the book's hash history.
 * Silently skips if the hash already exists for this book.
 */
export function saveHash(db: AppDatabase, bookId: string, md5Hash: string): void {
  try {
    const existing = db
      .select()
      .from(bookHashes)
      .where(
        and(
          eq(bookHashes.bookId, bookId),
          eq(bookHashes.md5Hash, md5Hash),
        ),
      )
      .get();
    if (existing) return;

    db.insert(bookHashes)
      .values({
        bookId,
        md5Hash,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (e) {
    console.error("Failed to save hash history:", e);
  }
}
```

Add the missing imports at the top:

```typescript
import { bookHashes } from "@verso/shared";
import { eq, and } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schema.ts packages/server/src/services/hash-history.ts packages/server/drizzle/
git commit -m "feat: add bookHashes table and saveHash service"
```

---

## Task 2: Save Hash on Upload + Import

**Files:**
- Modify: `packages/server/src/routes/upload.ts`
- Modify: `packages/server/src/routes/import.ts`

- [ ] **Step 1: Upload — save hash after book insert**

In `packages/server/src/routes/upload.ts`, add import:

```typescript
import { saveHash } from "../services/hash-history.js";
```

After the `db.insert(books).values(...)` call (after the book is inserted), add:

```typescript
        if (md5Hash) saveHash(db, bookId, md5Hash);
```

- [ ] **Step 2: Import — save hash after OPDS book insert**

In `packages/server/src/routes/import.ts`, add import:

```typescript
import { saveHash } from "../services/hash-history.js";
```

After the `db.insert(books).values(...)` call in the OPDS stream handler, add:

```typescript
            if (md5Hash) saveHash(db, bookId, md5Hash);
```

- [ ] **Step 3: Build and test**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
cd packages/server && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/upload.ts packages/server/src/routes/import.ts
git commit -m "feat: save MD5 hash on upload and import"
```

---

## Task 3: Save Old Hash + Update MD5 on Metadata Edit

**Files:**
- Modify: `packages/server/src/trpc/routers/metadata.ts`

- [ ] **Step 1: Add imports**

```typescript
import { saveHash } from "../../services/hash-history.js";
import { partialMd5 } from "../../services/partial-md5.js";
import { readFile } from "node:fs/promises";
```

- [ ] **Step 2: Save old hash and update md5Hash after EPUB write-back**

In the metadata `applyFields` mutation, find the EPUB write-back section. Replace:

```typescript
        // Update file hash after modification
        const newHash = await getFileHash(filePath);
        await ctx.db
          .update(books)
          .set({ fileHash: newHash })
          .where(eq(books.id, input.bookId));
```

with:

```typescript
        // Save old MD5 to hash history before updating
        if (book.md5Hash) {
          saveHash(ctx.db, input.bookId, book.md5Hash);
        }

        // Update file hashes after modification
        const newFileHash = await getFileHash(filePath);
        const newFileBuffer = await readFile(filePath);
        const newMd5Hash = partialMd5(newFileBuffer);

        // Save new MD5 to hash history too
        saveHash(ctx.db, input.bookId, newMd5Hash);

        await ctx.db
          .update(books)
          .set({ fileHash: newFileHash, md5Hash: newMd5Hash })
          .where(eq(books.id, input.bookId));
```

Note: `book` is already available (fetched at the start of the mutation). `book.md5Hash` has the old hash.

- [ ] **Step 3: Build and test**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
cd packages/server && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/metadata.ts
git commit -m "feat: save old MD5 + update md5Hash on metadata edit"
```

---

## Task 4: Fallback Kosync Lookup

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`
- Modify: `packages/server/src/routes/sync.ts`

- [ ] **Step 1: Update kosync PUT lookup**

In `packages/server/src/routes/kosync.ts`, add import:

```typescript
import { bookHashes } from "@verso/shared";
```

Find the book matching logic in the PUT handler:

```typescript
    const matchedBook = await db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.md5Hash, document))
      .get();
```

Replace with:

```typescript
    let matchedBook = await db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.md5Hash, document))
      .get();

    // Fallback: check hash history for books that changed after metadata edits
    if (!matchedBook) {
      const hashEntry = await db
        .select({ bookId: bookHashes.bookId })
        .from(bookHashes)
        .where(eq(bookHashes.md5Hash, document))
        .get();
      if (hashEntry) {
        matchedBook = { id: hashEntry.bookId };
      }
    }
```

- [ ] **Step 2: Update kosync GET lookup**

Same change in the GET handler — find the matching block and add the fallback:

```typescript
    let matchedBook = await db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.md5Hash, document))
      .get();

    if (!matchedBook) {
      const hashEntry = await db
        .select({ bookId: bookHashes.bookId })
        .from(bookHashes)
        .where(eq(bookHashes.md5Hash, document))
        .get();
      if (hashEntry) {
        matchedBook = { id: hashEntry.bookId };
      }
    }
```

- [ ] **Step 3: Update sync.ts lookup (Verso Sync plugin)**

In `packages/server/src/routes/sync.ts`, add import:

```typescript
import { bookHashes } from "@verso/shared";
```

Find the MD5 matching logic and add the same fallback pattern.

- [ ] **Step 4: Run tests**

```bash
cd packages/server && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/kosync.ts packages/server/src/routes/sync.ts
git commit -m "feat: kosync/sync fallback to hash history for book matching"
```

---

## Task 5: End-to-End Verification

- [ ] **Step 1: Build**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/server && npx vitest run
```

- [ ] **Step 3: Manual test**

1. Upload a book → check `book_hashes` has the original MD5
2. Edit metadata (change cover or title) → check `book_hashes` now has both old and new MD5
3. In KOReader, sync with the old file → should match via hash history
4. Re-download book via OPDS, sync again → should match via updated `books.md5Hash`
