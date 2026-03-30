# Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rolling activity log (5000 entries) for admin visibility into syncs, uploads, imports, exports, and metadata changes — with an admin-only UI page.

**Architecture:** New `activityLog` DB table + `logActivity()` service function called from each event source. Admin tRPC query with filters. Frontend page at `/admin/logs` with filter bar and expandable entries.

**Tech Stack:** Drizzle ORM (SQLite), tRPC, React, TanStack Router, i18n

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/server/src/services/activity-log.ts` | logActivity function + prune logic |
| Create | `packages/web/src/routes/_app/admin/logs.tsx` | Admin log viewer page |
| Modify | `packages/shared/src/schema.ts` | Add activityLog table |
| Modify | `packages/shared/src/admin-validators.ts` | Add activityLogInput validator |
| Modify | `packages/server/src/trpc/routers/admin.ts` | Add activityLog query |
| Modify | `packages/server/src/routes/kosync.ts` | Log sync.push and sync.pull events |
| Modify | `packages/server/src/routes/upload.ts` | Log upload events |
| Modify | `packages/server/src/routes/import.ts` | Log import events |
| Modify | `packages/server/src/routes/export.ts` | Log export events |
| Modify | `packages/server/src/trpc/routers/metadata.ts` | Log metadata.apply events |

---

## Task 1: Schema + Activity Log Service

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Create: `packages/server/src/services/activity-log.ts`

- [ ] **Step 1: Add activityLog table to schema**

In `packages/shared/src/schema.ts`, add at the end of the file (before any exports or after the last table):

```typescript
export const activityLog = sqliteTable("activity_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  userId: text("user_id"),
  bookId: text("book_id"),
  bookTitle: text("book_title"),
  details: text("details"),
  level: text("level").notNull().default("info"),
  createdAt: text("created_at").notNull(),
});
```

- [ ] **Step 2: Build shared package**

```bash
cd packages/shared && pnpm build
```

- [ ] **Step 3: Create activity-log service**

Create `packages/server/src/services/activity-log.ts`:

```typescript
import { activityLog } from "@verso/shared";
import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";

const MAX_ENTRIES = 5000;

type LogEntry = {
  type: string;
  userId?: string;
  bookId?: string;
  bookTitle?: string;
  level?: "info" | "warn" | "error";
  details?: Record<string, unknown>;
};

export function logActivity(db: AppDatabase, entry: LogEntry): void {
  const now = new Date().toISOString();
  try {
    db.insert(activityLog)
      .values({
        type: entry.type,
        userId: entry.userId ?? null,
        bookId: entry.bookId ?? null,
        bookTitle: entry.bookTitle ?? null,
        level: entry.level ?? "info",
        details: entry.details ? JSON.stringify(entry.details) : null,
        createdAt: now,
      })
      .run();

    // Prune old entries
    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(activityLog)
      .get();
    if (count && count.count > MAX_ENTRIES) {
      db.run(sql`DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY created_at DESC LIMIT ${MAX_ENTRIES})`);
    }
  } catch (e) {
    // Logging should never break the main flow
    console.error("Failed to write activity log:", e);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schema.ts packages/server/src/services/activity-log.ts
git commit -m "feat: add activityLog table and logActivity service"
```

---

## Task 2: Admin Validator + tRPC Query

**Files:**
- Modify: `packages/shared/src/admin-validators.ts`
- Modify: `packages/server/src/trpc/routers/admin.ts`

- [ ] **Step 1: Add validator**

In `packages/shared/src/admin-validators.ts`, add at the end:

```typescript
export const activityLogInput = z.object({
  type: z.string().optional(),
  level: z.string().optional(),
  limit: z.number().min(1).max(500).default(100),
  offset: z.number().min(0).default(0),
});
```

- [ ] **Step 2: Build shared**

```bash
cd packages/shared && pnpm build
```

- [ ] **Step 3: Add activityLog query to admin router**

In `packages/server/src/trpc/routers/admin.ts`, add the import:

```typescript
import {
  users,
  sessions,
  activityLog,
  adminCreateUserInput,
  adminUpdateRoleInput,
  adminDeleteUserInput,
  activityLogInput,
} from "@verso/shared";
import { eq, desc, and, sql } from "drizzle-orm";
```

Then add the query inside the router (after `deleteUser`):

```typescript
  activityLog: adminProcedure
    .input(activityLogInput)
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.type) conditions.push(eq(activityLog.type, input.type));
      if (input.level) conditions.push(eq(activityLog.level, input.level));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await ctx.db
        .select()
        .from(activityLog)
        .where(where)
        .orderBy(desc(activityLog.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map((row) => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : null,
      }));
    }),
```

- [ ] **Step 4: Build and verify**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/admin-validators.ts packages/server/src/trpc/routers/admin.ts
git commit -m "feat: add activityLog admin query with filters"
```

---

## Task 3: Log Kosync Events

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`

- [ ] **Step 1: Add import**

At the top of `packages/server/src/routes/kosync.ts`, add:

```typescript
import { logActivity } from "../services/activity-log.js";
```

- [ ] **Step 2: Log sync.push in PUT handler**

In the PUT handler, after the matched book block completes (after both the update and insert cases), add logging. Find the closing `}` of `if (matchedBook) { ... }` and add after it:

```typescript
      // Log sync event
      if (matchedBook) {
        const book = await db.select({ title: books.title }).from(books).where(eq(books.id, matchedBook.id)).get();
        logActivity(db, {
          type: "sync.push",
          userId,
          bookId: matchedBook.id,
          bookTitle: book?.title ?? "Unknown",
          details: {
            device,
            md5: document,
            matched: true,
            percentage: Math.round(percentage * 100),
            xpointerToCfi: convertedCfi ? "ok" : "failed",
          },
        });
      }
```

And in the `else` block (unmatched books), after the kosyncProgress insert/update, add:

```typescript
        logActivity(db, {
          type: "sync.push",
          userId,
          level: "warn",
          details: {
            device,
            md5: document,
            matched: false,
          },
        });
```

- [ ] **Step 3: Log sync.pull in GET handler**

In the GET handler, after `if (matchedBook)` and finding progress, before `return reply.send(...)`, add:

```typescript
          logActivity(db, {
            type: "sync.pull",
            userId,
            bookId: matchedBook.id,
            bookTitle: (await db.select({ title: books.title }).from(books).where(eq(books.id, matchedBook.id)).get())?.title ?? "Unknown",
            details: {
              md5: document,
              matched: true,
              percentage: Math.round(progress.percentage),
            },
          });
```

- [ ] **Step 4: Run kosync tests**

```bash
cd packages/server && npx vitest run src/__tests__/kosync.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/kosync.ts
git commit -m "feat: log kosync sync.push and sync.pull events"
```

---

## Task 4: Log Upload, Import, Export, Metadata Events

**Files:**
- Modify: `packages/server/src/routes/upload.ts`
- Modify: `packages/server/src/routes/import.ts`
- Modify: `packages/server/src/routes/export.ts`
- Modify: `packages/server/src/trpc/routers/metadata.ts`

- [ ] **Step 1: Log upload events**

In `packages/server/src/routes/upload.ts`, add import:

```typescript
import { logActivity } from "../services/activity-log.js";
```

After the successful book insert (after the `db.insert(books).values(...)` call), add:

```typescript
        logActivity(db, {
          type: "upload",
          userId: user.sub,
          bookId,
          bookTitle: metadata.title || file.filename,
          details: {
            fileName: file.filename,
            fileSize: file.file.bytesRead,
            fileFormat: outputFormat,
          },
        });
```

- [ ] **Step 2: Log import events**

In `packages/server/src/routes/import.ts`, add import:

```typescript
import { logActivity } from "../services/activity-log.js";
```

Find the library restore completion point. After `restoreLibrary(...)` completes, add:

```typescript
          logActivity(db, {
            type: "import",
            userId: req.user!.sub,
            details: {
              format: "zip",
            },
          });
```

- [ ] **Step 3: Log export events**

In `packages/server/src/routes/export.ts`, add import:

```typescript
import { logActivity } from "../services/activity-log.js";
```

Before the archive is piped to the response, add:

```typescript
      logActivity(db, {
        type: "export",
        userId: req.user!.sub,
        details: {
          format: "zip",
          bookCount: exportData.books.length,
        },
      });
```

Note: You need `db` available — check the function parameters. The export route receives `db` as a parameter.

- [ ] **Step 4: Log metadata.apply events**

In `packages/server/src/trpc/routers/metadata.ts`, add import:

```typescript
import { logActivity } from "../../services/activity-log.js";
```

In the `applyFields` mutation, after the successful DB update (after `const [updated] = await ctx.db.update(books)...`), add:

```typescript
    logActivity(ctx.db, {
      type: "metadata.apply",
      userId: ctx.user.sub,
      bookId: input.bookId,
      bookTitle: updated.title ?? book.title,
      details: {
        source: input.source ?? "manual",
        fields: Object.keys(input.fields).filter((k) => input.fields[k as keyof typeof input.fields] != null),
      },
    });
```

- [ ] **Step 5: Build and run all tests**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
cd packages/server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/upload.ts packages/server/src/routes/import.ts packages/server/src/routes/export.ts packages/server/src/trpc/routers/metadata.ts
git commit -m "feat: log upload, import, export, and metadata events"
```

---

## Task 5: Admin Log Viewer Page

**Files:**
- Create: `packages/web/src/routes/_app/admin/logs.tsx`

- [ ] **Step 1: Create the page**

Create `packages/web/src/routes/_app/admin/logs.tsx`:

```tsx
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/admin/logs")({
  component: AdminLogsPage,
});

const TYPE_OPTIONS = [
  { value: "", label: "All Events" },
  { value: "sync.push", label: "Sync Push" },
  { value: "sync.pull", label: "Sync Pull" },
  { value: "upload", label: "Upload" },
  { value: "import", label: "Import" },
  { value: "export", label: "Export" },
  { value: "metadata.apply", label: "Metadata" },
];

const LEVEL_OPTIONS = [
  { value: "", label: "All Levels" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warning" },
  { value: "error", label: "Error" },
];

const TYPE_COLORS: Record<string, string> = {
  "sync.push": "#3b82f6",
  "sync.pull": "#6366f1",
  upload: "#22c55e",
  import: "#14b8a6",
  export: "#f59e0b",
  "metadata.apply": "#a855f7",
};

const LEVEL_COLORS: Record<string, string> = {
  info: "var(--text-dim)",
  warn: "#f59e0b",
  error: "#ef4444",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSummary(entry: any): string {
  const d = entry.details || {};
  switch (entry.type) {
    case "sync.push":
      if (d.matched === false) return `KOReader sync — no book match (MD5: ${d.md5?.slice(0, 8)}…)`;
      return `KOReader synced${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} — ${d.percentage ?? "?"}% — XPointer→CFI ${d.xpointerToCfi ?? "?"}`;
    case "sync.pull":
      return `KOReader pulled${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} — ${d.percentage ?? "?"}%`;
    case "upload":
      return `Uploaded${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} (${d.fileFormat ?? "?"})`;
    case "import":
      return `Library imported (${d.format ?? "zip"})`;
    case "export":
      return `Library exported — ${d.bookCount ?? "?"} books`;
    case "metadata.apply":
      return `Metadata applied to${entry.bookTitle ? ` "${entry.bookTitle}"` : ""} — ${(d.fields ?? []).join(", ")} (${d.source ?? "?"})`;
    default:
      return entry.type;
  }
}

function AdminLogsPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      navigate({ to: "/home" });
    }
  }, [currentUser, navigate]);

  const [typeFilter, setTypeFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logsQuery = trpc.admin.activityLog.useQuery({
    type: typeFilter || undefined,
    level: levelFilter || undefined,
    limit,
    offset,
  });

  const entries = logsQuery.data ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Admin nav */}
      <div className="flex gap-4 mb-6">
        <Link
          to="/admin/users"
          className="text-sm font-medium transition-colors"
          style={{ color: "var(--text-dim)" }}
        >
          {t("admin.users")}
        </Link>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--warm)" }}
        >
          {t("admin.logs", "Activity Log")}
        </span>
      </div>

      <h1
        className="text-xl font-display font-semibold mb-6"
        style={{ color: "var(--text)" }}
      >
        {t("admin.activityLog", "Activity Log")}
      </h1>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => { setLevelFilter(e.target.value); setOffset(0); }}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          {LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Log entries */}
      <div className="space-y-1">
        {entries.length === 0 && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--text-faint)" }}>
            No log entries found.
          </p>
        )}
        {entries.map((entry: any) => (
          <div
            key={entry.id}
            className="rounded-md px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "var(--card)" }}
            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: TYPE_COLORS[entry.type] ?? "var(--border)",
                  color: "#fff",
                }}
              >
                {entry.type}
              </span>
              {entry.level !== "info" && (
                <span
                  className="text-[10px] font-semibold uppercase"
                  style={{ color: LEVEL_COLORS[entry.level] ?? "var(--text-dim)" }}
                >
                  {entry.level}
                </span>
              )}
              <span className="text-xs flex-1" style={{ color: "var(--text)" }}>
                {formatSummary(entry)}
              </span>
              <span className="text-[11px] shrink-0" style={{ color: "var(--text-faint)" }}>
                {timeAgo(entry.createdAt)}
              </span>
            </div>
            {expandedId === entry.id && entry.details && (
              <pre
                className="mt-2 text-[11px] p-2 rounded overflow-x-auto"
                style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}
              >
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {entries.length >= limit && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setOffset((o) => o + limit)}
            className="px-4 py-2 rounded-md text-sm"
            style={{ backgroundColor: "var(--card)", color: "var(--text-dim)", border: "1px solid var(--border)" }}
          >
            Load more
          </button>
        </div>
      )}
      {offset > 0 && (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setOffset(0)}
            className="text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            Back to newest
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add nav link to admin users page**

In `packages/web/src/routes/_app/admin/users.tsx`, find where the page heading is (look for the `<h1>` or page title). Add a nav bar above it, similar to the logs page:

```tsx
      {/* Admin nav */}
      <div className="flex gap-4 mb-6">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--warm)" }}
        >
          {t("admin.users")}
        </span>
        <Link
          to="/admin/logs"
          className="text-sm font-medium transition-colors"
          style={{ color: "var(--text-dim)" }}
        >
          {t("admin.logs", "Activity Log")}
        </Link>
      </div>
```

Make sure `Link` is imported from `@tanstack/react-router` (it should already be).

- [ ] **Step 3: Build**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
```

Expected: Builds successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/_app/admin/logs.tsx packages/web/src/routes/_app/admin/users.tsx
git commit -m "feat: add admin activity log viewer page"
```

---

## Task 6: End-to-End Verification

- [ ] **Step 1: Build everything**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
```

- [ ] **Step 2: Run all server tests**

```bash
cd packages/server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Manual test checklist**

1. Start dev server
2. Upload a book — check `/admin/logs` shows upload event
3. Edit metadata on a book — check logs show metadata.apply event
4. Push progress from KOReader — check logs show sync.push with matched/unmatched and conversion result
5. Pull progress from KOReader — check logs show sync.pull
6. Filter by type — verify filtering works
7. Filter by level — verify warn shows unmatched syncs
8. Click an entry — verify details JSON expands
9. Verify "Load more" pagination works
