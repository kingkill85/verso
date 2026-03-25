# Session 2: "Read a Book" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen EPUB reader with settings, TOC navigation, progress sync, and resume-from-position — so users can read books and pick up where they left off.

**Architecture:** Thin ref wrapper approach — a `useEpubReader` hook owns the epub.js `Book` and `Rendition` objects via `useRef`, exposing imperative methods and reactive state as props to flat child components. A separate `useProgressSync` hook debounces CFI/percentage to the server. Reader settings are stored in localStorage (device-specific), reading progress syncs via tRPC (cross-device).

**Tech Stack:** epub.js (EPUB rendering), tRPC + Drizzle (progress API), React + TanStack Router (reader UI), Tailwind CSS (styling)

**Design Spec:** `docs/superpowers/specs/2026-03-25-session2-read-a-book-design.md`

---

## File Map

### New Files — Server
| File | Responsibility |
|------|---------------|
| `packages/server/src/trpc/routers/progress.ts` | Progress router: `get` and `sync` procedures |
| `packages/server/src/__tests__/progress.test.ts` | Tests for progress router |

### New Files — Shared
| File | Responsibility |
|------|---------------|
| (validators.ts — append) | `progressGetInput`, `progressSyncInput` Zod schemas |
| (schema.ts — append) | `readingProgress` table definition |
| (types.ts — append) | `ReadingProgress` type export |

### New Files — Web
| File | Responsibility |
|------|---------------|
| `packages/web/src/hooks/use-epub-reader.ts` | epub.js integration hook — owns Book/Rendition, exposes methods + state |
| `packages/web/src/hooks/use-progress-sync.ts` | Debounced progress sync to server |
| `packages/web/src/routes/_app/books/$id.read.tsx` | Reader page route (full-screen) |
| `packages/web/src/components/reader/reader-top-bar.tsx` | Top controls: title, close, TOC, settings buttons |
| `packages/web/src/components/reader/reader-bottom-bar.tsx` | Bottom: progress bar + percentage |
| `packages/web/src/components/reader/tap-zones.tsx` | Invisible left/center/right navigation zones |
| `packages/web/src/components/reader/toc-panel.tsx` | Slide-in TOC panel |
| `packages/web/src/components/reader/settings-panel.tsx` | Slide-in settings panel |
| `packages/web/src/components/books/continue-reading-row.tsx` | Horizontal reading row for library page |

### Modified Files
| File | Change |
|------|--------|
| `packages/shared/src/schema.ts` | Add `readingProgress` table |
| `packages/shared/src/validators.ts` | Add progress input schemas |
| `packages/shared/src/types.ts` | Add `ReadingProgress` type |
| `packages/shared/src/index.ts` | Already re-exports all (no change needed) |
| `packages/server/src/trpc/router.ts` | Register `progressRouter` |
| `packages/server/src/trpc/routers/books.ts` | Add `currentlyReading` query |
| `packages/web/package.json` | Add `epubjs` dependency |
| `packages/web/src/routes/_app/books/$id.tsx` | Add reading CTA button + progress card |
| `packages/web/src/routes/_app/index.tsx` | Add Continue Reading row |

---

## Task 1: Add `readingProgress` table to schema

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add readingProgress table to schema.ts**

Append after the `sessions` table definition (after line 67):

```typescript
export const readingProgress = sqliteTable("reading_progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  currentPage: integer("current_page"),
  totalPages: integer("total_pages"),
  percentage: real("percentage").notNull().default(0),
  cfiPosition: text("cfi_position"),
  startedAt: text("started_at"),
  lastReadAt: text("last_read_at"),
  finishedAt: text("finished_at"),
  timeSpentMinutes: integer("time_spent_minutes").default(0),
});
```

- [ ] **Step 2: Add ReadingProgress type to types.ts**

Append to imports and type exports:

```typescript
// Add to import line:
import type { users, books, sessions, readingProgress } from "./schema.js";

// Add after Session types:
export type ReadingProgress = InferSelectModel<typeof readingProgress>;
export type NewReadingProgress = InferInsertModel<typeof readingProgress>;
```

- [ ] **Step 3: Generate migration**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter server drizzle-kit generate`

Verify: a new migration file appears in `packages/server/drizzle/`

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schema.ts packages/shared/src/types.ts packages/server/drizzle/
git commit -m "feat: add readingProgress table to schema"
```

---

## Task 2: Add progress validation schemas

**Files:**
- Modify: `packages/shared/src/validators.ts`

- [ ] **Step 1: Add progress input validators**

Append after the `changePasswordInput` (after line 63):

```typescript
// Progress
export const progressGetInput = z.object({
  bookId: z.string().uuid(),
});

export const progressSyncInput = z.object({
  bookId: z.string().uuid(),
  percentage: z.number().min(0).max(100),
  cfiPosition: z.string().optional(),
  currentPage: z.number().int().min(0).optional(),
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/validators.ts
git commit -m "feat: add progress input validators"
```

---

## Task 3: Implement progress router with tests (TDD)

**Files:**
- Create: `packages/server/src/__tests__/progress.test.ts`
- Create: `packages/server/src/trpc/routers/progress.ts`
- Modify: `packages/server/src/trpc/router.ts`

- [ ] **Step 1: Write failing tests for progress.get and progress.sync**

Create `packages/server/src/__tests__/progress.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, readingProgress } from "@verso/shared";

describe("progress router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;
  let bookId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    // Insert a book to read
    bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${bookId}.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe("get", () => {
    it("returns null when no progress exists", async () => {
      const result = await authedCaller.progress.get({ bookId });
      expect(result).toBeNull();
    });

    it("returns progress after sync", async () => {
      await authedCaller.progress.sync({
        bookId,
        percentage: 25,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
      });
      const result = await authedCaller.progress.get({ bookId });
      expect(result).not.toBeNull();
      expect(result!.percentage).toBe(25);
      expect(result!.cfiPosition).toBe("epubcfi(/6/4!/4/2/1:0)");
    });
  });

  describe("sync", () => {
    it("creates progress on first sync and sets startedAt", async () => {
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 10,
      });
      expect(result.percentage).toBe(10);
      expect(result.startedAt).not.toBeNull();
      expect(result.finishedAt).toBeNull();
      expect(result.lastReadAt).not.toBeNull();
    });

    it("updates existing progress on subsequent sync", async () => {
      await authedCaller.progress.sync({ bookId, percentage: 10 });
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 50,
        cfiPosition: "epubcfi(/6/10!/4/2/1:0)",
      });
      expect(result.percentage).toBe(50);
      expect(result.cfiPosition).toBe("epubcfi(/6/10!/4/2/1:0)");
    });

    it("auto-finishes at 98% or above", async () => {
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 99,
      });
      expect(result.finishedAt).not.toBeNull();
    });

    it("does not auto-finish below 98%", async () => {
      const result = await authedCaller.progress.sync({
        bookId,
        percentage: 97,
      });
      expect(result.finishedAt).toBeNull();
    });

    it("preserves startedAt on subsequent syncs", async () => {
      const first = await authedCaller.progress.sync({ bookId, percentage: 5 });
      const second = await authedCaller.progress.sync({ bookId, percentage: 20 });
      expect(second.startedAt).toBe(first.startedAt);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter server test -- --run src/__tests__/progress.test.ts`

Expected: FAIL — `progress` property does not exist on the router.

- [ ] **Step 3: Implement progress router**

Create `packages/server/src/trpc/routers/progress.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { readingProgress, progressGetInput, progressSyncInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

export const progressRouter = router({
  get: protectedProcedure.input(progressGetInput).query(async ({ ctx, input }) => {
    const progress = await ctx.db.query.readingProgress.findFirst({
      where: and(
        eq(readingProgress.bookId, input.bookId),
        eq(readingProgress.userId, ctx.user.sub),
      ),
    });
    return progress ?? null;
  }),

  sync: protectedProcedure.input(progressSyncInput).mutation(async ({ ctx, input }) => {
    const now = new Date().toISOString();
    const existing = await ctx.db.query.readingProgress.findFirst({
      where: and(
        eq(readingProgress.bookId, input.bookId),
        eq(readingProgress.userId, ctx.user.sub),
      ),
    });

    const finishedAt = input.percentage >= 98 ? now : null;

    if (existing) {
      const [updated] = await ctx.db
        .update(readingProgress)
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          currentPage: input.currentPage ?? existing.currentPage,
          lastReadAt: now,
          finishedAt: existing.finishedAt ?? finishedAt,
        })
        .where(eq(readingProgress.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await ctx.db
      .insert(readingProgress)
      .values({
        userId: ctx.user.sub,
        bookId: input.bookId,
        percentage: input.percentage,
        cfiPosition: input.cfiPosition,
        currentPage: input.currentPage,
        startedAt: now,
        lastReadAt: now,
        finishedAt,
      })
      .returning();
    return created;
  }),
});
```

- [ ] **Step 4: Register progress router in appRouter**

Modify `packages/server/src/trpc/router.ts`:

```typescript
import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";
import { booksRouter } from "./routers/books.js";
import { progressRouter } from "./routers/progress.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  progress: progressRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter server test -- --run src/__tests__/progress.test.ts`

Expected: All 6 tests PASS.

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter server test -- --run`

Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/trpc/routers/progress.ts packages/server/src/trpc/router.ts packages/server/src/__tests__/progress.test.ts
git commit -m "feat: add progress router with get and sync procedures"
```

---

## Task 4: Add `currentlyReading` query to books router

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts`
- Modify: `packages/server/src/__tests__/books.test.ts`

- [ ] **Step 1: Write failing test for currentlyReading**

Append to `packages/server/src/__tests__/books.test.ts` inside the outer `describe`, after the `recentlyAdded` describe block:

```typescript
  describe("currentlyReading", () => {
    it("returns empty when no books are in progress", async () => {
      await insertBook({ title: "Idle Book" });
      const result = await authedCaller.books.currentlyReading();
      expect(result).toHaveLength(0);
    });

    it("returns books with active progress", async () => {
      const book = await insertBook({ title: "Active Book" });
      // Insert reading progress directly
      const { readingProgress } = await import("@verso/shared");
      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: book.id,
        percentage: 42,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.currentlyReading();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Active Book");
      expect(result[0].percentage).toBe(42);
    });

    it("excludes finished books", async () => {
      const book = await insertBook({ title: "Finished Book" });
      const { readingProgress } = await import("@verso/shared");
      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: book.id,
        percentage: 100,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.currentlyReading();
      expect(result).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter server test -- --run src/__tests__/books.test.ts`

Expected: FAIL — `currentlyReading` is not a function.

- [ ] **Step 3: Implement currentlyReading query**

Add to `packages/server/src/trpc/routers/books.ts`:

Add `readingProgress` to the import from `@verso/shared`:
```typescript
import { books, readingProgress, bookListInput, bookByIdInput, bookUpdateInput, bookDeleteInput } from "@verso/shared";
```

Add `isNull` and `isNotNull` to the drizzle-orm import:
```typescript
import { eq, and, desc, asc, sql, isNull, isNotNull } from "drizzle-orm";
```

Add the `currentlyReading` procedure after `recentlyAdded` in the router object:

```typescript
  currentlyReading: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverPath: books.coverPath,
        fileFormat: books.fileFormat,
        fileSize: books.fileSize,
        pageCount: books.pageCount,
        percentage: readingProgress.percentage,
        cfiPosition: readingProgress.cfiPosition,
        lastReadAt: readingProgress.lastReadAt,
        startedAt: readingProgress.startedAt,
      })
      .from(readingProgress)
      .innerJoin(books, eq(books.id, readingProgress.bookId))
      .where(
        and(
          eq(readingProgress.userId, ctx.user.sub),
          isNotNull(readingProgress.startedAt),
          isNull(readingProgress.finishedAt),
        )
      )
      .orderBy(desc(readingProgress.lastReadAt));
    return rows;
  }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter server test -- --run src/__tests__/books.test.ts`

Expected: All tests PASS including new `currentlyReading` tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/trpc/routers/books.ts packages/server/src/__tests__/books.test.ts
git commit -m "feat: add currentlyReading query to books router"
```

---

## Task 5: Install epub.js and create useEpubReader hook

**Files:**
- Modify: `packages/web/package.json` (via pnpm add)
- Create: `packages/web/src/hooks/use-epub-reader.ts`

- [ ] **Step 1: Install epub.js**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter @verso/web add epubjs && pnpm --filter @verso/web add -D @types/epubjs`

Note: If `@types/epubjs` doesn't exist as a separate package, epub.js ships its own types. Check after install — if the types install fails, skip it and use the bundled types.

- [ ] **Step 2: Create useEpubReader hook**

Create `packages/web/src/hooks/use-epub-reader.ts`:

```typescript
import { useRef, useState, useEffect, useCallback } from "react";
import ePub, { type Book, type Rendition, type NavItem } from "epubjs";
import { getAccessToken } from "@/lib/auth";

export type ReaderSettings = {
  fontSize: number;
  fontFamily: "serif" | "sans-serif" | "dyslexic";
  lineSpacing: "compact" | "normal" | "relaxed";
  margins: "narrow" | "normal" | "wide";
  theme: "light" | "dark" | "sepia";
  flow: "paginated" | "scrolled";
};

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  fontFamily: "serif",
  lineSpacing: "normal",
  margins: "normal",
  theme: "dark",
  flow: "paginated",
};

const SETTINGS_KEY = "verso-reader-settings";

function loadSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const FONT_MAP: Record<ReaderSettings["fontFamily"], string> = {
  serif: "'Libre Baskerville', Georgia, serif",
  "sans-serif": "'Outfit', -apple-system, sans-serif",
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
};

const LINE_HEIGHT_MAP: Record<ReaderSettings["lineSpacing"], number> = {
  compact: 1.4,
  normal: 1.7,
  relaxed: 2.0,
};

const MARGIN_MAP: Record<ReaderSettings["margins"], number> = {
  narrow: 20,
  normal: 60,
  wide: 120,
};

const THEME_MAP: Record<ReaderSettings["theme"], { body: Record<string, string> }> = {
  light: { body: { color: "#2a2520", background: "#f6f1ea" } },
  dark: { body: { color: "#e8e2d8", background: "#12110f" } },
  sepia: { body: { color: "#5b4636", background: "#f4ecd8" } },
};

type UseEpubReaderOptions = {
  bookId: string;
  initialCfi?: string | null;
};

export function useEpubReader({ bookId, initialCfi }: UseEpubReaderOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [currentCfi, setCurrentCfi] = useState<string | null>(initialCfi ?? null);
  const [percentage, setPercentage] = useState(0);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentChapter, setCurrentChapter] = useState("");
  const [settings, setSettingsState] = useState<ReaderSettings>(loadSettings);

  // Apply theme/styles to rendition
  const applyStyles = useCallback((rendition: Rendition, s: ReaderSettings) => {
    const themeStyles = THEME_MAP[s.theme];
    rendition.themes.override("color", themeStyles.body.color);
    rendition.themes.override("background", themeStyles.body.background);
    rendition.themes.override("font-family", FONT_MAP[s.fontFamily]);
    rendition.themes.override("font-size", `${s.fontSize}px`);
    rendition.themes.override("line-height", `${LINE_HEIGHT_MAP[s.lineSpacing]}`);
  }, []);

  // Initialize epub.js
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    async function init() {
      // Fetch EPUB as ArrayBuffer with auth header
      const token = getAccessToken();
      const response = await fetch(`/api/books/${bookId}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok || cancelled) return;
      const arrayBuffer = await response.arrayBuffer();
      if (cancelled) return;

      const book = ePub(arrayBuffer);
      bookRef.current = book;

      const rendition = book.renderTo(container, {
        width: "100%",
        height: "100%",
        flow: loadSettings().flow === "scrolled" ? "scrolled" : "paginated",
        spread: "none",
      });
      renditionRef.current = rendition;

      // Apply saved settings
      const s = loadSettings();
      applyStyles(rendition, s);

      // Set up margins
      rendition.themes.override("padding", `0 ${MARGIN_MAP[s.margins]}px`);

      // Load TOC
      const nav = await book.loaded.navigation;
      if (!cancelled) setToc(nav.toc);

      // Display at saved position or start
      if (initialCfi) {
        await rendition.display(initialCfi);
      } else {
        await rendition.display();
      }

      if (!cancelled) setIsLoaded(true);

      // Listen for relocation events
      rendition.on("relocated", (location: any) => {
        if (cancelled) return;
        const cfi = location.start?.cfi;
        if (cfi) setCurrentCfi(cfi);

        const pct = book.locations
          ? Math.round((location.start?.percentage ?? 0) * 100)
          : 0;
        setPercentage(pct);

        // Update current chapter
        const currentHref = location.start?.href;
        if (currentHref && nav.toc) {
          const chapter = nav.toc.find(
            (item: NavItem) => currentHref.includes(item.href.split("#")[0])
          );
          if (chapter) setCurrentChapter(chapter.label.trim());
        }
      });

      // Generate locations for percentage calculation
      await book.locations.generate(1024);
      // Re-display to update percentage now that locations exist
      if (renditionRef.current && !cancelled) {
        const currentLocation = renditionRef.current.currentLocation();
        if (currentLocation) {
          const pct = Math.round(
            ((currentLocation as any).start?.percentage ?? 0) * 100
          );
          setPercentage(pct);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (renditionRef.current) {
        renditionRef.current.destroy();
        renditionRef.current = null;
      }
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
      // Clear the container
      container.innerHTML = "";
    };
  }, [bookId, initialCfi, applyStyles]);

  const nextPage = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const prevPage = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const goTo = useCallback((href: string) => {
    renditionRef.current?.display(href);
  }, []);

  const updateSettings = useCallback((partial: Partial<ReaderSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);

      const rendition = renditionRef.current;
      if (rendition) {
        applyStyles(rendition, next);
        rendition.themes.override("padding", `0 ${MARGIN_MAP[next.margins]}px`);

        // Flow change requires re-render
        if (partial.flow && partial.flow !== prev.flow) {
          const currentCfiValue = currentCfi;
          const container = containerRef.current;
          if (container && bookRef.current) {
            rendition.destroy();
            const newRendition = bookRef.current.renderTo(container, {
              width: "100%",
              height: "100%",
              flow: next.flow === "scrolled" ? "scrolled" : "paginated",
              spread: "none",
            });
            renditionRef.current = newRendition;
            applyStyles(newRendition, next);
            newRendition.themes.override("padding", `0 ${MARGIN_MAP[next.margins]}px`);
            if (currentCfiValue) {
              newRendition.display(currentCfiValue);
            } else {
              newRendition.display();
            }
          }
        }
      }

      return next;
    });
  }, [applyStyles, currentCfi]);

  return {
    containerRef,
    isLoaded,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    updateSettings,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml packages/web/src/hooks/use-epub-reader.ts
git commit -m "feat: add useEpubReader hook with epub.js integration"
```

---

## Task 6: Create useProgressSync hook

**Files:**
- Create: `packages/web/src/hooks/use-progress-sync.ts`

- [ ] **Step 1: Create the hook**

Create `packages/web/src/hooks/use-progress-sync.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/trpc";

type UseProgressSyncOptions = {
  bookId: string;
  percentage: number;
  cfiPosition: string | null;
  enabled: boolean;
};

const DEBOUNCE_MS = 30_000; // 30 seconds

export function useProgressSync({
  bookId,
  percentage,
  cfiPosition,
  enabled,
}: UseProgressSyncOptions) {
  const syncMutation = trpc.progress.sync.useMutation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<{ percentage: number; cfi: string | null }>({
    percentage: 0,
    cfi: null,
  });

  const doSync = useCallback(() => {
    if (!enabled || percentage === 0) return;
    // Skip if nothing changed
    if (
      percentage === lastSyncedRef.current.percentage &&
      cfiPosition === lastSyncedRef.current.cfi
    ) return;

    lastSyncedRef.current = { percentage, cfi: cfiPosition };
    syncMutation.mutate({
      bookId,
      percentage,
      ...(cfiPosition ? { cfiPosition } : {}),
    });
  }, [bookId, percentage, cfiPosition, enabled, syncMutation]);

  // Debounced sync on percentage/cfi change
  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSync, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [percentage, cfiPosition, doSync, enabled]);

  // Immediate sync on page turn (call from parent)
  const syncNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    doSync();
  }, [doSync]);

  // Sync on unmount — use fetch with keepalive for reliability
  useEffect(() => {
    return () => {
      if (lastSyncedRef.current.percentage !== percentage || lastSyncedRef.current.cfi !== cfiPosition) {
        if (enabled && percentage > 0) {
          const token = localStorage.getItem("verso-access-token");
          fetch("/trpc/progress.sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              json: { bookId, percentage, ...(cfiPosition ? { cfiPosition } : {}) },
            }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
  }, [bookId, percentage, cfiPosition, enabled]);

  return { syncNow };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/hooks/use-progress-sync.ts
git commit -m "feat: add useProgressSync hook with debounced sync"
```

---

## Task 7: Build reader UI components

**Files:**
- Create: `packages/web/src/components/reader/reader-top-bar.tsx`
- Create: `packages/web/src/components/reader/reader-bottom-bar.tsx`
- Create: `packages/web/src/components/reader/tap-zones.tsx`
- Create: `packages/web/src/components/reader/toc-panel.tsx`
- Create: `packages/web/src/components/reader/settings-panel.tsx`

- [ ] **Step 1: Create ReaderTopBar**

Create `packages/web/src/components/reader/reader-top-bar.tsx`:

```typescript
type ReaderTopBarProps = {
  title: string;
  visible: boolean;
  onClose: () => void;
  onToggleToc: () => void;
  onToggleSettings: () => void;
};

export function ReaderTopBar({ title, visible, onClose, onToggleToc, onToggleSettings }: ReaderTopBarProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-30 transition-opacity duration-300"
      style={{
        backgroundColor: "rgba(18,17,15,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(46,42,36,0.5)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-sm hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
        >
          ✕
        </button>
        <span
          className="font-display text-sm truncate max-w-[200px] md:max-w-[400px]"
          style={{ color: "var(--text)" }}
        >
          {title}
        </span>
      </div>
      <div className="flex gap-4">
        <button
          onClick={onToggleToc}
          className="text-sm hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Table of Contents"
        >
          ☰
        </button>
        <button
          onClick={onToggleSettings}
          className="text-sm hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ReaderBottomBar**

Create `packages/web/src/components/reader/reader-bottom-bar.tsx`:

```typescript
type ReaderBottomBarProps = {
  percentage: number;
  visible: boolean;
};

export function ReaderBottomBar({ percentage, visible }: ReaderBottomBarProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-10 flex items-center px-4 z-30 transition-opacity duration-300"
      style={{
        backgroundColor: "rgba(18,17,15,0.92)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid rgba(46,42,36,0.5)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="flex-1 flex items-center gap-3">
        <div
          className="flex-1 h-[3px] rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--progress-bg)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-600 ease-out"
            style={{
              width: `${percentage}%`,
              backgroundColor: "var(--warm)",
            }}
          />
        </div>
        <span
          className="text-[11px] whitespace-nowrap"
          style={{ color: "var(--text-dim)" }}
        >
          {percentage}%
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TapZones**

Create `packages/web/src/components/reader/tap-zones.tsx`:

```typescript
type TapZonesProps = {
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

export function TapZones({ onPrev, onNext, onCenter }: TapZonesProps) {
  return (
    <div className="fixed inset-0 z-10 flex" style={{ top: 48, bottom: 40 }}>
      <button
        className="flex-1 cursor-default"
        onClick={onPrev}
        aria-label="Previous page"
      />
      <button
        className="flex-1 cursor-default"
        onClick={onCenter}
        aria-label="Toggle controls"
      />
      <button
        className="flex-1 cursor-default"
        onClick={onNext}
        aria-label="Next page"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create TOCPanel**

Create `packages/web/src/components/reader/toc-panel.tsx`:

```typescript
import type { NavItem } from "epubjs";

type TOCPanelProps = {
  toc: NavItem[];
  currentChapter: string;
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
};

export function TOCPanel({ toc, currentChapter, open, onClose, onNavigate }: TOCPanelProps) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        />
      )}
      {/* Panel */}
      <div
        className="fixed inset-y-0 left-0 w-72 z-50 overflow-y-auto transition-transform duration-300"
        style={{
          backgroundColor: "var(--sidebar-bg)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div className="p-4">
          <p
            className="text-[10px] font-medium uppercase tracking-[1.5px] mb-4"
            style={{ color: "var(--text-faint)" }}
          >
            Contents
          </p>
          <div className="flex flex-col gap-0.5">
            {toc.map((item) => {
              const isActive = item.label.trim() === currentChapter;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.href);
                    onClose();
                  }}
                  className="text-left px-3 py-2 rounded-md text-[13px] transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: isActive ? "var(--warm-glow)" : "transparent",
                    color: isActive ? "var(--warm)" : "var(--text-dim)",
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {item.label.trim()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Create SettingsPanel**

Create `packages/web/src/components/reader/settings-panel.tsx`:

```typescript
import type { ReaderSettings } from "@/hooks/use-epub-reader";

type SettingsPanelProps = {
  settings: ReaderSettings;
  open: boolean;
  onClose: () => void;
  onUpdate: (partial: Partial<ReaderSettings>) => void;
};

function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-5">
      <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
        {label}
      </p>
      <div className="flex gap-1.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="flex-1 px-2 py-2 rounded-md text-xs transition-colors"
              style={{
                backgroundColor: active ? "var(--warm-glow)" : "transparent",
                border: `1px solid ${active ? "var(--warm)" : "var(--border)"}`,
                color: active ? "var(--warm)" : "var(--text-dim)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, open, onClose, onUpdate }: SettingsPanelProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        />
      )}
      <div
        className="fixed inset-y-0 right-0 w-72 z-50 overflow-y-auto transition-transform duration-300"
        style={{
          backgroundColor: "var(--sidebar-bg)",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <div className="p-4">
          <p
            className="text-[10px] font-medium uppercase tracking-[1.5px] mb-5"
            style={{ color: "var(--text-faint)" }}
          >
            Reader Settings
          </p>

          {/* Font Size */}
          <div className="mb-5">
            <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
              Font Size
            </p>
            <div className="flex items-center gap-3">
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>A</span>
              <input
                type="range"
                min={12}
                max={28}
                value={settings.fontSize}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="flex-1 accent-[var(--warm)]"
              />
              <span className="text-[17px]" style={{ color: "var(--text-faint)" }}>A</span>
            </div>
          </div>

          <ToggleGroup
            label="Font"
            options={[
              { value: "serif" as const, label: "Serif" },
              { value: "sans-serif" as const, label: "Sans" },
              { value: "dyslexic" as const, label: "Dyslexic" },
            ]}
            value={settings.fontFamily}
            onChange={(v) => onUpdate({ fontFamily: v })}
          />

          <ToggleGroup
            label="Line Spacing"
            options={[
              { value: "compact" as const, label: "Compact" },
              { value: "normal" as const, label: "Normal" },
              { value: "relaxed" as const, label: "Relaxed" },
            ]}
            value={settings.lineSpacing}
            onChange={(v) => onUpdate({ lineSpacing: v })}
          />

          <ToggleGroup
            label="Margins"
            options={[
              { value: "narrow" as const, label: "Narrow" },
              { value: "normal" as const, label: "Normal" },
              { value: "wide" as const, label: "Wide" },
            ]}
            value={settings.margins}
            onChange={(v) => onUpdate({ margins: v })}
          />

          {/* Theme */}
          <div className="mb-5">
            <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
              Theme
            </p>
            <div className="flex gap-1.5">
              {([
                { value: "light" as const, label: "Light", bg: "#f6f1ea", fg: "#2a2520" },
                { value: "dark" as const, label: "Dark", bg: "#12110f", fg: "#e8e2d8" },
                { value: "sepia" as const, label: "Sepia", bg: "#f4ecd8", fg: "#5b4636" },
              ]).map((t) => {
                const active = t.value === settings.theme;
                return (
                  <button
                    key={t.value}
                    onClick={() => onUpdate({ theme: t.value })}
                    className="flex-1 px-2 py-2 rounded-md text-xs transition-colors"
                    style={{
                      backgroundColor: t.bg,
                      border: `1px solid ${active ? "var(--warm)" : "var(--border)"}`,
                      color: t.fg,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <ToggleGroup
            label="View Mode"
            options={[
              { value: "paginated" as const, label: "Paginated" },
              { value: "scrolled" as const, label: "Scrolling" },
            ]}
            value={settings.flow}
            onChange={(v) => onUpdate({ flow: v })}
          />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/reader/
git commit -m "feat: add reader UI components (top bar, bottom bar, tap zones, TOC, settings)"
```

---

## Task 8: Create the reader page route

**Files:**
- Create: `packages/web/src/routes/_app/books/$id.read.tsx`

- [ ] **Step 1: Create the reader route**

Create `packages/web/src/routes/_app/books/$id.read.tsx`:

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/trpc";
import { useEpubReader } from "@/hooks/use-epub-reader";
import { useProgressSync } from "@/hooks/use-progress-sync";
import { ReaderTopBar } from "@/components/reader/reader-top-bar";
import { ReaderBottomBar } from "@/components/reader/reader-bottom-bar";
import { TapZones } from "@/components/reader/tap-zones";
import { TOCPanel } from "@/components/reader/toc-panel";
import { SettingsPanel } from "@/components/reader/settings-panel";

export const Route = createFileRoute("/_app/books/$id/read")({
  component: ReaderPage,
});

function ReaderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const bookQuery = trpc.books.byId.useQuery({ id });
  const progressQuery = trpc.progress.get.useQuery({ bookId: id });

  const initialCfi = progressQuery.data?.cfiPosition ?? null;
  const dataReady = bookQuery.isSuccess && progressQuery.isSuccess;

  const {
    containerRef,
    isLoaded,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    updateSettings,
  } = useEpubReader({
    bookId: id,
    initialCfi: dataReady ? initialCfi : undefined,
  });

  const { syncNow } = useProgressSync({
    bookId: id,
    percentage,
    cfiPosition: currentCfi,
    enabled: isLoaded,
  });

  // Controls visibility with auto-hide
  const [controlsVisible, setControlsVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-hide controls after 3s
  useEffect(() => {
    if (!controlsVisible || tocOpen || settingsOpen) return;
    const timer = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsVisible, tocOpen, settingsOpen]);

  const toggleControls = useCallback(() => {
    setControlsVisible((v) => !v);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          nextPage();
          syncNow();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prevPage();
          syncNow();
          break;
        case "Escape":
          navigate({ to: "/books/$id", params: { id } });
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextPage, prevPage, navigate, id, syncNow]);

  const handleClose = useCallback(() => {
    navigate({ to: "/books/$id", params: { id } });
  }, [navigate, id]);

  // Loading state
  if (!dataReady) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Loading book...
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50" style={{ backgroundColor: "var(--bg)" }}>
      {/* EPUB container */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ top: 0, bottom: 0 }}
      />

      {/* Navigation tap zones */}
      <TapZones
        onPrev={() => { prevPage(); syncNow(); }}
        onNext={() => { nextPage(); syncNow(); }}
        onCenter={toggleControls}
      />

      {/* Chrome */}
      <ReaderTopBar
        title={bookQuery.data?.title ?? ""}
        visible={controlsVisible}
        onClose={handleClose}
        onToggleToc={() => { setTocOpen((v) => !v); setControlsVisible(true); }}
        onToggleSettings={() => { setSettingsOpen((v) => !v); setControlsVisible(true); }}
      />
      <ReaderBottomBar
        percentage={percentage}
        visible={controlsVisible}
      />

      {/* Panels */}
      <TOCPanel
        toc={toc}
        currentChapter={currentChapter}
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        onNavigate={(href) => { goTo(href); syncNow(); }}
      />
      <SettingsPanel
        settings={settings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdate={updateSettings}
      />

      {/* Loading overlay */}
      {!isLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20"
          style={{ backgroundColor: "var(--bg)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Rendering book...
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter @verso/web build 2>&1 | head -30`

If there are type errors, fix them. Common issues: epub.js type imports, TanStack Router route generation.

Note: TanStack Router auto-generates route definitions. After creating the file, you may need to run the dev server briefly or run `pnpm --filter @verso/web dev` to trigger route generation, then stop it.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/_app/books/\$id.read.tsx
git commit -m "feat: add reader page route with full-screen EPUB reader"
```

---

## Task 9: Update book detail page with reading CTA and progress

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

- [ ] **Step 1: Add progress query and update the CTA button**

In `packages/web/src/routes/_app/books/$id.tsx`, make these changes:

1. Add progress query after the book query (note: input takes `bookId`, not `id`):

```typescript
const progressQuery = trpc.progress.get.useQuery({ bookId: id });
```

2. Replace the disabled "Start Reading" button (lines 166-172) with a working link:

```typescript
<Link
  to="/books/$id/read"
  params={{ id }}
  className="inline-flex items-center px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
  style={{ backgroundColor: "var(--warm)" }}
>
  {progressQuery.data?.finishedAt
    ? "Read Again"
    : progressQuery.data?.percentage
      ? `Continue Reading (${Math.round(progressQuery.data.percentage)}%)`
      : "Start Reading"}
</Link>
```

3. Add a progress card after the hero section (after the closing `</div>` of the hero `rounded-2xl` div, before the Description section). Insert:

```typescript
{/* Progress section */}
{progressQuery.data && !progressQuery.data.finishedAt && progressQuery.data.percentage > 0 && (
  <div
    className="rounded-xl p-4 mb-8 flex items-center gap-4"
    style={{ backgroundColor: "var(--card)" }}
  >
    <div className="flex-1">
      <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
        Reading Progress
      </p>
      <div
        className="h-1.5 rounded-full overflow-hidden mb-1.5"
        style={{ backgroundColor: "var(--progress-bg)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-600"
          style={{ width: `${progressQuery.data.percentage}%`, backgroundColor: "var(--warm)" }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        {Math.round(progressQuery.data.percentage)}% complete
        {book.pageCount
          ? ` · ${Math.round(book.pageCount * (1 - progressQuery.data.percentage / 100))} pages remaining`
          : ""}
      </p>
    </div>
  </div>
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter @verso/web build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/_app/books/\$id.tsx
git commit -m "feat: add reading CTA and progress card to book detail page"
```

---

## Task 10: Add "Continue Reading" row to library page

**Files:**
- Create: `packages/web/src/components/books/continue-reading-row.tsx`
- Modify: `packages/web/src/routes/_app/index.tsx`

- [ ] **Step 1: Create ContinueReadingRow component**

Create `packages/web/src/components/books/continue-reading-row.tsx`:

```typescript
import { Link } from "@tanstack/react-router";
import { BookCover } from "./book-cover";
import { trpc } from "@/trpc";

export function ContinueReadingRow() {
  const query = trpc.books.currentlyReading.useQuery();

  if (!query.data?.length) return null;

  return (
    <div className="mb-8">
      <h2
        className="font-display text-base font-bold mb-3"
        style={{ color: "var(--text)" }}
      >
        Continue Reading
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {query.data.map((item) => (
          <Link
            key={item.id}
            to="/books/$id/read"
            params={{ id: item.id }}
            className="shrink-0 flex gap-3 rounded-xl p-3 transition-transform hover:translate-y-[-2px]"
            style={{ backgroundColor: "var(--card)", width: 220 }}
          >
            <BookCover
              bookId={item.id}
              title={item.title}
              author={item.author}
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
              <p
                className="text-[11px] mt-0.5 line-clamp-1"
                style={{ color: "var(--text-dim)" }}
              >
                {item.author}
              </p>
              {/* Progress bar */}
              <div className="mt-2">
                <div
                  className="h-[3px] rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--progress-bg)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: "var(--warm)",
                    }}
                  />
                </div>
                <p
                  className="text-[10px] mt-0.5"
                  style={{ color: "var(--text-faint)" }}
                >
                  {Math.round(item.percentage)}%
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

- [ ] **Step 2: Add ContinueReadingRow to library page**

Modify `packages/web/src/routes/_app/index.tsx`:

Add import at top:
```typescript
import { ContinueReadingRow } from "@/components/books/continue-reading-row";
```

Add `<ContinueReadingRow />` in the JSX, between the header `<div className="mb-6">` and the loading/grid section. The return should become:

```typescript
  return (
    <div>
      <div className="mb-6">
        <h1
          className="font-display text-[26px] font-bold"
          style={{ color: "var(--text)" }}
        >
          Library
        </h1>
        {bookCount > 0 && (
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--text-dim)" }}
          >
            {bookCount} {bookCount === 1 ? "book" : "books"}
          </p>
        )}
      </div>

      <ContinueReadingRow />

      {booksQuery.isLoading ? (
        <div
          className="flex items-center justify-center py-20"
          style={{ color: "var(--text-dim)" }}
        >
          <p className="text-sm">Loading your library...</p>
        </div>
      ) : (
        <BookGrid books={booksQuery.data?.books ?? []} />
      )}
    </div>
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter @verso/web build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/books/continue-reading-row.tsx packages/web/src/routes/_app/index.tsx
git commit -m "feat: add Continue Reading row to library page"
```

---

## Task 11: End-to-end verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter server test -- --run`

Expected: All tests pass (existing + new progress tests).

- [ ] **Step 2: Build frontend**

Run: `cd /Users/michaelkusche/dev/verso && pnpm --filter @verso/web build`

Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Run: `cd /Users/michaelkusche/dev/verso && ./dev.sh`

Test flow:
1. Open library → verify no "Continue Reading" row (no books in progress)
2. Click a book → verify "Start Reading" button is active (not disabled)
3. Click "Start Reading" → reader opens full-screen
4. Verify: epub.js renders the book content
5. Tap right side or press → → page turns
6. Verify: bottom bar shows progress percentage updating
7. Click ☰ → TOC panel slides in, shows chapters
8. Click a chapter → navigates to it, panel closes
9. Click ⚙ → Settings panel slides in
10. Change font size → text reflows
11. Change theme to sepia → content background changes
12. Press Escape or click ✕ → returns to book detail page
13. Verify: book detail shows "Continue Reading (X%)" and progress card
14. Go back to library → verify "Continue Reading" row appears with the book
15. Click the book in Continue Reading row → reader opens at saved position

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address smoke test findings for Session 2"
```
