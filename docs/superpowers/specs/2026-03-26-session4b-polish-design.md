# Session 4b: "Polish" — Reading Stats Dashboard + Import/Export

## Overview

Session 4b adds two feature groups to Verso:

1. **Reading Stats Dashboard** — a dedicated `/stats` page showing reading habits over time (weekly/monthly/yearly/all-time), with a reflective, non-gamified tone
2. **Import/Export** — OPDS import (for BookLore, Calibre-Web, etc.), enhanced bulk upload, full library ZIP backup/restore

## Approach

**Approach B: Stats-First, Import as Synchronous Streams.** Stats dashboard built first as self-contained feature. Import/export uses SSE (Server-Sent Events) for progress reporting — no job queue infrastructure. ZIP export streams directly to the client. Suitable for personal libraries (typically 50-200 books).

---

## 1. Reading Stats Dashboard

### 1.1 Data Model

**New table: `reading_sessions`**

| Column | Type | Notes |
|---|---|---|
| `id` | text (nanoid) | Primary key |
| `userId` | text | FK → users.id |
| `bookId` | text | FK → books.id |
| `startedAt` | integer (unix ms) | Session start timestamp |
| `endedAt` | integer (unix ms) | Session end timestamp |
| `durationMinutes` | integer | Computed duration |

**Session creation logic:** The `progress.sync` mutation already fires every 30 seconds. On each sync:
- If the user's last session for this book ended < 5 minutes ago → extend it (update `endedAt` and `durationMinutes`)
- Otherwise → create a new session

This gives per-day, per-book time granularity for charts and streaks. The existing `reading_progress.timeSpentMinutes` continues to be the cumulative total (source of truth for all-time). Reading sessions provide the time-series breakdown.

### 1.2 tRPC Procedures

All procedures are user-scoped (filter by `userId` from JWT).

**`stats.overview(input: { range: "week" | "month" | "year" | "all" })`**

Returns summary cards:
- `timeReadMinutes` — total reading time in period
- `booksFinished` — count of books with `finishedAt` in period
- `booksInProgress` — count of books with progress > 0 and no `finishedAt`
- `currentStreak` — consecutive days with at least one reading session
- `avgMinutesPerDay` — total time / days in period

**`stats.dailyReading(input: { range: "week" | "month" | "year" | "all" })`**

Returns array of `{ date: string, minutes: number }` for the bar chart. Grouped from `reading_sessions`.

**`stats.distribution(input: { range: "week" | "month" | "year" | "all" })`**

Returns reading time grouped by author (top 5 + "Other"):
- `{ author: string, minutes: number, percentage: number }[]`

**`stats.readingLog(input: { cursor?: string, limit?: number })`**

Returns paginated list of recent reading sessions:
- `{ id, bookId, bookTitle, bookAuthor, coverPath, durationMinutes, startedAt }[]`
- Cursor-based pagination, ordered by `startedAt` descending

### 1.3 UI

**Route:** `/stats` — new page, sidebar link with chart icon below shelves section.

**Layout (top to bottom):**

1. **Time range selector** — pill button group: Week / Month / Year / All Time. Switches all data on the page.
2. **Summary cards row** — 4 cards in a grid: Time Read, Books Finished, Current Streak, Avg/Day. Warm accent color for the numbers.
3. **Daily reading chart** — bar chart showing minutes per day. Hand-rolled SVG bars (no heavy charting dependency). Tooltip on hover showing exact time. For "year" range, group by week. For "all" range, group by month.
4. **Distribution panel** — horizontal bar chart showing top 5 authors by reading time. Simple colored bars with labels and percentages.
5. **Reading log** — chronological list: book cover thumbnail, title, author, duration, relative date. "Load more" button for pagination.

**Responsive:** On mobile, summary cards stack 2x2. Charts go full-width. Reading log stays as a list.

---

## 2. Import

### 2.1 OPDS Import

**Purpose:** Import books from any OPDS-compatible server (BookLore, Calibre-Web, COPS, etc.).

**Flow:**

1. User navigates to `/import` and selects "OPDS Import"
2. Enters OPDS server URL + optional HTTP Basic credentials
3. Verso fetches the root OPDS catalog (Atom XML)
4. UI displays a browsable catalog: navigation feeds as folders, acquisition feeds as book lists
5. User selects books to import (individual checkboxes + select all)
6. User clicks "Import Selected"
7. Backend streams progress via SSE: each book goes through `downloading → processing → complete/failed`
8. UI shows a live progress list with per-book status

**Backend: Fastify SSE endpoint `POST /api/import/opds/stream`**

Body: `{ url: string, credentials?: { username: string, password: string }, entries: OpdsEntry[] }`

The entries array contains the selected books with their acquisition links and metadata (as returned by the browse endpoint). Credentials are sent in the POST body, never as query params.

For each selected book:
1. Download the acquisition file (follow `rel="http://opds-spec.org/acquisition"` link)
2. Download cover image if available (follow `rel="http://opds-spec.org/image"` link)
3. Parse the downloaded file using existing EPUB/PDF parsing logic
4. Create book record with metadata from OPDS entry (title, author, summary, ISBN, publisher)
5. Emit SSE event with status

**OPDS catalog browsing: `POST /api/import/opds/browse`**

Body: `{ url: string, credentials?: { username: string, password: string } }`

Returns parsed catalog: navigation entries (links to sub-feeds) and acquisition entries (books with metadata). The UI calls this recursively as the user navigates through the catalog.

**XML parsing:** Use `fast-xml-parser` — lightweight, no native dependencies.

### 2.2 Bulk Upload

Enhance the existing upload page to accept multiple files:

- Drop zone accepts multiple files (already partially supported)
- Files upload sequentially (or 2-3 in parallel) using the existing `POST /api/upload` endpoint
- Per-file progress bar in the UI
- Results summary: X succeeded, Y failed with reasons

This is a UI enhancement, not a new backend feature.

### 2.3 Library Restore (ZIP Import)

**Endpoint: `POST /api/import/restore`**

Accepts a Verso backup ZIP (multipart upload). Process:

1. Validate ZIP structure (must have `metadata.json` at root)
2. Parse `metadata.json`, `annotations.json`, `progress.json`
3. Copy book files to storage directory
4. Copy cover images to covers directory
5. Create database records: books, shelves, shelf-book assignments, annotations, reading progress, reading sessions
6. Handle conflicts: if a book with the same file hash already exists, skip the file but merge metadata if newer
7. Stream progress via SSE

---

## 3. Export

### 3.1 Library ZIP Export

**Endpoint: `GET /api/export/library`**

Streams a ZIP file directly to the client (no temp file). Uses `archiver` package.

**ZIP structure:**

```
verso-backup-{date}/
  books/
    {bookId}-{sanitized-title}.epub
    {bookId}-{sanitized-title}.pdf
    ...
  covers/
    {bookId}.jpg
    ...
  metadata.json
  annotations.json
  progress.json
```

**`metadata.json`** contains:
- All books with full metadata (title, author, ISBN, series, description, etc.)
- All shelves (name, emoji, smart filter rules, position)
- Shelf-book assignments (which books belong to which shelves)

**`annotations.json`** contains:
- All highlights (bookId, cfiPosition, cfiEnd, content, note, color, chapter)
- All bookmarks (bookId, cfiPosition, label)

**`progress.json`** contains:
- Reading progress per book (percentage, cfiPosition, timeSpentMinutes, startedAt, finishedAt)
- Reading sessions (bookId, startedAt, endedAt, durationMinutes)

All JSON files include a `version` field for forward compatibility.

**UI:** "Export Library" button in sidebar footer or settings area. Clicking starts the download immediately.

---

## 4. Routes and Navigation

### New Routes

| Route | Purpose |
|---|---|
| `/stats` | Reading stats dashboard |
| `/import` | Import hub |

### Import Page Layout

A hub page with three sections/tabs:

1. **OPDS Import** — URL + credentials form → catalog browser → select → import with progress
2. **Bulk Upload** — enhanced multi-file drop zone (reuses existing upload component)
3. **Restore from Backup** — drop zone for Verso ZIP, contents preview, confirm to restore

### Sidebar Changes

- Add "Stats" link with chart icon below the shelves section
- Add "Import" under a tools/settings section or as a standalone link
- Add "Export Library" button in sidebar footer

---

## 5. Technical Decisions

| Decision | Choice | Why |
|---|---|---|
| Charts | Hand-rolled SVG | No heavy dependency. Bar charts and horizontal bars are simple enough. |
| OPDS parsing | `fast-xml-parser` | Lightweight, well-maintained, no native deps |
| ZIP streaming | `archiver` | Streams directly, no temp files, well-maintained |
| Progress reporting | Server-Sent Events | Simpler than WebSockets, works with existing Fastify, unidirectional is sufficient |
| Session detection | 5-min gap threshold | < 5 min between syncs = same session, ≥ 5 min = new session |
| Time chart grouping | Day (week/month), Week (year), Month (all) | Keeps chart readable at each zoom level |

## 6. Out of Scope

- Calibre library import (direct SQLite parsing) — can be added later
- OPDS server (Verso serving its own OPDS feed) — Session 5
- Reading goals / gamification — explicitly excluded per design direction
- Genre-based distribution — requires genre data we don't consistently have; author is more reliable
