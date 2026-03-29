# E-Reader Sync — Design Spec

## Overview

Two layers of KOReader sync for Verso, built sequentially:

1. **kosync** (foundation) — reading position sync. Built into every KOReader install. Syncs last-read position + percentage per document. Baseline integration that reaches every e-reader user.
2. **KoInsight** (optional) — rich reading statistics. Users who install the KoInsight KOReader plugin get per-page session data, reading time analytics, and annotation sync.

Both share common infrastructure (devices, book matching, auth). All schema changes ship in one migration.

## Resolved Decisions

| Decision | Resolution |
|----------|-----------|
| kosync auth mapping | **Option A** — API key as `x-auth-key`. User enters email as `x-auth-user` and `vso_xxx` key as `x-auth-key`. Reuses existing `verifyApiKey` infrastructure. |
| Unmatched books | Store progress in `kosyncProgress` table. Auto-migrate to `readingProgress` when matching book is uploaded. Required for kosync standard compliance. |
| KoInsight version | `>= 0.3.0` semver minimum, not exact match. |
| Annotation `cfiPosition` nullable | Handle in Phase 1 migration alongside all other schema changes. |

---

## Phase 1: Foundation

### 1.1 Schema Changes (Single Migration)

**New tables:**

`devices` — E-reader device registry, shared by kosync and KoInsight.
- `id` (text PK) — device UUID or identifier
- `userId` (FK → users, cascade delete)
- `name` (text, 255) — user-editable label
- `model` (text, 255) — from KOReader (e.g. "Kindle")
- `lastSeen` (text, NOT NULL)
- `createdAt` (text, default now)

`kosyncProgress` — Progress for books not in Verso's catalog.
- `id` (text PK, UUID)
- `userId` (FK → users, cascade delete)
- `documentHash` (text, 32, NOT NULL) — MD5 from KOReader
- `progress` (text, NOT NULL) — opaque position marker
- `percentage` (real, NOT NULL) — 0-1
- `deviceId` (text, NOT NULL)
- `device` (text, 255) — device model name
- `updatedAt` (text, NOT NULL)
- Unique index on (userId, documentHash)

`pageStats` — Raw per-page reading data from KoInsight.
- `id` (integer PK, autoincrement)
- `userId` (FK → users)
- `bookId` (FK → books, SET NULL on delete, nullable)
- `bookMd5` (text, NOT NULL)
- `deviceId` (FK → devices)
- `page` (integer, NOT NULL)
- `startTime` (integer, NOT NULL) — unix timestamp
- `duration` (integer, NOT NULL) — seconds
- `totalPages` (integer, NOT NULL)
- Unique dedup index on (deviceId, bookMd5, page, startTime)

**Modified tables:**

`books`:
- Add `md5Hash` (text, 32, nullable) — MD5 of the book file for KOReader matching

`readingSessions`:
- Add `deviceId` (FK → devices, nullable)
- Add `source` (text, 20, default "web") — "web" | "kosync" | "koinsight"
- Add `bookTitle` (text, nullable) — for unmatched KoInsight books where bookId is null

`readingProgress`:
- Add `deviceId` (FK → devices, nullable) — "last synced from" metadata; record stays one-per-user-per-book

`annotations`:
- Make `cfiPosition` nullable (was NOT NULL)
- Add `pageNumber` (integer, nullable) — for e-reader annotations
- Add `deviceId` (FK → devices, nullable)
- Add `source` (text, 20, default "web")

`apiKeys` scopes enum:
- Add `"kosync"` and `"plugin"` to valid scopes

### 1.2 MD5 on Upload

In the upload route, after SHA-256 computation:
```typescript
const md5Hash = createHash("md5").update(storedBuffer).digest("hex");
```

Store in `books.md5Hash` on insert.

**Auto-migration on upload:** After inserting the book, check `kosyncProgress` for matching `documentHash`. If found, create a `readingProgress` record from the kosync data and delete the `kosyncProgress` entry.

### 1.3 MD5 Backfill Script

`packages/server/src/scripts/backfill-md5.ts` — reads each stored book file, computes MD5, updates `books.md5Hash`. One-time run for existing libraries.

---

## Phase 2: kosync

### 2.1 Auth Middleware

`packages/server/src/middleware/kosync-auth.ts`:
- Extract `x-auth-user` (email) and `x-auth-key` (API key) headers
- Validate via `verifyApiKey(db, email, key, "kosync")`
- Set `req.user = { sub, email, role }` on success
- Return 401 if missing or invalid

### 2.2 Endpoints

File: `packages/server/src/routes/kosync.ts`

#### POST /users/create
No-op registration. Returns 201 if credentials are valid (user exists, key valid). Returns 402 if not.

#### GET /users/auth
Validate credentials. Returns `200 { authorized: "OK" }`.

#### PUT /syncs/progress
Push reading position from KOReader.

Request body: `{ document, progress, percentage, device, device_id }`

Processing:
1. Authenticate via headers
2. Upsert device in `devices` (device_id + model + userId)
3. Match `document` (MD5) against `books.md5Hash`
4. If matched: upsert `readingProgress` (percentage, lastReadAt, deviceId; finishedAt if >= 0.98)
5. If unmatched: upsert `kosyncProgress` keyed by userId + documentHash

Response: `200 { document, timestamp }`

#### GET /syncs/progress/:document
Pull latest position.

Processing:
1. Authenticate
2. Look up by document hash — first `readingProgress` (via books.md5Hash join), then `kosyncProgress`
3. Return latest position with timestamp

### 2.3 Route Registration

In `app.ts`: `registerKosyncRoutes(app, db, config)`

---

## Phase 3: KoInsight

### 3.1 Auth

Uses existing `createFlexAuthHook(config, db)` with scope `"plugin"` (Bearer JWT or Basic with API key). Two endpoints unauthenticated: health and download.

### 3.2 Endpoints

File: `packages/server/src/routes/koinsight.ts`

#### POST /api/plugin/device
Register/upsert device. Validate version >= 0.3.0 (semver), reject 400 if below minimum.

Request: `{ version, id, model }`
Response: `200 { message: "Device registered successfully" }`

#### POST /api/plugin/import
Bulk import stats + annotations in a single transaction.

Request: `{ version, device_id, books, stats, annotations }`

Processing:
1. Validate version >= 0.3.0
2. Verify device belongs to user
3. Match book MD5s against `books.md5Hash`
4. Insert page stats into `pageStats` (ON CONFLICT DO NOTHING)
5. Synthesize `readingSessions` from page stats:
   - Sort by `start_time` per book
   - Gap > 5 minutes = new session
   - `durationMinutes` = sum of durations in group (rounded up to minutes)
   - `source` = "koinsight", `deviceId` from request
   - `bookTitle` populated for unmatched books (bookId null)
   - Skip if existing session with same deviceId + bookId + startedAt
6. Update `readingProgress` for matched books (latest page, percentage, cumulative time from page stats)
7. Replace annotations per book_md5 + device (delete old, insert new, source "koinsight")

Response: `200 { message: "Upload successful" }`

#### GET /api/plugin/download
Serve KoInsight plugin zip. No auth. Configurable path via config.

#### GET /api/plugin/health
Return `200 { status: "ok", version: "0.3.0" }`. No auth.

### 3.3 Route Registration

In `app.ts`: `registerKoInsightRoutes(app, db, storage, config)`

---

## Phase 4: Stats & Progress Integration

### What works automatically
- `stats.overview` — synthesized sessions have `durationMinutes`, totals/streaks/averages include e-reader data
- `stats.dailyReading` — same reason
- `stats.distribution` — works for matched books, unmatched excluded (acceptable)

### What needs changing

**`stats.readingLog`** — change INNER JOIN to LEFT JOIN on books:
```sql
SELECT rs.*, COALESCE(b.title, rs.book_title) AS title,
       COALESCE(b.author, 'Unknown') AS author, b.cover_path
FROM reading_sessions rs
LEFT JOIN books b ON rs.book_id = b.id
WHERE rs.user_id = ?
ORDER BY rs.started_at DESC
```

### kosync limitation
kosync sends position only — no time data. kosync-only users get progress bars but zero reading time stats/streaks. No workaround; KoInsight solves this properly.

### Progress priority
- Last write wins on percentage/position (whichever device syncs most recently)
- KoInsight is authoritative for `timeSpentMinutes` (computed from raw page stats)
- Web and e-reader don't conflict — user won't read same book on both simultaneously

---

## File Summary

| Action | File | Phase |
|--------|------|-------|
| Edit | `packages/shared/src/schema.ts` | 1 |
| Edit | `packages/shared/src/validators.ts` | 2, 3 |
| Create | `packages/server/src/middleware/kosync-auth.ts` | 2 |
| Create | `packages/server/src/routes/kosync.ts` | 2 |
| Create | `packages/server/src/routes/koinsight.ts` | 3 |
| Edit | `packages/server/src/app.ts` | 2, 3 |
| Edit | `packages/server/src/routes/upload.ts` | 1 |
| Edit | `packages/server/src/services/api-keys.ts` | 1 |
| Create | `packages/server/src/scripts/backfill-md5.ts` | 1 |
| Edit | `packages/server/src/trpc/routers/stats.ts` | 4 |
| Generate | `packages/server/drizzle/` | 1 |

## References

- [kosync api.json (KOReader source)](https://github.com/koreader/koreader/blob/master/plugins/kosync.koplugin/api.json)
- [kosync plugin main.lua](https://github.com/koreader/koreader/blob/master/plugins/kosync.koplugin/main.lua)
- [KoInsight (GitHub)](https://github.com/GeorgeSG/KoInsight)
- [kosync .NET reference implementation](https://github.com/jberlyn/kosync-dotnet)
