# Enhanced Home Dashboard

## Goal

Make the home page feel like a personalized reading dashboard — not just a list of shelves. Add 3 new sections that help users discover unread books, track progress, and stay motivated.

## Current State

The home page (`packages/web/src/routes/_app/home.tsx`) has 3 sections:
1. **Continue Reading** — books with active progress, sorted by `lastReadAt`
2. **Recently Added** — last 10 books by `createdAt`
3. **Your Shelves** — all user shelves with book counts

## New Sections (in order)

### 1. Almost Finished

**Position:** After Continue Reading.

Shows books at **75%+ progress** that haven't been marked finished (`finishedAt IS NULL`). Uses the same card layout as Continue Reading (cover + title + author + progress bar) but with a green-tinted progress bar and a "~X pages left" hint calculated from `totalPages - currentPage`.

**Visibility:** Only rendered if at least 1 book qualifies.

**Data:** New tRPC endpoint `books.almostFinished` — query `readingProgress` where `percentage >= 75 AND finishedAt IS NULL AND startedAt IS NOT NULL`, joined with `books`, ordered by `percentage DESC`, limit 10.

### 2. Reading Stats Card

**Position:** After Almost Finished.

A single compact card with up to 4 stats in a horizontal row:

| Stat | Source | Hide when |
|------|--------|-----------|
| Day Streak | `stats.overview().currentStreak` | 0 |
| Finished This Month | `stats.overview().booksFinished` | 0 |
| Time Read This Month | `stats.overview().timeReadMinutes` | 0 |
| Books in Library | `books.list` total count | never (always show if card visible) |

**Visibility:** Hide the entire card if streak, finished, and time are all 0 (no reading activity). The "Books in Library" count alone is not enough to show the card — there must be at least one activity-based stat.

### 3. Recommended For You

**Position:** After Stats Card, before Recently Added.

A horizontal scroll row of book covers (same style as Recently Added) with a small italic "reason" line under each book.

**Recommendation logic (new tRPC endpoint `books.recommended`):**

1. Collect genres and authors from books the user has **finished** or is **currently reading** (has `startedAt`, no `finishedAt`).
2. Query books in the library that:
   - Match any of those genres OR authors
   - Have **no reading progress** for this user (never started)
3. Score and sort:
   - Same author as a read/reading book: priority 1
   - Same genre as a read/reading book: priority 2
4. Limit to 8 results.
5. Shuffle within each priority tier so the section doesn't feel static on reload.
6. Attach a `reason` string to each result:
   - Same author: `"More by {author}"` (using the author name)
   - Same genre: `"{genre} in your library"` (using the genre name)

**Visibility:** Only rendered if at least 1 book qualifies. If the user has no reading history at all, this section is hidden.

**Fallback:** If fewer than 3 recommendations are found via the logic above, backfill with random unread books (no reason line).

## Section Order (full page)

1. Welcome header
2. Continue Reading (existing)
3. Almost Finished (new)
4. Reading Stats Card (new)
5. Recommended For You (new)
6. Recently Added (existing)
7. Your Shelves (existing)

## API Changes

### New endpoints in `packages/server/src/trpc/routers/books.ts`:

**`books.almostFinished`**
- Input: none (uses auth context)
- Query: `readingProgress` JOIN `books` WHERE `percentage >= 75 AND finishedAt IS NULL AND startedAt IS NOT NULL`, ordered by `percentage DESC`, limit 10
- Returns: `Array<Book & { percentage: number, currentPage: number, totalPages: number }>`

**`books.recommended`**
- Input: `{ limit?: number }` (default 8)
- Logic:
  1. Get distinct genres/authors from user's read + reading books
  2. Find unread books matching those genres/authors
  3. Score, shuffle within tiers, attach reason string
- Returns: `Array<Book & { reason: string }>`

### Existing endpoint used:

**`stats.overview`** — already returns `currentStreak`, `booksFinished`, `timeReadMinutes`. Will be called with `range: "month"` for the stats card.

## Frontend Changes

### `packages/web/src/routes/_app/home.tsx`

- Add queries for `books.almostFinished`, `books.recommended`, and `stats.overview`
- Add 3 new section components (inline in the file or extracted if large)
- Each section conditionally renders based on data availability
- Responsive: mobile gets smaller covers in scroll rows, desktop gets larger covers

### New component: `AlmostFinishedRow`

Similar to `ContinueReadingRow` — horizontal scroll of cards with progress bars. Green-tinted bar color. Shows "~X pages left" instead of percentage.

### New component: `ReadingStatsCard`

Single card, horizontal flex layout with dividers. Each stat is a large number + small label. Hidden stats don't render (no empty slots). Entire card hidden if no activity stats.

### New component: `RecommendedRow`

Horizontal scroll of book covers (reuses `BookCover` component). Each book gets a small italic reason line below author name. Links to `/books/$id`.

## i18n Keys

```
home.almostFinished: "Almost Finished"
home.almostFinishedHint: "Finish these up!"
home.pagesLeft: "~{{count}} pages left"
home.readingStats: "Your Reading"
home.streak: "Day Streak"
home.finishedThisMonth: "Finished This Month"
home.timeReadThisMonth: "Read This Month"
home.booksInLibrary: "Books in Library"
home.recommendedForYou: "Recommended For You"
home.recommendedSubtitle: "Based on your reading"
home.moreby: "More by {{author}}"
home.genreInLibrary: "{{genre}} in your library"
```

## Out of Scope

- Browse by Genre section (not selected)
- Not Started / Unread section (not selected)
- Recently Finished section (not selected)
- Any external recommendation API — all logic is local, based on owned books
