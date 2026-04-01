# Genres: Multi-Genre Support & Normalization

## Overview

Replace the single free-text `books.genre` field with a proper relational genre system. Books can have multiple genres, genres are normalized via a canonical list with i18n support, and users can add custom genres.

## Decisions

- **Multi-genre**: flat/equal weight, no primary/secondary distinction
- **Normalization**: hybrid — ship ~69 default genres, users can add custom ones
- **i18n**: default genres stored in English internally, translated in UI via locale files. Custom genres stored as-is, no translation
- **Migration**: auto-map existing data via fuzzy matching
- **Edit UX**: same tag-input pattern as AuthorMultiPick

## Database Schema

### `genres` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial/integer PK | Auto-increment |
| `slug` | text, unique, not null | Lowercase kebab-case (e.g., `science-fiction`) |
| `name` | text, not null | English display name (e.g., "Science Fiction") |
| `isDefault` | boolean, default false | `true` for shipped canonical genres |
| `createdBy` | integer, nullable, FK → users | `null` for defaults, user ID for custom |
| `createdAt` | timestamp | |

### `book_genres` join table

| Column | Type | Notes |
|--------|------|-------|
| `bookId` | integer, FK → books, not null | On delete cascade |
| `genreId` | integer, FK → genres, not null | On delete cascade |
| Primary key | composite (`bookId`, `genreId`) | |

### Default Genre List (69 genres)

**Fiction (39):**
Fiction, Literary Fiction, Science Fiction, Fantasy, Mystery, Thriller, Romance, Horror, Historical Fiction, Adventure, Crime, Drama, Young Adult, Children's, Humor, Satire, Western, Dystopian, Urban Fantasy, Paranormal, Graphic Novel, Short Stories, Fairy Tales, Mythology, Magical Realism, Cyberpunk, Steampunk, Space Opera, Military Fiction, Espionage, Erotic Fiction, Cozy Mystery, Dark Fantasy, Epic Fantasy, Psychological Thriller, Romantic Suspense, Coming of Age, Alternate History, Post-Apocalyptic

**Non-Fiction (30):**
Non-Fiction, Biography, Memoir, Autobiography, Self-Help, Science, History, Philosophy, Poetry, Psychology, Sociology, Politics, Economics, Business, Technology, Religion, Spirituality, Art, Music, Travel, Cooking, Health, Fitness, Education, Parenting, Nature, True Crime, Journalism, Essays, Reference

## Migration Strategy

1. Create `genres` and `book_genres` tables
2. Seed all 69 default genres with slugs and English names
3. Fuzzy-match existing `books.genre` values:
   - **Exact match** (case-insensitive): "Science Fiction" → `science-fiction`
   - **Slug match**: "science-fiction", "science_fiction" → `science-fiction`
   - **Common aliases**: hardcoded map (e.g., "Sci-Fi" → `science-fiction`, "Bio" → `biography`)
   - **Contains match**: "Historical Fiction & Drama" → `historical-fiction`
   - **Comma/slash-separated values**: split and match each independently → book gets multiple genres
   - **No match**: create as custom genre (`isDefault: false`, `createdBy: null`)
4. Insert matched/created genres into `book_genres`
5. Books with `genre = null` → no entries in `book_genres`
6. Drop `books.genre` column

## Metadata Enrichment

All sources updated to return multiple genres:

- **Google Books**: take all `categories` from API response, match against canonical list
- **Open Library**: take all `subjects`, match against canonical list (cap at 5 to avoid noise)
- **Goodreads scraper**: already extracts multiple genre buttons — match all
- **Calibre import**: map all `tags` against canonical list

**Matching logic** (shared function):
1. Try exact/slug match against `genres` table
2. Try alias map
3. No match → skip (don't auto-create custom genres from external sources)

**`ExternalBook` type**: `genre?: string` → `genres?: string[]`

## API Changes

### Updated routers

- **books.list**: filter changes from `genre: string` to `genreSlug: string`. Joins through `book_genres`
- **books.search**: extract unique genres via join. Genre filter chips use genre slugs
- **books.recommended**: pull genres from reading history via `book_genres` join. Books matching any of those genres qualify
- **books.update / metadata.apply**: accept `genreIds: number[]` instead of `genre: string`. Replaces all entries in `book_genres` for that book

### New `genres` router

- `genres.list` — return all genres (default + custom) with book counts. Supports `search` param for autocomplete
- `genres.create` — create custom genre (name → auto-generate slug). Reject duplicates
- `genres.update` — rename a genre (both default and custom; updating a default genre's name only changes the English fallback, translations still come from locale files)
- `genres.merge` — merge one genre into another (reassign all books, delete source)
- `genres.delete` — delete a custom genre (removes from all books)

### Smart shelf filters

`genre` field queries against `book_genres` join. `eq`/`neq` match by slug, `in` matches multiple slugs.

### OPDS

`buildGenresList` and `buildGenreBooks` query from `genres` + `book_genres` tables instead of `DISTINCT books.genre`.

### Validators

Update `bookListInput`, `bookUpdateInput`, `searchInput`, `metadataApplyFields`, and `smartFilterField` to use the new genre types.

## Frontend Changes

### Book detail page

Display genres as clickable chips/badges. Clicking a chip navigates to search filtered by that genre.

### Book edit page

`GenreMultiPick` component modeled after existing `AuthorMultiPick`:
- Flex-wrap layout with inline text input and genre chips
- Suggestions dropdown: shows matching genres from `genres.list` as you type, excludes already-selected, up to 8 results
- **Add**: type and press Enter or click suggestion. If no match, offer "Create 'X' as new genre"
- **Remove**: click X on chip, or Backspace when input empty
- **Keyboard**: Enter to add, Backspace to remove last
- Chips show translated genre names (for defaults) or raw name (for custom)

### Metadata enrichment page

Show matched genres as checkboxes instead of single text diff. User toggles which genres to apply.

### Search page

Genre filter chips populated from `genres.list` instead of extracted from results. Multi-select: can filter by multiple genres at once.

### Smart shelf filter builder

Genre field uses dropdown of known genres instead of free text. `in` operator allows selecting multiple genres.

## i18n

Default genres get translation keys in all locale files:
- Key format: `genre.<slug>` (e.g., `genre.science-fiction`)
- Example: `"genre.science-fiction": "Science-Fiction"` (DE), `"genre.science-fiction": "Ciencia ficción"` (ES)
- All 10 locales (en, de, es, fr, it, nl, pt, zh, ja, ko) need translations for all 69 defaults
- Custom genres display their `name` field as-is (no translation)
