# Series Normalization

**Date:** 2026-04-02
**Status:** Approved

## Problem

Series is stored as a free-text string on the `books` table with no normalization. "Dune Chronicles" and "dune chronicles" are separate strings with no relation. There is no way to browse books by series, filter smart shelves by series, or click a series name to see all its books.

## Solution

### 1. Series Table

Add a `bookSeries` table and a `seriesId` FK on `books`. Follow the same denormalized pattern as publishers: `books.series` stays as a display string, `books.seriesId` is the normalized FK. `books.seriesIndex` is unchanged.

**Schema:**

```sql
CREATE TABLE book_series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL (max 255),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE books ADD COLUMN series_id TEXT REFERENCES book_series(id) ON DELETE SET NULL;
```

Note: The table is named `book_series` (and the Drizzle export `bookSeries`) to avoid collision with the existing `books.series` column name in SQL contexts.

**`syncBookSeries(db, bookId, seriesString)` service:**

- If `seriesString` is null/empty, set `books.seriesId = null` and return
- Case-insensitive lookup in `bookSeries` table (`COLLATE NOCASE`)
- If found, use existing series ID
- If not found, create new series row
- Set `books.seriesId` to the resolved ID
- Update `books.series` to the canonical name from the `bookSeries` table (not the raw input)

**Entry points** (all places series values enter the system):

- `packages/server/src/routes/upload.ts` — after initial metadata extraction
- `packages/server/src/trpc/routers/books.ts` — `books.update` mutation
- `packages/server/src/trpc/routers/metadata.ts` — `applyFields` mutation

### 2. Series tRPC Router

New `seriesRouter` in `packages/server/src/trpc/routers/series.ts`:

- **`list`** — Returns all series with book counts. Supports optional `search` string filter. Ordered by book count descending. Used by the edit form combobox for autocomplete.
- **`update`** — Admin-only. Renames a series. If the new name matches an existing series (case-insensitive), auto-merges: reassigns all books from the renamed series to the existing one, then deletes the renamed series.

### 3. Edit UI Changes

**Series field** (`packages/web/src/routes/_app/books/$id_.edit.tsx`):

Replace the plain text `series` input with a single-select combobox (same pattern as `PublisherCombobox`). Type to search existing series via `series.list` tRPC query, select one, or type a new name. On save, the server's `syncBookSeries` handles deduplication.

`seriesIndex` remains as a number input, rendered side-by-side with the series combobox (both `half: true` in the classification group).

### 4. Book Detail Page — Clickable Series Link

**Book detail page** (`packages/web/src/routes/_app/books/$id.tsx`):

The series name (currently rendered as plain text "Book N of Series Name") becomes a clickable link. Clicking navigates to the search view filtered by that series, following the same pattern as genre navigation. The link goes to the book list/search route with a `series` query parameter.

### 5. Search — Series Filter

**Book list/search:**

Add a `series` filter parameter to `bookListInput` in `packages/shared/src/validators.ts`. When the `series` parameter is provided, filter books where `books.series` matches the value. When filtering by series, default sort to `seriesIndex ASC` (so books appear in reading order) instead of the default `recent`.

Add the series filter condition to both `books.list` and `books.search` procedures in `packages/server/src/trpc/routers/books.ts`.

### 6. Smart Shelf Filters

Add `series` to the `smartFilterField` enum in `packages/shared/src/shelf-validators.ts`.

Add `series` to the `columnMap` in `packages/server/src/trpc/routers/build-filter.ts`, mapping to `books.series`.

Add `series` to the filter builder UI field list in `packages/web/src/components/shelves/filter-builder.tsx`.

### 7. Migration

A startup migration function `migrateSeriesData(db)` in `packages/server/src/services/migrate-series.ts`:

- Selects all books where `series IS NOT NULL AND seriesId IS NULL`
- Groups by case-insensitive series name
- For each group: creates one `bookSeries` row using the most common casing as the canonical name
- Sets `books.seriesId` for all books in each group
- Called at app startup in `packages/server/src/app.ts` after the publisher migration

## Files Changed

| Layer | File | Change |
|-------|------|--------|
| Schema | `packages/shared/src/schema.ts` | Add `bookSeries` table, add `seriesId` FK to `books` |
| Shared | `packages/shared/src/index.ts` | Export new validators |
| Validators | `packages/shared/src/series-validators.ts` | New file: Zod validators for series router inputs |
| Validators | `packages/shared/src/validators.ts` | Add `series` param to `bookListInput` |
| Validators | `packages/shared/src/shelf-validators.ts` | Add `series` to `smartFilterField` enum |
| Service | `packages/server/src/services/sync-book-series.ts` | New file: `syncBookSeries()` |
| Service | `packages/server/src/services/migrate-series.ts` | New file: startup data migration |
| Router | `packages/server/src/trpc/routers/series.ts` | New file: `list`, `update` |
| Router | `packages/server/src/trpc/router.ts` | Register `seriesRouter` |
| Router | `packages/server/src/trpc/routers/books.ts` | Call `syncBookSeries` in `update`, add series filter to `list` and `search` |
| Router | `packages/server/src/trpc/routers/metadata.ts` | Call `syncBookSeries` in `applyFields` |
| Route | `packages/server/src/routes/upload.ts` | Call `syncBookSeries` after extraction |
| Filter | `packages/server/src/trpc/routers/build-filter.ts` | Add `series` to `columnMap` |
| App | `packages/server/src/app.ts` | Call `migrateSeriesData` at startup |
| UI | `packages/web/src/routes/_app/books/$id_.edit.tsx` | Series combobox replacing text input |
| UI | `packages/web/src/routes/_app/books/$id.tsx` | Clickable series link to search view |
| UI | `packages/web/src/components/shelves/filter-builder.tsx` | Add series to filter fields |
| Migration | `packages/server/drizzle/` | Schema migration for `bookSeries` table + `seriesId` FK |
| Tests | `packages/server/src/__tests__/sync-book-series.test.ts` | New file |
| Tests | `packages/server/src/__tests__/series.test.ts` | New file |

## Out of Scope

- Dedicated series browse/detail page (not needed — clicking series goes to filtered search view)
- Series enrichment from external APIs (only Goodreads provides series data, already works)
- Series cover/description (no separate metadata for series entities)
- OPDS series feed (could be added later)
- FTS5 indexing of series column (could be added later if search needs it)
