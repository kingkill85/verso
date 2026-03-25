# Session 4a: Metadata Enrichment & Annotations — Design Spec

## Scope

Session 4a covers the "enrich" half of Session 4. Session 4b (reading stats, import/export) is deferred.

### In Scope
1. Fix EPUB metadata extraction (currently broken)
2. On-demand metadata enrichment (Google Books + Open Library)
3. Metadata review UI with diff preview and per-field control
4. EPUB metadata write-back (DB + file always updated together)
5. Reader annotations (highlights with color + notes)
6. Annotations list on book detail page
7. Reading time tracking in the reader

### Out of Scope (deferred to 4b)
- Reading stats dashboard
- Import (bulk upload, Calibre, OPDS feeds, URLs)
- Export (ZIP backup)
- Auto-enrichment on upload (may revisit later)

---

## 1. Database Changes

### New table: `annotations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Unique annotation identifier |
| user_id | uuid | FK → users.id, NOT NULL | Annotator |
| book_id | uuid | FK → books.id, NOT NULL | Book |
| type | varchar(20) | NOT NULL | 'highlight' or 'note' |
| content | text | nullable | Highlighted text |
| note | text | nullable | Note attached to highlight |
| cfi_position | text | NOT NULL | EPUB CFI for start position |
| cfi_end | text | nullable | CFI for end of highlight range |
| color | varchar(20) | default 'yellow' | yellow, green, blue, pink |
| chapter | varchar(255) | nullable | Chapter title (denormalized for display) |
| created_at | timestamp | NOT NULL, default now | |
| updated_at | timestamp | NOT NULL, default now | |

**Indexes:** `INDEX(user_id, book_id)`, `INDEX(book_id, cfi_position)`

### New table: `metadata_cache`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Cache entry identifier |
| query_key | varchar(255) | NOT NULL | ISBN or "title::author" |
| source | varchar(20) | NOT NULL | 'google' or 'openlibrary' |
| data | text | NOT NULL | Full JSON response |
| fetched_at | timestamp | NOT NULL, default now | |

**Indexes:** `UNIQUE(query_key, source)`, `INDEX(fetched_at)`

Entries older than 30 days are stale and re-fetched on next access.

### Modified table: `books`

Add two columns:
- `series` varchar(255), nullable — Series name
- `series_index` real, nullable — Position in series (e.g. 1, 2, 2.5)

### Modified table: `reading_progress`

Add column (if not already present):
- `time_spent_minutes` integer, default 0 — Accumulated reading time

---

## 2. EPUB Parser Fix

The current `epub-parser.ts` using the `epub2` library is not extracting metadata correctly. Debug and fix to reliably extract:

- Title, author, ISBN, publisher, year, language, description, genre, cover image
- Series name and index (from `calibre:series` / `calibre:series_index` meta tags, and EPUB3 `belongs-to-collection`)

If `epub2` is fundamentally broken, fall back to direct XML parsing of the OPF file inside the EPUB ZIP archive.

---

## 3. EPUB Write-back Service

New service: `epub-writer.ts`

EPUBs are ZIP archives containing an OPF metadata file. The write-back service:

1. Opens the EPUB archive (using `yauzl`/`yazl` or similar)
2. Parses `content.opf` XML
3. Updates metadata fields in the OPF (title, author, description, publisher, ISBN, series, series_index, etc.)
4. Replaces the cover image inside the archive if a new one was provided
5. Writes both `calibre:series` format (wide compatibility) and EPUB3 `belongs-to-collection`
6. Writes the modified EPUB back to storage

**Safety:** Before writing, hash the current file. If the hash doesn't match the DB record (external modification), abort and warn the user.

---

## 4. Metadata Enrichment Service

New service: `metadata-enrichment.ts`

### Search Flow

```
User clicks "Find metadata" (or types a manual query)
  → metadata.search({ bookId, query? })
  → If no query: use book's current title + author + ISBN
  → If query provided: use the user's freetext search
  → Fire requests to Google Books + Open Library in parallel
  → Normalize responses into ExternalBook[] shape
  → Score each result:
      - ISBN match: override to 0.95
      - Exact title match: +0.4
      - Author last name match: +0.3
      - Year within ±2: +0.2
  → Deduplicate (same ISBN from both sources → merge, prefer Google for covers)
  → Cache raw responses in metadata_cache
  → Return ranked ExternalBook[]
```

### External APIs

**Google Books:**
- Endpoint: `https://www.googleapis.com/books/v1/volumes`
- Search by ISBN (`isbn:{isbn}`) or title+author (`intitle:{title}+inauthor:{author}`)
- No API key required for basic usage

**Open Library:**
- Endpoint: `https://openlibrary.org/search.json`
- Search by ISBN or title+author
- Cover URL: `https://covers.openlibrary.org/b/id/{cover_id}-L.jpg`
- Series data available via works API

### ExternalBook Shape

```typescript
{
  source: 'google' | 'openlibrary';
  sourceId: string;
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  description?: string;
  genre?: string;
  language?: string;
  pageCount?: number;
  coverUrl?: string;
  series?: string;
  seriesIndex?: number;
  confidence: number; // 0–1
}
```

### tRPC Router: `metadata`

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `search` | query | `{ bookId, query? }` | `ExternalBook[]` | Search external APIs, return ranked matches |
| `apply` | mutation | `{ bookId, fields }` | `Book` | Apply selected field values to DB + EPUB |

The `fields` parameter in `apply` is an object mapping field names to their final values (after user editing in the diff preview):
```typescript
{
  bookId: string;
  fields: {
    title?: string;
    author?: string;
    description?: string;
    genre?: string;
    publisher?: string;
    year?: number;
    isbn?: string;
    pageCount?: number;
    series?: string;
    seriesIndex?: number;
    coverUrl?: string; // external URL — service fetches and stores it
  }
}
```

The `apply` procedure:
1. Fetches external cover image if `coverUrl` is provided
2. Updates DB fields
3. Calls EPUB writer to update the file
4. Sets `metadata_source` to the external source
5. Returns the updated Book

---

## 5. Metadata Review UI

Triggered from a "Find metadata" button on the book detail page. Opens a dialog with two steps:

### Step 1: Search Results

- Search bar at top, pre-filled with book's title + author (editable for manual search)
- List of candidate matches showing:
  - Source badge (Google Books / Open Library)
  - Cover thumbnail
  - Title, author, year, page count
  - Confidence score as percentage
- Click a candidate to proceed to Step 2

### Step 2: Diff Preview

- Cover comparison (current vs. new) with checkbox
- Table of all metadata fields:
  - Checkbox to include/exclude each field
  - Field name
  - Current value
  - New value as an **editable text input** (pre-filled with external value, user can modify)
- Visual treatment:
  - Empty → filled: green highlight, auto-checked
  - Different values: orange highlight, unchecked by default
  - Matching values: dimmed, checkbox disabled
- "Apply N changes to book & file" button (count updates with checkbox changes)
- Cancel button

Series fields (`series`, `series_index`) are included in the diff table.

---

## 6. Reader Annotations

### Highlight Creation

1. User selects text in the EPUB reader (long-press on mobile, click-drag on desktop)
2. Floating toolbar appears near selection: 4 color swatches (yellow, green, blue, pink) + note icon
3. Tap color → highlight saved immediately with that color
4. Tap note icon → color picker + text input, save creates highlight with attached note

### Highlight Rendering

- On book load, fetch all annotations via `annotations.list({ bookId })`
- Apply highlights to epub.js rendition using its annotations API
- Re-apply after each chapter render (epub.js re-renders on navigation)

### Highlight Interaction

- Tap an existing highlight → popover with: edit note, change color, delete
- Changes saved immediately via `annotations.update` or `annotations.delete`

### tRPC Router: `annotations`

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `list` | query | `{ bookId }` | `Annotation[]` | All annotations for a book, ordered by position |
| `create` | mutation | `{ bookId, type, content, note?, cfiPosition, cfiEnd?, color?, chapter? }` | `Annotation` | Create highlight/note |
| `update` | mutation | `{ id, note?, color? }` | `Annotation` | Edit note text or color |
| `delete` | mutation | `{ id }` | `{ success }` | Remove annotation |

---

## 7. Annotations on Book Detail Page

New section/tab on the book detail page:

- **Tab label:** "Annotations" with count badge (e.g. "Annotations (12)")
- **Grouped by chapter** — chapter title as section header
- **Each annotation shows:**
  - Colored highlight indicator (left border or dot)
  - Highlighted text (truncated if long)
  - Note text if present
  - Timestamp
- **Click** → navigates to the reader at that CFI position
- **Inline actions:** edit note, change color, delete (same popover as reader)

---

## 8. Reading Time Tracking

### Client-side: `useReadingTimer` hook

- Starts accumulating seconds when the reader page mounts
- Pauses on:
  - `document.visibilitychange` (tab hidden)
  - 5 minutes of no mouse/touch/keyboard interaction
- Resumes when visibility or interaction returns

### Syncing

- Piggybacks on existing `useProgressSync` — when progress syncs (every 30s or on page turn), includes the accumulated `timeSpentMinutes` delta
- The `progress.sync` mutation input gets `timeSpentMinutes` added as an optional field
- Server-side: increments `time_spent_minutes` on the reading_progress record (additive, not overwrite)

### Edge Cases

- Tab closed before sync: lose up to 30s of tracking (acceptable)
- Multiple tabs: each syncs independently, server increments

---

## Architecture Summary

### New Files

| File | Purpose |
|------|---------|
| `packages/server/src/services/metadata-enrichment.ts` | Google Books + Open Library search, scoring, dedup |
| `packages/server/src/services/epub-writer.ts` | EPUB metadata write-back |
| `packages/server/src/trpc/routers/metadata.ts` | metadata.search, metadata.apply |
| `packages/server/src/trpc/routers/annotations.ts` | CRUD for annotations |
| `packages/shared/src/validators.ts` | New Zod schemas for metadata + annotation inputs |
| `packages/web/src/hooks/use-reading-timer.ts` | Client-side reading time tracking |
| `packages/web/src/components/metadata/find-metadata-dialog.tsx` | Search + diff preview dialog |
| `packages/web/src/components/reader/highlight-toolbar.tsx` | Floating color picker + note for text selection |
| `packages/web/src/components/reader/highlight-popover.tsx` | Edit/delete popover for existing highlights |
| `packages/web/src/components/books/annotations-tab.tsx` | Annotations list on book detail page |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/schema.ts` | Add annotations, metadata_cache tables; add series/series_index to books; add time_spent_minutes to reading_progress |
| `packages/server/src/trpc/router.ts` | Register metadata + annotations routers |
| `packages/server/src/services/epub-parser.ts` | Fix metadata extraction, add series parsing |
| `packages/server/src/trpc/routers/progress.ts` | Accept timeSpentMinutes in sync mutation |
| `packages/web/src/routes/_app/books/$id.tsx` | Add "Find metadata" button + annotations tab |
| `packages/web/src/routes/_app/books/$id_.read.tsx` | Integrate annotations + reading timer |
| `packages/web/src/hooks/use-epub-reader.ts` | Add highlight rendering + text selection handling |
| `packages/web/src/hooks/use-progress-sync.ts` | Include time delta in sync calls |
| `packages/web/src/components/layout/sidebar.tsx` | Show series info if present |
| New migration file | Schema changes |
