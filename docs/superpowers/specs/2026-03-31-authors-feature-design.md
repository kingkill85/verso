# Authors Feature

## Goal

Add a first-class Authors entity to Verso — with a dedicated list page, detail page, automatic creation on book add, and metadata enrichment (photo, bio) from OpenLibrary. Authors with no books are hidden. The book detail page links to the author. The sidebar gets an "Authors" nav item.

## Data Model

### New table: `authors`

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID, auto-generated |
| name | text NOT NULL | Canonical author name |
| description | text | Bio/description from OpenLibrary |
| imagePath | text | Path to stored author photo (in storage) |
| openLibraryKey | text | OpenLibrary author key (e.g. `OL34184A`) for re-fetching |
| birthDate | text | Stored for future use, not displayed in v1 |
| createdAt | text NOT NULL | ISO timestamp |
| updatedAt | text NOT NULL | ISO timestamp |

Unique constraint on `name` (case-insensitive via `COLLATE NOCASE`).

### New table: `bookAuthors`

| Column | Type | Notes |
|--------|------|-------|
| bookId | text NOT NULL | FK → books.id, ON DELETE CASCADE |
| authorId | text NOT NULL | FK → authors.id, ON DELETE CASCADE |
| position | integer NOT NULL | Ordering (0 = primary author) |

Composite primary key: `(bookId, authorId)`.

### Migration of existing data

When the feature lands, a one-time migration will:
1. Scan all distinct `books.author` values
2. Split comma-separated names (trim whitespace)
3. Create `authors` rows for each unique name (deduped case-insensitively)
4. Create `bookAuthors` rows linking each book to its author(s) with position
5. The existing `books.author` text field is **kept as-is** for display — it's the "display string" and remains the source of truth for how the author name(s) appear on book cards

### Author lifecycle

- **Auto-created on book add/import:** When a book is added, its `author` string is parsed (split by comma), and each name is looked up in the `authors` table. Missing authors are created. `bookAuthors` links are created.
- **Hidden when empty:** Authors with zero books (all their books were deleted) are not shown in the list. They can be cleaned up periodically or left in the DB for potential re-use.
- **Metadata enrichment:** On author creation, a background fetch to OpenLibrary is triggered (fire-and-forget). If it fails, retry when the author detail page is first viewed.

## OpenLibrary Integration

### Author search and matching

When a new author is created:

1. Search: `GET https://openlibrary.org/search/authors.json?q={authorName}`
2. Take the first result's `key` (e.g. `/authors/OL34184A`)
3. Fetch details: `GET https://openlibrary.org/authors/OL34184A.json`
4. Extract: `bio` (string or `{ value: string }`), `birth_date`, `photos` array
5. Fetch photo: `https://covers.openlibrary.org/a/olid/OL34184A-M.jpg` (medium size)
6. Store photo to server storage at `authors/{authorId}/photo.jpg`
7. Update the `authors` row with `description`, `imagePath`, `openLibraryKey`, `birthDate`

### Rate limiting

Throttle OpenLibrary requests to max 1 per second (their informal rate limit). Use a simple delay between requests during bulk operations (migration, batch import).

### Failure handling

- If OpenLibrary is unreachable or returns no results, the author is created with null metadata fields.
- The author detail page checks if `description` is null and `openLibraryKey` is null — if so, attempts a single retry fetch.
- No retry loops. If it fails twice, the author stays without metadata until manually refreshed.

## API Endpoints

### New tRPC router: `authors`

**`authors.list`**
- Input: `{ search?: string }` (optional search filter)
- Returns: `Array<{ id, name, imagePath, bookCount }>` sorted by bookCount DESC, then name ASC
- Only returns authors with `bookCount > 0`

**`authors.byId`**
- Input: `{ id: string }`
- Returns: `{ id, name, description, imagePath, openLibraryKey, birthDate, createdAt, books: Book[] }`
- Books returned in the same shape as `books.list` items, ordered by year/title
- If `description` is null and `openLibraryKey` is null, triggers a background metadata fetch before returning (single attempt)

**`authors.refreshMetadata`**
- Input: `{ id: string }`
- Mutation: re-fetches metadata from OpenLibrary and updates the author record
- Returns: updated author

### Modified endpoints

**Book creation/upload/import flows:**
- After a book is inserted, parse `book.author` string → split by comma → upsert authors → create `bookAuthors` links
- This logic lives in a shared helper function `syncBookAuthors(db, bookId, authorString)` called from upload, import, and book update flows

**`books.update`:**
- When the author field is changed, re-run `syncBookAuthors` to update links

## Frontend

### New route: `/authors` (authors list page)

- Grid of author cards: circular photo (with initials fallback), name, book count
- Search bar at the top to filter by name
- Sorted by book count descending
- Each card links to `/authors/$id`
- Responsive: smaller cards on mobile

### New route: `/authors/$id` (author detail page)

- Header: circular author photo (large, ~120px), name, book count, 3-line bio with "show more" expand
- Books section: grid of book cards using the existing `BookCard` component
- If no metadata yet, show a subtle "loading..." or just the name with no bio

### Modified: Book detail page (`/books/$id`)

- Author name becomes a clickable link to `/authors/$id`
- If book has multiple authors, each name links to its respective author page
- The author names are read from the `bookAuthors` relation (with author IDs for linking), falling back to the `books.author` display string

### Modified: Sidebar

- Add "Authors" nav item between Library and Stats (with a pen/quill icon)
- Move Stats up to sit right after Authors (reorder: Home, Library, Authors, Stats)

### i18n keys

```
authors.title: "Authors"
authors.subtitle: "{{count}} authors in your library"
authors.searchPlaceholder: "Search authors..."
authors.books: "{{count}} book" / "{{count}} books" (pluralized)
authors.noBio: "No biography available"
authors.refreshMetadata: "Refresh metadata"
author.booksSection: "Books"
```

## Sidebar Reorder

Current order: Home, Library, (shelves), Stats, (admin)
New order: Home, Library, Authors, Stats, (shelves), (admin)

Stats moves up to sit in the main nav section alongside Home, Library, and Authors — before the shelves section.

## Out of Scope

- Manual author editing/creation UI (authors are auto-managed)
- Author merge/dedup UI
- Multiple metadata sources (only OpenLibrary for now)
- Displaying birthDate, website, or other extended fields (stored but not shown)
- Author photos in book cards or home page sections
