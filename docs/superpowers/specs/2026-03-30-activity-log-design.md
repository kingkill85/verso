# Activity Log — Design Spec

## Problem

Debugging sync issues, uploads, and metadata changes requires digging through JSON docker logs. No way to see what happened at a glance. Need a human-readable admin log viewer.

## Solution

Database-backed activity log with rolling 5000 entries. Log all significant events (syncs, uploads, imports, exports, metadata). Admin-only page to view and filter.

---

## Section 1: Database Table

```sql
activity_log (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  user_id    TEXT,
  book_id    TEXT,
  book_title TEXT,
  details    TEXT,
  level      TEXT DEFAULT 'info',
  created_at TEXT NOT NULL
)
```

- `type`: one of `sync.push`, `sync.pull`, `upload`, `import`, `export`, `metadata.apply`
- `level`: `info`, `warn`, `error`
- `details`: JSON string with event-specific data
- `book_title`: denormalized so logs are readable after book deletion
- Auto-prune: after every INSERT, delete oldest rows if count > 5000

### Details JSON by event type

| Type | Details |
|------|---------|
| sync.push | `{ device, md5, matched, bookTitle, percentage, xpointerToCfi: "ok"/"failed"/"skipped" }` |
| sync.push (no match) | `{ device, md5, matched: false }` |
| sync.pull | `{ device, md5, matched, percentage }` |
| upload | `{ fileName, fileSize, fileFormat }` |
| import | `{ format, bookCount }` |
| export | `{ format, bookCount }` |
| metadata.apply | `{ source, fields: ["title", "author", "cover"] }` |

---

## Section 2: Logging Service

New file: `packages/server/src/services/activity-log.ts`

```typescript
logActivity(db, {
  type: "sync.push",
  userId?: string,
  bookId?: string,
  bookTitle?: string,
  level?: "info" | "warn" | "error",  // default "info"
  details?: Record<string, unknown>,
})
```

- Non-blocking: fire-and-forget, errors caught and ignored
- After insert, prune if count > 5000 (delete oldest)
- Called from: kosync routes, upload route, import route, export route, metadata router

---

## Section 3: Admin API

New tRPC query: `admin.activityLog` using `adminProcedure`.

Input:
- `type?`: filter by event type
- `level?`: filter by level
- `limit`: default 100, max 500
- `offset`: for pagination

Returns array of log entries, newest first.

---

## Section 4: Admin Frontend Page

New page: `packages/web/src/routes/_app/admin/logs.tsx`

- Filter bar: event type dropdown, level dropdown
- Log list, newest first, each entry shows:
  - Relative timestamp ("2 min ago")
  - Colored badge for type
  - One-line human-readable summary (e.g. "KOReader synced **Drei** — 42% — XPointer→CFI OK")
  - Expandable details JSON on click
- "Load more" button for pagination
- Link from admin nav

Admin-only: check `currentUser.role !== "admin"` same as users page.

---

## Section 5: Files Changed

| Action | File | What |
|--------|------|------|
| Create | `packages/server/src/services/activity-log.ts` | logActivity function + prune |
| Create | `packages/web/src/routes/_app/admin/logs.tsx` | Admin log viewer page |
| Modify | `packages/shared/src/schema.ts` | Add activityLog table |
| Modify | `packages/server/src/trpc/routers/admin.ts` | Add activityLog query |
| Modify | `packages/server/src/routes/kosync.ts` | Log sync.push and sync.pull events |
| Modify | `packages/server/src/routes/upload.ts` | Log upload events |
| Modify | `packages/server/src/routes/import.ts` | Log import events |
| Modify | `packages/server/src/routes/export.ts` | Log export events |
| Modify | `packages/server/src/trpc/routers/metadata.ts` | Log metadata.apply events |
| Modify | `packages/web/src/routes/_app/admin/users.tsx` | Add nav link to logs page |
| Modify | `packages/shared/src/admin-validators.ts` | Add activityLog input validator |
