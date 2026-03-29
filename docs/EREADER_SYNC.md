# E-Reader Sync — Implementation Plan

## Overview

Two layers of KOReader sync for Verso, built in order:

1. **kosync** (foundation) — reading position sync. Every KOReader user has this plugin built in. Syncs last-read position (progress marker + percentage) per document, per device. This is the baseline that makes Verso useful for e-reader users.

2. **KoInsight** (optional add-on) — rich reading statistics. Users who install the KoInsight KOReader plugin get per-page session data, reading time analytics, and annotation sync. Layers on top of kosync.

Both share common infrastructure (devices, book matching, auth). Build kosync first. KoInsight extends it.

---

## Part 1: Shared Infrastructure

### 1.1 Book Matching (MD5 bridge)

KOReader identifies books by MD5 hash of the file. Verso stores SHA-256 in `books.fileHash`. Same file, different hashes — they won't match.

**Add `md5Hash` to the `books` table:**

```typescript
// in packages/shared/src/schema.ts, add to books table:
md5Hash: text("md5_hash", { length: 32 }),
```

**Compute MD5 on upload** — in `packages/server/src/routes/upload.ts`, after the existing SHA-256:

```typescript
const md5Hash = createHash("md5").update(storedBuffer).digest("hex");
```

**Backfill existing books** — one-time script that reads each stored file from storage and computes MD5:

```
packages/server/src/scripts/backfill-md5.ts
```

### 1.2 Devices table

Shared by kosync and KoInsight. Tracks which e-reader devices belong to which user.

```typescript
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),              // device UUID or identifier
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name", { length: 255 }),      // user-editable label
  model: text("model", { length: 255 }),    // from KOReader (e.g. "Kindle")
  lastSeen: text("last_seen").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

### 1.3 Extend `readingSessions` and `readingProgress`

Add `source` and `deviceId` columns so web and e-reader data coexist cleanly:

```typescript
// readingSessions — add:
deviceId: text("device_id").references(() => devices.id),
source: text("source", { length: 20 }).default("web"),  // "web" | "kosync" | "koinsight"

// readingProgress — add:
deviceId: text("device_id").references(() => devices.id),
```

### 1.4 API Key Scope

Add `"kosync"` and `"plugin"` to valid scopes in `packages/server/src/services/api-keys.ts`. Users create a key with the appropriate scope in Settings for their device.

---

## Part 2: kosync

The kosync protocol is simple — 4 endpoints. KOReader has this plugin built in, so this is the integration that reaches every user.

### Protocol Reference

Auth: every request sends `x-auth-user` and `x-auth-key` (MD5 of password) headers. Verso should accept these headers and validate against its own user system. Since Verso doesn't use MD5 passwords, the simplest approach: treat `x-auth-key` as an API key (the `vso_` key), or allow users to set a dedicated "sync password" for kosync.

**Decision needed:** How to map kosync's `x-auth-user` / `x-auth-key` to Verso's auth. Options:

- **Option A: API key as x-auth-key.** User creates a Verso API key, enters their email as `x-auth-user` and the `vso_xxx` key as `x-auth-key`. Verso validates via existing `verifyApiKey`. Cleanest, no new auth code.
- **Option B: Dedicated sync password.** Add a `syncPasswordHash` to users table. User sets a sync password in Settings, enters it in KOReader. More like how original kosync works.

**Recommendation: Option A.** Reuses existing API key infrastructure. The OPDS integration already works this way (email + API key via Basic auth). Users already know the pattern.

### Endpoints

File: `packages/server/src/routes/kosync.ts`

#### POST /users/create

KOReader calls this to "register". In Verso's case, users already exist (they registered via web UI). This endpoint can either:
- Return 201 if the user/key combo is valid (no-op, just confirms the credentials work)
- Or return 402 if registration is disabled (Verso doesn't allow creating users via kosync)

```
Headers: x-auth-user, x-auth-key
Request body: { username: string, password: string }
Response: 201 { username: "..." }
```

#### GET /users/auth

Validates credentials. Returns 200 if the user + key are valid.

```
Headers: x-auth-user, x-auth-key
Response: 200 { authorized: "OK" }
```

#### PUT /syncs/progress

Push reading position from KOReader to Verso.

```
Headers: x-auth-user, x-auth-key
Request body: {
  document: string,     // MD5 hash of the book file
  progress: string,     // position marker (opaque string)
  percentage: number,   // 0-1 reading completion
  device: string,       // device model name
  device_id: string     // device identifier
}
Response: 200 { document: "...", timestamp: "..." }
```

Processing:
1. Authenticate via x-auth-user + x-auth-key
2. Upsert device in `devices` table (device_id + model + userId)
3. Match `document` (MD5) against `books.md5Hash` to find bookId
4. If book found: upsert `readingProgress` for this user + book
   - Set `currentPage` from progress if it's a page number, or store progress as-is
   - Set `percentage` from the request
   - Set `lastReadAt` to now
   - Set `deviceId`
   - If percentage >= 0.98, set `finishedAt`
5. If book not found: store the progress keyed by document hash anyway (so it can be retrieved by another device even if the book isn't in Verso's catalog)

**Unmatched documents:** Need a lightweight table to hold progress for books not in the Verso catalog:

```typescript
export const kosyncProgress = sqliteTable("kosync_progress", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentHash: text("document_hash", { length: 32 }).notNull(),
  progress: text("progress").notNull(),
  percentage: real("percentage").notNull(),
  deviceId: text("device_id").notNull(),
  device: text("device", { length: 255 }),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("kosync_progress_user_doc_idx").on(table.userId, table.documentHash),
]);
```

When a book is uploaded later and its MD5 matches a `documentHash`, migrate the progress to `readingProgress`.

#### GET /syncs/progress/:document

Pull latest reading position for a document.

```
Headers: x-auth-user, x-auth-key
Response: 200 {
  document: "...",
  progress: "...",
  percentage: 0.42,
  device: "Kindle",
  device_id: "...",
  timestamp: 1234567890
}
```

Processing:
1. Authenticate
2. Look up by `document` hash — first check `readingProgress` (via books.md5Hash join), then fall back to `kosyncProgress`
3. Return the latest position

### Route Registration

In `packages/server/src/app.ts`:

```typescript
registerKosyncRoutes(app, db, config);
```

### kosync Auth Middleware

Create `packages/server/src/middleware/kosync-auth.ts`:

Extract `x-auth-user` and `x-auth-key` headers, validate as email + API key using the existing `verifyApiKey` service with `"kosync"` scope.

```typescript
export function createKosyncAuthHook(db: AppDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const username = req.headers["x-auth-user"] as string;
    const key = req.headers["x-auth-key"] as string;
    if (!username || !key) return reply.code(401).send({ message: "Unauthorized" });

    const user = await verifyApiKey(db, username, key, "kosync");
    if (!user) return reply.code(401).send({ message: "Unauthorized" });

    req.user = { sub: user.userId, email: user.email, role: user.role };
  };
}
```

---

## Part 3: KoInsight (on top of kosync)

Users who want richer stats install the KoInsight KOReader plugin and point it at Verso. This adds four more endpoints.

### Prerequisites

- Part 1 (shared infra) and Part 2 (kosync) must be complete
- The `devices` table, book matching, and auth infrastructure are already in place

### New table: `pageStats`

This is the only truly new data KoInsight brings that has no existing home. Raw per-page reading segments — the foundation for rich analytics.

```typescript
export const pageStats = sqliteTable("page_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  bookId: text("book_id").references(() => books.id, { onDelete: "set null" }),
  bookMd5: text("book_md5").notNull(),
  deviceId: text("device_id").notNull().references(() => devices.id),
  page: integer("page").notNull(),
  startTime: integer("start_time").notNull(),     // unix timestamp
  duration: integer("duration").notNull(),         // seconds
  totalPages: integer("total_pages").notNull(),
}, (table) => [
  uniqueIndex("page_stats_dedup_idx")
    .on(table.deviceId, table.bookMd5, table.page, table.startTime),
]);
```

Store raw. Never aggregate at ingest. The unique index handles dedup since the plugin sends ALL stats every sync.

### Extend `annotations` for e-reader data

KOReader annotations use page numbers, not CFI positions. Make `cfiPosition` nullable, add `pageNumber`:

```typescript
// annotations table changes:
cfiPosition: text("cfi_position"),          // nullable now (was NOT NULL)
pageNumber: integer("page_number"),         // for e-reader annotations
deviceId: text("device_id").references(() => devices.id),
source: text("source", { length: 20 }).default("web"),
```

### Endpoints

File: `packages/server/src/routes/koinsight.ts`

Auth: use `createFlexAuthHook` (Bearer JWT or Basic with API key, scope `"plugin"`).

#### POST /api/plugin/device

```
Request:  { version: "0.3.0", id: string, model: string }
Response: 200 { message: "Device registered successfully" }
```

- Validate version === "0.3.0", reject 400 if not
- Upsert into `devices` (same table kosync uses)

#### POST /api/plugin/import

```
Request: {
  version: "0.3.0",
  device_id: string,
  books: Book[],
  stats: PageStat[],
  annotations: { [book_md5]: Annotation[] }
}
Response: 200 { message: "Upload successful" }
```

In a transaction:
1. Validate version
2. Verify device belongs to user
3. For each book: match md5 against `books.md5Hash`
4. Insert page stats → `pageStats` (ON CONFLICT DO NOTHING)
5. Synthesize `readingSessions` from page stats — group contiguous stats (gap > 5 min = new session), insert with `source: "koinsight"`, skip if already exists
6. Update `readingProgress` for matched books (latest page, percentage, cumulative time)
7. Replace annotations for each book_md5+device — delete old, insert new, with `source: "koinsight"`

#### GET /api/plugin/download

Serve KoInsight plugin zip. No auth. Configurable path.

#### GET /api/plugin/health

Return `200 { status: "ok", version: "0.3.0" }`. No auth.

### Stats Router Enhancements

The existing stats router queries `readingSessions`. Since KoInsight synthesizes sessions into that table, existing queries (daily reading, streaks, distribution) work automatically with combined web + e-reader data.

For deeper analytics from raw `pageStats`, add new procedures:

- `stats.readingVelocity` — pages/hour over time
- `stats.deviceBreakdown` — time by device
- `stats.pageHeatmap` — time distribution across pages of a book

These are additive — build them after the core integration works.

---

## Schema Summary

### New tables
| Table | Purpose | Used by |
|-------|---------|---------|
| `devices` | E-reader device registry | kosync + KoInsight |
| `kosyncProgress` | Progress for books not in Verso catalog | kosync |
| `pageStats` | Raw per-page reading data | KoInsight |

### Modified tables
| Table | Changes | Why |
|-------|---------|-----|
| `books` | Add `md5Hash` | Match KOReader book identification |
| `readingSessions` | Add `deviceId`, `source` | Distinguish web vs e-reader sessions |
| `readingProgress` | Add `deviceId` | Track which device last reported |
| `annotations` | Nullable `cfiPosition`, add `pageNumber`, `deviceId`, `source` | E-reader annotations use pages not CFI |

---

## Endpoint Summary

### kosync (Part 2)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/users/create` | Validate credentials (no-op registration) |
| GET | `/users/auth` | Authenticate |
| PUT | `/syncs/progress` | Push reading position |
| GET | `/syncs/progress/:document` | Pull reading position |

### KoInsight (Part 3)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/plugin/device` | Register device |
| POST | `/api/plugin/import` | Import stats + annotations |
| GET | `/api/plugin/download` | Serve plugin zip |
| GET | `/api/plugin/health` | Health check |

---

## File Summary

| Action | File | Part |
|--------|------|------|
| Edit | `packages/shared/src/schema.ts` | 1, 2, 3 |
| Edit | `packages/shared/src/validators.ts` | 2, 3 |
| Create | `packages/server/src/middleware/kosync-auth.ts` | 2 |
| Create | `packages/server/src/routes/kosync.ts` | 2 |
| Create | `packages/server/src/routes/koinsight.ts` | 3 |
| Edit | `packages/server/src/app.ts` | 2, 3 |
| Edit | `packages/server/src/routes/upload.ts` | 1 |
| Edit | `packages/server/src/services/api-keys.ts` | 1 |
| Create | `packages/server/src/scripts/backfill-md5.ts` | 1 |
| Edit | `packages/server/src/trpc/routers/stats.ts` | 3 (later) |
| Generate | `packages/server/drizzle/` | 1, 2, 3 |

---

## Implementation Order

### Phase 1: Foundation
1. Schema changes — `books.md5Hash`, `devices` table, `readingSessions`/`readingProgress` extensions
2. MD5 on upload + backfill script
3. Generate and run migration

### Phase 2: kosync
4. kosync auth middleware (`x-auth-user` / `x-auth-key` → API key validation)
5. `kosyncProgress` table + migration
6. Four kosync endpoints
7. Test with actual KOReader device

### Phase 3: KoInsight
8. `pageStats` table + `annotations` extensions + migration
9. KoInsight Zod validators
10. Four KoInsight endpoints (import logic: page stats, session synthesis, progress update, annotation replacement)
11. Test with KoInsight plugin pointing at Verso
12. Stats router enhancements (velocity, heatmap, device breakdown)

---

## Part 4: Stats & Progress Integration

The existing stats system was built for web reader data. E-reader sync needs to feed into it properly or stats will be incomplete/broken.

### How the stats system works today

**`progress.sync` (tRPC mutation):** Called by the web EPUB reader every 30 seconds. Upserts `readingProgress` (position, percentage, cumulative time) and creates/extends `readingSessions` rows using a 5-minute gap threshold. The web reader sends `timeSpentMinutes` on each sync.

**`stats.overview`:** Sums `readingSessions.durationMinutes` for total reading time, counts finished/in-progress from `readingProgress`, calculates current streak from unique days in `readingSessions`.

**`stats.dailyReading`:** Groups `readingSessions` by date, sums minutes per day.

**`stats.distribution`:** `INNER JOIN readingSessions → books`, groups reading time by `books.author`.

**`stats.readingLog`:** Paginated list of `readingSessions` joined to `books` (title, author, cover). Uses `INNER JOIN`.

### What kosync can and cannot feed

kosync only sends **position + percentage** — no time data. This means:
- kosync **can** update `readingProgress` (percentage, currentPage, lastReadAt) ✅
- kosync **cannot** create `readingSessions` (no duration data) ❌
- kosync-only users will have accurate progress bars but **zero reading time stats, no streaks, no daily reading charts**

This is a known limitation of kosync's protocol. The plan should make this clear in the UI: show a message like "Install KoInsight plugin for reading time stats" when a user has kosync progress but no sessions.

### What KoInsight feeds

KoInsight sends raw `page_stat_data` — per-page duration. From this we can synthesize full `readingSessions` rows:

**Session synthesis algorithm** (in the `/api/plugin/import` handler):

1. Sort incoming page stats by `start_time` for each book
2. Group into sessions: if gap between consecutive `start_time + duration` and next `start_time` is > 5 minutes, start a new session
3. For each session:
   - `startedAt` = ISO string of first stat's `start_time`
   - `endedAt` = ISO string of last stat's `start_time + duration`
   - `durationMinutes` = sum of all durations in the group, converted to minutes (round up)
   - `bookId` = matched Verso book ID (or skip if unmatched)
   - `deviceId` = device that sent the data
   - `source` = "koinsight"
4. Before inserting, check for existing session with same `deviceId` + `bookId` + `startedAt` to avoid duplicates on re-sync

These synthesized sessions are indistinguishable from web sessions to the stats router — same table, same columns.

### Stats router changes

**`stats.overview`** — works as-is. Synthesized KoInsight sessions have `durationMinutes`, so total time, avg/day, and streaks all include e-reader reading automatically.

**`stats.dailyReading`** — works as-is. Same reason.

**`stats.distribution`** — works as-is for matched books (inner join on `books`). Unmatched books are excluded. This is acceptable — if the book isn't in Verso's catalog, we don't have author metadata to group by.

**`stats.readingLog`** — currently uses `INNER JOIN` on books. **Change to `LEFT JOIN`** so KoInsight sessions for unmatched books can still appear in the log. When `bookId` is null, show the book title from the KoInsight import data instead.

To support this, store the KOReader-reported book title alongside the session. Two options:
- Add a `bookTitle` column to `readingSessions` (denormalized but simple)
- Look it up from `pageStats` by `bookMd5` at query time (normalized but slower)

**Recommendation: add `bookTitle` to `readingSessions`** as a nullable column, populated only for e-reader sessions where `bookId` is null. The readingLog query then becomes:

```sql
SELECT
  rs.*,
  COALESCE(b.title, rs.book_title) AS title,
  COALESCE(b.author, 'Unknown') AS author,
  b.cover_path
FROM reading_sessions rs
LEFT JOIN books b ON rs.book_id = b.id
WHERE rs.user_id = ?
ORDER BY rs.started_at DESC
```

### readingProgress interaction

Both kosync and KoInsight update `readingProgress`. Define priority:
- **Last write wins** on `percentage` and `currentPage` — whichever syncs more recently sets the current position
- **KoInsight is more accurate on time** — if both are present, KoInsight's cumulative time (from page stats) should be authoritative for `timeSpentMinutes`
- **Web reader and e-reader don't conflict** — a user won't read the same book on both simultaneously. If they switch between web and e-reader, progress naturally converges since both track percentage.

### Streak accuracy

Streaks count consecutive days with at least one `readingSession`. For kosync-only users, no sessions are created, so **kosync reading doesn't count toward streaks**. Only KoInsight (or web reading) contributes.

If this becomes a pain point, a future enhancement could estimate sessions from kosync progress changes (if percentage increased between syncs, infer a reading session on that day). But don't build this now — it's imprecise and KoInsight solves it properly.

### Summary of stats changes

| Component | Change needed | When |
|-----------|--------------|------|
| `readingSessions` table | Add `bookTitle` column (nullable) | Phase 3 |
| KoInsight import handler | Synthesize sessions from page stats | Phase 3 |
| `stats.readingLog` | Change INNER JOIN to LEFT JOIN, use COALESCE for title | Phase 3 |
| `stats.overview` | No change — works automatically | — |
| `stats.dailyReading` | No change — works automatically | — |
| `stats.distribution` | No change — unmatched books excluded (acceptable) | — |
| UI: stats page | Show "install KoInsight for reading time" hint for kosync-only users | Phase 3 |

---

## Open Decisions

1. **kosync auth mapping** — Option A (API key as x-auth-key) recommended. See Part 2 for details.
2. **Unmatched books** — what happens when KOReader syncs a book that's not in Verso? Current plan: store progress in `kosyncProgress`, show "unmatched books" in UI, auto-migrate when book is uploaded later.
3. **Annotation CFI migration** — making `cfiPosition` nullable in SQLite requires table recreation. Consider whether to do this in Phase 3 or plan for it from the start.
4. **KoInsight plugin version pinning** — currently hardcoded to "0.3.0". Consider making this configurable or range-based for forward compatibility.

---

## References

- [kosync api.json (KOReader source)](https://github.com/koreader/koreader/blob/master/plugins/kosync.koplugin/api.json)
- [kosync plugin main.lua](https://github.com/koreader/koreader/blob/master/plugins/kosync.koplugin/main.lua)
- [KoInsight (GitHub)](https://github.com/GeorgeSG/KoInsight)
- [kosync .NET reference implementation](https://github.com/jberlyn/kosync-dotnet)
