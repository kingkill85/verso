# Session 3: Organize and Find Books — Design Spec

## Overview

Session 3 adds library organization (shelves) and full-text search to Verso. Users can create manual and smart shelves to organize books, and search their library instantly with FTS5-powered search.

**Result:** Users can organize books into shelves, find any book instantly, and filter search results.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Continue Reading row | Keep as shelf preview with "See all" link | Quick access on home page + full view via shelf |
| Sidebar organization | Two sections: "Library" (defaults) + "Shelves" (user-created) | Manual vs smart is implementation detail; default vs custom is meaningful |
| Shelf detail page | Reuse existing BookGrid | Consistent UX, no new layout needed |
| Smart shelf builder | Presets as templates + editable rule builder | Presets teach the model; builder enables customization |
| Search location | Global bar in TopBar + per-shelf local filter | Global is predictable; per-shelf is scoped |
| Search results | Grid with inline filter chips | Lightweight filtering without heavy facet sidebar |
| Smart shelf evaluation | Query-time (not materialized) | Personal library scale doesn't warrant caching complexity |

## Data Model

### `shelves` table

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | varchar(100) | NOT NULL |
| `description` | text | nullable |
| `emoji` | varchar(10) | nullable |
| `userId` | uuid | FK → users.id, ON DELETE CASCADE, NOT NULL |
| `isSmart` | boolean | default false |
| `smartFilter` | JSON | nullable |
| `position` | integer | NOT NULL |
| `createdAt` | timestamp | default now |

### `shelfBooks` join table (manual shelves only)

| Column | Type | Constraints |
|---|---|---|
| `shelfId` | uuid | FK → shelves.id, ON DELETE CASCADE |
| `bookId` | uuid | FK → books.id, ON DELETE CASCADE |
| `position` | integer | NOT NULL |
| `addedAt` | timestamp | default now |

PK: (`shelfId`, `bookId`)

### Smart filter JSON schema

```json
{
  "operator": "AND",
  "conditions": [
    { "field": "genre", "op": "eq", "value": "Science Fiction" },
    { "field": "year", "op": "gte", "value": 2020 }
  ]
}
```

**Supported fields:** `title`, `author`, `genre`, `tags`, `year`, `language`, `fileFormat`, `pageCount`

**Supported operators:** `eq`, `neq`, `contains`, `gt`, `gte`, `lt`, `lte`, `in`

### FTS5 virtual table: `books_fts`

- Indexes: `title`, `author`, `description`
- Weights via `bm25()`: title (10), author (5), description (1)
- Synced via SQLite triggers on `books` INSERT/UPDATE/DELETE
- Created with raw SQL in migration (Drizzle doesn't support FTS5 virtual tables natively)

### Default shelves (seeded per user on registration)

- 📖 Currently Reading (manual)
- 🔖 Want to Read (manual)
- ⭐ Favorites (manual)
- 📅 Recently Added (smart: added in last 30 days)

## API Layer

New `shelves` tRPC router + `search` procedure on `books` router. All procedures are protected and filter by `ctx.user.sub`.

### Shelves router

| Procedure | Input | Description |
|---|---|---|
| `list` | — | All user's shelves ordered by position, with book count per shelf |
| `byId` | `{ id }` | Shelf with books (manual: join table, smart: evaluated from filter) |
| `create` | `{ name, emoji?, description?, isSmart, smartFilter? }` | Create shelf, assign next position |
| `update` | `{ id, name?, emoji?, description?, smartFilter? }` | Update shelf metadata or filter |
| `delete` | `{ id }` | Delete shelf (cascade removes shelfBooks) |
| `reorder` | `{ shelfIds[] }` | Bulk update positions from ordered array |
| `addBook` | `{ shelfId, bookId }` | Add book to manual shelf |
| `removeBook` | `{ shelfId, bookId }` | Remove book from manual shelf |

### Books router addition

| Procedure | Input | Description |
|---|---|---|
| `search` | `{ query, genre?, format?, author?, limit?, page? }` | FTS5 search with optional filter chips, returns ranked + paginated results |

### Shared utility

`buildFilterConditions(filter: SmartFilter, userId: string)` — translates smart filter JSON to Drizzle `where` clause. Reused by:
- Smart shelf `byId` evaluation
- Search result chip filtering

## Frontend

### New routes

| Route | Component | Description |
|---|---|---|
| `/shelves/:id` | `ShelfPage` | Shelf detail — header (emoji, name, count), BookGrid, edit/delete actions |
| `/search` | `SearchResultsPage` | Search query display, filter chips row, BookGrid of ranked results |

### New components

| Component | Description |
|---|---|
| `ShelfPage` | Header with emoji + name + book count, BookGrid, edit/delete actions. Smart shelves show filter summary badge. |
| `SearchResultsPage` | Displays search query, filter chips row (genre, format, author), BookGrid of ranked results, pagination. |
| `ShelfDialog` | Modal for create/edit shelf. Name, emoji picker, manual vs smart toggle. Smart mode shows FilterBuilder. |
| `FilterBuilder` | Rows of field/op/value dropdowns with add/remove buttons. AND/OR toggle. Used inside ShelfDialog. |
| `AddToShelfMenu` | Dropdown on BookCard/BookDetail to add/remove book from manual shelves. Checkmark for current membership. |
| `FilterChips` | Horizontal row of toggleable chips for search result filtering. Values extracted from result set. |

### Sidebar changes

Two sections replacing current single "Library" section:

**Library section:** All Books, Currently Reading, Want to Read, Favorites, Recently Added — each with book count badge. Smart shelves show italic "smart" label instead of count.

**Shelves section:** User-created shelves with "+" button to create new. Shows emoji + name + count. Smart shelves show italic "smart" label.

### Home page changes

Continue Reading row gains a "See all" link that navigates to the Currently Reading shelf page (`/shelves/:id`).

### Search bar behavior

Existing TopBar search bar enhanced: typing + Enter navigates to `/search?q=...`. No debounced suggestions dropdown (out of scope).

### Per-shelf search

Shelf pages get a local search input. Filters via LIKE on title/author (small result set within a shelf, FTS unnecessary).

## Search Implementation

1. User types in global search bar → navigates to `/search?q=...`
2. `books.search` runs `SELECT ... FROM books_fts WHERE books_fts MATCH ?` with `bm25(books_fts, 10, 5, 1)` ranking
3. Results joined to `books` table for full metadata
4. Optional filter chips applied as additional WHERE clauses
5. Paginated response returned

## Testing Strategy

### Backend: `shelves.test.ts`
- CRUD: create, read, update, delete shelves
- Manual shelf book management: add, remove, list books
- Smart shelf evaluation: filter JSON → correct book results
- Default shelf seeding on user registration
- User isolation: user A can't access user B's shelves
- Edge cases: delete shelf with books, add book to smart shelf (should fail)

### Backend: `search.test.ts`
- FTS5 basic: title match, author match, description match
- Ranking: title matches ranked higher than description matches
- Filter chips: search + genre filter, search + format filter
- Empty query, no results, special characters

### Frontend tests
- ShelfPage: renders shelf name, emoji, book grid
- SearchResultsPage: renders results, filter chips toggle
- FilterBuilder: add/remove rows, field/op/value selection
- AddToShelfMenu: shows shelves with membership checkmarks
- Sidebar shelf list: renders sections, counts, active state
