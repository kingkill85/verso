# Database Schema

Verso uses Drizzle ORM with support for both SQLite (default) and PostgreSQL. The schema is defined once in `packages/shared/src/schema.ts` and used by both the server (for queries) and the client (for type inference).

## Entity Relationship Diagram

```
users ─────────┬──── reading_progress ────── books
               │                              │
               ├──── shelves ── shelf_books ───┤
               │                              │
               ├──── annotations ─────────────┤
               │                              │
               └──── api_keys                 │
                                              │
                     metadata_cache ──────────┘
```

## Tables

### users

Core user account. Supports both local password auth and OIDC-linked accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Unique user identifier |
| email | varchar(255) | UNIQUE, NOT NULL | Login email |
| display_name | varchar(100) | NOT NULL | Shown in UI |
| avatar_url | text | nullable | Profile image URL |
| role | varchar(20) | NOT NULL, default 'user' | 'admin' or 'user' |
| password_hash | text | nullable | bcrypt hash, null for OIDC-only users |
| oidc_provider | varchar(255) | nullable | OIDC issuer URL |
| oidc_subject | varchar(255) | nullable | OIDC `sub` claim |
| created_at | timestamp | NOT NULL, default now | Account creation |
| last_login_at | timestamp | nullable | Last successful login |

**Indexes**: `UNIQUE(oidc_provider, oidc_subject)`, `UNIQUE(email)`

**Notes**: A user can have both `password_hash` and `oidc_subject` set, allowing login via either method. On first OIDC login with `OIDC_AUTO_REGISTER=true`, a user record is created automatically from the ID token claims.

---

### books

Central book record. Metadata comes from three sources (file extraction, external APIs, user edits) with user edits taking priority.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Unique book identifier |
| title | varchar(500) | NOT NULL | Book title |
| author | varchar(500) | NOT NULL | Author name(s) |
| isbn | varchar(20) | nullable | ISBN-10 or ISBN-13 |
| publisher | varchar(255) | nullable | Publisher name |
| year | integer | nullable | Publication year |
| language | varchar(10) | nullable | ISO 639-1 code (e.g., 'en', 'de') |
| description | text | nullable | Book synopsis/description |
| genre | varchar(100) | nullable | Primary genre |
| tags | text | nullable | JSON array of user-defined tags |
| cover_path | text | nullable | Relative path to cover image |
| file_path | text | NOT NULL | Relative path to book file |
| file_format | varchar(10) | NOT NULL | 'epub', 'pdf', or 'mobi' |
| file_size | bigint | NOT NULL | File size in bytes |
| file_hash | varchar(64) | nullable | SHA-256 hash for dedup |
| page_count | integer | nullable | Total pages (extracted or manual) |
| added_by | uuid | FK → users.id | User who uploaded |
| metadata_source | varchar(20) | nullable | 'extracted', 'google', 'openlibrary', 'manual' |
| metadata_locked | boolean | default false | Prevent auto-enrichment if user edited |
| created_at | timestamp | NOT NULL, default now | When added to library |
| updated_at | timestamp | NOT NULL, default now | Last metadata update |

**Indexes**: `INDEX(title)`, `INDEX(author)`, `INDEX(isbn)`, `INDEX(added_by)`, `INDEX(file_hash)`

---

### shelves

User-created collections. Can be manual (user adds books) or smart (auto-populated by filter rules).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Unique shelf identifier |
| name | varchar(100) | NOT NULL | Shelf display name |
| description | text | nullable | Optional description |
| emoji | varchar(10) | nullable | Shelf icon emoji |
| user_id | uuid | FK → users.id, NOT NULL | Owner |
| is_smart | boolean | default false | Whether shelf uses auto-filter |
| smart_filter | text | nullable | JSON filter definition (see below) |
| position | integer | NOT NULL, default 0 | Sort order |
| created_at | timestamp | NOT NULL, default now | Creation date |

**Indexes**: `INDEX(user_id)`, `UNIQUE(user_id, name)`

**Smart filter schema** (stored as JSON):
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "genre", "op": "eq", "value": "Science Fiction" },
    { "field": "rating", "op": "gte", "value": 4 }
  ]
}
```

Supported fields: `title`, `author`, `genre`, `tags`, `year`, `rating`, `file_format`, `status` (unread/reading/done).  
Supported operators: `eq`, `neq`, `contains`, `gt`, `gte`, `lt`, `lte`, `in`.

---

### shelf_books

Join table for manual shelves. Not used for smart shelves (those are computed at query time).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| shelf_id | uuid | FK → shelves.id, NOT NULL | Shelf |
| book_id | uuid | FK → books.id, NOT NULL | Book |
| position | integer | NOT NULL, default 0 | Sort order within shelf |
| added_at | timestamp | NOT NULL, default now | When book was added to shelf |

**Indexes**: `PRIMARY KEY(shelf_id, book_id)`

---

### reading_progress

Per-user, per-book reading state. One record per user-book pair.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Unique progress identifier |
| user_id | uuid | FK → users.id, NOT NULL | Reader |
| book_id | uuid | FK → books.id, NOT NULL | Book being read |
| current_page | integer | nullable | Current page number |
| total_pages | integer | nullable | Total pages (may differ from book.page_count for PDFs) |
| percentage | real | NOT NULL, default 0 | Progress 0.0–100.0 |
| cfi_position | text | nullable | EPUB CFI string for exact position |
| started_at | timestamp | nullable | When user first opened the book |
| last_read_at | timestamp | nullable | Last reading session |
| finished_at | timestamp | nullable | When marked as finished |
| time_spent_minutes | integer | default 0 | Accumulated reading time |

**Indexes**: `UNIQUE(user_id, book_id)`, `INDEX(user_id, last_read_at)`

**Notes**: `cfi_position` is an EPUB Content Fragment Identifier — a string that pinpoints the exact reading position within the EPUB structure. For PDFs, `current_page` is used instead.

---

### annotations

User highlights, bookmarks, and notes within books.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Unique annotation identifier |
| user_id | uuid | FK → users.id, NOT NULL | Annotator |
| book_id | uuid | FK → books.id, NOT NULL | Book |
| type | varchar(20) | NOT NULL | 'highlight', 'note', or 'bookmark' |
| content | text | nullable | Note text or highlighted text |
| note | text | nullable | Additional note on a highlight |
| cfi_position | text | nullable | EPUB CFI for position |
| page | integer | nullable | Page number (for PDFs) |
| color | varchar(20) | nullable | Highlight color name |
| created_at | timestamp | NOT NULL, default now | When created |
| updated_at | timestamp | NOT NULL, default now | Last edit |

**Indexes**: `INDEX(user_id, book_id)`, `INDEX(book_id, cfi_position)`

---

### api_keys

App passwords for OPDS clients and external API access. Each key is scoped and revocable.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Key identifier |
| user_id | uuid | FK → users.id, NOT NULL | Owner |
| name | varchar(100) | NOT NULL | User-given label (e.g., "KOReader") |
| key_hash | varchar(255) | NOT NULL | SHA-256 hash of the API key |
| key_prefix | varchar(8) | NOT NULL | First 8 chars for identification |
| scopes | text | NOT NULL, default '["opds"]' | JSON array of permitted scopes |
| last_used_at | timestamp | nullable | Last successful use |
| expires_at | timestamp | nullable | Optional expiry |
| created_at | timestamp | NOT NULL, default now | Creation date |

**Indexes**: `INDEX(user_id)`, `INDEX(key_prefix)`

**Scopes**: `opds` (browse/download via OPDS), `api` (full API access).

---

### sessions

Refresh token tracking for JWT auth. Allows token revocation and device management.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Session identifier |
| user_id | uuid | FK → users.id, NOT NULL | Session owner |
| refresh_token_hash | varchar(255) | NOT NULL | SHA-256 hash of refresh token |
| device_info | varchar(255) | nullable | User-agent or device description |
| ip_address | varchar(45) | nullable | Last known IP |
| expires_at | timestamp | NOT NULL | When refresh token expires |
| created_at | timestamp | NOT NULL, default now | Session start |

**Indexes**: `INDEX(user_id)`, `INDEX(refresh_token_hash)`

---

### metadata_cache

Cache of external metadata lookups to avoid redundant API calls.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen | Cache entry identifier |
| query_key | varchar(255) | NOT NULL | Search key (ISBN or "title::author") |
| source | varchar(20) | NOT NULL | 'google' or 'openlibrary' |
| data | text | NOT NULL | Full JSON response |
| fetched_at | timestamp | NOT NULL, default now | When fetched |

**Indexes**: `UNIQUE(query_key, source)`, `INDEX(fetched_at)`

**Notes**: Cache entries older than 30 days are considered stale and re-fetched on next access.

---

## Default Data

On first launch (setup flow), the system creates:

1. Admin user (from setup form)
2. Three default shelves per user:
   - 📖 Currently Reading
   - 🔖 Want to Read
   - ⭐ Favorites
3. One default smart shelf per user:
   - 📅 Recently Added (filter: added in last 30 days)

## Migration Strategy

Drizzle Kit handles migrations:

```bash
# Generate migration from schema changes
pnpm --filter server drizzle-kit generate

# Apply migrations
pnpm --filter server drizzle-kit migrate

# Push schema directly (dev only)
pnpm --filter server drizzle-kit push
```

SQLite migrations are stored in `packages/server/drizzle/sqlite/`. PostgreSQL migrations in `packages/server/drizzle/pg/`. The active driver is determined by the `DB_DRIVER` environment variable.
