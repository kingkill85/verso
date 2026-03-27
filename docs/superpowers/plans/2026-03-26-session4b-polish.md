# Session 4b: "Polish" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reading stats dashboard, OPDS import, and library ZIP backup/restore to Verso.

**Architecture:** New `reading_sessions` table tracks per-session reading time. A new `stats` tRPC router computes dashboard data from sessions + progress. OPDS import uses a Fastify SSE endpoint that parses Atom XML catalogs and downloads books. Export streams a ZIP via `archiver`. All features are user-scoped.

**Tech Stack:** Drizzle ORM (SQLite), tRPC, Fastify (raw routes for SSE/streaming), fast-xml-parser, archiver, hand-rolled SVG charts, React + TanStack Router.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `packages/shared/src/stats-validators.ts` | Zod schemas for stats + import/export inputs |
| `packages/server/src/trpc/routers/stats.ts` | tRPC router: overview, dailyReading, distribution, readingLog |
| `packages/server/src/services/opds-client.ts` | OPDS catalog parsing + book download |
| `packages/server/src/services/library-export.ts` | ZIP export stream builder |
| `packages/server/src/services/library-import.ts` | ZIP restore logic |
| `packages/server/src/routes/import.ts` | Fastify routes: OPDS browse, OPDS import stream (SSE), restore |
| `packages/server/src/routes/export.ts` | Fastify route: library ZIP download |
| `packages/server/src/__tests__/stats.test.ts` | Stats router tests |
| `packages/server/src/__tests__/opds-client.test.ts` | OPDS XML parsing tests |
| `packages/server/src/__tests__/library-export.test.ts` | Export service tests |
| `packages/web/src/routes/_app/stats.tsx` | Stats dashboard page |
| `packages/web/src/routes/_app/import.tsx` | Import hub page |
| `packages/web/src/components/stats/summary-cards.tsx` | Summary cards component |
| `packages/web/src/components/stats/daily-chart.tsx` | SVG bar chart component |
| `packages/web/src/components/stats/distribution-chart.tsx` | Horizontal bar chart component |
| `packages/web/src/components/stats/reading-log.tsx` | Reading log list component |
| `packages/web/src/components/import/opds-import.tsx` | OPDS import flow component |
| `packages/web/src/components/import/restore-backup.tsx` | Restore from ZIP component |

### Modified Files

| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add `readingSessions` table |
| `packages/shared/src/index.ts` | Re-export `stats-validators.ts` |
| `packages/server/src/trpc/router.ts` | Register `stats` router |
| `packages/server/src/trpc/routers/progress.ts` | Add session tracking to `sync` mutation |
| `packages/server/src/app.ts` | Register import + export routes |
| `packages/web/src/components/layout/sidebar.tsx` | Add Stats + Import links, Export button |

---

## Task 1: `reading_sessions` Table + Migration

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Create: migration via `drizzle-kit generate`

- [ ] **Step 1: Add `readingSessions` table to schema**

Add after the `annotations` table in `packages/shared/src/schema.ts`:

```typescript
export const readingSessions = sqliteTable("reading_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(0),
});
```

- [ ] **Step 2: Generate migration**

Run from `packages/server`:

```bash
cd packages/server && npx drizzle-kit generate
```

Expected: new SQL file in `drizzle/` with `CREATE TABLE reading_sessions`.

- [ ] **Step 3: Verify migration applies**

```bash
cd packages/server && pnpm test -- --run -t "progress" 2>&1 | tail -5
```

Expected: existing progress tests still pass (migration runs in test setup via `migrate()`).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schema.ts packages/server/drizzle/
git commit -m "feat: add reading_sessions table for per-session time tracking"
```

---

## Task 2: Session Tracking in `progress.sync`

**Files:**
- Modify: `packages/server/src/trpc/routers/progress.ts`
- Modify: `packages/server/src/__tests__/progress.test.ts`

- [ ] **Step 1: Write failing tests for session creation**

Add to `packages/server/src/__tests__/progress.test.ts` inside the `describe("sync", ...)` block:

```typescript
import { books, readingProgress, readingSessions } from "@verso/shared";
import { eq } from "drizzle-orm";

// ... inside describe("sync", () => { ... })

it("creates a reading session on first sync with time", async () => {
  await authedCaller.progress.sync({
    bookId,
    percentage: 10,
    timeSpentMinutes: 2,
  });

  const sessions = await ctx.db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.bookId, bookId));
  expect(sessions).toHaveLength(1);
  expect(sessions[0].durationMinutes).toBe(2);
});

it("extends existing session if last ended < 5 min ago", async () => {
  await authedCaller.progress.sync({
    bookId,
    percentage: 10,
    timeSpentMinutes: 2,
  });
  // Second sync immediately after — should extend, not create new
  await authedCaller.progress.sync({
    bookId,
    percentage: 15,
    timeSpentMinutes: 1,
  });

  const sessions = await ctx.db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.bookId, bookId));
  expect(sessions).toHaveLength(1);
  expect(sessions[0].durationMinutes).toBe(3);
});

it("does not create session when timeSpentMinutes is 0 or missing", async () => {
  await authedCaller.progress.sync({
    bookId,
    percentage: 10,
  });

  const sessions = await ctx.db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.bookId, bookId));
  expect(sessions).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/server && pnpm test -- --run -t "creates a reading session"
```

Expected: FAIL — `readingSessions` table has no rows because `progress.sync` doesn't write to it yet.

- [ ] **Step 3: Implement session tracking in `progress.sync`**

In `packages/server/src/trpc/routers/progress.ts`, add the session logic. The full updated file:

```typescript
import { eq, and, desc } from "drizzle-orm";
import { readingProgress, readingSessions, progressGetInput, progressSyncInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

const SESSION_GAP_MS = 5 * 60 * 1000; // 5 minutes

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

    // Track reading session if time was reported
    if (input.timeSpentMinutes && input.timeSpentMinutes > 0) {
      const lastSession = await ctx.db
        .select()
        .from(readingSessions)
        .where(
          and(
            eq(readingSessions.userId, ctx.user.sub),
            eq(readingSessions.bookId, input.bookId),
          )
        )
        .orderBy(desc(readingSessions.endedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      const nowMs = Date.now();
      const lastEndedMs = lastSession ? new Date(lastSession.endedAt).getTime() : 0;

      if (lastSession && nowMs - lastEndedMs < SESSION_GAP_MS) {
        // Extend existing session
        await ctx.db
          .update(readingSessions)
          .set({
            endedAt: now,
            durationMinutes: lastSession.durationMinutes + input.timeSpentMinutes,
          })
          .where(eq(readingSessions.id, lastSession.id));
      } else {
        // Create new session
        await ctx.db.insert(readingSessions).values({
          userId: ctx.user.sub,
          bookId: input.bookId,
          startedAt: now,
          endedAt: now,
          durationMinutes: input.timeSpentMinutes,
        });
      }
    }

    if (existing) {
      const [updated] = await ctx.db
        .update(readingProgress)
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          currentPage: input.currentPage ?? existing.currentPage,
          timeSpentMinutes: (existing.timeSpentMinutes ?? 0) + (input.timeSpentMinutes ?? 0),
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
        timeSpentMinutes: input.timeSpentMinutes ?? 0,
        startedAt: now,
        lastReadAt: now,
        finishedAt,
      })
      .returning();
    return created;
  }),
});
```

- [ ] **Step 4: Run all progress tests**

```bash
cd packages/server && pnpm test -- --run -t "progress"
```

Expected: all tests pass including the 3 new session tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/trpc/routers/progress.ts packages/server/src/__tests__/progress.test.ts
git commit -m "feat: track reading sessions in progress.sync"
```

---

## Task 3: Stats Validators

**Files:**
- Create: `packages/shared/src/stats-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create stats validators**

Create `packages/shared/src/stats-validators.ts`:

```typescript
import { z } from "zod";

export const statsRangeInput = z.object({
  range: z.enum(["week", "month", "year", "all"]),
});

export const statsReadingLogInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export const opdsBrowseInput = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const opdsImportInput = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  entries: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      author: z.string().optional(),
      acquisitionUrl: z.string().url(),
      coverUrl: z.string().url().optional(),
      format: z.string().optional(),
    })
  ),
});
```

- [ ] **Step 2: Re-export from shared index**

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./stats-validators.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/stats-validators.ts packages/shared/src/index.ts
git commit -m "feat: add validators for stats and import"
```

---

## Task 4: Stats tRPC Router

**Files:**
- Create: `packages/server/src/trpc/routers/stats.ts`
- Modify: `packages/server/src/trpc/router.ts`
- Create: `packages/server/src/__tests__/stats.test.ts`

- [ ] **Step 1: Write stats router tests**

Create `packages/server/src/__tests__/stats.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, readingSessions, readingProgress } from "@verso/shared";

describe("stats router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;
  let bookId1: string;
  let bookId2: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    bookId1 = crypto.randomUUID();
    bookId2 = crypto.randomUUID();
    const now = new Date().toISOString();

    await ctx.db.insert(books).values([
      {
        id: bookId1,
        title: "Dune",
        author: "Frank Herbert",
        filePath: `books/${bookId1}.epub`,
        fileFormat: "epub",
        fileSize: 1024,
        addedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: bookId2,
        title: "Neuromancer",
        author: "William Gibson",
        filePath: `books/${bookId2}.epub`,
        fileFormat: "epub",
        fileSize: 2048,
        addedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  describe("overview", () => {
    it("returns zeros when no reading data exists", async () => {
      const result = await authedCaller.stats.overview({ range: "all" });
      expect(result.timeReadMinutes).toBe(0);
      expect(result.booksFinished).toBe(0);
      expect(result.booksInProgress).toBe(0);
      expect(result.currentStreak).toBe(0);
      expect(result.avgMinutesPerDay).toBe(0);
    });

    it("returns correct totals from reading sessions", async () => {
      const today = new Date().toISOString();

      await ctx.db.insert(readingSessions).values([
        {
          userId,
          bookId: bookId1,
          startedAt: today,
          endedAt: today,
          durationMinutes: 30,
        },
        {
          userId,
          bookId: bookId2,
          startedAt: today,
          endedAt: today,
          durationMinutes: 45,
        },
      ]);

      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: bookId1,
        percentage: 100,
        startedAt: today,
        lastReadAt: today,
        finishedAt: today,
        timeSpentMinutes: 30,
      });

      const result = await authedCaller.stats.overview({ range: "all" });
      expect(result.timeReadMinutes).toBe(75);
      expect(result.booksFinished).toBe(1);
    });
  });

  describe("dailyReading", () => {
    it("returns daily breakdown from sessions", async () => {
      const today = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString();

      await ctx.db.insert(readingSessions).values([
        {
          userId,
          bookId: bookId1,
          startedAt: today,
          endedAt: today,
          durationMinutes: 30,
        },
        {
          userId,
          bookId: bookId1,
          startedAt: yesterday,
          endedAt: yesterday,
          durationMinutes: 45,
        },
      ]);

      const result = await authedCaller.stats.dailyReading({ range: "week" });
      expect(result.length).toBeGreaterThanOrEqual(2);
      const totalMinutes = result.reduce((sum, d) => sum + d.minutes, 0);
      expect(totalMinutes).toBe(75);
    });
  });

  describe("distribution", () => {
    it("returns reading time grouped by author", async () => {
      const today = new Date().toISOString();

      await ctx.db.insert(readingSessions).values([
        {
          userId,
          bookId: bookId1,
          startedAt: today,
          endedAt: today,
          durationMinutes: 60,
        },
        {
          userId,
          bookId: bookId2,
          startedAt: today,
          endedAt: today,
          durationMinutes: 30,
        },
      ]);

      const result = await authedCaller.stats.distribution({ range: "all" });
      expect(result).toHaveLength(2);
      const herbert = result.find((d) => d.author === "Frank Herbert");
      expect(herbert).toBeDefined();
      expect(herbert!.minutes).toBe(60);
    });
  });

  describe("readingLog", () => {
    it("returns recent sessions with book info", async () => {
      const today = new Date().toISOString();

      await ctx.db.insert(readingSessions).values({
        userId,
        bookId: bookId1,
        startedAt: today,
        endedAt: today,
        durationMinutes: 30,
      });

      const result = await authedCaller.stats.readingLog({ limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].bookTitle).toBe("Dune");
      expect(result.items[0].durationMinutes).toBe(30);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/server && pnpm test -- --run -t "stats router"
```

Expected: FAIL — `stats` router doesn't exist yet.

- [ ] **Step 3: Implement the stats router**

Create `packages/server/src/trpc/routers/stats.ts`:

```typescript
import { eq, and, gte, sql, desc } from "drizzle-orm";
import {
  readingSessions,
  readingProgress,
  books,
  statsRangeInput,
  statsReadingLogInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

function getRangeStart(range: "week" | "month" | "year" | "all"): string | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "week") now.setDate(now.getDate() - 7);
  else if (range === "month") now.setMonth(now.getMonth() - 1);
  else if (range === "year") now.setFullYear(now.getFullYear() - 1);
  return now.toISOString();
}

function rangeDays(range: "week" | "month" | "year" | "all"): number {
  if (range === "week") return 7;
  if (range === "month") return 30;
  if (range === "year") return 365;
  return 0; // computed from first session for "all"
}

export const statsRouter = router({
  overview: protectedProcedure.input(statsRangeInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const rangeStart = getRangeStart(input.range);

    // Total time from sessions in range
    const timeResult = await ctx.db
      .select({ total: sql<number>`coalesce(sum(${readingSessions.durationMinutes}), 0)` })
      .from(readingSessions)
      .where(
        and(
          eq(readingSessions.userId, userId),
          rangeStart ? gte(readingSessions.startedAt, rangeStart) : undefined,
        )
      );
    const timeReadMinutes = timeResult[0]?.total ?? 0;

    // Books finished in range
    const finishedResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.userId, userId),
          sql`${readingProgress.finishedAt} IS NOT NULL`,
          rangeStart ? gte(readingProgress.finishedAt, rangeStart) : undefined,
        )
      );
    const booksFinished = finishedResult[0]?.count ?? 0;

    // Current streak: consecutive days with sessions ending today/yesterday and going back
    const dailySessions = await ctx.db
      .select({
        day: sql<string>`date(${readingSessions.startedAt})`.as("day"),
      })
      .from(readingSessions)
      .where(eq(readingSessions.userId, userId))
      .groupBy(sql`date(${readingSessions.startedAt})`)
      .orderBy(desc(sql`date(${readingSessions.startedAt})`));

    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < dailySessions.length; i++) {
      const sessionDate = new Date(dailySessions[i].day + "T00:00:00");
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);
      expectedDate.setHours(0, 0, 0, 0);

      // Allow streak to start from today or yesterday
      if (i === 0) {
        const diffDays = Math.floor((today.getTime() - sessionDate.getTime()) / 86400000);
        if (diffDays > 1) break; // No recent reading
        if (diffDays === 1) {
          // Started from yesterday
          expectedDate.setDate(expectedDate.getDate() - 1);
        }
      }

      if (sessionDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Avg per day
    let days = rangeDays(input.range);
    if (input.range === "all" && dailySessions.length > 0) {
      const firstDay = new Date(dailySessions[dailySessions.length - 1].day);
      days = Math.max(1, Math.ceil((Date.now() - firstDay.getTime()) / 86400000));
    }
    const avgMinutesPerDay = days > 0 ? Math.round(timeReadMinutes / days) : 0;

    // Books in progress
    const inProgressResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.userId, userId),
          sql`${readingProgress.percentage} > 0`,
          sql`${readingProgress.finishedAt} IS NULL`,
        )
      );
    const booksInProgress = inProgressResult[0]?.count ?? 0;

    return { timeReadMinutes, booksFinished, booksInProgress, currentStreak, avgMinutesPerDay };
  }),

  dailyReading: protectedProcedure.input(statsRangeInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const rangeStart = getRangeStart(input.range);

    const rows = await ctx.db
      .select({
        date: sql<string>`date(${readingSessions.startedAt})`.as("date"),
        minutes: sql<number>`sum(${readingSessions.durationMinutes})`.as("minutes"),
      })
      .from(readingSessions)
      .where(
        and(
          eq(readingSessions.userId, userId),
          rangeStart ? gte(readingSessions.startedAt, rangeStart) : undefined,
        )
      )
      .groupBy(sql`date(${readingSessions.startedAt})`)
      .orderBy(sql`date(${readingSessions.startedAt})`);

    return rows.map((r) => ({ date: r.date, minutes: r.minutes }));
  }),

  distribution: protectedProcedure.input(statsRangeInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const rangeStart = getRangeStart(input.range);

    const rows = await ctx.db
      .select({
        author: books.author,
        minutes: sql<number>`sum(${readingSessions.durationMinutes})`.as("minutes"),
      })
      .from(readingSessions)
      .innerJoin(books, eq(readingSessions.bookId, books.id))
      .where(
        and(
          eq(readingSessions.userId, userId),
          rangeStart ? gte(readingSessions.startedAt, rangeStart) : undefined,
        )
      )
      .groupBy(books.author)
      .orderBy(desc(sql`sum(${readingSessions.durationMinutes})`))
      .limit(6); // top 5 + room for "Other" calculation

    const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);
    return rows.map((r) => ({
      author: r.author,
      minutes: r.minutes,
      percentage: totalMinutes > 0 ? Math.round((r.minutes / totalMinutes) * 100) : 0,
    }));
  }),

  readingLog: protectedProcedure.input(statsReadingLogInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const limit = input.limit ?? 20;

    const conditions = [eq(readingSessions.userId, userId)];
    if (input.cursor) {
      conditions.push(sql`${readingSessions.startedAt} < ${input.cursor}`);
    }

    const rows = await ctx.db
      .select({
        id: readingSessions.id,
        bookId: readingSessions.bookId,
        bookTitle: books.title,
        bookAuthor: books.author,
        coverPath: books.coverPath,
        durationMinutes: readingSessions.durationMinutes,
        startedAt: readingSessions.startedAt,
      })
      .from(readingSessions)
      .innerJoin(books, eq(readingSessions.bookId, books.id))
      .where(and(...conditions))
      .orderBy(desc(readingSessions.startedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1].startedAt : undefined;

    return { items, nextCursor };
  }),
});
```

- [ ] **Step 4: Register stats router**

In `packages/server/src/trpc/router.ts`, add:

```typescript
import { statsRouter } from "./routers/stats.js";
```

And add to the router object:

```typescript
export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  progress: progressRouter,
  shelves: shelvesRouter,
  metadata: metadataRouter,
  annotations: annotationsRouter,
  stats: statsRouter,
});
```

- [ ] **Step 5: Run stats tests**

```bash
cd packages/server && pnpm test -- --run -t "stats router"
```

Expected: all stats tests pass.

- [ ] **Step 6: Run full test suite**

```bash
cd packages/server && pnpm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/trpc/routers/stats.ts packages/server/src/trpc/router.ts packages/server/src/__tests__/stats.test.ts
git commit -m "feat: add stats tRPC router with overview, daily, distribution, log"
```

---

## Task 5: Stats Dashboard Page — Summary Cards + Time Range

**Files:**
- Create: `packages/web/src/routes/_app/stats.tsx`
- Create: `packages/web/src/components/stats/summary-cards.tsx`

- [ ] **Step 1: Create the summary cards component**

Create `packages/web/src/components/stats/summary-cards.tsx`:

```tsx
type SummaryCardsProps = {
  timeReadMinutes: number;
  booksFinished: number;
  booksInProgress: number;
  currentStreak: number;
  avgMinutesPerDay: number;
};

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function SummaryCards({
  timeReadMinutes,
  booksFinished,
  currentStreak,
  avgMinutesPerDay,
}: SummaryCardsProps) {
  const cards = [
    { label: "Time Read", value: formatTime(timeReadMinutes) },
    { label: "Books Finished", value: String(booksFinished) },
    { label: "In Progress", value: String(booksInProgress) },
    { label: "Day Streak", value: String(currentStreak) },
    { label: "Avg / Day", value: formatTime(avgMinutesPerDay) },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl p-5 text-center"
          style={{ backgroundColor: "var(--card)" }}
        >
          <div
            className="text-2xl font-bold font-display"
            style={{ color: "var(--warm)" }}
          >
            {card.value}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--text-dim)" }}
          >
            {card.label}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the stats page with time range selector**

Create `packages/web/src/routes/_app/stats.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { trpc } from "@/trpc";
import { SummaryCards } from "@/components/stats/summary-cards";

type Range = "week" | "month" | "year" | "all";

const RANGES: { label: string; value: Range }[] = [
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
  { label: "All Time", value: "all" },
];

export const Route = createFileRoute("/_app/stats")({
  component: StatsPage,
});

function StatsPage() {
  const [range, setRange] = useState<Range>("week");

  const overviewQuery = trpc.stats.overview.useQuery({ range });

  return (
    <div className="max-w-3xl mx-auto">
      <h1
        className="font-display text-[26px] font-bold mb-6"
        style={{ color: "var(--text)" }}
      >
        Reading Stats
      </h1>

      {/* Time range selector */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ backgroundColor: "var(--card)" }}>
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: range === r.value ? "var(--warm)" : "transparent",
              color: range === r.value ? "white" : "var(--text-dim)",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {overviewQuery.data && (
        <SummaryCards
          timeReadMinutes={overviewQuery.data.timeReadMinutes}
          booksFinished={overviewQuery.data.booksFinished}
          booksInProgress={overviewQuery.data.booksInProgress}
          currentStreak={overviewQuery.data.currentStreak}
          avgMinutesPerDay={overviewQuery.data.avgMinutesPerDay}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the route compiles**

```bash
cd packages/web && pnpm build 2>&1 | tail -10
```

Expected: build succeeds (TanStack Router auto-generates the route tree).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/_app/stats.tsx packages/web/src/components/stats/summary-cards.tsx
git commit -m "feat: add stats page with time range selector and summary cards"
```

---

## Task 6: Daily Reading Chart

**Files:**
- Create: `packages/web/src/components/stats/daily-chart.tsx`
- Modify: `packages/web/src/routes/_app/stats.tsx`

- [ ] **Step 1: Create the SVG bar chart component**

Create `packages/web/src/components/stats/daily-chart.tsx`:

```tsx
type DailyChartProps = {
  data: { date: string; minutes: number }[];
  range: "week" | "month" | "year" | "all";
};

function formatLabel(date: string, range: string): string {
  const d = new Date(date + "T00:00:00");
  if (range === "week") return d.toLocaleDateString("en", { weekday: "short" });
  if (range === "month") return String(d.getDate());
  return d.toLocaleDateString("en", { month: "short" });
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function DailyChart({ data, range }: DailyChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center text-sm"
        style={{ backgroundColor: "var(--card)", color: "var(--text-faint)" }}
      >
        No reading data for this period
      </div>
    );
  }

  const maxMinutes = Math.max(...data.map((d) => d.minutes), 1);
  const barWidth = Math.max(8, Math.min(40, Math.floor(600 / data.length) - 4));
  const chartWidth = data.length * (barWidth + 4);
  const chartHeight = 160;
  const labelHeight = 20;

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
      <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-dim)" }}>
        Daily Reading
      </h3>
      <div className="overflow-x-auto">
        <svg
          width={Math.max(chartWidth, 200)}
          height={chartHeight + labelHeight}
          viewBox={`0 0 ${Math.max(chartWidth, 200)} ${chartHeight + labelHeight}`}
        >
          {data.map((d, i) => {
            const barHeight = (d.minutes / maxMinutes) * chartHeight;
            const x = i * (barWidth + 4);
            const y = chartHeight - barHeight;
            return (
              <g key={d.date}>
                <title>{`${d.date}: ${formatMinutes(d.minutes)}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  fill="var(--warm)"
                  opacity={0.8}
                />
                {(range === "week" || data.length <= 14) && (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 14}
                    textAnchor="middle"
                    fill="var(--text-faint)"
                    fontSize={10}
                  >
                    {formatLabel(d.date, range)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add DailyChart to the stats page**

In `packages/web/src/routes/_app/stats.tsx`, add the import and query:

```tsx
import { DailyChart } from "@/components/stats/daily-chart";
```

Add after the SummaryCards section inside StatsPage:

```tsx
const dailyQuery = trpc.stats.dailyReading.useQuery({ range });
```

And in the JSX, after the SummaryCards block:

```tsx
{/* Daily reading chart */}
{dailyQuery.data && (
  <div className="mt-6">
    <DailyChart data={dailyQuery.data} range={range} />
  </div>
)}
```

- [ ] **Step 3: Verify build**

```bash
cd packages/web && pnpm build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/stats/daily-chart.tsx packages/web/src/routes/_app/stats.tsx
git commit -m "feat: add daily reading bar chart to stats page"
```

---

## Task 7: Distribution Chart + Reading Log

**Files:**
- Create: `packages/web/src/components/stats/distribution-chart.tsx`
- Create: `packages/web/src/components/stats/reading-log.tsx`
- Modify: `packages/web/src/routes/_app/stats.tsx`

- [ ] **Step 1: Create distribution chart**

Create `packages/web/src/components/stats/distribution-chart.tsx`:

```tsx
type DistributionChartProps = {
  data: { author: string; minutes: number; percentage: number }[];
};

const COLORS = ["var(--warm)", "#6b8f71", "#7b8fb0", "#b07b8f", "#8f8b6b", "#888"];

export function DistributionChart({ data }: DistributionChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center text-sm"
        style={{ backgroundColor: "var(--card)", color: "var(--text-faint)" }}
      >
        No reading data yet
      </div>
    );
  }

  const maxMinutes = Math.max(...data.map((d) => d.minutes), 1);

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
      <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-dim)" }}>
        By Author
      </h3>
      <div className="space-y-3">
        {data.map((d, i) => (
          <div key={d.author}>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: "var(--text)" }}>{d.author}</span>
              <span style={{ color: "var(--text-faint)" }}>{d.percentage}%</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--bg)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(d.minutes / maxMinutes) * 100}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create reading log component**

Create `packages/web/src/components/stats/reading-log.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

type ReadingLogProps = {
  items: {
    id: string;
    bookId: string;
    bookTitle: string;
    bookAuthor: string;
    coverPath: string | null;
    durationMinutes: number;
    startedAt: string;
  }[];
  hasMore: boolean;
  onLoadMore: () => void;
};

function relativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ReadingLog({ items, hasMore, onLoadMore }: ReadingLogProps) {
  if (items.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center text-sm"
        style={{ backgroundColor: "var(--card)", color: "var(--text-faint)" }}
      >
        No reading sessions yet
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
      <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-dim)" }}>
        Reading Log
      </h3>
      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            to="/books/$id"
            params={{ id: item.bookId }}
            className="flex items-center gap-3 rounded-lg p-2 -mx-2 transition-colors hover:opacity-80"
          >
            <div
              className="w-8 h-11 rounded flex-shrink-0 bg-cover bg-center"
              style={{
                backgroundColor: "var(--bg)",
                backgroundImage: item.coverPath
                  ? `url(/api/covers/${item.bookId})`
                  : undefined,
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                {item.bookTitle}
              </div>
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                {item.bookAuthor}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-medium" style={{ color: "var(--warm)" }}>
                {formatDuration(item.durationMinutes)}
              </div>
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                {relativeDate(item.startedAt)}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full text-center text-sm mt-4 py-2 rounded-lg transition-colors"
          style={{ color: "var(--warm)" }}
        >
          Load more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire distribution + log into stats page**

In `packages/web/src/routes/_app/stats.tsx`, add imports:

```tsx
import { DistributionChart } from "@/components/stats/distribution-chart";
import { ReadingLog } from "@/components/stats/reading-log";
```

Add queries inside `StatsPage`:

```tsx
const distributionQuery = trpc.stats.distribution.useQuery({ range });
const logQuery = trpc.stats.readingLog.useInfiniteQuery(
  { limit: 20 },
  { getNextPageParam: (lastPage) => lastPage.nextCursor }
);
```

Add JSX after the DailyChart section:

```tsx
{/* Distribution + reading log */}
<div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-1">
    {distributionQuery.data && (
      <DistributionChart data={distributionQuery.data} />
    )}
  </div>
  <div className="lg:col-span-2">
    {logQuery.data && (
      <ReadingLog
        items={logQuery.data.pages.flatMap((p) => p.items)}
        hasMore={logQuery.hasNextPage ?? false}
        onLoadMore={() => logQuery.fetchNextPage()}
      />
    )}
  </div>
</div>
```

- [ ] **Step 4: Verify build**

```bash
cd packages/web && pnpm build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/stats/distribution-chart.tsx packages/web/src/components/stats/reading-log.tsx packages/web/src/routes/_app/stats.tsx
git commit -m "feat: add distribution chart and reading log to stats page"
```

---

## Task 8: Sidebar Navigation Updates

**Files:**
- Modify: `packages/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add Stats and Import links to the sidebar**

In `packages/web/src/components/layout/sidebar.tsx`, update the "Actions" section. Replace the current Actions block with:

```tsx
<div className="px-3 mb-2 mt-6 text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
  Actions
</div>
<SidebarItem to="/stats" label="Stats" emoji="📊" active={isActive("/stats")} onClick={onClose} />
<SidebarItem to="/upload" label="Upload" emoji="📤" active={isActive("/upload")} onClick={onClose} />
<SidebarItem to="/import" label="Import" emoji="📥" active={isActive("/import")} onClick={onClose} />
```

- [ ] **Step 2: Add export button to sidebar footer**

In the sidebar footer section (the `<div className="p-4 border-t"...>` block), add an export button before the user avatar:

```tsx
<div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
  <button
    onClick={handleExport}
    className="w-full flex items-center gap-3 rounded-lg px-[22px] py-[10px] text-[13.5px] transition-colors mb-2"
    style={{ color: "var(--text-dim)" }}
  >
    <span className="w-[22px] text-base">💾</span>
    <span>Export Library</span>
  </button>
  <div className="flex items-center gap-3 px-2">
    {/* existing user avatar */}
  </div>
</div>
```

Add the export handler at the top of the `Sidebar` function:

```tsx
const handleExport = async () => {
  const token = localStorage.getItem("verso_access_token");
  if (!token) return;
  const res = await fetch("/api/export/library", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `verso-backup-${new Date().toISOString().split("T")[0]}.zip`;
  a.click();
  URL.revokeObjectURL(url);
};
```

Note: Check how the token is stored in the app — look at `packages/web/src/lib/auth.ts` for `getAccessToken()` and use that instead of direct localStorage if available.

- [ ] **Step 3: Verify build**

```bash
cd packages/web && pnpm build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layout/sidebar.tsx
git commit -m "feat: add stats, import, export links to sidebar"
```

---

## Task 9: OPDS Client Service

**Files:**
- Create: `packages/server/src/services/opds-client.ts`
- Create: `packages/server/src/__tests__/opds-client.test.ts`

- [ ] **Step 1: Install fast-xml-parser**

```bash
cd packages/server && pnpm add fast-xml-parser
```

- [ ] **Step 2: Write OPDS parsing tests**

Create `packages/server/src/__tests__/opds-client.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseOpdsCatalog } from "../services/opds-client.js";

const NAVIGATION_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>Test Library</title>
  <entry>
    <title>Popular</title>
    <link rel="subsection" href="/opds/popular" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">Most popular books</content>
  </entry>
  <entry>
    <title>Recent</title>
    <link rel="subsection" href="/opds/recent" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">Recently added</content>
  </entry>
</feed>`;

const ACQUISITION_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>All Books</title>
  <entry>
    <id>book-1</id>
    <title>Dune</title>
    <author><name>Frank Herbert</name></author>
    <summary>A science fiction masterpiece</summary>
    <link rel="http://opds-spec.org/acquisition" href="/download/book-1.epub" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/image" href="/covers/book-1.jpg" type="image/jpeg"/>
  </entry>
  <entry>
    <id>book-2</id>
    <title>Neuromancer</title>
    <author><name>William Gibson</name></author>
    <link rel="http://opds-spec.org/acquisition" href="/download/book-2.epub" type="application/epub+zip"/>
  </entry>
  <link rel="next" href="/opds/all?page=2" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
</feed>`;

describe("OPDS client", () => {
  describe("parseOpdsCatalog", () => {
    it("parses navigation feed into navigation entries", () => {
      const result = parseOpdsCatalog(NAVIGATION_FEED);
      expect(result.type).toBe("navigation");
      expect(result.title).toBe("Test Library");
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toEqual({
        title: "Popular",
        href: "/opds/popular",
        description: "Most popular books",
      });
    });

    it("parses acquisition feed into book entries", () => {
      const result = parseOpdsCatalog(ACQUISITION_FEED);
      expect(result.type).toBe("acquisition");
      expect(result.entries).toHaveLength(2);

      const dune = result.entries[0];
      expect(dune.id).toBe("book-1");
      expect(dune.title).toBe("Dune");
      expect(dune.author).toBe("Frank Herbert");
      expect(dune.summary).toBe("A science fiction masterpiece");
      expect(dune.acquisitionUrl).toBe("/download/book-1.epub");
      expect(dune.coverUrl).toBe("/covers/book-1.jpg");
      expect(dune.format).toBe("epub");
    });

    it("extracts next page link", () => {
      const result = parseOpdsCatalog(ACQUISITION_FEED);
      expect(result.nextUrl).toBe("/opds/all?page=2");
    });

    it("handles entry without cover", () => {
      const result = parseOpdsCatalog(ACQUISITION_FEED);
      expect(result.entries[1].coverUrl).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/server && pnpm test -- --run -t "OPDS client"
```

Expected: FAIL — module doesn't exist yet.

- [ ] **Step 4: Implement OPDS client**

Create `packages/server/src/services/opds-client.ts`:

```typescript
import { XMLParser } from "fast-xml-parser";

export type OpdsNavigationEntry = {
  title: string;
  href: string;
  description?: string;
};

export type OpdsBookEntry = {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  acquisitionUrl: string;
  coverUrl?: string;
  format?: string;
};

export type OpdsCatalog = {
  title: string;
  nextUrl?: string;
} & (
  | { type: "navigation"; entries: OpdsNavigationEntry[] }
  | { type: "acquisition"; entries: OpdsBookEntry[] }
);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["entry", "link"].includes(name),
});

function asArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function getFormat(type: string): string | undefined {
  if (type.includes("epub")) return "epub";
  if (type.includes("pdf")) return "pdf";
  return undefined;
}

export function parseOpdsCatalog(xml: string): OpdsCatalog {
  const parsed = parser.parse(xml);
  const feed = parsed.feed;
  const title = feed.title || "Catalog";
  const entries = asArray(feed.entry);
  const feedLinks = asArray(feed.link);

  const nextLink = feedLinks.find((l: any) => l["@_rel"] === "next");
  const nextUrl = nextLink?.["@_href"];

  // Determine type: if any entry has an acquisition link, it's an acquisition feed
  const isAcquisition = entries.some((entry: any) => {
    const links = asArray(entry.link);
    return links.some((l: any) =>
      l["@_rel"]?.startsWith("http://opds-spec.org/acquisition")
    );
  });

  if (isAcquisition) {
    const bookEntries: OpdsBookEntry[] = entries.map((entry: any) => {
      const links = asArray(entry.link);
      const acqLink = links.find((l: any) =>
        l["@_rel"]?.startsWith("http://opds-spec.org/acquisition")
      );
      const imgLink = links.find((l: any) =>
        l["@_rel"] === "http://opds-spec.org/image"
      );

      const authorObj = entry.author;
      const author = authorObj?.name ?? (typeof authorObj === "string" ? authorObj : undefined);

      return {
        id: entry.id || "",
        title: entry.title || "Untitled",
        author,
        summary: entry.summary || entry.content?.["#text"] || entry.content,
        acquisitionUrl: acqLink?.["@_href"] || "",
        coverUrl: imgLink?.["@_href"],
        format: acqLink ? getFormat(acqLink["@_type"] || "") : undefined,
      };
    });

    return { type: "acquisition", title, entries: bookEntries, nextUrl };
  }

  // Navigation feed
  const navEntries: OpdsNavigationEntry[] = entries.map((entry: any) => {
    const links = asArray(entry.link);
    const navLink = links.find(
      (l: any) => l["@_rel"] === "subsection" || l["@_type"]?.includes("opds-catalog")
    );
    return {
      title: entry.title || "Untitled",
      href: navLink?.["@_href"] || "",
      description: entry.content?.["#text"] || entry.content || undefined,
    };
  });

  return { type: "navigation", title, entries: navEntries, nextUrl };
}

export async function fetchOpdsCatalog(
  url: string,
  credentials?: { username: string; password: string }
): Promise<OpdsCatalog> {
  const headers: Record<string, string> = {};
  if (credentials) {
    const basic = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`OPDS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const catalog = parseOpdsCatalog(xml);

  // Resolve relative URLs
  const baseUrl = new URL(url);
  const resolveUrl = (href: string) => {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  };

  if (catalog.nextUrl) catalog.nextUrl = resolveUrl(catalog.nextUrl);

  if (catalog.type === "navigation") {
    catalog.entries.forEach((e) => { e.href = resolveUrl(e.href); });
  } else {
    catalog.entries.forEach((e) => {
      e.acquisitionUrl = resolveUrl(e.acquisitionUrl);
      if (e.coverUrl) e.coverUrl = resolveUrl(e.coverUrl);
    });
  }

  return catalog;
}

export async function downloadBook(
  url: string,
  credentials?: { username: string; password: string }
): Promise<{ buffer: Buffer; contentType: string }> {
  const headers: Record<string, string> = {};
  if (credentials) {
    const basic = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { buffer, contentType };
}
```

- [ ] **Step 5: Run OPDS tests**

```bash
cd packages/server && pnpm test -- --run -t "OPDS client"
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/opds-client.ts packages/server/src/__tests__/opds-client.test.ts packages/server/package.json packages/server/pnpm-lock.yaml
git commit -m "feat: add OPDS catalog parser and client"
```

Note: the pnpm-lock.yaml is at the repo root, so:

```bash
git add packages/server/src/services/opds-client.ts packages/server/src/__tests__/opds-client.test.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat: add OPDS catalog parser and client"
```

---

## Task 10: Import Routes (OPDS Browse + Import Stream)

**Files:**
- Create: `packages/server/src/routes/import.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create the import routes**

Create `packages/server/src/routes/import.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { books } from "@verso/shared";
import { fetchOpdsCatalog, downloadBook } from "../services/opds-client.js";
import { parseEpub } from "../services/epub-parser.js";
import { parsePdf } from "../services/pdf-parser.js";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import { createAuthHook } from "../middleware/auth.js";
import sharp from "sharp";

export function registerImportRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAuthHook(config);

  // Browse OPDS catalog
  app.post<{
    Body: { url: string; username?: string; password?: string };
  }>(
    "/api/import/opds/browse",
    { preHandler: authHook },
    async (req, reply) => {
      const { url, username, password } = req.body as any;
      if (!url) return reply.status(400).send({ error: "URL is required" });

      const credentials = username && password ? { username, password } : undefined;
      const catalog = await fetchOpdsCatalog(url, credentials);
      return reply.send(catalog);
    }
  );

  // Import books via SSE
  app.post<{
    Body: {
      url: string;
      username?: string;
      password?: string;
      entries: {
        id: string;
        title: string;
        author?: string;
        acquisitionUrl: string;
        coverUrl?: string;
        format?: string;
      }[];
    };
  }>(
    "/api/import/opds/stream",
    { preHandler: authHook },
    async (req, reply) => {
      const { username, password, entries } = req.body as any;
      const user = req.user!;

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const send = (data: object) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const credentials = username && password ? { username, password } : undefined;

      let completed = 0;
      let failed = 0;

      for (const entry of entries) {
        try {
          send({ type: "progress", id: entry.id, title: entry.title, status: "downloading" });

          const { buffer } = await downloadBook(entry.acquisitionUrl, credentials);

          send({ type: "progress", id: entry.id, title: entry.title, status: "processing" });

          const ext = entry.format || "epub";
          const bookId = crypto.randomUUID();
          const fileHash = createHash("sha256").update(buffer).digest("hex");
          const filePath = `books/${bookId}/book.${ext}`;
          await storage.put(filePath, buffer);

          // Parse metadata from downloaded file
          const fullFilePath = storage.fullPath(filePath);
          let metadata;
          try {
            if (ext === "epub") {
              metadata = await parseEpub(fullFilePath);
            } else if (ext === "pdf") {
              metadata = await parsePdf(fullFilePath);
            } else {
              metadata = { title: entry.title, author: entry.author || "Unknown Author" };
            }
          } catch {
            metadata = { title: entry.title, author: entry.author || "Unknown Author" };
          }

          // Process cover
          let coverPath: string | undefined;
          if (entry.coverUrl) {
            try {
              const coverRes = await downloadBook(entry.coverUrl, credentials);
              const coverBuffer = await sharp(coverRes.buffer)
                .resize(600, undefined, { withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
              coverPath = `covers/${bookId}.jpg`;
              await storage.put(coverPath, coverBuffer);
            } catch {
              // Cover download/processing failed, continue without
            }
          } else if (metadata.coverData) {
            try {
              const coverBuffer = await sharp(metadata.coverData)
                .resize(600, undefined, { withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
              coverPath = `covers/${bookId}.jpg`;
              await storage.put(coverPath, coverBuffer);
            } catch {
              // Cover processing failed
            }
          }

          await db.insert(books).values({
            id: bookId,
            title: metadata.title || entry.title,
            author: metadata.author || entry.author || "Unknown Author",
            isbn: metadata.isbn,
            publisher: metadata.publisher,
            year: metadata.year,
            language: metadata.language,
            description: metadata.description,
            genre: metadata.genre,
            tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
            coverPath: coverPath || null,
            filePath,
            fileFormat: ext,
            fileSize: buffer.length,
            fileHash,
            pageCount: metadata.pageCount,
            series: metadata.series,
            seriesIndex: metadata.seriesIndex,
            addedBy: user.sub,
            metadataSource: "opds-import",
          });

          completed++;
          send({ type: "progress", id: entry.id, title: entry.title, status: "complete" });
        } catch (err: any) {
          failed++;
          send({ type: "progress", id: entry.id, title: entry.title, status: "failed", error: err.message });
        }
      }

      send({ type: "done", completed, failed, total: entries.length });
      reply.raw.end();
    }
  );
}
```

- [ ] **Step 2: Register import routes in app.ts**

In `packages/server/src/app.ts`, add:

```typescript
import { registerImportRoutes } from "./routes/import.js";
```

And after the existing route registrations:

```typescript
registerImportRoutes(app, db, storage, config);
```

- [ ] **Step 3: Verify build**

```bash
cd packages/server && pnpm build 2>&1 | tail -5
```

Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/import.ts packages/server/src/app.ts
git commit -m "feat: add OPDS browse and import SSE routes"
```

---

## Task 11: Library Export Service + Route

**Files:**
- Create: `packages/server/src/services/library-export.ts`
- Create: `packages/server/src/routes/export.ts`
- Create: `packages/server/src/__tests__/library-export.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Install archiver**

```bash
cd packages/server && pnpm add archiver && pnpm add -D @types/archiver
```

- [ ] **Step 2: Write export service tests**

Create `packages/server/src/__tests__/library-export.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, readingProgress, annotations, shelves, shelfBooks, readingSessions } from "@verso/shared";
import { buildExportData } from "../services/library-export.js";

describe("library export", () => {
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

    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Dune",
      author: "Frank Herbert",
      filePath: `books/${bookId}.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await ctx.db.insert(readingProgress).values({
      userId,
      bookId,
      percentage: 50,
      timeSpentMinutes: 120,
      startedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });
  });

  it("builds export data with all user content", async () => {
    const data = await buildExportData(ctx.db, userId);
    expect(data.metadata.version).toBe(1);
    expect(data.metadata.books).toHaveLength(1);
    expect(data.metadata.books[0].title).toBe("Dune");
    expect(data.progress.readingProgress).toHaveLength(1);
    expect(data.progress.readingProgress[0].percentage).toBe(50);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/server && pnpm test -- --run -t "library export"
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement export service**

Create `packages/server/src/services/library-export.ts`:

```typescript
import { eq } from "drizzle-orm";
import {
  books,
  readingProgress,
  annotations,
  shelves,
  shelfBooks,
  readingSessions,
} from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

export async function buildExportData(db: AppDatabase, userId: string) {
  const userBooks = await db.select().from(books).where(eq(books.addedBy, userId));

  const userShelves = await db.select().from(shelves).where(eq(shelves.userId, userId));

  const shelfBookRows = userShelves.length > 0
    ? await db.select().from(shelfBooks)
    : [];
  // Filter to only shelves belonging to this user
  const shelfIds = new Set(userShelves.map((s) => s.id));
  const userShelfBooks = shelfBookRows.filter((sb) => shelfIds.has(sb.shelfId));

  const userAnnotations = await db
    .select()
    .from(annotations)
    .where(eq(annotations.userId, userId));

  const userProgress = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.userId, userId));

  const userSessions = await db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.userId, userId));

  return {
    metadata: {
      version: 1,
      exportedAt: new Date().toISOString(),
      books: userBooks.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        isbn: b.isbn,
        publisher: b.publisher,
        year: b.year,
        language: b.language,
        description: b.description,
        genre: b.genre,
        tags: b.tags,
        filePath: b.filePath,
        fileFormat: b.fileFormat,
        fileSize: b.fileSize,
        fileHash: b.fileHash,
        pageCount: b.pageCount,
        series: b.series,
        seriesIndex: b.seriesIndex,
        coverPath: b.coverPath,
      })),
      shelves: userShelves.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        emoji: s.emoji,
        isSmart: s.isSmart,
        isDefault: s.isDefault,
        smartFilter: s.smartFilter,
        position: s.position,
      })),
      shelfBooks: userShelfBooks.map((sb) => ({
        shelfId: sb.shelfId,
        bookId: sb.bookId,
        position: sb.position,
      })),
    },
    annotations: {
      version: 1,
      items: userAnnotations.map((a) => ({
        bookId: a.bookId,
        type: a.type,
        content: a.content,
        note: a.note,
        cfiPosition: a.cfiPosition,
        cfiEnd: a.cfiEnd,
        color: a.color,
        chapter: a.chapter,
        createdAt: a.createdAt,
      })),
    },
    progress: {
      version: 1,
      readingProgress: userProgress.map((p) => ({
        bookId: p.bookId,
        percentage: p.percentage,
        cfiPosition: p.cfiPosition,
        currentPage: p.currentPage,
        timeSpentMinutes: p.timeSpentMinutes,
        startedAt: p.startedAt,
        lastReadAt: p.lastReadAt,
        finishedAt: p.finishedAt,
      })),
      readingSessions: userSessions.map((s) => ({
        bookId: s.bookId,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMinutes: s.durationMinutes,
      })),
    },
  };
}
```

- [ ] **Step 5: Create export route**

Create `packages/server/src/routes/export.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import archiver from "archiver";
import { buildExportData } from "../services/library-export.js";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import { createAuthHook } from "../middleware/auth.js";

export function registerExportRoute(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAuthHook(config);

  app.get(
    "/api/export/library",
    { preHandler: authHook },
    async (req, reply) => {
      const user = req.user!;
      const data = await buildExportData(db, user.sub);
      const dateStr = new Date().toISOString().split("T")[0];

      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="verso-backup-${dateStr}.zip"`,
      });

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(reply.raw);

      // Add JSON data files
      archive.append(JSON.stringify(data.metadata, null, 2), {
        name: `verso-backup-${dateStr}/metadata.json`,
      });
      archive.append(JSON.stringify(data.annotations, null, 2), {
        name: `verso-backup-${dateStr}/annotations.json`,
      });
      archive.append(JSON.stringify(data.progress, null, 2), {
        name: `verso-backup-${dateStr}/progress.json`,
      });

      // Add book files and covers
      for (const book of data.metadata.books) {
        try {
          const filePath = storage.fullPath(book.filePath);
          archive.file(filePath, {
            name: `verso-backup-${dateStr}/books/${book.id}-${sanitize(book.title)}.${book.fileFormat}`,
          });
        } catch {
          // File missing — skip
        }

        if (book.coverPath) {
          try {
            const coverFullPath = storage.fullPath(book.coverPath);
            archive.file(coverFullPath, {
              name: `verso-backup-${dateStr}/covers/${book.id}.jpg`,
            });
          } catch {
            // Cover missing — skip
          }
        }
      }

      await archive.finalize();
    }
  );
}

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}
```

- [ ] **Step 6: Register export route in app.ts**

In `packages/server/src/app.ts`, add:

```typescript
import { registerExportRoute } from "./routes/export.js";
```

And after the import routes registration:

```typescript
registerExportRoute(app, db, storage, config);
```

- [ ] **Step 7: Run export tests**

```bash
cd packages/server && pnpm test -- --run -t "library export"
```

Expected: all tests pass.

- [ ] **Step 8: Verify build**

```bash
cd packages/server && pnpm build 2>&1 | tail -5
```

Expected: compiles successfully.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/services/library-export.ts packages/server/src/routes/export.ts packages/server/src/__tests__/library-export.test.ts packages/server/src/app.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat: add library ZIP export with streaming"
```

---

## Task 12: Library Restore Route

**Files:**
- Create: `packages/server/src/services/library-import.ts`
- Modify: `packages/server/src/routes/import.ts`

- [ ] **Step 1: Create library import service**

Create `packages/server/src/services/library-import.ts`:

```typescript
import { eq } from "drizzle-orm";
import {
  books,
  readingProgress,
  annotations,
  shelves,
  shelfBooks,
  readingSessions,
} from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

type ExportMetadata = {
  version: number;
  books: any[];
  shelves: any[];
  shelfBooks: any[];
};

type ExportAnnotations = {
  version: number;
  items: any[];
};

type ExportProgress = {
  version: number;
  readingProgress: any[];
  readingSessions: any[];
};

export async function restoreLibrary(
  db: AppDatabase,
  userId: string,
  metadata: ExportMetadata,
  annotationsData: ExportAnnotations,
  progressData: ExportProgress,
  bookIdMap: Map<string, string> // old bookId → new bookId
) {
  // Insert books (IDs remapped by caller after file copy)
  for (const book of metadata.books) {
    const newId = bookIdMap.get(book.id) || book.id;
    await db.insert(books).values({
      id: newId,
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      publisher: book.publisher,
      year: book.year,
      language: book.language,
      description: book.description,
      genre: book.genre,
      tags: book.tags,
      filePath: book.filePath,
      fileFormat: book.fileFormat,
      fileSize: book.fileSize,
      fileHash: book.fileHash,
      pageCount: book.pageCount,
      series: book.series,
      seriesIndex: book.seriesIndex,
      coverPath: book.coverPath,
      addedBy: userId,
      metadataSource: "import",
    }).onConflictDoNothing();
  }

  // Insert shelves
  const shelfIdMap = new Map<string, string>();
  for (const shelf of metadata.shelves) {
    const newShelfId = crypto.randomUUID();
    shelfIdMap.set(shelf.id, newShelfId);
    await db.insert(shelves).values({
      id: newShelfId,
      name: shelf.name,
      description: shelf.description,
      emoji: shelf.emoji,
      userId,
      isSmart: shelf.isSmart,
      isDefault: false, // Don't import as default — user has their own defaults
      smartFilter: shelf.smartFilter,
      position: shelf.position,
    }).onConflictDoNothing();
  }

  // Insert shelf-book assignments
  for (const sb of metadata.shelfBooks) {
    const newShelfId = shelfIdMap.get(sb.shelfId);
    const newBookId = bookIdMap.get(sb.bookId);
    if (newShelfId && newBookId) {
      await db.insert(shelfBooks).values({
        shelfId: newShelfId,
        bookId: newBookId,
        position: sb.position,
      }).onConflictDoNothing();
    }
  }

  // Insert annotations
  for (const ann of annotationsData.items) {
    const newBookId = bookIdMap.get(ann.bookId);
    if (!newBookId) continue;
    await db.insert(annotations).values({
      userId,
      bookId: newBookId,
      type: ann.type,
      content: ann.content,
      note: ann.note,
      cfiPosition: ann.cfiPosition,
      cfiEnd: ann.cfiEnd,
      color: ann.color,
      chapter: ann.chapter,
    }).onConflictDoNothing();
  }

  // Insert reading progress
  for (const prog of progressData.readingProgress) {
    const newBookId = bookIdMap.get(prog.bookId);
    if (!newBookId) continue;
    await db.insert(readingProgress).values({
      userId,
      bookId: newBookId,
      percentage: prog.percentage,
      cfiPosition: prog.cfiPosition,
      currentPage: prog.currentPage,
      timeSpentMinutes: prog.timeSpentMinutes,
      startedAt: prog.startedAt,
      lastReadAt: prog.lastReadAt,
      finishedAt: prog.finishedAt,
    }).onConflictDoNothing();
  }

  // Insert reading sessions
  for (const sess of progressData.readingSessions) {
    const newBookId = bookIdMap.get(sess.bookId);
    if (!newBookId) continue;
    await db.insert(readingSessions).values({
      userId,
      bookId: newBookId,
      startedAt: sess.startedAt,
      endedAt: sess.endedAt,
      durationMinutes: sess.durationMinutes,
    }).onConflictDoNothing();
  }
}
```

- [ ] **Step 2: Add restore route to import.ts**

Add the following to the end of `registerImportRoutes` in `packages/server/src/routes/import.ts`:

```typescript
import { restoreLibrary } from "../services/library-import.js";
import yauzl from "yauzl-promise";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
```

Add these imports at the top, then add the route inside `registerImportRoutes`:

```typescript
  // Restore from backup ZIP
  app.post(
    "/api/import/restore",
    { preHandler: authHook },
    async (req, reply) => {
      const user = req.user!;
      const data = await req.file();

      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const buffer = await data.toBuffer();

      // Write to temp file for yauzl
      const tmpPath = path.join(os.tmpdir(), `verso-restore-${Date.now()}.zip`);
      await fs.writeFile(tmpPath, buffer);

      try {
        const zip = await yauzl.open(tmpPath);
        const jsonFiles: Record<string, any> = {};
        const bookFiles: { entryName: string; bookId: string; ext: string }[] = [];
        const coverFiles: { entryName: string; bookId: string }[] = [];

        for await (const entry of zip) {
          const name = entry.filename;

          if (name.endsWith("metadata.json")) {
            const stream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(chunk as Buffer);
            jsonFiles.metadata = JSON.parse(Buffer.concat(chunks).toString());
          } else if (name.endsWith("annotations.json")) {
            const stream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(chunk as Buffer);
            jsonFiles.annotations = JSON.parse(Buffer.concat(chunks).toString());
          } else if (name.endsWith("progress.json")) {
            const stream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(chunk as Buffer);
            jsonFiles.progress = JSON.parse(Buffer.concat(chunks).toString());
          } else if (name.includes("/books/")) {
            // Extract bookId from filename: {bookId}-{title}.{ext}
            const basename = name.split("/").pop() || "";
            const dashIdx = basename.indexOf("-");
            if (dashIdx > 0) {
              const bookId = basename.slice(0, dashIdx);
              const ext = basename.split(".").pop() || "epub";
              bookFiles.push({ entryName: name, bookId, ext });
            }
          } else if (name.includes("/covers/")) {
            const basename = name.split("/").pop() || "";
            const bookId = basename.replace(/\.[^.]+$/, "");
            coverFiles.push({ entryName: name, bookId });
          }
        }

        await zip.close();

        if (!jsonFiles.metadata) {
          return reply.status(400).send({ error: "Invalid backup: missing metadata.json" });
        }

        // Re-open ZIP for file extraction
        const zip2 = await yauzl.open(tmpPath);
        const bookIdMap = new Map<string, string>();

        // Copy book files
        for await (const entry of zip2) {
          const bookFile = bookFiles.find((bf) => bf.entryName === entry.filename);
          if (bookFile) {
            const newBookId = crypto.randomUUID();
            bookIdMap.set(bookFile.bookId, newBookId);
            const filePath = `books/${newBookId}/book.${bookFile.ext}`;
            const stream = await entry.openReadStream();
            const chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(chunk as Buffer);
            await storage.put(filePath, Buffer.concat(chunks));

            // Update filePath in metadata
            const metaBook = jsonFiles.metadata.books.find((b: any) => b.id === bookFile.bookId);
            if (metaBook) metaBook.filePath = filePath;
          }

          const coverFile = coverFiles.find((cf) => cf.entryName === entry.filename);
          if (coverFile) {
            const newBookId = bookIdMap.get(coverFile.bookId);
            if (newBookId) {
              const coverPath = `covers/${newBookId}.jpg`;
              const stream = await entry.openReadStream();
              const chunks: Buffer[] = [];
              for await (const chunk of stream) chunks.push(chunk as Buffer);
              await storage.put(coverPath, Buffer.concat(chunks));

              // Update coverPath in metadata
              const metaBook = jsonFiles.metadata.books.find((b: any) => b.id === coverFile.bookId);
              if (metaBook) metaBook.coverPath = coverPath;
            }
          }
        }

        await zip2.close();

        // Restore database records
        await restoreLibrary(
          db,
          user.sub,
          jsonFiles.metadata,
          jsonFiles.annotations || { version: 1, items: [] },
          jsonFiles.progress || { version: 1, readingProgress: [], readingSessions: [] },
          bookIdMap
        );

        return reply.send({
          success: true,
          imported: {
            books: jsonFiles.metadata.books.length,
            shelves: jsonFiles.metadata.shelves?.length ?? 0,
            annotations: jsonFiles.annotations?.items?.length ?? 0,
          },
        });
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }
    }
  );
```

- [ ] **Step 3: Verify build**

```bash
cd packages/server && pnpm build 2>&1 | tail -5
```

Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/library-import.ts packages/server/src/routes/import.ts
git commit -m "feat: add library restore from backup ZIP"
```

---

## Task 13: Import Page UI

**Files:**
- Create: `packages/web/src/routes/_app/import.tsx`
- Create: `packages/web/src/components/import/opds-import.tsx`
- Create: `packages/web/src/components/import/restore-backup.tsx`

- [ ] **Step 1: Create OPDS import component**

Create `packages/web/src/components/import/opds-import.tsx`:

```tsx
import { useState } from "react";
import { getAccessToken } from "@/lib/auth";

type OpdsBookEntry = {
  id: string;
  title: string;
  author?: string;
  acquisitionUrl: string;
  coverUrl?: string;
  format?: string;
};

type CatalogResult = {
  type: "navigation" | "acquisition";
  title: string;
  entries: any[];
  nextUrl?: string;
};

type ImportStatus = {
  id: string;
  title: string;
  status: "downloading" | "processing" | "complete" | "failed";
  error?: string;
};

export function OpdsImport() {
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [statuses, setStatuses] = useState<ImportStatus[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = async (browseUrl: string) => {
    setBrowsing(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch("/api/import/opds/browse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: browseUrl,
          ...(username && { username }),
          ...(password && { password }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      setCatalog(data);
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBrowsing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!catalog || catalog.type !== "acquisition") return;
    const allIds = catalog.entries.map((e: OpdsBookEntry) => e.id);
    setSelected(new Set(allIds));
  };

  const startImport = async () => {
    if (!catalog || catalog.type !== "acquisition") return;
    const entries = catalog.entries.filter((e: OpdsBookEntry) => selected.has(e.id));
    if (entries.length === 0) return;

    setImporting(true);
    setStatuses(entries.map((e: OpdsBookEntry) => ({ id: e.id, title: e.title, status: "downloading" })));

    const token = getAccessToken();
    const res = await fetch("/api/import/opds/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...(username && { username }),
        ...(password && { password }),
        entries,
      }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "progress") {
                setStatuses((prev) =>
                  prev.map((s) =>
                    s.id === event.id
                      ? { ...s, status: event.status, error: event.error }
                      : s
                  )
                );
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    }

    setImporting(false);
  };

  return (
    <div>
      {/* Connection form */}
      {!catalog && (
        <div className="space-y-3">
          <input
            type="url"
            placeholder="OPDS server URL (e.g. http://booklore:6060/api/v1/opds)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm"
            style={{ backgroundColor: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Username (optional)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
            <input
              type="password"
              placeholder="Password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <button
            onClick={() => browse(url)}
            disabled={!url || browsing}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--warm)" }}
          >
            {browsing ? "Connecting..." : "Connect"}
          </button>
        </div>
      )}

      {/* Catalog browser */}
      {catalog && !importing && statuses.length === 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {catalog.title}
            </h3>
            <button
              onClick={() => setCatalog(null)}
              className="text-xs"
              style={{ color: "var(--text-faint)" }}
            >
              ← Back
            </button>
          </div>

          {catalog.type === "navigation" && (
            <div className="space-y-2">
              {catalog.entries.map((entry: any, i: number) => (
                <button
                  key={i}
                  onClick={() => browse(entry.href)}
                  className="w-full text-left rounded-lg px-4 py-3 transition-colors hover:opacity-80"
                  style={{ backgroundColor: "var(--card)" }}
                >
                  <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                    📁 {entry.title}
                  </div>
                  {entry.description && (
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {entry.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {catalog.type === "acquisition" && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={selectAll}
                  className="text-xs px-3 py-1 rounded-full border"
                  style={{ color: "var(--text-dim)", borderColor: "var(--border)" }}
                >
                  Select all ({catalog.entries.length})
                </button>
                {selected.size > 0 && (
                  <button
                    onClick={startImport}
                    className="text-sm px-5 py-1.5 rounded-full font-semibold text-white"
                    style={{ backgroundColor: "var(--warm)" }}
                  >
                    Import {selected.size} books
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {catalog.entries.map((entry: OpdsBookEntry) => (
                  <button
                    key={entry.id}
                    onClick={() => toggleSelect(entry.id)}
                    className="w-full text-left flex items-center gap-3 rounded-lg px-4 py-3 transition-colors"
                    style={{
                      backgroundColor: selected.has(entry.id) ? "var(--warm-glow)" : "var(--card)",
                      borderLeft: selected.has(entry.id) ? "3px solid var(--warm)" : "3px solid transparent",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                        {entry.title}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                        {entry.author || "Unknown"} · {entry.format?.toUpperCase() || "EPUB"}
                      </div>
                    </div>
                    <div
                      className="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {selected.has(entry.id) && (
                        <span style={{ color: "var(--warm)" }}>✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import progress */}
      {(importing || statuses.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>
            {importing ? "Importing..." : "Import Complete"}
          </h3>
          {statuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg px-4 py-3"
              style={{ backgroundColor: "var(--card)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: "var(--text)" }}>
                  {s.title}
                </div>
              </div>
              {s.status === "downloading" && (
                <span className="text-xs" style={{ color: "var(--warm)" }}>Downloading...</span>
              )}
              {s.status === "processing" && (
                <span className="text-xs" style={{ color: "var(--warm)" }}>Processing...</span>
              )}
              {s.status === "complete" && (
                <span className="text-xs" style={{ color: "var(--green)" }}>✓ Done</span>
              )}
              {s.status === "failed" && (
                <span className="text-xs text-red-500">{s.error || "Failed"}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create restore backup component**

Create `packages/web/src/components/import/restore-backup.tsx`:

```tsx
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { getAccessToken } from "@/lib/auth";

export function RestoreBackup() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ books: number; shelves: number; annotations: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    try {
      const token = getAccessToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import/restore", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Restore failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data.imported);
      setStatus("done");
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    maxFiles: 1,
  });

  if (status === "done" && result) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "var(--card)" }}>
        <div className="text-lg font-display font-semibold mb-2" style={{ color: "var(--green)" }}>
          Restore Complete
        </div>
        <div className="text-sm" style={{ color: "var(--text-dim)" }}>
          Imported {result.books} books, {result.shelves} shelves, {result.annotations} annotations
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
        style={{
          borderColor: isDragActive ? "var(--warm)" : "var(--border)",
          backgroundColor: isDragActive ? "var(--warm-glow)" : "var(--card)",
        }}
      >
        <input {...getInputProps()} />
        <p className="text-sm font-medium" style={{ color: isDragActive ? "var(--warm)" : "var(--text)" }}>
          {status === "uploading" ? "Restoring..." : "Drop a Verso backup ZIP here"}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
          or click to browse
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-500 mt-2">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the import hub page**

Create `packages/web/src/routes/_app/import.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OpdsImport } from "@/components/import/opds-import";
import { RestoreBackup } from "@/components/import/restore-backup";

type Tab = "opds" | "restore";

export const Route = createFileRoute("/_app/import")({
  component: ImportPage,
});

function ImportPage() {
  const [tab, setTab] = useState<Tab>("opds");

  const tabs: { label: string; value: Tab }[] = [
    { label: "OPDS Import", value: "opds" },
    { label: "Restore Backup", value: "restore" },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <h1
        className="font-display text-[26px] font-bold mb-6"
        style={{ color: "var(--text)" }}
      >
        Import
      </h1>

      {/* Tab selector */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ backgroundColor: "var(--card)" }}>
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: tab === t.value ? "var(--warm)" : "transparent",
              color: tab === t.value ? "white" : "var(--text-dim)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "opds" && <OpdsImport />}
      {tab === "restore" && <RestoreBackup />}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd packages/web && pnpm build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/_app/import.tsx packages/web/src/components/import/opds-import.tsx packages/web/src/components/import/restore-backup.tsx
git commit -m "feat: add import page with OPDS browser and backup restore"
```

---

## Task 14: Browser Test — Full Flow Verification

**Files:** None created — manual verification.

- [ ] **Step 1: Start dev server**

```bash
cd /Users/michaelkusche/dev/verso && ./dev.sh
```

- [ ] **Step 2: Verify stats page**

Open `http://localhost:5173/stats` in browser. Confirm:
- Time range selector renders with Week/Month/Year/All Time pills
- Summary cards show (with zeros if no reading data)
- Chart area shows "No reading data" placeholder
- Sidebar shows Stats link that navigates correctly

- [ ] **Step 3: Verify import page**

Open `http://localhost:5173/import` in browser. Confirm:
- Tab selector shows OPDS Import / Restore Backup
- OPDS form renders with URL, username, password fields
- Restore tab shows drop zone for ZIP file

- [ ] **Step 4: Verify export button**

Click "Export Library" in sidebar footer. Confirm:
- ZIP file downloads
- Contains `metadata.json`, `annotations.json`, `progress.json`
- Book files included if any exist

- [ ] **Step 5: Test OPDS import with BookLore (if accessible)**

Enter BookLore OPDS URL, connect, browse catalog, select a book, import it. Confirm:
- Catalog navigation works
- Book selection works
- SSE progress updates display
- Book appears in library after import

- [ ] **Step 6: Run full test suites**

```bash
cd packages/server && pnpm test -- --run
cd packages/web && pnpm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during browser testing"
```
