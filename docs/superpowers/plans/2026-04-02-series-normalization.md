# Series Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize series into a dedicated table with deduplication, add a series combobox to the edit form, make series clickable on the detail page (linking to a filtered search view), and add series to smart shelf filters.

**Architecture:** New `bookSeries` table with `seriesId` FK on `books` (one-to-one). A `syncBookSeries` service handles case-insensitive upsert at all entry points. The search route gains a `series` query parameter that filters and sorts by series index. The book detail page links series names to the search view. Mirrors the publisher normalization pattern exactly.

**Tech Stack:** Drizzle ORM (SQLite), tRPC v11, Zod, React 19, TanStack Router, i18next, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/shared/src/schema.ts` | **MODIFY** — Add `bookSeries` table, add `seriesId` FK to `books` |
| `packages/shared/src/series-validators.ts` | **NEW** — Zod validators for series router inputs |
| `packages/shared/src/validators.ts` | **MODIFY** — Add `series` param to `bookListInput` |
| `packages/shared/src/shelf-validators.ts` | **MODIFY** — Add `series` to `smartFilterField` enum |
| `packages/shared/src/index.ts` | **MODIFY** — Export new validators |
| `packages/server/src/services/sync-book-series.ts` | **NEW** — `syncBookSeries()` service |
| `packages/server/src/services/migrate-series.ts` | **NEW** — Startup data migration |
| `packages/server/src/trpc/routers/series.ts` | **NEW** — `list` and `update` procedures |
| `packages/server/src/trpc/router.ts` | **MODIFY** — Register `seriesRouter` |
| `packages/server/src/trpc/routers/books.ts` | **MODIFY** — Call `syncBookSeries` in `update`, add series filter to `list` and `search` |
| `packages/server/src/trpc/routers/metadata.ts` | **MODIFY** — Call `syncBookSeries` in `applyFields` |
| `packages/server/src/routes/upload.ts` | **MODIFY** — Call `syncBookSeries` after extraction |
| `packages/server/src/trpc/routers/build-filter.ts` | **MODIFY** — Add `series` to `columnMap` |
| `packages/server/src/app.ts` | **MODIFY** — Call `migrateSeriesData` at startup |
| `packages/web/src/routes/_app/books/$id_.edit.tsx` | **MODIFY** — Series combobox replacing text input |
| `packages/web/src/routes/_app/books/$id.tsx` | **MODIFY** — Clickable series link |
| `packages/web/src/routes/_app/search.tsx` | **MODIFY** — Accept `series` search param, filter by series |
| `packages/web/src/components/shelves/filter-builder.tsx` | **MODIFY** — Add series to filter fields |
| `packages/server/src/__tests__/sync-book-series.test.ts` | **NEW** — Tests for sync service |
| `packages/server/src/__tests__/series.test.ts` | **NEW** — Tests for series router |

---

### Task 1: Series Schema & Shared Validators

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Create: `packages/shared/src/series-validators.ts`
- Modify: `packages/shared/src/validators.ts`
- Modify: `packages/shared/src/shelf-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add bookSeries table to schema**

In `packages/shared/src/schema.ts`, add the `bookSeries` table BEFORE the `books` table (after the `publishers` table, before `books`):

```typescript
export const bookSeries = sqliteTable("book_series", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name", { length: 255 }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

Add `seriesId` FK to the `books` table, after the `seriesIndex` field (after line 59):

```typescript
  seriesId: text("series_id").references(() => bookSeries.id, { onDelete: "set null" }),
```

- [ ] **Step 2: Create series validators**

Create `packages/shared/src/series-validators.ts`:

```typescript
import { z } from "zod";

export const seriesListInput = z.object({
  search: z.string().optional(),
});

export const seriesUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
});
```

- [ ] **Step 3: Add series to bookListInput**

In `packages/shared/src/validators.ts`, add `series` param to `bookListInput` (after the `format` field):

```typescript
  series: z.string().optional(),
```

- [ ] **Step 4: Add series to smart filter field enum**

In `packages/shared/src/shelf-validators.ts`, update the `smartFilterField` enum:

```typescript
export const smartFilterField = z.enum([
  "title", "author", "genre", "year",
  "language", "fileFormat", "pageCount", "publisher", "series",
]);
```

- [ ] **Step 5: Export new module**

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./series-validators.js";
```

- [ ] **Step 6: Build shared package**

Run: `cd packages/shared && pnpm build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schema.ts packages/shared/src/series-validators.ts packages/shared/src/validators.ts packages/shared/src/shelf-validators.ts packages/shared/src/index.ts
git commit -m "feat: add bookSeries table, seriesId FK, and series validators"
```

---

### Task 2: syncBookSeries Service

**Files:**
- Create: `packages/server/src/services/sync-book-series.ts`
- Create: `packages/server/src/__tests__/sync-book-series.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/sync-book-series.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, bookSeries } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookSeries } from "../services/sync-book-series.js";

describe("syncBookSeries", () => {
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

  it("creates a series and links to book", async () => {
    const book = await insertBook({ series: "Dune" });
    const result = await syncBookSeries(ctx.db, book.id, "Dune");

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Dune");

    const allSeries = await ctx.db.select().from(bookSeries);
    expect(allSeries).toHaveLength(1);

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.seriesId).toBe(result!.id);
    expect(updatedBook.series).toBe("Dune");
  });

  it("reuses existing series (case-insensitive)", async () => {
    const book1 = await insertBook({ title: "Dune", series: "Dune Chronicles" });
    const book2 = await insertBook({ title: "Dune Messiah", series: "dune chronicles" });

    await syncBookSeries(ctx.db, book1.id, "Dune Chronicles");
    await syncBookSeries(ctx.db, book2.id, "dune chronicles");

    const allSeries = await ctx.db.select().from(bookSeries);
    expect(allSeries).toHaveLength(1);

    const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
    const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
    expect(b1.seriesId).toBe(b2.seriesId);
    expect(b2.series).toBe("Dune Chronicles");
  });

  it("clears seriesId when given null", async () => {
    const book = await insertBook({ series: "Dune" });
    await syncBookSeries(ctx.db, book.id, "Dune");
    await syncBookSeries(ctx.db, book.id, null);

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.seriesId).toBeNull();
    expect(updatedBook.series).toBeNull();
  });

  it("clears seriesId when given empty string", async () => {
    const book = await insertBook({ series: "Dune" });
    await syncBookSeries(ctx.db, book.id, "Dune");
    await syncBookSeries(ctx.db, book.id, "");

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.seriesId).toBeNull();
    expect(updatedBook.series).toBeNull();
  });

  it("trims whitespace from series names", async () => {
    const book = await insertBook({ series: "  Dune  " });
    const result = await syncBookSeries(ctx.db, book.id, "  Dune  ");

    expect(result!.name).toBe("Dune");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelkusche/dev/verso/packages/server && pnpm vitest run src/__tests__/sync-book-series.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement syncBookSeries**

Create `packages/server/src/services/sync-book-series.ts`:

```typescript
import { eq, sql } from "drizzle-orm";
import { books, bookSeries } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Resolve a series string to a bookSeries record, creating if needed.
 * Updates books.seriesId and books.series (canonical name).
 */
export async function syncBookSeries(
  db: BetterSQLite3Database<any>,
  bookId: string,
  seriesString: string | null,
): Promise<{ id: string; name: string } | null> {
  const trimmed = seriesString?.trim() || null;

  if (!trimmed) {
    await db
      .update(books)
      .set({ seriesId: null, series: null })
      .where(eq(books.id, bookId));
    return null;
  }

  // Case-insensitive lookup
  const existing = await db
    .select()
    .from(bookSeries)
    .where(sql`${bookSeries.name} COLLATE NOCASE = ${trimmed}`)
    .get();

  let seriesId: string;
  let canonicalName: string;

  if (existing) {
    seriesId = existing.id;
    canonicalName = existing.name;
  } else {
    const [created] = await db
      .insert(bookSeries)
      .values({
        name: trimmed,
        createdAt: new Date().toISOString(),
      })
      .returning();
    seriesId = created.id;
    canonicalName = created.name;
  }

  await db
    .update(books)
    .set({ seriesId, series: canonicalName })
    .where(eq(books.id, bookId));

  return { id: seriesId, name: canonicalName };
}
```

- [ ] **Step 4: Generate Drizzle migration, build, and run tests**

Run: `cd /Users/michaelkusche/dev/verso/packages/shared && pnpm build && cd ../server && pnpm db:generate && pnpm vitest run src/__tests__/sync-book-series.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/sync-book-series.ts packages/server/src/__tests__/sync-book-series.test.ts packages/server/drizzle/
git commit -m "feat: add syncBookSeries service for series deduplication"
```

---

### Task 3: Series tRPC Router

**Files:**
- Create: `packages/server/src/trpc/routers/series.ts`
- Modify: `packages/server/src/trpc/router.ts`
- Create: `packages/server/src/__tests__/series.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/series.test.ts`. Follow the same test infrastructure pattern as `publishers.test.ts` — use `ctx.createAuthedCaller(token)` for authenticated calls, first registered user is admin:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, bookSeries } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookSeries } from "../services/sync-book-series.js";

describe("series router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let adminCaller: ReturnType<typeof ctx.createAuthedCaller>;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    userId = reg.user.id;
    adminCaller = ctx.createAuthedCaller(reg.accessToken);
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

  describe("list", () => {
    it("returns series with book counts", async () => {
      const book1 = await insertBook({ title: "Dune", series: "Dune Chronicles" });
      const book2 = await insertBook({ title: "Dune Messiah", series: "Dune Chronicles" });
      const book3 = await insertBook({ title: "Foundation", series: "Foundation" });
      await syncBookSeries(ctx.db, book1.id, "Dune Chronicles");
      await syncBookSeries(ctx.db, book2.id, "Dune Chronicles");
      await syncBookSeries(ctx.db, book3.id, "Foundation");

      const result = await adminCaller.series.list({});
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Dune Chronicles");
      expect(result[0].bookCount).toBe(2);
      expect(result[1].name).toBe("Foundation");
      expect(result[1].bookCount).toBe(1);
    });

    it("filters by search string", async () => {
      const book1 = await insertBook({ title: "Dune", series: "Dune Chronicles" });
      const book2 = await insertBook({ title: "Foundation", series: "Foundation" });
      await syncBookSeries(ctx.db, book1.id, "Dune Chronicles");
      await syncBookSeries(ctx.db, book2.id, "Foundation");

      const result = await adminCaller.series.list({ search: "dune" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Dune Chronicles");
    });
  });

  describe("update", () => {
    it("renames a series", async () => {
      const book = await insertBook({ series: "Dune" });
      await syncBookSeries(ctx.db, book.id, "Dune");

      const seriesList = await adminCaller.series.list({});
      const s = seriesList[0];

      const updated = await adminCaller.series.update({ id: s.id, name: "Dune Chronicles" });
      expect(updated.name).toBe("Dune Chronicles");

      const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
      expect(updatedBook.series).toBe("Dune Chronicles");
    });

    it("auto-merges when renamed to match existing series", async () => {
      const book1 = await insertBook({ title: "Dune", series: "Dune" });
      const book2 = await insertBook({ title: "Dune Messiah", series: "Dune Chronicles" });
      await syncBookSeries(ctx.db, book1.id, "Dune");
      await syncBookSeries(ctx.db, book2.id, "Dune Chronicles");

      const seriesList = await adminCaller.series.list({});
      const duneSeries = seriesList.find((s) => s.name === "Dune")!;
      const duneChroniclesSeries = seriesList.find((s) => s.name === "Dune Chronicles")!;

      await adminCaller.series.update({ id: duneSeries.id, name: "Dune Chronicles" });

      const afterList = await adminCaller.series.list({});
      expect(afterList).toHaveLength(1);
      expect(afterList[0].name).toBe("Dune Chronicles");
      expect(afterList[0].bookCount).toBe(2);

      const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
      const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
      expect(b1.seriesId).toBe(duneChroniclesSeries.id);
      expect(b2.seriesId).toBe(duneChroniclesSeries.id);
      expect(b1.series).toBe("Dune Chronicles");
    });
  });
});
```

- [ ] **Step 2: Implement series router**

Create `packages/server/src/trpc/routers/series.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { eq, sql, like } from "drizzle-orm";
import { books, bookSeries, seriesListInput, seriesUpdateInput } from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";

export const seriesRouter = router({
  list: protectedProcedure.input(seriesListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: bookSeries.id,
        name: bookSeries.name,
        bookCount: sql<number>`count(${books.id})`,
      })
      .from(bookSeries)
      .leftJoin(books, eq(books.seriesId, bookSeries.id))
      .where(
        input.search
          ? like(bookSeries.name, `%${input.search}%`)
          : undefined
      )
      .groupBy(bookSeries.id)
      .orderBy(sql`count(${books.id}) DESC`, bookSeries.name);

    return rows;
  }),

  update: adminProcedure.input(seriesUpdateInput).mutation(async ({ ctx, input }) => {
    const series = await ctx.db
      .select()
      .from(bookSeries)
      .where(eq(bookSeries.id, input.id))
      .get();

    if (!series) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
    }

    // Check if a series with the new name already exists (case-insensitive)
    const existing = await ctx.db
      .select()
      .from(bookSeries)
      .where(sql`${bookSeries.name} COLLATE NOCASE = ${input.name} AND ${bookSeries.id} != ${input.id}`)
      .get();

    if (existing) {
      // Merge: reassign all books from this series to the existing one
      await ctx.db
        .update(books)
        .set({ seriesId: existing.id, series: existing.name })
        .where(eq(books.seriesId, input.id));

      // Delete the old series
      await ctx.db.delete(bookSeries).where(eq(bookSeries.id, input.id));

      return existing;
    }

    // Simple rename
    await ctx.db
      .update(bookSeries)
      .set({ name: input.name })
      .where(eq(bookSeries.id, input.id));

    // Update denormalized series field on all books
    await ctx.db
      .update(books)
      .set({ series: input.name })
      .where(eq(books.seriesId, input.id));

    return ctx.db.select().from(bookSeries).where(eq(bookSeries.id, input.id)).get()!;
  }),
});
```

- [ ] **Step 3: Register router**

In `packages/server/src/trpc/router.ts`, add:

Import: `import { seriesRouter } from "./routers/series.js";`

Add to `appRouter`: `series: seriesRouter,`

- [ ] **Step 4: Build and run tests**

Run: `cd /Users/michaelkusche/dev/verso/packages/shared && pnpm build && cd ../server && pnpm vitest run src/__tests__/series.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/trpc/routers/series.ts packages/server/src/trpc/router.ts packages/server/src/__tests__/series.test.ts
git commit -m "feat: add series tRPC router with list, update, and auto-merge"
```

---

### Task 4: Integrate at Entry Points

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts`
- Modify: `packages/server/src/trpc/routers/metadata.ts`
- Modify: `packages/server/src/routes/upload.ts`

- [ ] **Step 1: Update books.ts**

Add import:
```typescript
import { syncBookSeries } from "../../services/sync-book-series.js";
```

In the `update` mutation, after the `syncBookPublisher` call (after line 150), add:

```typescript
    // Sync series record
    const finalSeries = fields.series !== undefined ? fields.series : existing.series;
    await syncBookSeries(ctx.db, id, finalSeries ?? null);
```

In the `list` procedure, destructure `series` from input (line 33):
```typescript
    const { sort, page, limit, search, genreSlug, author, format, series } = input;
```

Add series filter condition after the format condition (after line 47):
```typescript
    if (series) conditions.push(eq(books.series, series));
```

Add series-aware sort — when filtering by series, default to seriesIndex. Replace the orderBy block (lines 51-53):
```typescript
    const orderBy = series
      ? asc(books.seriesIndex)
      : {
          title: asc(books.title),
          author: asc(books.author),
          recent: desc(books.createdAt),
        }[sort || "recent"];
```

- [ ] **Step 2: Update metadata.ts**

Add import:
```typescript
import { syncBookSeries } from "../../services/sync-book-series.js";
```

In `applyFields`, after the `syncBookPublisher` call (after line 199), add:

```typescript
    // Sync series record
    if (metadataFields.series !== undefined) {
      await syncBookSeries(ctx.db, input.bookId, metadataFields.series ?? null);
    }
```

- [ ] **Step 3: Update upload.ts**

Add import:
```typescript
import { syncBookSeries } from "../services/sync-book-series.js";
```

After the `syncBookPublisher` call (after line 184), add:

```typescript
        // Sync series record
        if (metadata.series) {
          await syncBookSeries(db, bookId, metadata.series);
        }
```

- [ ] **Step 4: Run full test suite**

Run: `cd /Users/michaelkusche/dev/verso/packages/shared && pnpm build && cd ../server && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/trpc/routers/books.ts packages/server/src/trpc/routers/metadata.ts packages/server/src/routes/upload.ts
git commit -m "feat: integrate syncBookSeries at all entry points, add series filter to book list"
```

---

### Task 5: Smart Shelf Filter & Search Route

**Files:**
- Modify: `packages/server/src/trpc/routers/build-filter.ts`
- Modify: `packages/web/src/components/shelves/filter-builder.tsx`
- Modify: `packages/web/src/routes/_app/search.tsx`

- [ ] **Step 1: Add series to server columnMap**

In `packages/server/src/trpc/routers/build-filter.ts`, add `series` to the `columnMap`:

```typescript
const columnMap = {
  title: books.title,
  author: books.author,
  publisher: books.publisher,
  series: books.series,
  year: books.year,
  language: books.language,
  fileFormat: books.fileFormat,
  pageCount: books.pageCount,
} as const;
```

- [ ] **Step 2: Add series to filter builder UI**

In `packages/web/src/components/shelves/filter-builder.tsx`, add series to the `FIELDS` array:

```typescript
const FIELDS: { value: SmartFilterCondition["field"]; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "publisher", label: "Publisher" },
  { value: "series", label: "Series" },
  { value: "genre", label: "Genre" },
  { value: "year", label: "Year" },
  { value: "language", label: "Language" },
  { value: "fileFormat", label: "Format" },
  { value: "pageCount", label: "Page Count" },
];
```

- [ ] **Step 3: Update search route to accept series param**

In `packages/web/src/routes/_app/search.tsx`, update `validateSearch` (line 9) to accept `series`:

```typescript
  validateSearch: (search: Record<string, unknown>): { q: string; genre?: string; series?: string } => ({
    q: typeof search.q === "string" ? search.q : "",
    genre: typeof search.genre === "string" ? search.genre : undefined,
    series: typeof search.series === "string" ? search.series : undefined,
  }),
```

Update the `SearchPage` component to use the series param. Destructure it (line 18):
```typescript
  const { q, genre, series } = Route.useSearch();
```

Pass it to the search query (line 22-28):
```typescript
  const searchQuery = trpc.books.search.useQuery(
    {
      query: q || undefined,
      genreSlug: selectedGenreSlug ?? undefined,
      format: (selectedFormat?.toLowerCase() as "epub" | "pdf" | "mobi") ?? undefined,
    },
    { enabled: q.length > 0 || !!selectedGenreSlug },
  );
```

Actually, for series filtering we should use `books.list` instead of `books.search` since `books.search` uses FTS and doesn't have the series filter. Let's use a separate query for series. Add after the searchQuery:

```typescript
  const seriesQuery = trpc.books.list.useQuery(
    { series: series, limit: 100 },
    { enabled: !!series },
  );
```

Update the books variable to use series results when filtering by series:
```typescript
  const books = series
    ? seriesQuery.data?.books ?? []
    : searchQuery.data?.books ?? [];
```

Update the empty state check (line 63):
```typescript
  if (!q && !selectedGenreSlug && !series) {
```

Update the loading check to include series:
```typescript
  const isLoading = series ? seriesQuery.isLoading : searchQuery.isLoading;
```

Update the results count header to show series name when filtering by series:
```typescript
        <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
          {isLoading
            ? t("search.searching")
            : series
              ? t("search.seriesResults", { count: seriesQuery.data?.total ?? 0, series })
              : q
                ? t("search.resultsFor", { count: searchQuery.data?.total ?? 0, query: q })
                : t("search.resultsCount", { count: searchQuery.data?.total ?? 0 })}
        </p>
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/build-filter.ts packages/web/src/components/shelves/filter-builder.tsx packages/web/src/routes/_app/search.tsx
git commit -m "feat: add series to smart shelf filters and search route"
```

---

### Task 6: Edit UI — Series Combobox

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id_.edit.tsx`

- [ ] **Step 1: Remove series from FIELDS array**

In `packages/web/src/routes/_app/books/$id_.edit.tsx`, remove the series entry from `FIELDS` (line 20). Keep seriesIndex. The updated array:

```typescript
const FIELDS: { key: string; labelKey: string; type: "text" | "number" | "textarea"; half?: boolean; group: string }[] = [
  { key: "title", labelKey: "edit.field.title", type: "text", group: "basic" },
  // author is handled separately as a multi-pick component
  { key: "description", labelKey: "edit.field.description", type: "textarea", group: "basic" },
  // genre is handled separately as a multi-pick component
  // language is handled separately as a combobox component
  // series is handled separately as a combobox component
  { key: "seriesIndex", labelKey: "edit.field.seriesIndex", type: "number", half: true, group: "classification" },
  // publisher is handled separately as a combobox component
  { key: "year", labelKey: "edit.field.year", type: "number", half: true, group: "publication" },
  { key: "isbn", labelKey: "edit.field.isbn", type: "text", half: true, group: "publication" },
  { key: "pageCount", labelKey: "edit.field.pages", type: "number", group: "publication" },
];
```

- [ ] **Step 2: Add series state and query**

In the `BookEditPage` function, after the publisher state declarations, add:

```typescript
  // Series combobox state
  const [seriesValue, setSeriesValue] = useState("");
  const [initialSeries, setInitialSeries] = useState("");
  const seriesQuery = trpc.series.list.useQuery({});
```

In the initialization `useEffect`, after publisher initialization, add:

```typescript
    // Handle series separately
    const serStr = metadataApply?.fields?.series ?? bookQuery.data.series ?? "";
    setSeriesValue(serStr);
    setInitialSeries(serStr);
```

In the `isDirty` check, add:
```typescript
    if (seriesValue !== initialSeries) return true;
```

In `handleSave`, add:
```typescript
    // Include series
    if (seriesValue !== (bookQuery.data.series ?? "")) {
      fields.series = seriesValue.trim() || null;
    }
```

- [ ] **Step 3: Add SeriesCombobox component**

Add a `SeriesCombobox` component (same pattern as `PublisherCombobox`):

```typescript
function SeriesCombobox({ value, onChange, suggestions, t }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: { id: string; name: string; bookCount: number }[];
  t: (key: string) => string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? suggestions.filter(
        (s) => s.name.toLowerCase().includes(value.toLowerCase()) && s.name !== value
      )
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="flex-1">
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
        {t("edit.field.series")}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      {showSuggestions && filtered.length > 0 && (
        <div
          className="mt-1 rounded-lg border shadow-lg overflow-hidden max-h-40 overflow-y-auto"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          {filtered.slice(0, 8).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s.name); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors"
              style={{ color: "var(--text)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {s.name}
              <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
                ({s.bookCount})
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render series combobox in the classification group**

In the JSX, in the classification group, render the series combobox + seriesIndex side by side. The seriesIndex is still in FIELDS and renders via `renderFieldRows`, but we need to add the series combobox before it. Add before the `LanguageCombobox`:

```tsx
                  {group.id === "classification" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <SeriesCombobox
                          value={seriesValue}
                          onChange={setSeriesValue}
                          suggestions={seriesQuery.data ?? []}
                          t={t}
                        />
                      </div>
                      <LanguageCombobox
                        value={languageValue}
                        onChange={setLanguageValue}
                        t={t}
                      />
                      <GenreMultiPick
                        selectedGenres={selectedGenres}
                        onChange={setSelectedGenres}
                        t={t}
                      />
                    </>
                  )}
```

Note: The `seriesIndex` field remains in `FIELDS` with `half: true` and will render via `renderFieldRows` in the classification group. The series combobox takes the first half of a grid row, and seriesIndex (from FIELDS) renders alongside it since they're in the same group.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/_app/books/$id_.edit.tsx
git commit -m "feat: add series combobox to edit page"
```

---

### Task 7: Book Detail Page — Clickable Series Link

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

- [ ] **Step 1: Make series name a clickable link**

In `packages/web/src/routes/_app/books/$id.tsx`, find the series display block (lines 183-190). Currently:

```tsx
                {book.series && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {t("book.seriesInfo", { index: book.seriesIndex || "?", series: book.series })}
                  </p>
                )}
```

Replace with a version where the series name is a clickable `<Link>`:

```tsx
                {book.series && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {t("book.seriesInfoPrefix", { index: book.seriesIndex || "?" })}{" "}
                    <Link
                      to="/search"
                      search={{ q: "", series: book.series }}
                      className="hover:opacity-80 transition-opacity underline"
                      style={{ color: "var(--warm)" }}
                    >
                      {book.series}
                    </Link>
                  </p>
                )}
```

This requires splitting the i18n key. We need a new key `book.seriesInfoPrefix` that renders just "Book N of" without the series name (since the series name is now a separate link element).

- [ ] **Step 2: Add i18n keys for split series info**

Add `book.seriesInfoPrefix` to all 7 locale files:

**en.json:** `"book.seriesInfoPrefix": "Book {{index}} of"`
**de.json:** `"book.seriesInfoPrefix": "Band {{index}} von"`
**es.json:** `"book.seriesInfoPrefix": "Libro {{index}} de"`
**fr.json:** `"book.seriesInfoPrefix": "Tome {{index}} de"`
**it.json:** `"book.seriesInfoPrefix": "Libro {{index}} di"`
**nl.json:** `"book.seriesInfoPrefix": "Boek {{index}} van"`
**pt.json:** `"book.seriesInfoPrefix": "Livro {{index}} de"`

Also add `search.seriesResults` key for the search page header:

**en.json:** `"search.seriesResults": "{{count}} books in {{series}}"`
**de.json:** `"search.seriesResults": "{{count}} Bücher in {{series}}"`
**es.json:** `"search.seriesResults": "{{count}} libros en {{series}}"`
**fr.json:** `"search.seriesResults": "{{count}} livres dans {{series}}"`
**it.json:** `"search.seriesResults": "{{count}} libri in {{series}}"`
**nl.json:** `"search.seriesResults": "{{count}} boeken in {{series}}"`
**pt.json:** `"search.seriesResults": "{{count}} livros em {{series}}"`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/_app/books/$id.tsx packages/web/src/locales/*.json
git commit -m "feat: make series name clickable on book detail page"
```

---

### Task 8: Database Migration

**Files:**
- Create: `packages/server/src/services/migrate-series.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create migration service**

Create `packages/server/src/services/migrate-series.ts`:

```typescript
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
```

- [ ] **Step 2: Wire into app startup**

In `packages/server/src/app.ts`, add import:
```typescript
import { migrateSeriesData } from "./services/migrate-series.js";
```

Add the call after `migratePublishersAndLanguages(db)`:
```typescript
  await migrateSeriesData(db);
```

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/michaelkusche/dev/verso/packages/shared && pnpm build && cd ../server && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/migrate-series.ts packages/server/src/app.ts
git commit -m "feat: add series data migration at startup"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: Clean build

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Browser test**

Run: `pnpm dev`

Test in browser:
1. Open a book's edit page — verify series shows as a combobox with existing series suggestions
2. Change a book's series to an existing series — verify dedup works
3. Check book detail page — verify series name is a clickable link
4. Click the series link — verify it navigates to search view showing all books in that series, sorted by series index
5. Create a smart shelf with a series filter — verify it works

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during browser testing"
```
