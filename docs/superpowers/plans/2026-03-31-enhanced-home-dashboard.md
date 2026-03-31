# Enhanced Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new sections to the home page — Almost Finished, Reading Stats Card, and Recommended For You — making the dashboard feel personalized and motivating.

**Architecture:** Two new tRPC endpoints (`books.almostFinished`, `books.recommended`) plus reuse of existing `stats.overview`. Three new frontend components, each self-contained and conditionally rendered. TDD for backend endpoints.

**Tech Stack:** Drizzle ORM (SQLite), tRPC, React, Tailwind CSS, Vitest, react-i18next

---

### Task 1: Add `books.almostFinished` endpoint — tests

**Files:**
- Modify: `packages/server/src/__tests__/books.test.ts`

- [ ] **Step 1: Write failing tests for `almostFinished` endpoint**

Add a new describe block at the end of the existing `books.test.ts` file:

```typescript
describe("almostFinished", () => {
  it("returns empty array when no progress exists", async () => {
    await insertBook();
    const result = await authedCaller.books.almostFinished();
    expect(result).toHaveLength(0);
  });

  it("returns books with 75%+ progress that are not finished", async () => {
    const book1 = await insertBook({ title: "Almost Done" });
    const book2 = await insertBook({ title: "Just Started" });
    const book3 = await insertBook({ title: "Finished Book" });

    await ctx.db.insert(readingProgress).values([
      {
        userId,
        bookId: book1.id,
        percentage: 82,
        currentPage: 246,
        totalPages: 300,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId,
        bookId: book2.id,
        percentage: 20,
        currentPage: 60,
        totalPages: 300,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId,
        bookId: book3.id,
        percentage: 100,
        currentPage: 300,
        totalPages: 300,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ]);

    const result = await authedCaller.books.almostFinished();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Almost Done");
    expect(result[0].percentage).toBe(82);
    expect(result[0].currentPage).toBe(246);
    expect(result[0].totalPages).toBe(300);
  });

  it("orders by percentage descending", async () => {
    const book1 = await insertBook({ title: "78 percent" });
    const book2 = await insertBook({ title: "95 percent" });

    await ctx.db.insert(readingProgress).values([
      {
        userId,
        bookId: book1.id,
        percentage: 78,
        currentPage: 234,
        totalPages: 300,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId,
        bookId: book2.id,
        percentage: 95,
        currentPage: 285,
        totalPages: 300,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ]);

    const result = await authedCaller.books.almostFinished();
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("95 percent");
    expect(result[1].title).toBe("78 percent");
  });
});
```

Note: `readingProgress` must be imported at the top of the test file. Add it to the existing import:
```typescript
import { books, readingProgress } from "@verso/shared";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/books.test.ts --reporter verbose`
Expected: FAIL — `authedCaller.books.almostFinished is not a function`

---

### Task 2: Add `books.almostFinished` endpoint — implementation

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts`

- [ ] **Step 1: Add the `almostFinished` endpoint**

Add after the `currentlyReading` endpoint (after line 171 in `books.ts`):

```typescript
almostFinished: protectedProcedure.query(async ({ ctx }) => {
  const rows = await ctx.db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverPath: books.coverPath,
      fileFormat: books.fileFormat,
      pageCount: books.pageCount,
      percentage: readingProgress.percentage,
      currentPage: readingProgress.currentPage,
      totalPages: readingProgress.totalPages,
      lastReadAt: readingProgress.lastReadAt,
    })
    .from(readingProgress)
    .innerJoin(books, eq(books.id, readingProgress.bookId))
    .where(
      and(
        eq(readingProgress.userId, ctx.user.sub),
        sql`${readingProgress.percentage} >= 75`,
        isNotNull(readingProgress.startedAt),
        isNull(readingProgress.finishedAt),
      )
    )
    .orderBy(desc(readingProgress.percentage))
    .limit(10);
  return rows;
}),
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/books.test.ts --reporter verbose`
Expected: All `almostFinished` tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/trpc/routers/books.ts packages/server/src/__tests__/books.test.ts
git commit -m "feat: add books.almostFinished endpoint with tests"
```

---

### Task 3: Add `books.recommended` endpoint — tests

**Files:**
- Modify: `packages/server/src/__tests__/books.test.ts`

- [ ] **Step 1: Write failing tests for `recommended` endpoint**

Add a new describe block after the `almostFinished` block:

```typescript
describe("recommended", () => {
  it("returns empty array when no reading history exists", async () => {
    await insertBook({ genre: "Sci-Fi" });
    const result = await authedCaller.books.recommended({});
    expect(result).toHaveLength(0);
  });

  it("recommends unread books by same author as currently reading", async () => {
    const reading = await insertBook({ title: "Dune", author: "Frank Herbert", genre: "Sci-Fi" });
    const unread = await insertBook({ title: "Children of Dune", author: "Frank Herbert", genre: "Sci-Fi" });
    // A book by a different author — should not appear
    await insertBook({ title: "1984", author: "George Orwell", genre: "Dystopian" });

    // Mark one as currently reading
    await ctx.db.insert(readingProgress).values({
      userId,
      bookId: reading.id,
      percentage: 40,
      startedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });

    const result = await authedCaller.books.recommended({});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Children of Dune");
    expect(result[0].reason).toContain("Frank Herbert");
  });

  it("recommends unread books by same genre as finished books", async () => {
    const finished = await insertBook({ title: "Dune", author: "Frank Herbert", genre: "Sci-Fi" });
    const unread = await insertBook({ title: "Snow Crash", author: "Neal Stephenson", genre: "Sci-Fi" });
    // Different genre — should not appear
    await insertBook({ title: "Pride and Prejudice", author: "Jane Austen", genre: "Romance" });

    await ctx.db.insert(readingProgress).values({
      userId,
      bookId: finished.id,
      percentage: 100,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });

    const result = await authedCaller.books.recommended({});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Snow Crash");
    expect(result[0].reason).toContain("Sci-Fi");
  });

  it("excludes books the user has already started", async () => {
    const reading = await insertBook({ title: "Dune", author: "Frank Herbert", genre: "Sci-Fi" });
    const alsoStarted = await insertBook({ title: "Children of Dune", author: "Frank Herbert", genre: "Sci-Fi" });

    await ctx.db.insert(readingProgress).values([
      {
        userId,
        bookId: reading.id,
        percentage: 40,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      },
      {
        userId,
        bookId: alsoStarted.id,
        percentage: 10,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      },
    ]);

    const result = await authedCaller.books.recommended({});
    expect(result).toHaveLength(0);
  });

  it("prioritises same-author over same-genre", async () => {
    const reading = await insertBook({ title: "Dune", author: "Frank Herbert", genre: "Sci-Fi" });
    const sameAuthor = await insertBook({ title: "Children of Dune", author: "Frank Herbert", genre: "Sci-Fi" });
    const sameGenre = await insertBook({ title: "Snow Crash", author: "Neal Stephenson", genre: "Sci-Fi" });

    await ctx.db.insert(readingProgress).values({
      userId,
      bookId: reading.id,
      percentage: 40,
      startedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });

    const result = await authedCaller.books.recommended({ limit: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
    // Same-author should come first
    expect(result[0].title).toBe("Children of Dune");
  });

  it("respects the limit parameter", async () => {
    const reading = await insertBook({ title: "Dune", author: "Frank Herbert", genre: "Sci-Fi" });

    for (let i = 0; i < 5; i++) {
      await insertBook({ title: `Sci-Fi Book ${i}`, author: `Author ${i}`, genre: "Sci-Fi" });
    }

    await ctx.db.insert(readingProgress).values({
      userId,
      bookId: reading.id,
      percentage: 40,
      startedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });

    const result = await authedCaller.books.recommended({ limit: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/books.test.ts --reporter verbose`
Expected: FAIL — `authedCaller.books.recommended is not a function`

---

### Task 4: Add `books.recommended` endpoint — implementation

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts`

- [ ] **Step 1: Add the recommended input schema**

At the top of the file, add a `z` import and define the input schema. Add to the existing import from `@verso/shared`:

```typescript
import { z } from "zod";
```

- [ ] **Step 2: Add the `recommended` endpoint**

Add after the `almostFinished` endpoint:

```typescript
recommended: protectedProcedure
  .input(z.object({ limit: z.number().min(1).max(20).default(8) }).default({}))
  .query(async ({ ctx, input }) => {
    // 1. Get genres and authors from books the user has read or is reading
    const activeBooks = await ctx.db
      .select({
        author: books.author,
        genre: books.genre,
      })
      .from(readingProgress)
      .innerJoin(books, eq(books.id, readingProgress.bookId))
      .where(
        and(
          eq(readingProgress.userId, ctx.user.sub),
          isNotNull(readingProgress.startedAt),
        )
      );

    if (activeBooks.length === 0) return [];

    const authors = [...new Set(activeBooks.map((b) => b.author).filter(Boolean))];
    const genres = [...new Set(activeBooks.map((b) => b.genre).filter(Boolean))];

    if (authors.length === 0 && genres.length === 0) return [];

    // 2. Get IDs of books the user has already started (to exclude)
    const startedRows = await ctx.db
      .select({ bookId: readingProgress.bookId })
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.userId, ctx.user.sub),
          isNotNull(readingProgress.startedAt),
        )
      );
    const startedIds = new Set(startedRows.map((r) => r.bookId));

    // 3. Find candidate books matching author or genre
    const authorConditions = authors.map((a) => eq(books.author, a!));
    const genreConditions = genres.map((g) => eq(books.genre, g!));
    const allConditions = [...authorConditions, ...genreConditions];

    const candidates = await ctx.db
      .select()
      .from(books)
      .where(sql`(${sql.join(allConditions, sql` OR `)})`)
      .limit(50);

    // 4. Filter out started books, score and attach reason
    const authorsSet = new Set(authors);
    const genresSet = new Set(genres);

    const scored = candidates
      .filter((b) => !startedIds.has(b.id))
      .map((b) => {
        const isAuthorMatch = b.author && authorsSet.has(b.author);
        const isGenreMatch = b.genre && genresSet.has(b.genre);
        const priority = isAuthorMatch ? 1 : 2;
        const reason = isAuthorMatch
          ? `More by ${b.author}`
          : `${b.genre} in your library`;
        return { ...b, reason, priority };
      });

    // 5. Shuffle within each priority tier
    const tier1 = scored.filter((b) => b.priority === 1).sort(() => Math.random() - 0.5);
    const tier2 = scored.filter((b) => b.priority === 2).sort(() => Math.random() - 0.5);
    let combined = [...tier1, ...tier2];

    // 6. Backfill with random unread books if fewer than 3 matches
    if (combined.length < 3) {
      const usedIds = new Set([...startedIds, ...combined.map((b) => b.id)]);
      const fillers = await ctx.db
        .select()
        .from(books)
        .limit(input.limit - combined.length + 10);
      const available = fillers
        .filter((b) => !usedIds.has(b.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, input.limit - combined.length)
        .map((b) => ({ ...b, reason: "", priority: 3 as const }));
      combined = [...combined, ...available];
    }

    // 7. Limit and strip internal fields
    const result = combined.slice(0, input.limit);
    return result.map(({ priority, ...rest }) => rest);
  }),
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/books.test.ts --reporter verbose`
Expected: All `recommended` tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/books.ts packages/server/src/__tests__/books.test.ts
git commit -m "feat: add books.recommended endpoint with tests"
```

---

### Task 5: Add i18n keys

**Files:**
- Modify: `packages/web/src/locales/en.json`

- [ ] **Step 1: Add new translation keys**

Add these keys after the existing `home.yourShelves` entry:

```json
"home.almostFinished": "Almost Finished",
"home.almostFinishedHint": "Finish these up!",
"home.pagesLeft": "~{{count}} pages left",
"home.readingStats": "Your Reading",
"home.streak": "Day Streak",
"home.finishedThisMonth": "Finished This Month",
"home.timeReadThisMonth": "Read This Month",
"home.booksInLibrary": "Books in Library",
"home.recommendedForYou": "Recommended For You",
"home.recommendedSubtitle": "Based on your reading"
```

- [ ] **Step 2: Check if other locale files exist and add the same keys**

Run: `ls packages/web/src/locales/`

If there are other locale files (e.g. `de.json`), add the same keys with the English values as placeholders.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/locales/
git commit -m "feat: add i18n keys for enhanced home dashboard"
```

---

### Task 6: Create `AlmostFinishedRow` component

**Files:**
- Create: `packages/web/src/components/books/almost-finished-row.tsx`

- [ ] **Step 1: Create the component**

This follows the same pattern as `ContinueReadingRow` but with green progress bar and pages-left text:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BookCover } from "./book-cover";
import { trpc } from "@/trpc";

export function AlmostFinishedRow() {
  const { t } = useTranslation();
  const query = trpc.books.almostFinished.useQuery();

  if (!query.data?.length) return null;

  return (
    <div className="mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <h2
          className="font-display text-sm md:text-base font-bold"
          style={{ color: "var(--text)" }}
        >
          {t("home.almostFinished")}
        </h2>
        <span className="text-[11px] md:text-xs" style={{ color: "var(--warm)" }}>
          {t("home.almostFinishedHint")}
        </span>
      </div>
      {/* Mobile */}
      <div className="flex md:hidden gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((item) => (
          <Link
            key={item.id}
            to="/books/$id/read"
            params={{ id: item.id }}
            search={{ cfi: undefined }}
            className="shrink-0 flex gap-3 rounded-xl p-3 transition-transform hover:translate-y-[-2px]"
            style={{ backgroundColor: "var(--card)", width: 200 }}
          >
            <BookCover
              bookId={item.id}
              title={item.title}
              author={item.author ?? undefined}
              coverPath={item.coverPath}
              size="sm"
            />
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p
                className="font-display text-[11px] font-semibold leading-tight line-clamp-1"
                style={{ color: "var(--text)" }}
              >
                {item.title}
              </p>
              <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: "var(--text-dim)" }}>
                {item.author}
              </p>
              <div className="mt-2">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-bg)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.percentage}%`, backgroundColor: "#7ab87a" }}
                  />
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                  {item.totalPages && item.currentPage
                    ? t("home.pagesLeft", { count: item.totalPages - item.currentPage })
                    : `${Math.round(item.percentage)}%`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden md:flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((item) => (
          <Link
            key={item.id}
            to="/books/$id/read"
            params={{ id: item.id }}
            search={{ cfi: undefined }}
            className="shrink-0 flex gap-3 rounded-xl p-3 transition-transform hover:translate-y-[-2px]"
            style={{ backgroundColor: "var(--card)", width: 260 }}
          >
            <BookCover
              bookId={item.id}
              title={item.title}
              author={item.author ?? undefined}
              coverPath={item.coverPath}
              size="sm"
            />
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p
                className="font-display text-xs font-semibold leading-tight line-clamp-1"
                style={{ color: "var(--text)" }}
              >
                {item.title}
              </p>
              <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--text-dim)" }}>
                {item.author}
              </p>
              <div className="mt-2">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-bg)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.percentage}%`, backgroundColor: "#7ab87a" }}
                  />
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                  {item.totalPages && item.currentPage
                    ? t("home.pagesLeft", { count: item.totalPages - item.currentPage })
                    : `${Math.round(item.percentage)}%`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/books/almost-finished-row.tsx
git commit -m "feat: add AlmostFinishedRow component"
```

---

### Task 7: Create `ReadingStatsCard` component

**Files:**
- Create: `packages/web/src/components/books/reading-stats-card.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ReadingStatsCard() {
  const { t } = useTranslation();
  const statsQuery = trpc.stats.overview.useQuery({ range: "month" });
  const booksQuery = trpc.books.list.useQuery({ sort: "recent", limit: 1 });

  const stats = statsQuery.data;
  const totalBooks = booksQuery.data?.total ?? 0;

  if (!stats) return null;

  // Hide the card if there's no reading activity
  const hasActivity = stats.currentStreak > 0 || stats.booksFinished > 0 || stats.timeReadMinutes > 0;
  if (!hasActivity) return null;

  const items: { value: string; label: string }[] = [];

  if (stats.currentStreak > 0) {
    items.push({ value: String(stats.currentStreak), label: t("home.streak") });
  }
  if (stats.booksFinished > 0) {
    items.push({ value: String(stats.booksFinished), label: t("home.finishedThisMonth") });
  }
  if (stats.timeReadMinutes > 0) {
    items.push({ value: formatTime(stats.timeReadMinutes), label: t("home.timeReadThisMonth") });
  }
  // Always show library count when card is visible
  items.push({ value: String(totalBooks), label: t("home.booksInLibrary") });

  return (
    <div className="mb-6 md:mb-8">
      <div className="rounded-xl p-4 md:p-5" style={{ backgroundColor: "var(--card)" }}>
        <div className="flex justify-around items-center text-center">
          {items.map((item, i) => (
            <div key={item.label} className="flex items-center">
              {i > 0 && (
                <div
                  className="w-px h-8 mx-3 md:mx-5 shrink-0"
                  style={{ backgroundColor: "var(--border)" }}
                />
              )}
              <div>
                <div
                  className="text-xl md:text-2xl font-bold"
                  style={{ color: "var(--warm)" }}
                >
                  {item.value}
                </div>
                <div
                  className="text-[10px] md:text-[11px] mt-0.5"
                  style={{ color: "var(--text-dim)" }}
                >
                  {item.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/books/reading-stats-card.tsx
git commit -m "feat: add ReadingStatsCard component"
```

---

### Task 8: Create `RecommendedRow` component

**Files:**
- Create: `packages/web/src/components/books/recommended-row.tsx`

- [ ] **Step 1: Create the component**

Follows the same horizontal scroll pattern as the "Recently Added" section in `home.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BookCover } from "./book-cover";
import { trpc } from "@/trpc";

export function RecommendedRow() {
  const { t } = useTranslation();
  const query = trpc.books.recommended.useQuery({});

  if (!query.data?.length) return null;

  return (
    <div className="mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <h2
          className="font-display text-sm md:text-base font-bold"
          style={{ color: "var(--text)" }}
        >
          {t("home.recommendedForYou")}
        </h2>
        <span className="text-[11px] md:text-xs" style={{ color: "var(--text-dim)" }}>
          {t("home.recommendedSubtitle")}
        </span>
      </div>
      {/* Mobile */}
      <div className="flex md:hidden gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((book) => (
          <Link
            key={book.id}
            to="/books/$id"
            params={{ id: book.id }}
            className="shrink-0 group transition-transform duration-200 hover:-translate-y-1"
            style={{ width: 90 }}
          >
            <BookCover
              bookId={book.id}
              title={book.title}
              author={book.author ?? undefined}
              coverPath={book.coverPath}
              size="md"
            />
            <div className="mt-1.5 min-w-0">
              <p
                className="text-[11px] font-medium leading-tight line-clamp-2"
                style={{ color: "var(--text)" }}
              >
                {book.title}
              </p>
              <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: "var(--text-dim)" }}>
                {book.author}
              </p>
              <p className="text-[9px] mt-0.5 italic line-clamp-1" style={{ color: "var(--text-faint)" }}>
                {book.reason}
              </p>
            </div>
          </Link>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden md:flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((book) => (
          <Link
            key={book.id}
            to="/books/$id"
            params={{ id: book.id }}
            className="shrink-0 group transition-transform duration-200 hover:-translate-y-1"
            style={{ width: 120 }}
          >
            <BookCover
              bookId={book.id}
              title={book.title}
              author={book.author ?? undefined}
              coverPath={book.coverPath}
              size="lg"
            />
            <div className="mt-2 min-w-0">
              <p
                className="font-display text-xs font-semibold leading-tight line-clamp-2"
                style={{ color: "var(--text)" }}
              >
                {book.title}
              </p>
              <p
                className="font-display italic text-[11px] mt-0.5 line-clamp-1"
                style={{ color: "var(--text-dim)" }}
              >
                {book.author}
              </p>
              <p
                className="text-[10px] mt-0.5 italic line-clamp-1"
                style={{ color: "var(--text-faint)" }}
              >
                {book.reason}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/books/recommended-row.tsx
git commit -m "feat: add RecommendedRow component"
```

---

### Task 9: Wire up home page with new sections

**Files:**
- Modify: `packages/web/src/routes/_app/home.tsx`

- [ ] **Step 1: Add imports for the new components**

Add these imports at the top of `home.tsx`:

```typescript
import { AlmostFinishedRow } from "@/components/books/almost-finished-row";
import { ReadingStatsCard } from "@/components/books/reading-stats-card";
import { RecommendedRow } from "@/components/books/recommended-row";
```

- [ ] **Step 2: Add the new sections in the correct order**

Replace the return JSX in `HomePage` to insert the new sections. The full section order:

```tsx
return (
  <div>
    {/* Header — responsive */}
    <div className="mb-4 md:mb-6">
      <h1
        className="font-display text-xl md:text-[26px] font-bold"
        style={{ color: "var(--text)" }}
      >
        {t("home.welcome", { name: user?.displayName ?? "" })}
      </h1>
      <p
        className="hidden md:block text-sm mt-0.5"
        style={{ color: "var(--text-dim)" }}
      >
        {t("home.dashboard")}
      </p>
    </div>

    {/* Continue Reading */}
    <ContinueReadingRow />

    {/* Almost Finished (NEW) */}
    <AlmostFinishedRow />

    {/* Reading Stats (NEW) */}
    <ReadingStatsCard />

    {/* Recommended For You (NEW) */}
    <RecommendedRow />

    {/* Recently Added — responsive cover sizes */}
    {recentBooks.length > 0 && (
      <div className="mb-6 md:mb-8">
        {/* ... existing Recently Added section unchanged ... */}
      </div>
    )}

    {/* Shelves — compact on mobile, cards on desktop */}
    {allShelves.length > 0 && (
      <div className="mb-6 md:mb-8">
        {/* ... existing Shelves section unchanged ... */}
      </div>
    )}
  </div>
);
```

Keep the existing Recently Added and Shelves sections exactly as they are — only insert the three new components between `<ContinueReadingRow />` and the Recently Added section.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/_app/home.tsx
git commit -m "feat: wire up enhanced home dashboard sections"
```

---

### Task 10: Build check and browser test

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript type check**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run server tests**

Run: `cd packages/server && npx vitest run --reporter verbose`
Expected: All tests pass.

- [ ] **Step 3: Build the web package**

Run: `cd packages/web && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Browser test**

Start the dev server and verify in the browser:
1. Home page loads without errors
2. Almost Finished section only appears if there are books at 75%+
3. Stats card only appears if there is reading activity
4. Recommended section only appears if there are matching unread books
5. All sections are responsive (check mobile and desktop)

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during browser testing"
```
