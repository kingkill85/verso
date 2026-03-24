# API Specification

Verso exposes two API layers: a tRPC router for typed JSON operations and standard Fastify routes for binary/XML operations.

## tRPC Router

All tRPC procedures are available at `/trpc/*`. The frontend accesses them via the typed tRPC client — no manual fetch calls needed.

### Auth Router (`auth.*`)

| Procedure | Type | Auth | Input | Output | Description |
|-----------|------|------|-------|--------|-------------|
| `register` | mutation | none | `{ email, password, displayName }` | `{ user, accessToken, refreshToken }` | Create local account. Disabled if `AUTH_MODE=oidc`. |
| `login` | mutation | none | `{ email, password }` | `{ user, accessToken, refreshToken }` | Local login. Returns JWT pair. |
| `refresh` | mutation | none | `{ refreshToken }` | `{ accessToken, refreshToken }` | Exchange refresh token for new pair. Rotates refresh token. |
| `me` | query | required | — | `User` | Get current authenticated user. |
| `getOIDCAuthUrl` | query | none | — | `{ url, state }` | Generate OIDC authorization URL. Frontend redirects user here. |
| `linkOIDC` | mutation | required | `{ code, state }` | `{ user }` | Link OIDC identity to existing account. |
| `unlinkOIDC` | mutation | required | — | `{ user }` | Remove OIDC link (only if password is set). |
| `logout` | mutation | required | — | `{ success }` | Invalidate current refresh token. |
| `updateProfile` | mutation | required | `{ displayName?, avatarUrl? }` | `{ user }` | Update user profile. |
| `changePassword` | mutation | required | `{ currentPassword, newPassword }` | `{ success }` | Change local password. |

### Books Router (`books.*`)

| Procedure | Type | Auth | Input | Output | Description |
|-----------|------|------|-------|--------|-------------|
| `list` | query | required | `{ shelf?, search?, genre?, author?, format?, sort?, page?, limit? }` | `{ books: Book[], total, page }` | List books with filters and pagination. `sort`: title, author, recent, progress, rating. |
| `byId` | query | required | `{ id }` | `Book` (with full metadata) | Get single book with all details. |
| `update` | mutation | required | `{ id, title?, author?, genre?, description?, tags?, ... }` | `Book` | Update book metadata. Sets `metadata_locked = true`. |
| `delete` | mutation | required | `{ id }` | `{ success }` | Delete book, file, and cover. |
| `search` | query | required | `{ query, limit? }` | `Book[]` | Full-text search across title, author, description, ISBN. |
| `recentlyAdded` | query | required | `{ limit? }` | `Book[]` | Get most recently added books. |
| `currentlyReading` | query | required | — | `(Book & ReadingProgress)[]` | Books with active reading progress for current user. |

### Shelves Router (`shelves.*`)

| Procedure | Type | Auth | Input | Output | Description |
|-----------|------|------|-------|--------|-------------|
| `list` | query | required | — | `Shelf[]` (with book counts) | List all shelves for current user, ordered by position. |
| `byId` | query | required | `{ id, page?, limit? }` | `Shelf & { books: Book[] }` | Get shelf with its books. Smart shelves are computed on query. |
| `create` | mutation | required | `{ name, emoji?, description?, isSmart?, smartFilter? }` | `Shelf` | Create a new shelf. |
| `update` | mutation | required | `{ id, name?, emoji?, description?, smartFilter?, position? }` | `Shelf` | Update shelf properties. |
| `delete` | mutation | required | `{ id }` | `{ success }` | Delete shelf (does not delete books). |
| `addBook` | mutation | required | `{ shelfId, bookId }` | `{ success }` | Add a book to a manual shelf. |
| `removeBook` | mutation | required | `{ shelfId, bookId }` | `{ success }` | Remove a book from a shelf. |
| `reorder` | mutation | required | `{ shelfId, bookIds: string[] }` | `{ success }` | Reorder books within a shelf. |
| `reorderShelves` | mutation | required | `{ shelfIds: string[] }` | `{ success }` | Reorder shelves in sidebar. |

### Progress Router (`progress.*`)

| Procedure | Type | Auth | Input | Output | Description |
|-----------|------|------|-------|--------|-------------|
| `get` | query | required | `{ bookId }` | `ReadingProgress \| null` | Get reading progress for a book. |
| `sync` | mutation | required | `{ bookId, currentPage?, percentage, cfiPosition?, timeSpentMinutes? }` | `ReadingProgress` | Update reading progress. Auto-sets `started_at` and `finished_at`. |
| `stats` | query | required | `{ period?: 'week' \| 'month' \| 'year' \| 'all' }` | `ReadingStats` | Aggregated reading statistics. |
| `history` | query | required | `{ limit?, offset? }` | `ProgressEntry[]` | Reading history sorted by last_read_at. |
| `markFinished` | mutation | required | `{ bookId }` | `ReadingProgress` | Manually mark book as finished. |
| `resetProgress` | mutation | required | `{ bookId }` | `{ success }` | Clear reading progress for a book. |

**ReadingStats shape**:
```typescript
{
  totalBooksRead: number;
  totalPagesRead: number;
  totalTimeMinutes: number;
  currentStreak: number;       // consecutive days with reading activity
  longestStreak: number;
  booksThisPeriod: number;
  pagesThisPeriod: number;
  dailyPages: { date: string; pages: number }[];
  genreDistribution: { genre: string; count: number }[];
}
```

### Metadata Router (`metadata.*`)

| Procedure | Type | Auth | Input | Output | Description |
|-----------|------|------|-------|--------|-------------|
| `search` | query | required | `{ query, isbn? }` | `ExternalBook[]` | Search Google Books + Open Library. Returns merged, deduplicated results. |
| `apply` | mutation | required | `{ bookId, externalBook: ExternalBook }` | `Book` | Apply external metadata to a local book. Merges fields (doesn't overwrite user edits). |
| `refresh` | mutation | required | `{ bookId }` | `Book` | Re-fetch metadata from external sources for a book. |

**ExternalBook shape**:
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
  coverUrl?: string;           // URL to cover image
  confidence: number;          // 0-1 match confidence score
}
```

### Admin Router (`admin.*`)

| Procedure | Type | Auth | Input | Output | Description |
|-----------|------|------|-------|--------|-------------|
| `listUsers` | query | admin | — | `User[]` | List all users. |
| `updateUserRole` | mutation | admin | `{ userId, role }` | `User` | Change user role. |
| `deleteUser` | mutation | admin | `{ userId }` | `{ success }` | Delete user and their data. |
| `getSystemInfo` | query | admin | — | `SystemInfo` | DB size, book count, storage used, version. |
| `inviteUser` | mutation | admin | `{ email, role? }` | `{ inviteUrl }` | Generate invite link. |

### API Keys Router (`apiKeys.*`)

| Procedure | Type | Auth | Input | Output | Description |
|-----------|------|------|-------|--------|-------------|
| `list` | query | required | — | `ApiKey[]` (without actual key) | List user's API keys. |
| `create` | mutation | required | `{ name, scopes?, expiresAt? }` | `{ apiKey: ApiKey, plainKey: string }` | Create new API key. `plainKey` only shown once. |
| `delete` | mutation | required | `{ id }` | `{ success }` | Revoke an API key. |

---

## Fastify Routes

These routes handle binary data, file uploads, and XML that don't fit the tRPC JSON model.

### File Upload

```
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body:
  - file: binary (epub, pdf, or mobi)
  - shelfId?: string (optional, add to shelf after upload)

Response: 201
{
  "book": { Book object },
  "metadataStatus": "complete" | "partial" | "needs_review"
}
```

Accepts single file upload. Max file size configurable via `MAX_UPLOAD_SIZE` (default 100MB). The server:
1. Validates file type by magic bytes (not just extension)
2. Stores file at `data/books/{uuid}/book.{ext}`
3. Extracts metadata and cover
4. Triggers background metadata enrichment
5. Returns the created book record

### File Streaming

```
GET /api/books/:id/file
Authorization: Bearer <token>

Response: 200
Content-Type: application/epub+zip | application/pdf
Content-Disposition: attachment; filename="book-title.epub"

Body: binary stream
```

Streams the ebook file. Supports HTTP Range requests for PDF partial loading. The reader uses this endpoint to load ebook content.

### Cover Images

```
GET /api/covers/:bookId
Authorization: Bearer <token> (optional — allows caching)

Query: ?w=200&h=300 (optional resize)

Response: 200
Content-Type: image/jpeg
Cache-Control: public, max-age=86400

Body: image bytes
```

Serves cover images with optional on-the-fly resizing via `sharp`. Covers are cached after first resize.

### OIDC Callback

```
GET /auth/callback?code=xxx&state=yyy

Response: 302 → /#/auth/complete?token=xxx
```

Handles the OIDC authorization code callback. Exchanges code for tokens, validates ID token, creates/links user, issues Verso JWT, and redirects to the frontend.

---

## OPDS Catalog

OPDS routes are served at `/opds/*` and return Atom XML. Authentication is via HTTP Basic Auth using app passwords.

### Root Catalog

```
GET /opds/catalog
Authorization: Basic <base64(email:app_password)>

Response: 200
Content-Type: application/atom+xml;profile=opds-catalog
```

Navigation feed with links to:
- All Books
- Recently Added
- Each user shelf
- Search endpoint

### Book Listings

```
GET /opds/all?page=1
GET /opds/shelves/:shelfId?page=1
GET /opds/recent

Response: 200
Content-Type: application/atom+xml;profile=opds-catalog
```

Acquisition feeds with book entries. Each entry includes:
- Title, author, summary
- Acquisition link (download URL)
- Cover image link
- Format information

### Search

```
GET /opds/search?q=dune

Response: 200
Content-Type: application/atom+xml;profile=opds-catalog
```

OpenSearch-powered search across the user's library.

### Download

```
GET /opds/books/:id/download
Authorization: Basic <base64(email:app_password)>

Response: 200
Content-Type: application/epub+zip
```

Direct file download for OPDS clients.

### OpenSearch Descriptor

```
GET /opds/opensearch.xml

Response: 200
Content-Type: application/opensearchdescription+xml
```

Required by OPDS spec so reader apps know how to search.

---

## Error Handling

All tRPC procedures use standard tRPC error codes:

| Code | HTTP | Usage |
|------|------|-------|
| `BAD_REQUEST` | 400 | Invalid input (Zod validation failure) |
| `UNAUTHORIZED` | 401 | Missing or expired token |
| `FORBIDDEN` | 403 | Insufficient role (e.g., non-admin accessing admin routes) |
| `NOT_FOUND` | 404 | Book, shelf, or user not found |
| `CONFLICT` | 409 | Duplicate (e.g., book already on shelf, email taken) |
| `PAYLOAD_TOO_LARGE` | 413 | Upload exceeds size limit |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

Error shape:
```typescript
{
  code: string;
  message: string;
  details?: Record<string, string[]>;  // field-level validation errors
}
```

## Rate Limiting

- Auth endpoints (`login`, `register`): 10 requests per minute per IP
- Upload: 20 uploads per hour per user
- Metadata search: 30 requests per minute per user (to respect external API limits)
- All other endpoints: 200 requests per minute per user
