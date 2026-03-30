# Kobo Sync — Design Spec

## Overview

Emulate the Kobo Store API so Kobo e-readers can sync with Verso automatically — discovering and downloading books, syncing reading progress bidirectionally, and retaining access to the real Kobo store via transparent proxy. Inspired by Grimmory and Calibre-Web's Kobo integrations.

## Architecture

New Fastify route namespace at `/kobo/:token/*`. Each user gets a unique URL token. The Kobo device is configured to point at Verso's URL, and from then on it syncs automatically. A transparent proxy forwards unhandled requests to `storeapi.kobo.com` so the real Kobo store still works.

Reading progress feeds into the same `readingProgress` table used by the web reader and KOReader, giving unified cross-device progress.

## How the Kobo Protocol Works

1. **Device setup**: User edits `Kobo eReader.conf` on the device to set a custom API endpoint
2. **Initialization** (`GET /v1/initialization`): Verso proxies to Kobo's real API but rewrites resource URLs to point back to itself
3. **Library sync** (`GET /v1/library/sync`): Verso diffs current library against device snapshots, sends add/update/remove entitlements. Paginated via `X-Kobo-Sync: continue` header
4. **Book download** (`GET /v1/books/{bookId}/download`): Device pulls EPUB or KEPUB file
5. **Progress sync** (`PUT /v1/library/{bookId}/state`): Kobo pushes reading state → writes to unified `readingProgress`
6. **Auth** (`POST /v1/auth/device`): Returns synthetic auth tokens
7. **Catch-all proxy**: Everything else forwarded to `storeapi.kobo.com`

## Database

### `koboSettings` table

| Column         | Type    | Notes                                     |
|----------------|---------|-------------------------------------------|
| id             | TEXT PK | UUID                                      |
| userId         | TEXT FK | → users.id, UNIQUE (one config per user)  |
| token          | TEXT    | UNIQUE, crypto.randomUUID — used in URL   |
| convertToKepub | BOOLEAN | default true                              |
| enabled        | BOOLEAN | default true                              |
| createdAt      | TEXT    | ISO timestamp                             |
| updatedAt      | TEXT    | ISO timestamp                             |

### `koboSyncSnapshots` table

Tracks what the device knows about — used to compute sync diffs.

| Column       | Type    | Notes                                                 |
|--------------|---------|-------------------------------------------------------|
| id           | TEXT PK | UUID                                                  |
| userId       | TEXT FK | → users.id, ON DELETE CASCADE                         |
| bookId       | TEXT FK | → books.id, ON DELETE CASCADE                         |
| entitlementId| TEXT    | Kobo-format UUID for the book entitlement             |
| lastModified | TEXT    | ISO timestamp — book's updatedAt at time of last sync |
| createdAt    | TEXT    | ISO timestamp                                         |

Unique index on `(userId, bookId)`.

## Sync Token Auth

The URL token IS the auth — no username/password needed for the Kobo device. Middleware extracts the token from `/kobo/:token/*`, looks up the user in `koboSettings`, and attaches them to the request. Matches the approach used by Grimmory and Calibre-Web.

Token is a `crypto.randomUUID()` — sufficiently random and unguessable. Users can regenerate their token (invalidates the old URL).

## Kobo API Endpoints

All routes are prefixed with `/kobo/:token`.

### `POST /v1/auth/device`
Returns synthetic auth tokens so the device accepts the server.
```json
{
  "AccessToken": "...",
  "RefreshToken": "...",
  "TokenType": "Bearer",
  "TrackingId": "...",
  "UserKey": "..."
}
```

### `GET /v1/initialization`
Proxies to `https://storeapi.kobo.com/v1/initialization` and rewrites key resource URLs:
- `image_host` → Verso's URL
- `library_sync` → `/kobo/:token/v1/library/sync`
- `image_url_template` → Verso's cover endpoint pattern
- `image_url_quality_template` → same

Other URLs left pointing to real Kobo servers.

### `GET /v1/library/sync`

Core sync mechanism:

1. Read `X-Kobo-SyncToken` header (contains Verso's snapshot state)
2. Query all books in user's library
3. Diff against `koboSyncSnapshots`:
   - Book in library but no snapshot → `NewEntitlement`
   - Book in library, snapshot exists but `updatedAt` changed → `ChangedEntitlement`
   - Snapshot exists but book deleted → `ChangedReadingState` with `StatusInfo.Status: "RevisionChanged"` (signals removal)
4. Return paginated results (batch of 100 per response)
5. If more items remain, set `X-Kobo-Sync: continue` header
6. Update snapshots after sending
7. Merge with real Kobo store sync results (proxy call)

### Entitlement Payload Structure

```json
{
  "NewEntitlement": {
    "BookEntitlement": {
      "Id": "{entitlementId}",
      "Accessibility": "Full",
      "ActivePeriod": { "From": "2026-01-01T00:00:00Z" },
      "Created": "{book.createdAt}",
      "CrossRevisionId": "{entitlementId}",
      "IsHiddenFromArchive": false,
      "IsLocked": false,
      "IsRemoved": false,
      "LastModified": "{book.updatedAt}",
      "OriginCategory": "Imported",
      "RevisionId": "{entitlementId}",
      "Status": "Active"
    },
    "BookMetadata": {
      "Categories": [],
      "ContributorRoles": [{ "Name": "{author}" }],
      "CoverImageId": "{bookId}",
      "Description": "{description}",
      "DownloadUrls": [{
        "Format": "EPUB",
        "Size": {fileSize},
        "Url": "/kobo/{token}/v1/books/{bookId}/download",
        "Platform": "Generic"
      }],
      "EntitlementId": "{entitlementId}",
      "Language": "{language}",
      "PublicationDate": "{year}-01-01T00:00:00Z",
      "Publisher": { "Name": "{publisher}" },
      "RevisionId": "{entitlementId}",
      "Series": { "Name": "{series}", "Number": "{seriesIndex}" },
      "Title": "{title}",
      "WorkId": "{entitlementId}"
    },
    "ReadingState": {
      "LastModified": "{progress.lastReadAt}",
      "CurrentBookmark": {
        "Location": { "Value": "{percentage}" },
        "ProgressPercent": {percentage}
      }
    }
  }
}
```

### `GET /v1/books/{bookId}/download`

1. Look up book by ID
2. If `convertToKepub` is enabled and book is EPUB:
   - Check if cached KEPUB exists (`books/{id}/book.kepub.epub`)
   - If not, convert via Calibre: `ebook-convert input.epub output.kepub.epub`
   - Serve the KEPUB file
3. Otherwise serve the original file
4. Set `Content-Disposition` header with filename

### `PUT /v1/library/{bookId}/state`

Receives Kobo reading state and writes to unified `readingProgress`:

1. Parse the Kobo state payload (contains `StatusInfo`, `CurrentBookmark`)
2. Extract percentage from `CurrentBookmark.ProgressPercent`
3. Upsert `readingProgress` for this user + book
4. Register/update Kobo device in `devices` table (model: "Kobo", id from device serial)
5. Create `readingSessions` entry with source `"kobo"`

### `GET /v1/books/{bookId}/metadata/image/*`

Serve book cover images. Maps Kobo's cover image URL pattern to Verso's existing cover endpoint.

### Catch-All Proxy

```
ALL /kobo/:token/*
```

Any request not matched by the above routes is proxied to `https://storeapi.kobo.com` with:
- Original HTTP method, headers, and body
- Token stripped from the URL path
- Response passed through unmodified

Uses `undici` (`globalThis.fetch` or `undici.request`) — no new dependencies needed (bundled with Node.js 18+).

## Format Conversion: EPUB → KEPUB

Uses Calibre's `ebook-convert` (already available in Docker image):

```bash
ebook-convert book.epub book.kepub.epub
```

- Conversion triggered on first download request (lazy)
- Result cached at `books/{id}/book.kepub.epub`
- Cache invalidated when book file is updated (check `updatedAt`)
- Conversion failure → fall back to serving original EPUB (Kobo can read EPUB, just with fewer features)
- Optional per user via `koboSettings.convertToKepub`

### Why KEPUB?

Kobo devices render KEPUB files significantly better than plain EPUB:
- Proper page statistics and reading time estimates
- Better typography and hyphenation
- Kobo-specific features (highlights sync, dictionary integration)
- Faster page turns

## Backend

### New Files

- `packages/shared/src/kobo-validators.ts` — Zod schemas for Kobo settings, sync tokens
- `packages/server/src/routes/kobo.ts` — all Kobo Fastify routes
- `packages/server/src/services/kobo-sync.ts` — library diffing, entitlement generation, snapshot management
- `packages/server/src/services/kobo-proxy.ts` — transparent proxy to storeapi.kobo.com
- `packages/server/src/services/kobo-convert.ts` — EPUB → KEPUB conversion via Calibre
- `packages/server/src/middleware/kobo-auth.ts` — token-based auth middleware
- `packages/server/src/trpc/routers/kobo.ts` — tRPC router for settings UI

### tRPC Router: `kobo`

| Procedure           | Type     | Description                              |
|---------------------|----------|------------------------------------------|
| `getSettings`       | query    | Returns Kobo sync config + sync URL      |
| `enableSync`        | mutation | Creates koboSettings with new token      |
| `disableSync`       | mutation | Deletes koboSettings + snapshots         |
| `regenerateToken`   | mutation | New token, clears snapshots (re-sync)    |
| `updateSettings`    | mutation | Toggle KEPUB conversion                  |

## Frontend

### Account Page: "Kobo Sync" Section

- **Enable/disable toggle** — creates or removes the sync config
- **Sync URL display** (when enabled):
  - Full URL: `https://your-domain.com/kobo/{token}`
  - Copy button
  - QR code (optional, for easy reference)
- **Setup instructions** (collapsible):
  1. Connect Kobo to computer via USB
  2. Open `.kobo/Kobo/Kobo eReader.conf`
  3. Find `[OneStoreServices]` section
  4. Set `api_endpoint=https://your-domain.com/kobo/{token}`
  5. Eject and disconnect — device will sync on next WiFi connection
- **KEPUB conversion toggle** with explanation
- **Regenerate token button** with confirmation dialog (warns it will require re-configuring the device)

### Book Detail View

No explicit Kobo UI — sync is automatic. The book appears on the device after the next sync cycle.

## Reading Progress Integration

Kobo progress writes to the same `readingProgress` table as web and KOReader:

- **Device registration**: Kobo serial number → `devices.id`, model set to `"Kobo {model}"`
- **Progress**: percentage from Kobo's `CurrentBookmark.ProgressPercent` → `readingProgress.percentage`
- **Sessions**: source tracked as `"kobo"` in `readingSessions`
- **Bidirectional**: progress set by the web reader or KOReader is picked up by Kobo on next sync (via the `ReadingState` in entitlement payload)

## Error Handling

| Scenario                 | Behavior                                                       |
|--------------------------|----------------------------------------------------------------|
| Invalid/expired token    | 401 response — device shows "sync failed"                      |
| KEPUB conversion failure | Serve original EPUB as fallback, log warning                   |
| Proxy timeout            | 504 response — device retries automatically on next sync cycle |
| Book deleted mid-sync    | Removal entitlement sent on next sync                          |
| Kobo sync disabled       | All `/kobo/:token/*` routes return 401                         |

## Security

- Token is a UUID — sufficiently random (122 bits of entropy)
- Token never logged or exposed except in Account settings UI
- Proxy strips Verso auth headers before forwarding to Kobo servers
- Proxy only forwards to `storeapi.kobo.com` — no open redirect
- Rate limiting: inherit existing Fastify rate limits
- **HTTPS required**: Kobo devices reject non-HTTPS API endpoints. Setup instructions should note that Verso must be behind a reverse proxy with TLS (e.g., Caddy, nginx, Traefik)

## i18n

All UI strings in namespace `kobo.*` (e.g., `kobo.syncUrl`, `kobo.setupInstructions`, `kobo.kepubConversion`).
