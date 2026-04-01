# Publisher & Language Normalization

**Date:** 2026-04-01
**Status:** Approved

## Problem

Publishers and languages are stored as free-text strings on the `books` table with no normalization. This causes:

- **Publishers:** Duplicates like "Penguin Books", "penguin books", "Penguin Books Ltd" all stored as separate strings with no way to merge or deduplicate.
- **Languages:** Different sources produce different formats — ISO 639-1 (`en`), ISO 639-2/B (`eng`), ISO 639-2/T (`deu`), full names (`German`) — all stored as-is, making filtering unreliable.

## Solution

### 1. Publishers Table

Add a `publishers` table and a `publisherId` FK on `books`. Follow the same denormalized pattern as authors: `books.publisher` stays as a display string, `books.publisherId` is the normalized FK.

**Schema:**

```sql
CREATE TABLE publishers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL (max 255),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE books ADD COLUMN publisher_id TEXT REFERENCES publishers(id) ON DELETE SET NULL;
```

**`syncBookPublisher(db, bookId, publisherString)` service:**

- If `publisherString` is null/empty, set `books.publisherId = null` and return
- Case-insensitive lookup in `publishers` table (`COLLATE NOCASE`)
- If found, use existing publisher ID
- If not found, create new publisher row
- Set `books.publisherId` to the resolved ID
- Update `books.publisher` to the canonical name from the `publishers` table (not the raw input — so "penguin books" becomes "Penguin Books" if that's the existing canonical name)

**Entry points** (all places publisher values enter the system):

- `packages/server/src/routes/upload.ts` — after initial metadata extraction
- `packages/server/src/trpc/routers/books.ts` — `books.update` mutation
- `packages/server/src/trpc/routers/metadata.ts` — `applyFields` mutation

### 2. Publisher tRPC Router

New `publishersRouter` in `packages/server/src/trpc/routers/publishers.ts`:

- **`list`** — Returns all publishers with book counts. Supports optional `search` string filter. Ordered by book count descending. Used by the edit form combobox for autocomplete.
- **`update`** — Admin-only. Renames a publisher. If the new name matches an existing publisher (case-insensitive), auto-merges: reassigns all books from the renamed publisher to the existing one, then deletes the renamed publisher. This is how duplicates get resolved — no separate merge UI needed.

### 3. Language Normalization

No new table. Languages remain a text column on `books` but are normalized to ISO 639-1 two-letter codes at every entry point.

**`normalizeLanguage(input: string): string` utility in `packages/shared`:**

- ISO 639-2/B codes: `eng` -> `en`, `ger` -> `de`, `fre` -> `fr`, `spa` -> `es`, `ita` -> `it`, `por` -> `pt`, `nld`/`dut` -> `nl`, `jpn` -> `ja`, `kor` -> `ko`, `zho`/`chi` -> `zh`, `rus` -> `ru`, `ara` -> `ar`, `hin` -> `hi`, `pol` -> `pl`, `swe` -> `sv`, `nor` -> `no`, `dan` -> `da`, `fin` -> `fi`, `ces`/`cze` -> `cs`, `tur` -> `tr`, `hun` -> `hu`, `ron`/`rum` -> `ro`, `ell`/`gre` -> `el`, `heb` -> `he`, `tha` -> `th`, `vie` -> `vi`, `ind` -> `id`, `msa`/`may` -> `ms`, `ukr` -> `uk`, `cat` -> `ca`, `hrv` -> `hr`, `srp` -> `sr`, `slk`/`slo` -> `sk`, `slv` -> `sl`, `bul` -> `bg`, `lit` -> `lt`, `lav` -> `lv`, `est` -> `et`
- ISO 639-2/T codes that differ from /B: `deu` -> `de`, `fra` -> `fr`, etc. (covered by same map)
- Full names (case-insensitive): `"German"` -> `de`, `"English"` -> `en`, `"French"` -> `fr`, etc.
- BCP-47 tags: strip region (`en-US` -> `en`, `pt-BR` -> `pt`)
- Already ISO 639-1: pass through unchanged
- Unknown input: return as-is (don't lose data)

**Entry points** (same as publisher):

- `packages/server/src/routes/upload.ts`
- `packages/server/src/trpc/routers/books.ts` — `books.update`
- `packages/server/src/trpc/routers/metadata.ts` — `applyFields`

### 4. Edit UI Changes

**Publisher field** (`packages/web/src/routes/_app/books/$id_.edit.tsx`):

Replace the plain text input with a single-select combobox (similar pattern to `AuthorMultiPick` but picks one value). Type to search existing publishers via `publishers.list` tRPC query, select one, or type a new name. On save, the server's `syncBookPublisher` handles deduplication.

**Language field** (`packages/web/src/routes/_app/books/$id_.edit.tsx`):

Replace the plain text input with a combobox/dropdown. The option list is static — all ISO 639-1 languages with human-readable display names (e.g. "German (de)") sourced from a constant in the shared package. Client-side filtering, no tRPC call needed. Stores the two-letter code.

**Book detail page** (`packages/web/src/routes/_app/books/$id.tsx`):

Display the human-readable language name (e.g. "German") instead of the raw code.

### 5. Smart Shelf Filters

Add `publisher` to the `columnMap` in `packages/server/src/trpc/routers/build-filter.ts`. This enables smart shelf filtering by publisher, which is currently missing.

The language filter already works via the existing `language` entry in `columnMap` — normalized codes will make it reliable.

Add `publisher` to the filter builder UI field list in `packages/web/src/components/shelves/filter-builder.tsx`.

### 6. Migration

A Drizzle migration that:

**Languages:**
- Iterates all books with non-null `language` values
- Applies `normalizeLanguage()` to each
- Updates in-place

**Publishers:**
- Selects all distinct non-null `publisher` values from `books`
- Groups by case-insensitive match
- For each group: creates one `publishers` row using the most common casing as the canonical name
- Sets `books.publisherId` for all books in each group

## Files Changed

| Layer | File | Change |
|-------|------|--------|
| Schema | `packages/shared/src/schema.ts` | Add `publishers` table, add `publisherId` FK to `books` |
| Shared | `packages/shared/src/index.ts` | Export new schema + `normalizeLanguage` |
| Shared | `packages/shared/src/language.ts` | New file: `normalizeLanguage()` utility + ISO 639-1 display name map |
| Validators | `packages/shared/src/validators.ts` | No change needed — `bookUpdateInput.publisher` stays as string, server resolves |
| Service | `packages/server/src/services/sync-book-publisher.ts` | New file: `syncBookPublisher()` |
| Router | `packages/server/src/trpc/routers/publishers.ts` | New file: `list`, `update` |
| Router | `packages/server/src/trpc/routers/index.ts` | Register `publishersRouter` |
| Router | `packages/server/src/trpc/routers/books.ts` | Call `syncBookPublisher` + `normalizeLanguage` in `update` |
| Router | `packages/server/src/trpc/routers/metadata.ts` | Call `syncBookPublisher` + `normalizeLanguage` in `applyFields` |
| Route | `packages/server/src/routes/upload.ts` | Call `syncBookPublisher` + `normalizeLanguage` after extraction |
| Filter | `packages/server/src/trpc/routers/build-filter.ts` | Add `publisher` to `columnMap` |
| UI | `packages/web/src/routes/_app/books/$id_.edit.tsx` | Publisher combobox, language dropdown |
| UI | `packages/web/src/routes/_app/books/$id.tsx` | Display human-readable language name |
| UI | `packages/web/src/components/shelves/filter-builder.tsx` | Add publisher to filter fields |
| Migration | `packages/server/drizzle/XXXX_publisher_language.sql` | Schema changes + data normalization |
| i18n | `packages/web/src/locales/*.json` | Labels for new UI elements |

## Out of Scope

- Dedicated publisher browse/detail page (not needed per requirements)
- Fuzzy publisher matching (too error-prone for automated dedup)
- Language table in the database (ISO 639-1 is a fixed standard, code-level map suffices)
- Publisher enrichment from external APIs (could be added later)
