# Features

Detailed specifications for each feature area.

## Book Upload & Metadata Extraction

### Supported Formats
| Format | Extension | Metadata Extraction | Reader Support |
|--------|-----------|-------------------|----------------|
| EPUB | .epub | Full (title, author, ISBN, cover, description, language, publisher) | Full (epub.js) |
| PDF | .pdf | Partial (title, author from document properties) | View only (pdf.js or native) |
| MOBI | .mobi | Partial (title, author) | Converted to EPUB for reading |

### Upload Flow
1. **Drag-and-drop or file picker** on the library page
2. **Client-side validation**: check file extension and size before upload
3. **Upload**: multipart POST to `/api/upload`
4. **Server processing**:
   - Validate file by magic bytes (not just extension)
   - Generate UUID for the book
   - Store file: `data/books/{uuid}/book.{ext}`
   - Compute SHA-256 hash for deduplication
   - Check if hash already exists in library → warn user
5. **Metadata extraction** (synchronous):
   - EPUB: Parse `content.opf` via `epub2` library
   - PDF: Parse document properties via `pdf-parse`
   - Extract embedded cover image → resize to max 600px wide → save as JPEG
6. **Metadata enrichment** (async, after response):
   - Search Google Books API by ISBN (if available) or title + author
   - Search Open Library API as fallback
   - If a high-confidence match is found (>0.8), auto-merge fields that weren't extracted
   - If match is ambiguous, set `metadataStatus: 'needs_review'`
   - Fetch higher-quality cover if external source has one
7. **Return** book record to client with current metadata state

### Bulk Upload
- Accept multiple files in one upload
- Process sequentially (to avoid memory pressure)
- Return progress via Server-Sent Events or poll endpoint
- Each book created independently (one failure doesn't block others)

### Duplicate Detection
- SHA-256 file hash checked on upload
- If duplicate found: show existing book, offer to skip or create duplicate
- Title + author fuzzy match as secondary check (may be different editions)

---

## Metadata Enrichment

### External Sources

#### Google Books API
- **Endpoint**: `https://www.googleapis.com/books/v1/volumes`
- **Auth**: No API key required for basic usage (rate-limited by IP)
- **Search**: By ISBN (`isbn:{isbn}`) or title+author (`intitle:{title}+inauthor:{author}`)
- **Returns**: Title, authors, publisher, publishedDate, description, pageCount, categories, imageLinks
- **Cover quality**: Usually good, available in multiple sizes

#### Open Library API
- **Endpoint**: `https://openlibrary.org/search.json`
- **Auth**: None required
- **Search**: By ISBN or title+author
- **Returns**: Title, author, publisher, publish_year, isbn, cover_id, subject
- **Cover URL**: `https://covers.openlibrary.org/b/id/{cover_id}-L.jpg`
- **Strengths**: Better for older/classic books, edition-level data

### Matching Strategy
```
1. If ISBN exists → search by ISBN (high confidence)
2. If no ISBN → search by "title author" (fuzzy)
3. Score results:
   - Exact title match: +0.4
   - Author last name match: +0.3
   - Year within ±2: +0.2
   - ISBN match: +0.5 (override to 0.95)
4. If best score > 0.8 → auto-apply
5. If best score 0.5–0.8 → flag for review
6. If best score < 0.5 → no match, user can manually search
```

### Field Merge Rules
When applying external metadata:
- **Never overwrite**: Fields the user has manually edited (`metadata_locked = true`)
- **Overwrite if empty**: Fill in blank fields from external source
- **Prefer external**: Description (usually better quality), cover (usually higher resolution)
- **Prefer extracted**: Title and author (extracted from file is usually what the user expects)

### Metadata Cache
- Cache external API responses in `metadata_cache` table
- Cache key: ISBN or "title::author"
- TTL: 30 days
- Prevents redundant API calls when multiple users add the same book

---

## Custom Shelves

### Types

**Manual shelves**: User explicitly adds and removes books. Books have a position (orderable).

**Smart shelves**: Defined by a filter rule. Books are computed at query time — no manual management needed. The filter is stored as JSON:

```json
{
  "operator": "AND",
  "conditions": [
    { "field": "genre", "op": "contains", "value": "Fiction" },
    { "field": "rating", "op": "gte", "value": 4 }
  ]
}
```

### Default Shelves (created per user)
| Name | Type | Description |
|------|------|-------------|
| 📖 Currently Reading | Manual | Books you're actively reading |
| 🔖 Want to Read | Manual | Your reading queue |
| ⭐ Favorites | Manual | Your top picks |
| 📅 Recently Added | Smart | filter: added in last 30 days |

### Shelf Management
- Reorder shelves via drag-and-drop in sidebar
- Reorder books within a shelf via drag-and-drop in grid
- Shelf emoji is user-selectable
- A book can be on multiple shelves simultaneously
- Deleting a shelf does not delete its books

---

## Reading Progress

### Tracking
- Progress is synced via `trpc.progress.sync` mutation
- Client debounces updates: sync every 30 seconds during active reading, and on every page turn/chapter change
- Uses EPUB CFI (Content Fragment Identifier) for exact position in EPUBs
- Uses page number for PDFs
- Percentage is the primary display metric

### Auto-Detection
- First open of a book: sets `started_at`
- Progress reaches ≥98%: auto-sets `finished_at` (to handle rounding on last page)
- User can manually mark as finished or reset progress

### Reading Time
- Client tracks time spent with document visible (pauses on tab switch or inactivity >5 min)
- Accumulated in `time_spent_minutes` on the progress record
- Used for reading stats calculations

### Reading Stats
Available via `trpc.progress.stats`:
- **Total books read** (finished_at not null)
- **Total pages read** (sum of pagesRead across all books)
- **Total reading time**
- **Current streak**: consecutive calendar days with ≥1 reading activity
- **Longest streak**
- **Daily pages chart**: pages read per day over the selected period
- **Genre distribution**: pie/bar chart of completed books by genre
- **Monthly/yearly summary**

---

## EPUB Reader

### Technology
epub.js — the most mature browser-based EPUB renderer. Handles pagination, styling, and navigation.

### Features
- **Paginated view**: horizontal swipe/tap page turns
- **Scrolling view**: vertical continuous scroll (user preference)
- **Table of contents**: slide-in panel from left
- **Settings panel**: slide-in from right
  - Font size: range slider (12–28px)
  - Font family: serif / sans-serif / dyslexic-friendly
  - Line spacing: compact / normal / relaxed
  - Margins: narrow / normal / wide
  - Theme: light / dark / sepia
- **Bookmarks**: tap top-right corner to bookmark a page
- **Highlights**: long-press to select text, choose highlight color (yellow, green, blue, pink)
- **Notes**: add a note to any highlight
- **Search within book**: full-text search across chapters
- **Progress bar**: thin bar at bottom showing overall position
- **Page indicator**: "Page X of Y" or "Location XXXX" or percentage

### Reader Controls
- **Tap zones**: left 1/3 = previous page, right 1/3 = next page, center = show/hide controls
- **Swipe**: left/right for page turns
- **Keyboard**: arrow keys, space for page turn
- **Close**: X button returns to book page (not library — preserves context)

### Offline Support (Future)
- Service worker caches the currently reading book
- Progress syncs when connection is restored

---

## Search

### Implementation
SQLite FTS5 (Full-Text Search) for the default SQLite database. PostgreSQL uses `tsvector` / `tsquery`.

### Searchable Fields
- Book title (highest weight)
- Author name (high weight)
- Description (medium weight)
- ISBN (exact match)
- Tags (medium weight)
- Genre (low weight)

### Search UX
- Instant search as you type (debounced 300ms)
- Results grouped: books matching title first, then author, then description
- Each result shows: cover thumbnail, title, author, match context snippet
- Search persists in URL (`?q=dune`) for shareability
- Empty state: "No books found" with suggestion to check spelling or try broader terms

---

## Multi-User

### User Isolation
- Each user has their own: shelves, reading progress, annotations, API keys
- Books are owned by the user who uploaded them
- By default, users only see their own books

### Shared Library Mode (Future)
- Admin can enable "shared library" mode
- All books are visible to all users
- Each user still has private: shelves, progress, annotations
- Upload permission can be restricted to admin-only

### User Management (Admin)
- View all users, their roles, last login
- Change user roles (admin/user)
- Delete user (cascades: shelves, progress, annotations; books optionally retained or deleted)
- Generate invite links with optional role and expiry

---

## OPDS Feed

### Compatibility
Tested with:
- KOReader
- Moon+ Reader
- Librera Pro
- Calibre (OPDS browser)
- FBReader

### Feed Structure
```
/opds/catalog          → Root navigation feed
/opds/all              → All books (paginated, 20 per page)
/opds/recent           → Recently added (last 50)
/opds/shelves/:id      → Books in a specific shelf
/opds/search?q=...     → Search results
/opds/opensearch.xml   → OpenSearch descriptor
/opds/books/:id/cover  → Cover image
/opds/books/:id/download → File download
```

### Authentication
HTTP Basic Auth using app passwords. The user creates an app password in Settings → API Keys and configures their reader app with `email:app_password`.

### Pagination
Acquisition feeds use `<link rel="next">` for pagination:
```xml
<link rel="next" type="application/atom+xml"
      href="/opds/all?page=2" />
```

---

## Import / Export

### Import From
- **File upload**: Single or bulk EPUB/PDF/MOBI upload
- **Calibre library**: Import from Calibre's `metadata.db` + file structure
- **OPDS feed**: Subscribe to an external OPDS feed and import selected books
- **URL**: Paste a direct download link to an ebook file

### Export
- **Library backup**: Download all books + metadata as a ZIP archive
- **Metadata export**: CSV or JSON export of library metadata (without files)
- **Single book**: Download original file from book page

---

## Notifications (Future)

- New book recommendations based on reading history
- Reading goal reminders ("You're 2 books behind your yearly goal")
- Shelf suggestions ("You might want to move X to Favorites")

These would be in-app notifications (not push), shown as a subtle indicator in the topbar.
