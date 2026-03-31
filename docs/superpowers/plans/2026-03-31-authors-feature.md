# Authors Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Authors entity with dedicated pages, automatic creation on book add, metadata enrichment from OpenLibrary, and many-to-many book–author relationships.

**Architecture:** New `authors` and `bookAuthors` tables with Drizzle ORM. A shared `syncBookAuthors` helper parses comma-separated author strings and upserts author records. An OpenLibrary service fetches bios and photos asynchronously. New tRPC router for listing/viewing authors. Two new frontend routes (`/authors`, `/authors/$id`). Sidebar reordered with Authors nav item.

**Tech Stack:** Drizzle ORM (SQLite), tRPC, React, TanStack Router, Tailwind CSS, Vitest, react-i18next, OpenLibrary API

---

### Task 1: Add `authors` and `bookAuthors` schema tables

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Add the `authors` table definition**

Add after the `books` table definition (after line 56 in schema.ts):

```typescript
export const authors = sqliteTable("authors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name", { length: 500 }).notNull(),
  description: text("description"),
  imagePath: text("image_path"),
  openLibraryKey: text("open_library_key"),
  birthDate: text("birth_date"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add the `bookAuthors` junction table**

Add immediately after the `authors` table:

```typescript
export const bookAuthors = sqliteTable("book_authors", {
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => authors.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.bookId, table.authorId] }),
]);
```

- [ ] **Step 3: Verify types compile**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schema.ts
git commit -m "feat: add authors and bookAuthors schema tables"
```

---

### Task 2: Add author validators

**Files:**
- Create: `packages/shared/src/author-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create author validators**

```typescript
import { z } from "zod";

export const authorListInput = z.object({
  search: z.string().optional(),
});

export const authorByIdInput = z.object({
  id: z.string().uuid(),
});

export const authorRefreshInput = z.object({
  id: z.string().uuid(),
});
```

- [ ] **Step 2: Add export to index.ts**

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./author-validators.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/author-validators.ts packages/shared/src/index.ts
git commit -m "feat: add author validators"
```

---

### Task 3: Create `syncBookAuthors` helper — tests

**Files:**
- Create: `packages/server/src/__tests__/sync-book-authors.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, authors, bookAuthors } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookAuthors } from "../services/sync-book-authors.js";

describe("syncBookAuthors", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    userId = reg.user.id;
  });

  async function insertBook(overrides: Partial<typeof books.$inferInsert> = {}) {
    const id = crypto.randomUUID();
    const defaults = {
      id,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${id}.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ctx.db.insert(books).values({ ...defaults, ...overrides });
    return { ...defaults, ...overrides };
  }

  it("creates an author and links to book for a single author string", async () => {
    const book = await insertBook({ author: "Frank Herbert" });
    await syncBookAuthors(ctx.db, book.id, "Frank Herbert");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(1);
    expect(allAuthors[0].name).toBe("Frank Herbert");

    const links = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book.id));
    expect(links).toHaveLength(1);
    expect(links[0].authorId).toBe(allAuthors[0].id);
    expect(links[0].position).toBe(0);
  });

  it("returns isNew flag for new vs existing authors", async () => {
    const book1 = await insertBook({ title: "Dune", author: "Frank Herbert" });
    const result1 = await syncBookAuthors(ctx.db, book1.id, "Frank Herbert");
    expect(result1).toHaveLength(1);
    expect(result1[0].isNew).toBe(true);
    expect(result1[0].name).toBe("Frank Herbert");

    const book2 = await insertBook({ title: "Dune Messiah", author: "Frank Herbert" });
    const result2 = await syncBookAuthors(ctx.db, book2.id, "Frank Herbert");
    expect(result2[0].isNew).toBe(false);
  });

  it("splits comma-separated authors and creates multiple links", async () => {
    const book = await insertBook({ author: "Brian Herbert, Kevin J. Anderson" });
    await syncBookAuthors(ctx.db, book.id, "Brian Herbert, Kevin J. Anderson");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(2);

    const links = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book.id));
    expect(links).toHaveLength(2);
    expect(links[0].position).toBe(0);
    expect(links[1].position).toBe(1);
  });

  it("reuses existing author records (case-insensitive)", async () => {
    const book1 = await insertBook({ title: "Dune", author: "Frank Herbert" });
    const book2 = await insertBook({ title: "Dune Messiah", author: "frank herbert" });

    await syncBookAuthors(ctx.db, book1.id, "Frank Herbert");
    await syncBookAuthors(ctx.db, book2.id, "frank herbert");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(1);

    const links1 = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book1.id));
    const links2 = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book2.id));
    expect(links1[0].authorId).toBe(links2[0].authorId);
  });

  it("replaces old links when called again with a different author string", async () => {
    const book = await insertBook({ author: "Frank Herbert" });
    await syncBookAuthors(ctx.db, book.id, "Frank Herbert");
    await syncBookAuthors(ctx.db, book.id, "Brian Herbert, Kevin J. Anderson");

    const links = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book.id));
    expect(links).toHaveLength(2);

    const allAuthors = await ctx.db.select().from(authors);
    // Frank Herbert still exists (not deleted), plus the two new ones
    expect(allAuthors.length).toBeGreaterThanOrEqual(2);
  });

  it("trims whitespace from author names", async () => {
    const book = await insertBook({ author: "  Frank Herbert , Brian Herbert  " });
    await syncBookAuthors(ctx.db, book.id, "  Frank Herbert , Brian Herbert  ");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(2);
    expect(allAuthors.map((a) => a.name).sort()).toEqual(["Brian Herbert", "Frank Herbert"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/sync-book-authors.test.ts --reporter verbose`
Expected: FAIL — module not found

---

### Task 4: Create `syncBookAuthors` helper — implementation

**Files:**
- Create: `packages/server/src/services/sync-book-authors.ts`

- [ ] **Step 1: Implement syncBookAuthors**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/sync-book-authors.test.ts --reporter verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/sync-book-authors.ts packages/server/src/__tests__/sync-book-authors.test.ts
git commit -m "feat: add syncBookAuthors helper with tests"
```

---

### Task 5: Create OpenLibrary author service — tests

**Files:**
- Create: `packages/server/src/__tests__/openlibrary-authors.test.ts`

- [ ] **Step 1: Write tests for the OpenLibrary service**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAuthor, fetchAuthorMetadata } from "../services/openlibrary-authors.js";

describe("openlibrary-authors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("searchAuthor", () => {
    it("returns the first matching author key", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          numFound: 1,
          docs: [{ key: "OL34184A", name: "Frank Herbert" }],
        }))
      );

      const result = await searchAuthor("Frank Herbert");
      expect(result).toBe("OL34184A");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("openlibrary.org/search/authors.json?q=Frank+Herbert")
      );
    });

    it("returns null when no results", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ numFound: 0, docs: [] }))
      );

      const result = await searchAuthor("Nonexistent Author");
      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network error"));

      const result = await searchAuthor("Frank Herbert");
      expect(result).toBeNull();
    });
  });

  describe("fetchAuthorMetadata", () => {
    it("returns description and photo URL for a valid key", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          name: "Frank Herbert",
          bio: "American science fiction author.",
          birth_date: "8 October 1920",
          photos: [12345],
        }))
      );

      const result = await fetchAuthorMetadata("OL34184A");
      expect(result).not.toBeNull();
      expect(result!.description).toBe("American science fiction author.");
      expect(result!.birthDate).toBe("8 October 1920");
      expect(result!.photoUrl).toContain("covers.openlibrary.org/a/olid/OL34184A-M.jpg");
    });

    it("handles bio as object with value property", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          name: "Frank Herbert",
          bio: { type: "/type/text", value: "Author of Dune." },
          photos: [],
        }))
      );

      const result = await fetchAuthorMetadata("OL34184A");
      expect(result!.description).toBe("Author of Dune.");
    });

    it("returns null on fetch error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("fail"));

      const result = await fetchAuthorMetadata("OL34184A");
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/openlibrary-authors.test.ts --reporter verbose`
Expected: FAIL — module not found

---

### Task 6: Create OpenLibrary author service — implementation

**Files:**
- Create: `packages/server/src/services/openlibrary-authors.ts`

- [ ] **Step 1: Implement the OpenLibrary service**

```typescript
const OL_BASE = "https://openlibrary.org";
const OL_COVERS = "https://covers.openlibrary.org";

export type AuthorMetadata = {
  description: string | null;
  birthDate: string | null;
  photoUrl: string | null;
};

/**
 * Search OpenLibrary for an author by name. Returns the OpenLibrary key (e.g. "OL34184A") or null.
 */
export async function searchAuthor(name: string): Promise<string | null> {
  try {
    const url = `${OL_BASE}/search/authors.json?q=${encodeURIComponent(name)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.docs?.length) return null;
    return data.docs[0].key;
  } catch {
    return null;
  }
}

/**
 * Fetch author metadata from OpenLibrary by key.
 */
export async function fetchAuthorMetadata(olKey: string): Promise<AuthorMetadata | null> {
  try {
    const url = `${OL_BASE}/authors/${olKey}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    // Bio can be string or { type, value }
    let description: string | null = null;
    if (typeof data.bio === "string") {
      description = data.bio;
    } else if (data.bio?.value) {
      description = data.bio.value;
    }

    const birthDate: string | null = data.birth_date || null;

    // Photo URL from covers API
    let photoUrl: string | null = null;
    if (data.photos?.length > 0) {
      photoUrl = `${OL_COVERS}/a/olid/${olKey}-M.jpg`;
    }

    return { description, birthDate, photoUrl };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/openlibrary-authors.test.ts --reporter verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/openlibrary-authors.ts packages/server/src/__tests__/openlibrary-authors.test.ts
git commit -m "feat: add OpenLibrary author metadata service with tests"
```

---

### Task 7: Create `enrichAuthor` helper

**Files:**
- Create: `packages/server/src/services/enrich-author.ts`

This ties OpenLibrary search + fetch + photo download + DB update into one function.

- [ ] **Step 1: Implement enrichAuthor**

```typescript
import { eq } from "drizzle-orm";
import { authors } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { searchAuthor, fetchAuthorMetadata } from "./openlibrary-authors.js";

/**
 * Fetch metadata from OpenLibrary and update the author record.
 * Fire-and-forget safe — catches all errors internally.
 * Returns true if metadata was found and saved, false otherwise.
 */
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/services/enrich-author.ts
git commit -m "feat: add enrichAuthor helper for OpenLibrary metadata"
```

---

### Task 8: Create authors tRPC router — tests

**Files:**
- Create: `packages/server/src/__tests__/authors.test.ts`

- [ ] **Step 1: Write tests for the authors router**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, authors, bookAuthors } from "@verso/shared";

describe("authors router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;
  });

  async function insertAuthorWithBooks(name: string, bookCount: number) {
    const [author] = await ctx.db
      .insert(authors)
      .values({ name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .returning();

    for (let i = 0; i < bookCount; i++) {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId,
        title: `${name} Book ${i + 1}`,
        author: name,
        filePath: `books/${bookId}.epub`,
        fileFormat: "epub",
        fileSize: 1024,
        addedBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await ctx.db.insert(bookAuthors).values({ bookId, authorId: author.id, position: 0 });
    }

    return author;
  }

  describe("list", () => {
    it("returns empty list when no authors exist", async () => {
      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(0);
    });

    it("returns authors with book counts, sorted by count desc", async () => {
      await insertAuthorWithBooks("Frank Herbert", 3);
      await insertAuthorWithBooks("Neal Stephenson", 1);

      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Frank Herbert");
      expect(result[0].bookCount).toBe(3);
      expect(result[1].name).toBe("Neal Stephenson");
      expect(result[1].bookCount).toBe(1);
    });

    it("excludes authors with zero books", async () => {
      await ctx.db.insert(authors).values({
        name: "No Books Author",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await insertAuthorWithBooks("Has Books", 1);

      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Has Books");
    });

    it("filters by search term", async () => {
      await insertAuthorWithBooks("Frank Herbert", 2);
      await insertAuthorWithBooks("Neal Stephenson", 1);

      const result = await authedCaller.authors.list({ search: "frank" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Frank Herbert");
    });
  });

  describe("byId", () => {
    it("returns author with books", async () => {
      const author = await insertAuthorWithBooks("Frank Herbert", 2);

      const result = await authedCaller.authors.byId({ id: author.id });
      expect(result.name).toBe("Frank Herbert");
      expect(result.books).toHaveLength(2);
    });

    it("throws NOT_FOUND for missing author", async () => {
      await expect(
        authedCaller.authors.byId({ id: crypto.randomUUID() })
      ).rejects.toThrow("Author not found");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/authors.test.ts --reporter verbose`
Expected: FAIL — `authedCaller.authors` is not defined

---

### Task 9: Create authors tRPC router — implementation

**Files:**
- Create: `packages/server/src/trpc/routers/authors.ts`
- Modify: `packages/server/src/trpc/router.ts`

- [ ] **Step 1: Create the authors router**

```typescript
import { TRPCError } from "@trpc/server";
import { eq, sql, desc, like } from "drizzle-orm";
import {
  authors,
  bookAuthors,
  books,
  authorListInput,
  authorByIdInput,
  authorRefreshInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";
import { enrichAuthor } from "../../services/enrich-author.js";

export const authorsRouter = router({
  list: protectedProcedure.input(authorListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: authors.id,
        name: authors.name,
        imagePath: authors.imagePath,
        bookCount: sql<number>`count(${bookAuthors.bookId})`,
      })
      .from(authors)
      .innerJoin(bookAuthors, eq(bookAuthors.authorId, authors.id))
      .where(
        input.search
          ? like(authors.name, `%${input.search}%`)
          : undefined
      )
      .groupBy(authors.id)
      .orderBy(desc(sql`count(${bookAuthors.bookId})`), authors.name);

    return rows;
  }),

  byId: protectedProcedure.input(authorByIdInput).query(async ({ ctx, input }) => {
    const author = await ctx.db.query.authors.findFirst({
      where: eq(authors.id, input.id),
    });

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    // If no metadata yet, try enriching in background
    if (!author.description && !author.openLibraryKey) {
      enrichAuthor(ctx.db, author.id, author.name, ctx.storage).catch(() => {});
    }

    const authorBooks = await ctx.db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverPath: books.coverPath,
        year: books.year,
        fileFormat: books.fileFormat,
      })
      .from(bookAuthors)
      .innerJoin(books, eq(books.id, bookAuthors.bookId))
      .where(eq(bookAuthors.authorId, input.id))
      .orderBy(books.year, books.title);

    return { ...author, books: authorBooks };
  }),

  refreshMetadata: protectedProcedure.input(authorRefreshInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.query.authors.findFirst({
      where: eq(authors.id, input.id),
    });

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    await enrichAuthor(ctx.db, author.id, author.name, ctx.storage);

    const updated = await ctx.db.query.authors.findFirst({
      where: eq(authors.id, input.id),
    });

    return updated!;
  }),
});
```

- [ ] **Step 2: Register the router in router.ts**

Add import and register in `packages/server/src/trpc/router.ts`:

```typescript
import { authorsRouter } from "./routers/authors.js";
```

Add to the router object:

```typescript
authors: authorsRouter,
```

- [ ] **Step 3: Add `authors` to Drizzle schema config if needed**

Check if there's a Drizzle schema config file that needs the new tables registered for `db.query.authors` to work. Look for a file that passes the schema object to the Drizzle constructor. If found, add `authors` and `bookAuthors` to it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/authors.test.ts --reporter verbose`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/trpc/routers/authors.ts packages/server/src/trpc/router.ts
git commit -m "feat: add authors tRPC router with list, byId, refreshMetadata"
```

---

### Task 10: Hook syncBookAuthors into upload and import flows

**Files:**
- Modify: `packages/server/src/routes/upload.ts`
- Modify: `packages/server/src/routes/import.ts`
- Modify: `packages/server/src/trpc/routers/books.ts`

- [ ] **Step 1: Add syncBookAuthors call to upload.ts**

In `packages/server/src/routes/upload.ts`, add import at the top:

```typescript
import { syncBookAuthors } from "../services/sync-book-authors.js";
import { enrichAuthor } from "../services/enrich-author.js";
```

After the book insert (after line 166, after `.returning()`), add:

```typescript
// Sync author records and enrich new ones in background
const syncedAuthors = await syncBookAuthors(db, bookId, metadata.author);
for (const a of syncedAuthors) {
  if (a.isNew) enrichAuthor(db, a.id, a.name, storage).catch(() => {});
}
```

- [ ] **Step 2: Add syncBookAuthors call to import.ts**

In `packages/server/src/routes/import.ts`, add import at the top:

```typescript
import { syncBookAuthors } from "../services/sync-book-authors.js";
import { enrichAuthor } from "../services/enrich-author.js";
```

After the book insert (after line 203), add:

```typescript
// Sync author records and enrich new ones in background
const authorString = metadata.author || entry.author || "Unknown Author";
const syncedAuthors = await syncBookAuthors(db, bookId, authorString);
for (const a of syncedAuthors) {
  if (a.isNew) enrichAuthor(db, a.id, a.name, storage).catch(() => {});
}
```

- [ ] **Step 3: Add syncBookAuthors call to books.update**

In `packages/server/src/trpc/routers/books.ts`, add import at the top:

```typescript
import { syncBookAuthors } from "../../services/sync-book-authors.js";
```

In the `update` mutation, after the `ctx.db.update(books)` call (after line 96), add:

```typescript
// If author field changed, re-sync author links
if (fields.author) {
  await syncBookAuthors(ctx.db, id, fields.author);
}
```

- [ ] **Step 4: Run all server tests**

Run: `cd packages/server && npx vitest run --reporter verbose`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/upload.ts packages/server/src/routes/import.ts packages/server/src/trpc/routers/books.ts
git commit -m "feat: hook syncBookAuthors into upload, import, and book update"
```

---

### Task 11: Add i18n keys for authors

**Files:**
- Modify: `packages/web/src/locales/en.json`
- Modify: all other locale files in `packages/web/src/locales/`

- [ ] **Step 1: Add i18n keys to en.json**

Add these keys:

```json
"authors.title": "Authors",
"authors.subtitle_one": "{{count}} author in your library",
"authors.subtitle_other": "{{count}} authors in your library",
"authors.searchPlaceholder": "Search authors...",
"authors.books_one": "{{count}} book",
"authors.books_other": "{{count}} books",
"authors.noBio": "No biography available",
"authors.refreshMetadata": "Refresh metadata",
"authors.booksSection": "Books",
"nav.authors": "Authors"
```

- [ ] **Step 2: Add same keys to all other locale files as English placeholders**

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/locales/
git commit -m "feat: add i18n keys for authors feature"
```

---

### Task 12: Add PenIcon to icons and reorder sidebar

**Files:**
- Modify: `packages/web/src/components/icons.tsx`
- Modify: `packages/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add PenIcon to icons.tsx**

Add a pen/quill icon export to `packages/web/src/components/icons.tsx`:

```typescript
export function PenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
```

- [ ] **Step 2: Reorder sidebar — add Authors, move Stats**

In `packages/web/src/components/layout/sidebar.tsx`, add `PenIcon` to the icon imports:

```typescript
import {
  HomeIcon,
  BookOpenIcon,
  BarChartIcon,
  PenIcon,
  // ... rest
} from "@/components/icons";
```

Move the Stats `SidebarItem` (currently line 79) to right after the Library item, and add Authors between Library and Stats. The section after `<SidebarItem to="/library" ...>` and before the default shelves should become:

```tsx
<SidebarItem to="/home" label={t("nav.home")} icon={<HomeIcon />} active={isActive("/home")} onClick={onClose} />
<SidebarItem to="/library" label={t("nav.library")} icon={<BookOpenIcon />} active={isActive("/library")} onClick={onClose} />
<SidebarItem to="/authors" label={t("nav.authors")} icon={<PenIcon />} active={isActive("/authors")} onClick={onClose} />
<SidebarItem to="/stats" label={t("nav.stats")} icon={<BarChartIcon />} active={isActive("/stats")} onClick={onClose} />
{defaultShelves.map((shelf) => (
```

Remove the old Stats `SidebarItem` from its current position (after the user shelves section).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/icons.tsx packages/web/src/components/layout/sidebar.tsx
git commit -m "feat: add Authors to sidebar, reorder Stats"
```

---

### Task 13: Create AuthorCard component

**Files:**
- Create: `packages/web/src/components/authors/author-card.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

type AuthorCardProps = {
  id: string;
  name: string;
  imagePath?: string | null;
  bookCount: number;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 35%)`;
}

export function AuthorCard({ id, name, imagePath, bookCount }: AuthorCardProps) {
  const { t } = useTranslation();

  return (
    <Link
      to="/authors/$id"
      params={{ id }}
      className="block rounded-xl p-4 text-center transition-transform duration-200 hover:-translate-y-1"
      style={{ backgroundColor: "var(--card)" }}
    >
      <div
        className="w-20 h-20 rounded-full mx-auto mb-2.5 flex items-center justify-center text-2xl font-bold text-white overflow-hidden"
        style={{ backgroundColor: hashColor(name) }}
      >
        {imagePath ? (
          <img
            src={`/api/storage/${imagePath}`}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).parentElement!.textContent = getInitials(name);
            }}
          />
        ) : (
          getInitials(name)
        )}
      </div>
      <p
        className="font-display text-sm font-semibold line-clamp-1"
        style={{ color: "var(--text)" }}
      >
        {name}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-dim)" }}>
        {t("authors.books", { count: bookCount })}
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/authors/author-card.tsx
git commit -m "feat: add AuthorCard component"
```

---

### Task 14: Create Authors list page

**Files:**
- Create: `packages/web/src/routes/_app/authors/index.tsx`

- [ ] **Step 1: Create the authors list route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { AuthorCard } from "@/components/authors/author-card";

export const Route = createFileRoute("/_app/authors/")({
  component: AuthorsPage,
});

function AuthorsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = trpc.authors.list.useQuery({ search: search || undefined });

  const authorsList = query.data ?? [];

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1
            className="font-display text-xl md:text-[26px] font-bold"
            style={{ color: "var(--text)" }}
          >
            {t("authors.title")}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
            {t("authors.subtitle", { count: authorsList.length })}
          </p>
        </div>
        <input
          type="text"
          placeholder={t("authors.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm w-full md:w-56 outline-none"
          style={{
            backgroundColor: "var(--card)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
        />
      </div>

      <div
        className="grid gap-3 md:gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {authorsList.map((author) => (
          <AuthorCard
            key={author.id}
            id={author.id}
            name={author.name}
            imagePath={author.imagePath}
            bookCount={author.bookCount}
          />
        ))}
      </div>

      {authorsList.length === 0 && !query.isLoading && (
        <p className="text-center py-12 text-sm" style={{ color: "var(--text-dim)" }}>
          {search ? t("search.noResults") : t("authors.title")}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/_app/authors/
git commit -m "feat: add Authors list page"
```

---

### Task 15: Create Author detail page

**Files:**
- Create: `packages/web/src/routes/_app/authors/$id.tsx`

- [ ] **Step 1: Create the author detail route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { BookCard } from "@/components/books/book-card";

export const Route = createFileRoute("/_app/authors/$id")({
  component: AuthorDetailPage,
});

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 35%)`;
}

function AuthorDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const query = trpc.authors.byId.useQuery({ id });
  const utils = trpc.useUtils();
  const refreshMutation = trpc.authors.refreshMetadata.useMutation({
    onSuccess: () => utils.authors.byId.invalidate({ id }),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: "var(--text-dim)" }}>Loading...</p>
      </div>
    );
  }

  const author = query.data;
  if (!author) return null;

  return (
    <div>
      {/* Author header */}
      <div className="flex gap-4 md:gap-6 mb-6 md:mb-8">
        <div
          className="w-20 h-20 md:w-[120px] md:h-[120px] rounded-full flex items-center justify-center text-2xl md:text-4xl font-bold text-white shrink-0 overflow-hidden"
          style={{ backgroundColor: hashColor(author.name) }}
        >
          {author.imagePath ? (
            <img
              src={`/api/storage/${author.imagePath}`}
              alt={author.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.textContent = getInitials(author.name);
              }}
            />
          ) : (
            getInitials(author.name)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1
            className="font-display text-xl md:text-2xl font-bold"
            style={{ color: "var(--text)" }}
          >
            {author.name}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
            {t("authors.books", { count: author.books.length })}
          </p>
          {author.description ? (
            <p
              className="text-sm mt-3 leading-relaxed line-clamp-3"
              style={{ color: "var(--text-dim)" }}
            >
              {author.description}
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-3">
              <p className="text-sm italic" style={{ color: "var(--text-faint)" }}>
                {t("authors.noBio")}
              </p>
              <button
                onClick={() => refreshMutation.mutate({ id })}
                disabled={refreshMutation.isPending}
                className="text-xs underline"
                style={{ color: "var(--warm)" }}
              >
                {refreshMutation.isPending ? "..." : t("authors.refreshMetadata")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Books section */}
      <h2
        className="font-display text-base font-bold mb-3"
        style={{ color: "var(--text)" }}
      >
        {t("authors.booksSection")}
      </h2>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {author.books.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            coverPath={book.coverPath}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/_app/authors/$id.tsx
git commit -m "feat: add Author detail page"
```

---

### Task 16: Make author name clickable on book detail page

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

- [ ] **Step 1: Add authors query and make author name a link**

Add imports at the top:

```typescript
import { trpc } from "@/trpc";
```

The book detail page already uses `trpc`. We need to fetch the bookAuthors for this book to get author IDs for linking. Add a new query in the component:

```typescript
const authorsQuery = trpc.authors.list.useQuery({});
```

Replace the current author display (lines 169-174):

```tsx
<p
  className="font-display italic text-sm md:text-base mt-0.5"
  style={{ color: "var(--text-dim)" }}
>
  {book.author}
</p>
```

With a version that links each author name to their author page. Since we have the full authors list and the book's author string, we can match by name:

```tsx
<p
  className="font-display italic text-sm md:text-base mt-0.5"
  style={{ color: "var(--text-dim)" }}
>
  {book.author.split(",").map((name, i, arr) => {
    const trimmed = name.trim();
    const match = authorsQuery.data?.find(
      (a) => a.name.toLowerCase() === trimmed.toLowerCase()
    );
    return (
      <span key={trimmed}>
        {match ? (
          <Link
            to="/authors/$id"
            params={{ id: match.id }}
            className="hover:underline"
            style={{ color: "var(--warm)" }}
          >
            {trimmed}
          </Link>
        ) : (
          trimmed
        )}
        {i < arr.length - 1 && ", "}
      </span>
    );
  })}
</p>
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/_app/books/$id.tsx
git commit -m "feat: make author names clickable on book detail page"
```

---

### Task 17: Create migration script for existing books

**Files:**
- Create: `packages/server/src/services/migrate-authors.ts`

- [ ] **Step 1: Create migration script**

This runs once to create author records for all existing books:

```typescript
import { books } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { syncBookAuthors } from "./sync-book-authors.js";
import { enrichAuthor } from "./enrich-author.js";

/**
 * One-time migration: scan all books, create author records, and link them.
 * Call this on server startup if bookAuthors table is empty.
 */
export async function migrateExistingAuthors(
  db: BetterSQLite3Database<any>,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<number> {
  const allBooks = await db.select({ id: books.id, author: books.author }).from(books);

  let authorCount = 0;
  const enriched = new Set<string>();

  for (const book of allBooks) {
    if (!book.author) continue;
    const authorIds = await syncBookAuthors(db, book.id, book.author);
    authorCount += authorIds.length;

    // Enrich each new author (with a 1s delay between requests)
    for (const authorId of authorIds) {
      if (!enriched.has(authorId)) {
        enriched.add(authorId);
        // Fire-and-forget with delay for rate limiting
        enrichAuthor(db, authorId, book.author.split(",")[0].trim(), storage).catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  return enriched.size;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/services/migrate-authors.ts
git commit -m "feat: add migration script for existing book authors"
```

---

### Task 18: Build check and full test run

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript type check on shared**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run TypeScript type check on server**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run TypeScript type check on web**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run all server tests**

Run: `cd packages/server && npx vitest run --reporter verbose`
Expected: All tests pass.

- [ ] **Step 5: Build web package**

Run: `cd packages/web && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Browser test**

Start the dev server and verify:
1. Sidebar shows Authors between Library and Stats
2. `/authors` page shows empty state or author grid
3. Upload a book → author auto-created
4. `/authors` page now shows the author
5. Click author → detail page with book card
6. Book detail page → author name is clickable link
7. Responsive: check mobile layout

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during integration testing"
```
