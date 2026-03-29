# E-Reader Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KOReader sync support via kosync (position sync) and KoInsight (reading stats/annotations) protocols.

**Architecture:** Fastify REST routes implementing kosync and KoInsight server APIs. Shared infrastructure (devices table, MD5 book matching, extended schema) supports both. Auth via existing API key system with new scopes. All schema changes in one migration.

**Tech Stack:** Fastify, Drizzle ORM, SQLite, Zod, Vitest, existing `verifyApiKey` service.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/schema.ts` | Add `devices`, `kosyncProgress`, `pageStats` tables; extend `books`, `readingSessions`, `readingProgress`, `annotations` |
| Modify | `packages/shared/src/schemas/api-keys.ts` | Add `"kosync"` and `"plugin"` to scope enum |
| Create | `packages/shared/src/kosync-validators.ts` | Zod schemas for kosync request/response |
| Create | `packages/shared/src/koinsight-validators.ts` | Zod schemas for KoInsight request/response |
| Modify | `packages/shared/src/index.ts` | Export new validator modules |
| Create | `packages/server/src/middleware/kosync-auth.ts` | Extract `x-auth-user`/`x-auth-key` headers, validate via API key |
| Create | `packages/server/src/routes/kosync.ts` | 4 kosync endpoints |
| Create | `packages/server/src/routes/koinsight.ts` | 4 KoInsight endpoints |
| Modify | `packages/server/src/routes/upload.ts` | Compute MD5 on upload, auto-migrate kosyncProgress |
| Create | `packages/server/src/scripts/backfill-md5.ts` | One-time MD5 backfill for existing books |
| Modify | `packages/server/src/app.ts` | Register kosync + KoInsight routes |
| Modify | `packages/server/src/trpc/routers/stats.ts` | LEFT JOIN in readingLog for unmatched books |
| Create | `packages/server/src/__tests__/kosync.test.ts` | kosync endpoint tests |
| Create | `packages/server/src/__tests__/koinsight.test.ts` | KoInsight endpoint tests |
| Create | `packages/server/src/__tests__/ereader-schema.test.ts` | Schema + migration tests |
| Generate | `packages/server/drizzle/` | New migration file |

---

## Task 1: Schema — New Tables and Column Extensions

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Write test for new schema exports**

Create `packages/server/src/__tests__/ereader-schema.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import {
  books,
  devices,
  kosyncProgress,
  pageStats,
  readingSessions,
  readingProgress,
  annotations,
} from "@verso/shared";

describe("e-reader schema", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    userId = reg.user.id;
  });

  it("books table has md5Hash column", async () => {
    const id = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc123",
      md5Hash: "d41d8cd98f00b204e9800998ecf8427e",
      addedBy: userId,
    });
    const book = await ctx.db.select().from(books).get();
    expect(book!.md5Hash).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });

  it("devices table works", async () => {
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "My Kindle",
      model: "Kindle Paperwhite",
      lastSeen: new Date().toISOString(),
    });
    const device = await ctx.db.select().from(devices).get();
    expect(device!.id).toBe("kindle-001");
    expect(device!.model).toBe("Kindle Paperwhite");
  });

  it("kosyncProgress table works with unique constraint", async () => {
    const now = new Date().toISOString();
    await ctx.db.insert(kosyncProgress).values({
      userId,
      documentHash: "abc123def456",
      progress: "50",
      percentage: 0.5,
      deviceId: "kindle-001",
      device: "Kindle",
      updatedAt: now,
    });
    const row = await ctx.db.select().from(kosyncProgress).get();
    expect(row!.documentHash).toBe("abc123def456");
    expect(row!.percentage).toBe(0.5);
  });

  it("pageStats table works with dedup index", async () => {
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "Kindle",
      model: "Kindle",
      lastSeen: new Date().toISOString(),
    });
    await ctx.db.insert(pageStats).values({
      userId,
      bookId: null,
      bookMd5: "abc123",
      deviceId: "kindle-001",
      page: 1,
      startTime: 1700000000,
      duration: 60,
      totalPages: 200,
    });
    const row = await ctx.db.select().from(pageStats).get();
    expect(row!.page).toBe(1);
    expect(row!.duration).toBe(60);
  });

  it("readingSessions has deviceId, source, bookTitle columns", async () => {
    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc",
      addedBy: userId,
    });
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "Kindle",
      model: "Kindle",
      lastSeen: new Date().toISOString(),
    });
    const now = new Date().toISOString();
    await ctx.db.insert(readingSessions).values({
      userId,
      bookId,
      startedAt: now,
      endedAt: now,
      durationMinutes: 10,
      deviceId: "kindle-001",
      source: "koinsight",
      bookTitle: "Fallback Title",
    });
    const session = await ctx.db.select().from(readingSessions).get();
    expect(session!.deviceId).toBe("kindle-001");
    expect(session!.source).toBe("koinsight");
    expect(session!.bookTitle).toBe("Fallback Title");
  });

  it("readingProgress has deviceId column", async () => {
    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc",
      addedBy: userId,
    });
    await ctx.db.insert(devices).values({
      id: "kindle-001",
      userId,
      name: "Kindle",
      model: "Kindle",
      lastSeen: new Date().toISOString(),
    });
    await ctx.db.insert(readingProgress).values({
      userId,
      bookId,
      percentage: 50,
      deviceId: "kindle-001",
    });
    const progress = await ctx.db.select().from(readingProgress).get();
    expect(progress!.deviceId).toBe("kindle-001");
  });

  it("annotations allows null cfiPosition with pageNumber", async () => {
    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test",
      author: "Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc",
      addedBy: userId,
    });
    await ctx.db.insert(annotations).values({
      userId,
      bookId,
      type: "highlight",
      content: "Some text",
      cfiPosition: null,
      pageNumber: 42,
      source: "koinsight",
    });
    const ann = await ctx.db.select().from(annotations).get();
    expect(ann!.cfiPosition).toBeNull();
    expect(ann!.pageNumber).toBe(42);
    expect(ann!.source).toBe("koinsight");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: FAIL — `devices`, `kosyncProgress`, `pageStats` not exported; `md5Hash`, `deviceId`, `source`, `bookTitle`, `pageNumber` don't exist on their tables.

- [ ] **Step 3: Add new tables and extend existing tables in schema**

In `packages/shared/src/schema.ts`, add after the `apiKeys` table (after line 178):

```typescript
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name", { length: 255 }),
  model: text("model", { length: 255 }),
  lastSeen: text("last_seen").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const kosyncProgress = sqliteTable("kosync_progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentHash: text("document_hash", { length: 32 }).notNull(),
  progress: text("progress").notNull(),
  percentage: real("percentage").notNull(),
  deviceId: text("device_id").notNull(),
  device: text("device", { length: 255 }),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("kosync_progress_user_doc_idx").on(table.userId, table.documentHash),
]);

export const pageStats = sqliteTable("page_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bookId: text("book_id").references(() => books.id, { onDelete: "set null" }),
  bookMd5: text("book_md5").notNull(),
  deviceId: text("device_id")
    .notNull()
    .references(() => devices.id),
  page: integer("page").notNull(),
  startTime: integer("start_time").notNull(),
  duration: integer("duration").notNull(),
  totalPages: integer("total_pages").notNull(),
}, (table) => [
  uniqueIndex("page_stats_dedup_idx").on(table.deviceId, table.bookMd5, table.page, table.startTime),
]);
```

Add `md5Hash` to `books` table (after `fileHash` line 38):

```typescript
  md5Hash: text("md5_hash", { length: 32 }),
```

Add to `readingSessions` table (after `durationMinutes` line 155):

```typescript
  deviceId: text("device_id").references(() => devices.id),
  source: text("source", { length: 20 }).default("web"),
  bookTitle: text("book_title"),
```

Add to `readingProgress` table (after `timeSpentMinutes` line 88):

```typescript
  deviceId: text("device_id").references(() => devices.id),
```

Modify `annotations` table — change `cfiPosition` (line 135) from `.notNull()` to nullable, and add new columns after `chapter` (line 138):

```typescript
  cfiPosition: text("cfi_position"),  // was .notNull() — now nullable for e-reader annotations
```

Add after the `chapter` line:

```typescript
  pageNumber: integer("page_number"),
  deviceId: text("device_id").references(() => devices.id),
  source: text("source", { length: 20 }).default("web"),
```

- [ ] **Step 4: Generate migration**

Run: `cd packages/server && npx drizzle-kit generate`

This produces a new SQL migration file in `packages/server/drizzle/`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 6: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All existing tests still pass (schema changes are backward-compatible — new columns are nullable, defaults preserve existing behavior).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schema.ts packages/server/drizzle/ packages/server/src/__tests__/ereader-schema.test.ts
git commit -m "feat: e-reader sync schema — devices, kosyncProgress, pageStats tables and column extensions"
```

---

## Task 2: API Key Scope Extension

**Files:**
- Modify: `packages/shared/src/schemas/api-keys.ts`

- [ ] **Step 1: Write test for new scopes**

Add to `packages/server/src/__tests__/ereader-schema.test.ts`:

```typescript
import { createApiKeyInput } from "@verso/shared";

describe("api key scopes", () => {
  it("accepts kosync scope", () => {
    const result = createApiKeyInput.safeParse({
      name: "KOReader",
      scopes: ["kosync"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts plugin scope", () => {
    const result = createApiKeyInput.safeParse({
      name: "KoInsight",
      scopes: ["plugin"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid scope", () => {
    const result = createApiKeyInput.safeParse({
      name: "Bad",
      scopes: ["invalid"],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: FAIL — `"kosync"` and `"plugin"` not in the enum.

- [ ] **Step 3: Update scope enum**

In `packages/shared/src/schemas/api-keys.ts`, change line 5:

```typescript
  scopes: z.array(z.enum(["opds", "api", "kosync", "plugin"])).min(1),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/api-keys.ts packages/server/src/__tests__/ereader-schema.test.ts
git commit -m "feat: add kosync and plugin API key scopes"
```

---

## Task 3: MD5 on Upload + Auto-Migration

**Files:**
- Modify: `packages/server/src/routes/upload.ts`

- [ ] **Step 1: Add MD5 computation to upload route**

In `packages/server/src/routes/upload.ts`, add after line 104 (`const fileHash = ...`):

```typescript
        const md5Hash = createHash("md5").update(storedBuffer).digest("hex");
```

In the `db.insert(books).values({...})` block (line 136-160), add `md5Hash` after `fileHash,` (line 153):

```typescript
            md5Hash,
```

- [ ] **Step 2: Add auto-migration of kosyncProgress**

After the `db.insert(books)...returning()` block (after line 160), add before `return reply.status(201)`:

```typescript
        // Auto-migrate kosyncProgress if a matching document hash exists
        if (md5Hash) {
          const matchedProgress = await db
            .select()
            .from(kosyncProgress)
            .where(eq(kosyncProgress.documentHash, md5Hash))
            .all();

          for (const kp of matchedProgress) {
            await db.insert(readingProgress).values({
              userId: kp.userId,
              bookId,
              percentage: kp.percentage * 100, // kosync uses 0-1, readingProgress uses 0-100
              lastReadAt: kp.updatedAt,
              startedAt: kp.updatedAt,
            }).onConflictDoNothing();

            await db
              .delete(kosyncProgress)
              .where(eq(kosyncProgress.id, kp.id));
          }
        }
```

Add the required imports at the top of `upload.ts`:

```typescript
import { books, kosyncProgress, readingProgress } from "@verso/shared";
import { eq } from "drizzle-orm";
```

(Replace the existing `import { books } from "@verso/shared";` on line 12.)

- [ ] **Step 3: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass. Upload tests still work (md5Hash is just an extra column being set).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/upload.ts
git commit -m "feat: compute MD5 on upload, auto-migrate kosyncProgress"
```

---

## Task 4: MD5 Backfill Script

**Files:**
- Create: `packages/server/src/scripts/backfill-md5.ts`

- [ ] **Step 1: Create backfill script**

```typescript
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, isNull } from "drizzle-orm";
import { books } from "@verso/shared";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { loadConfig } from "../config.js";
import { StorageService } from "../services/storage.js";

async function backfillMd5() {
  const config = loadConfig();
  const db = createDb(config);
  runMigrations(db);
  const storage = new StorageService(config);

  const booksWithoutMd5 = await db
    .select({ id: books.id, filePath: books.filePath })
    .from(books)
    .where(isNull(books.md5Hash));

  console.log(`Found ${booksWithoutMd5.length} books without MD5 hash`);

  let updated = 0;
  for (const book of booksWithoutMd5) {
    try {
      const fullPath = storage.fullPath(book.filePath);
      const buffer = readFileSync(fullPath);
      const md5Hash = createHash("md5").update(buffer).digest("hex");
      await db
        .update(books)
        .set({ md5Hash })
        .where(eq(books.id, book.id));
      updated++;
      console.log(`  [${updated}/${booksWithoutMd5.length}] ${book.id} → ${md5Hash}`);
    } catch (err) {
      console.error(`  SKIP ${book.id}: ${(err as Error).message}`);
    }
  }

  console.log(`Done. Updated ${updated}/${booksWithoutMd5.length} books.`);
}

backfillMd5().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/scripts/backfill-md5.ts
git commit -m "feat: MD5 backfill script for existing books"
```

---

## Task 5: kosync Validators

**Files:**
- Create: `packages/shared/src/kosync-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write test for validators**

Add to `packages/server/src/__tests__/ereader-schema.test.ts`:

```typescript
import {
  kosyncProgressPushInput,
  kosyncProgressPullParams,
} from "@verso/shared";

describe("kosync validators", () => {
  it("validates progress push input", () => {
    const result = kosyncProgressPushInput.safeParse({
      document: "d41d8cd98f00b204e9800998ecf8427e",
      progress: "page-42",
      percentage: 0.42,
      device: "Kindle Paperwhite",
      device_id: "kindle-001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects progress push without document", () => {
    const result = kosyncProgressPushInput.safeParse({
      progress: "page-42",
      percentage: 0.42,
      device: "Kindle",
      device_id: "kindle-001",
    });
    expect(result.success).toBe(false);
  });

  it("validates progress pull params", () => {
    const result = kosyncProgressPullParams.safeParse({
      document: "d41d8cd98f00b204e9800998ecf8427e",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: FAIL — validators not exported.

- [ ] **Step 3: Create kosync validators**

Create `packages/shared/src/kosync-validators.ts`:

```typescript
import { z } from "zod";

export const kosyncProgressPushInput = z.object({
  document: z.string().min(1),
  progress: z.string().min(1),
  percentage: z.number().min(0).max(1),
  device: z.string().min(1),
  device_id: z.string().min(1),
});

export const kosyncProgressPullParams = z.object({
  document: z.string().min(1),
});
```

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./kosync-validators.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/kosync-validators.ts packages/shared/src/index.ts packages/server/src/__tests__/ereader-schema.test.ts
git commit -m "feat: kosync Zod validators"
```

---

## Task 6: kosync Auth Middleware

**Files:**
- Create: `packages/server/src/middleware/kosync-auth.ts`

- [ ] **Step 1: Write test for kosync auth**

Create `packages/server/src/__tests__/kosync.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { buildApp } from "../app.js";
import { createApiKey } from "../services/api-keys.js";
import type { FastifyInstance } from "fastify";

describe("kosync auth", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let userEmail: string;
  let apiKey: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";
    const { plainKey } = await createApiKey(ctx.db, userId, "KOReader", ["kosync"]);
    apiKey = plainKey;
  });

  it("GET /users/auth returns 200 with valid credentials", async () => {
    const app = await buildApp(ctx.config);
    const res = await app.inject({
      method: "GET",
      url: "/users/auth",
      headers: {
        "x-auth-user": userEmail,
        "x-auth-key": apiKey,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ authorized: "OK" });
  });

  it("GET /users/auth returns 401 without headers", async () => {
    const app = await buildApp(ctx.config);
    const res = await app.inject({
      method: "GET",
      url: "/users/auth",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /users/auth returns 401 with wrong key", async () => {
    const app = await buildApp(ctx.config);
    const res = await app.inject({
      method: "GET",
      url: "/users/auth",
      headers: {
        "x-auth-user": userEmail,
        "x-auth-key": "vso_wrongkey12345678901234567890",
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: FAIL — `/users/auth` route doesn't exist yet (404).

- [ ] **Step 3: Create kosync auth middleware**

Create `packages/server/src/middleware/kosync-auth.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyApiKey } from "../services/api-keys.js";
import type { AppDatabase } from "../db/client.js";

export function createKosyncAuthHook(db: AppDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const username = req.headers["x-auth-user"] as string | undefined;
    const key = req.headers["x-auth-key"] as string | undefined;

    if (!username || !key) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    const user = await verifyApiKey(db, username, key, "kosync");
    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    req.user = { sub: user.userId, email: user.email, role: user.role, type: "access" };
  };
}
```

- [ ] **Step 4: Create minimal kosync routes (auth endpoint only for now)**

Create `packages/server/src/routes/kosync.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { createKosyncAuthHook } from "../middleware/kosync-auth.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function registerKosyncRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  config: Config,
) {
  const authHook = createKosyncAuthHook(db);

  // GET /users/auth — validate credentials
  app.get("/users/auth", { preHandler: authHook }, async (_req, reply) => {
    return reply.send({ authorized: "OK" });
  });
}
```

Register in `packages/server/src/app.ts` — add import:

```typescript
import { registerKosyncRoutes } from "./routes/kosync.js";
```

Add after line 81 (`registerOpdsRoutes(...)`):

```typescript
  registerKosyncRoutes(app, db, config);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/middleware/kosync-auth.ts packages/server/src/routes/kosync.ts packages/server/src/app.ts packages/server/src/__tests__/kosync.test.ts
git commit -m "feat: kosync auth middleware and /users/auth endpoint"
```

---

## Task 7: kosync — POST /users/create Endpoint

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`
- Modify: `packages/server/src/__tests__/kosync.test.ts`

- [ ] **Step 1: Write test**

Add to `packages/server/src/__tests__/kosync.test.ts`, inside the main `describe`:

```typescript
  describe("POST /users/create", () => {
    it("returns 201 with valid credentials", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/users/create",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": apiKey,
        },
        payload: { username: userEmail, password: "anything" },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body)).toEqual({ username: userEmail });
    });

    it("returns 401 with invalid credentials", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/users/create",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": "vso_bad",
        },
        payload: { username: userEmail, password: "anything" },
      });
      expect(res.statusCode).toBe(401);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: FAIL — route not found (404).

- [ ] **Step 3: Add endpoint**

In `packages/server/src/routes/kosync.ts`, add inside `registerKosyncRoutes` after the `/users/auth` route:

```typescript
  // POST /users/create — no-op registration, validates credentials
  app.post("/users/create", { preHandler: authHook }, async (req, reply) => {
    return reply.code(201).send({ username: req.user!.email });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/kosync.ts packages/server/src/__tests__/kosync.test.ts
git commit -m "feat: kosync POST /users/create endpoint"
```

---

## Task 8: kosync — PUT /syncs/progress Endpoint

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`
- Modify: `packages/server/src/__tests__/kosync.test.ts`

- [ ] **Step 1: Write tests**

Add to `packages/server/src/__tests__/kosync.test.ts`:

```typescript
import { books, readingProgress, kosyncProgress, devices } from "@verso/shared";

  describe("PUT /syncs/progress", () => {
    it("saves progress for a matched book", async () => {
      // Insert a book with md5Hash
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId,
        title: "Test Book",
        author: "Author",
        filePath: "books/test.epub",
        fileFormat: "epub",
        fileSize: 1000,
        fileHash: "sha256hash",
        md5Hash: "abc123def456abc123def456abc12345",
        addedBy: userId,
      });

      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "PUT",
        url: "/syncs/progress",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": apiKey,
        },
        payload: {
          document: "abc123def456abc123def456abc12345",
          progress: "/body/chapter[3]/p[5]",
          percentage: 0.42,
          device: "Kindle Paperwhite",
          device_id: "kindle-001",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.document).toBe("abc123def456abc123def456abc12345");
      expect(body.timestamp).toBeDefined();

      // Verify readingProgress was updated
      const progress = await ctx.db.select().from(readingProgress).all();
      expect(progress).toHaveLength(1);
      expect(progress[0].bookId).toBe(bookId);
      expect(progress[0].percentage).toBe(42); // 0.42 * 100

      // Verify device was upserted
      const deviceRows = await ctx.db.select().from(devices).all();
      expect(deviceRows).toHaveLength(1);
      expect(deviceRows[0].id).toBe("kindle-001");
    });

    it("saves to kosyncProgress for unmatched book", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "PUT",
        url: "/syncs/progress",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": apiKey,
        },
        payload: {
          document: "unmatched_hash_1234567890abcdef",
          progress: "page-10",
          percentage: 0.1,
          device: "Kindle",
          device_id: "kindle-001",
        },
      });
      expect(res.statusCode).toBe(200);

      // Verify kosyncProgress was created
      const kp = await ctx.db.select().from(kosyncProgress).all();
      expect(kp).toHaveLength(1);
      expect(kp[0].documentHash).toBe("unmatched_hash_1234567890abcdef");
      expect(kp[0].percentage).toBe(0.1);
    });

    it("sets finishedAt when percentage >= 0.98", async () => {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId,
        title: "Done Book",
        author: "Author",
        filePath: "books/done.epub",
        fileFormat: "epub",
        fileSize: 1000,
        fileHash: "sha",
        md5Hash: "finished_hash_abcdef1234567890",
        addedBy: userId,
      });

      const app = await buildApp(ctx.config);
      await app.inject({
        method: "PUT",
        url: "/syncs/progress",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
        payload: {
          document: "finished_hash_abcdef1234567890",
          progress: "end",
          percentage: 0.99,
          device: "Kindle",
          device_id: "kindle-001",
        },
      });

      const progress = await ctx.db.select().from(readingProgress).all();
      expect(progress[0].finishedAt).not.toBeNull();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement PUT /syncs/progress**

In `packages/server/src/routes/kosync.ts`, add imports and the endpoint:

```typescript
import { eq, and } from "drizzle-orm";
import { books, devices, readingProgress, kosyncProgress, kosyncProgressPushInput } from "@verso/shared";

  // PUT /syncs/progress — push reading position
  app.put("/syncs/progress", { preHandler: authHook }, async (req, reply) => {
    const parsed = kosyncProgressPushInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid request body" });
    }

    const { document, progress, percentage, device, device_id } = parsed.data;
    const userId = req.user!.sub;
    const now = new Date().toISOString();
    const timestamp = Math.floor(Date.now() / 1000);

    // Upsert device
    const existingDevice = await db.select().from(devices).where(eq(devices.id, device_id)).get();
    if (existingDevice) {
      await db.update(devices).set({ lastSeen: now, model: device }).where(eq(devices.id, device_id));
    } else {
      await db.insert(devices).values({
        id: device_id,
        userId,
        model: device,
        lastSeen: now,
      });
    }

    // Try to match book by MD5
    const matchedBook = await db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.md5Hash, document))
      .get();

    if (matchedBook) {
      // Upsert readingProgress
      const existing = await db
        .select()
        .from(readingProgress)
        .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, matchedBook.id)))
        .get();

      const finishedAt = percentage >= 0.98 ? now : null;

      if (existing) {
        await db
          .update(readingProgress)
          .set({
            percentage: percentage * 100,
            lastReadAt: now,
            deviceId: device_id,
            finishedAt: existing.finishedAt ?? finishedAt,
          })
          .where(eq(readingProgress.id, existing.id));
      } else {
        await db.insert(readingProgress).values({
          userId,
          bookId: matchedBook.id,
          percentage: percentage * 100,
          startedAt: now,
          lastReadAt: now,
          deviceId: device_id,
          finishedAt,
        });
      }
    } else {
      // Store in kosyncProgress for unmatched books
      const existing = await db
        .select()
        .from(kosyncProgress)
        .where(and(eq(kosyncProgress.userId, userId), eq(kosyncProgress.documentHash, document)))
        .get();

      if (existing) {
        await db
          .update(kosyncProgress)
          .set({ progress, percentage, deviceId: device_id, device, updatedAt: now })
          .where(eq(kosyncProgress.id, existing.id));
      } else {
        await db.insert(kosyncProgress).values({
          userId,
          documentHash: document,
          progress,
          percentage,
          deviceId: device_id,
          device,
          updatedAt: now,
        });
      }
    }

    return reply.send({ document, timestamp });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/kosync.ts packages/server/src/__tests__/kosync.test.ts
git commit -m "feat: kosync PUT /syncs/progress endpoint"
```

---

## Task 9: kosync — GET /syncs/progress/:document Endpoint

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`
- Modify: `packages/server/src/__tests__/kosync.test.ts`

- [ ] **Step 1: Write tests**

Add to `packages/server/src/__tests__/kosync.test.ts`:

```typescript
  describe("GET /syncs/progress/:document", () => {
    it("returns progress for matched book", async () => {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId,
        title: "Test",
        author: "Author",
        filePath: "books/test.epub",
        fileFormat: "epub",
        fileSize: 1000,
        fileHash: "sha",
        md5Hash: "pull_test_hash_abcdef123456789",
        addedBy: userId,
      });
      await ctx.db.insert(devices).values({
        id: "kindle-001",
        userId,
        model: "Kindle",
        lastSeen: new Date().toISOString(),
      });
      await ctx.db.insert(readingProgress).values({
        userId,
        bookId,
        percentage: 42,
        lastReadAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        deviceId: "kindle-001",
      });

      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "GET",
        url: "/syncs/progress/pull_test_hash_abcdef123456789",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.document).toBe("pull_test_hash_abcdef123456789");
      expect(body.percentage).toBe(0.42); // converted back to 0-1
    });

    it("returns progress from kosyncProgress for unmatched book", async () => {
      await ctx.db.insert(kosyncProgress).values({
        userId,
        documentHash: "unmatched_pull_hash_abcdef12345",
        progress: "page-10",
        percentage: 0.1,
        deviceId: "kindle-001",
        device: "Kindle",
        updatedAt: new Date().toISOString(),
      });

      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "GET",
        url: "/syncs/progress/unmatched_pull_hash_abcdef12345",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.document).toBe("unmatched_pull_hash_abcdef12345");
      expect(body.percentage).toBe(0.1);
      expect(body.progress).toBe("page-10");
    });

    it("returns 404 when no progress exists", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "GET",
        url: "/syncs/progress/nonexistent_hash_12345678901234",
        headers: { "x-auth-user": userEmail, "x-auth-key": apiKey },
      });
      expect(res.statusCode).toBe(404);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement GET /syncs/progress/:document**

In `packages/server/src/routes/kosync.ts`, add:

```typescript
  // GET /syncs/progress/:document — pull reading position
  app.get<{ Params: { document: string } }>(
    "/syncs/progress/:document",
    { preHandler: authHook },
    async (req, reply) => {
      const { document } = req.params;
      const userId = req.user!.sub;

      // First check readingProgress via books.md5Hash
      const matchedBook = await db
        .select({ id: books.id })
        .from(books)
        .where(eq(books.md5Hash, document))
        .get();

      if (matchedBook) {
        const progress = await db
          .select()
          .from(readingProgress)
          .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, matchedBook.id)))
          .get();

        if (progress) {
          return reply.send({
            document,
            progress: progress.cfiPosition || `${progress.currentPage || 0}`,
            percentage: progress.percentage / 100, // convert back to 0-1
            device: "",
            device_id: progress.deviceId || "",
            timestamp: progress.lastReadAt
              ? Math.floor(new Date(progress.lastReadAt).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
          });
        }
      }

      // Fallback to kosyncProgress
      const kp = await db
        .select()
        .from(kosyncProgress)
        .where(and(eq(kosyncProgress.userId, userId), eq(kosyncProgress.documentHash, document)))
        .get();

      if (kp) {
        return reply.send({
          document,
          progress: kp.progress,
          percentage: kp.percentage,
          device: kp.device || "",
          device_id: kp.deviceId,
          timestamp: Math.floor(new Date(kp.updatedAt).getTime() / 1000),
        });
      }

      return reply.code(404).send({ message: "No progress found" });
    },
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/kosync.ts packages/server/src/__tests__/kosync.test.ts
git commit -m "feat: kosync GET /syncs/progress/:document endpoint"
```

---

## Task 10: KoInsight Validators

**Files:**
- Create: `packages/shared/src/koinsight-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write test for validators**

Create or add to `packages/server/src/__tests__/koinsight.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  koinsightDeviceInput,
  koinsightImportInput,
} from "@verso/shared";

describe("koinsight validators", () => {
  it("validates device registration", () => {
    const result = koinsightDeviceInput.safeParse({
      version: "0.3.0",
      id: "kindle-001",
      model: "Kindle Paperwhite",
    });
    expect(result.success).toBe(true);
  });

  it("rejects device registration below minimum version", () => {
    const result = koinsightDeviceInput.safeParse({
      version: "0.2.0",
      id: "kindle-001",
      model: "Kindle",
    });
    // Version validation happens at route level, not in Zod
    expect(result.success).toBe(true);
  });

  it("validates import input", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [{ md5: "abc123", title: "Book", authors: "Author", pages: 200 }],
      stats: [{ md5: "abc123", page: 1, start_time: 1700000000, duration: 60, total_pages: 200 }],
      annotations: {},
    });
    expect(result.success).toBe(true);
  });

  it("validates import with annotations", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [],
      stats: [],
      annotations: {
        abc123: [
          { chapter: "Ch 1", text: "highlighted text", page: 5, type: "highlight" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: FAIL — validators not exported.

- [ ] **Step 3: Create KoInsight validators**

Create `packages/shared/src/koinsight-validators.ts`:

```typescript
import { z } from "zod";

export const koinsightDeviceInput = z.object({
  version: z.string().min(1),
  id: z.string().min(1),
  model: z.string().min(1),
});

export const koinsightBookInput = z.object({
  md5: z.string().min(1),
  title: z.string(),
  authors: z.string(),
  pages: z.number().int(),
});

export const koinsightStatInput = z.object({
  md5: z.string().min(1),
  page: z.number().int(),
  start_time: z.number().int(),
  duration: z.number().int(),
  total_pages: z.number().int(),
});

export const koinsightAnnotationInput = z.object({
  chapter: z.string().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
  page: z.number().int(),
  type: z.string().default("highlight"),
});

export const koinsightImportInput = z.object({
  version: z.string().min(1),
  device_id: z.string().min(1),
  books: z.array(koinsightBookInput),
  stats: z.array(koinsightStatInput),
  annotations: z.record(z.string(), z.array(koinsightAnnotationInput)),
});
```

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./koinsight-validators.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/koinsight-validators.ts packages/shared/src/index.ts packages/server/src/__tests__/koinsight.test.ts
git commit -m "feat: KoInsight Zod validators"
```

---

## Task 11: KoInsight — Health and Device Endpoints

**Files:**
- Create: `packages/server/src/routes/koinsight.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/__tests__/koinsight.test.ts`

- [ ] **Step 1: Write tests**

Add to `packages/server/src/__tests__/koinsight.test.ts`:

```typescript
import { beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { buildApp } from "../app.js";
import { createApiKey } from "../services/api-keys.js";
import { devices } from "@verso/shared";

describe("koinsight endpoints", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let userEmail: string;
  let apiKey: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";
    const { plainKey } = await createApiKey(ctx.db, userId, "KoInsight", ["plugin"]);
    apiKey = plainKey;
  });

  describe("GET /api/plugin/health", () => {
    it("returns ok without auth", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({ method: "GET", url: "/api/plugin/health" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.3.0");
    });
  });

  describe("POST /api/plugin/device", () => {
    it("registers a device", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/device",
        headers: { authorization: `Basic ${Buffer.from(`${userEmail}:${apiKey}`).toString("base64")}` },
        payload: { version: "0.3.0", id: "kobo-001", model: "Kobo Libra" },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).message).toBe("Device registered successfully");

      const d = await ctx.db.select().from(devices).all();
      expect(d).toHaveLength(1);
      expect(d[0].id).toBe("kobo-001");
    });

    it("rejects version below 0.3.0", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/device",
        headers: { authorization: `Basic ${Buffer.from(`${userEmail}:${apiKey}`).toString("base64")}` },
        payload: { version: "0.2.0", id: "kobo-001", model: "Kobo" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("accepts version above 0.3.0", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/device",
        headers: { authorization: `Basic ${Buffer.from(`${userEmail}:${apiKey}`).toString("base64")}` },
        payload: { version: "0.4.1", id: "kobo-001", model: "Kobo" },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: FAIL — routes don't exist.

- [ ] **Step 3: Create KoInsight routes with health + device endpoints**

Create `packages/server/src/routes/koinsight.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { devices, koinsightDeviceInput } from "@verso/shared";
import { createFlexAuthHook } from "../middleware/auth.js";
import { createApiKeyAuthHook } from "../middleware/kosync-auth.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";

const MIN_VERSION = [0, 3, 0];

function isVersionValid(version: string): boolean {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_VERSION[i]) return true;
    if (parts[i] < MIN_VERSION[i]) return false;
  }
  return true; // equal
}

export function registerKoInsightRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config,
) {
  const authHook = createFlexAuthHook(config, db);

  // GET /api/plugin/health — no auth
  app.get("/api/plugin/health", async (_req, reply) => {
    return reply.send({ status: "ok", version: "0.3.0" });
  });

  // POST /api/plugin/device — register device
  app.post("/api/plugin/device", { preHandler: authHook }, async (req, reply) => {
    const parsed = koinsightDeviceInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid request body" });
    }

    const { version, id, model } = parsed.data;
    if (!isVersionValid(version)) {
      return reply.code(400).send({ message: `Plugin version ${version} is below minimum 0.3.0` });
    }

    const userId = req.user!.sub;
    const now = new Date().toISOString();

    const existing = await db.select().from(devices).where(eq(devices.id, id)).get();
    if (existing) {
      await db.update(devices).set({ model, lastSeen: now }).where(eq(devices.id, id));
    } else {
      await db.insert(devices).values({ id, userId, model, lastSeen: now });
    }

    return reply.send({ message: "Device registered successfully" });
  });
}
```

Update `packages/server/src/app.ts` — add import:

```typescript
import { registerKoInsightRoutes } from "./routes/koinsight.js";
```

Add after the kosync route registration:

```typescript
  registerKoInsightRoutes(app, db, storage, config);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: PASS.

Note: The flex auth hook uses Basic auth which calls `createBasicAuthHook` — this validates password, not API key. We need the KoInsight routes to support API key via Basic auth too. If tests fail because Basic auth with API key doesn't work, update `createFlexAuthHook` or create a dedicated hook that tries API key verification first. Check `createBasicAuthHook` — it uses bcrypt password comparison, which won't work for `vso_` keys.

**If Basic auth with API key fails:** Create a new auth hook in `kosync-auth.ts`:

```typescript
export function createPluginAuthHook(config: Config, db: AppDatabase) {
  const bearerHook = createAuthHook(config);

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Basic ")) {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
      const colonIndex = decoded.indexOf(":");
      if (colonIndex === -1) {
        return reply.code(401).send({ message: "Invalid auth format" });
      }
      const email = decoded.slice(0, colonIndex);
      const key = decoded.slice(colonIndex + 1);
      const user = await verifyApiKey(db, email, key, "plugin");
      if (!user) {
        return reply.code(401).send({ message: "Unauthorized" });
      }
      req.user = { sub: user.userId, email: user.email, role: user.role, type: "access" };
      return;
    }
    return bearerHook(req, reply);
  };
}
```

Use `createPluginAuthHook` instead of `createFlexAuthHook` in the KoInsight routes.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/koinsight.ts packages/server/src/app.ts packages/server/src/middleware/kosync-auth.ts packages/server/src/__tests__/koinsight.test.ts
git commit -m "feat: KoInsight health and device endpoints"
```

---

## Task 12: KoInsight — POST /api/plugin/import Endpoint

**Files:**
- Modify: `packages/server/src/routes/koinsight.ts`
- Modify: `packages/server/src/__tests__/koinsight.test.ts`

- [ ] **Step 1: Write tests**

Add to `packages/server/src/__tests__/koinsight.test.ts`:

```typescript
import { books, readingSessions, readingProgress, pageStats, annotations } from "@verso/shared";

  describe("POST /api/plugin/import", () => {
    const authHeader = () =>
      `Basic ${Buffer.from(`${userEmail}:${apiKey}`).toString("base64")}`;

    async function registerDevice() {
      await ctx.db.insert(devices).values({
        id: "kobo-001",
        userId,
        model: "Kobo Libra",
        lastSeen: new Date().toISOString(),
      });
    }

    async function insertBook(md5: string) {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId,
        title: "Import Test Book",
        author: "Author",
        filePath: "books/test.epub",
        fileFormat: "epub",
        fileSize: 1000,
        fileHash: "sha",
        md5Hash: md5,
        addedBy: userId,
      });
      return bookId;
    }

    it("imports page stats and synthesizes sessions", async () => {
      await registerDevice();
      const bookMd5 = "import_test_md5_1234567890abcde";
      const bookId = await insertBook(bookMd5);

      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/import",
        headers: { authorization: authHeader() },
        payload: {
          version: "0.3.0",
          device_id: "kobo-001",
          books: [{ md5: bookMd5, title: "Import Test Book", authors: "Author", pages: 200 }],
          stats: [
            { md5: bookMd5, page: 1, start_time: 1700000000, duration: 60, total_pages: 200 },
            { md5: bookMd5, page: 2, start_time: 1700000070, duration: 60, total_pages: 200 },
            { md5: bookMd5, page: 3, start_time: 1700000140, duration: 60, total_pages: 200 },
          ],
          annotations: {},
        },
      });
      expect(res.statusCode).toBe(200);

      // Page stats stored
      const stats = await ctx.db.select().from(pageStats).all();
      expect(stats).toHaveLength(3);

      // Session synthesized (all within 5 min gap → 1 session)
      const sessions = await ctx.db.select().from(readingSessions).all();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].source).toBe("koinsight");
      expect(sessions[0].durationMinutes).toBe(3); // 180 seconds → 3 minutes

      // Progress updated
      const progress = await ctx.db.select().from(readingProgress).all();
      expect(progress).toHaveLength(1);
      expect(progress[0].bookId).toBe(bookId);
    });

    it("imports annotations", async () => {
      await registerDevice();
      const bookMd5 = "annotate_test_md5_1234567890abc";
      const bookId = await insertBook(bookMd5);

      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/import",
        headers: { authorization: authHeader() },
        payload: {
          version: "0.3.0",
          device_id: "kobo-001",
          books: [{ md5: bookMd5, title: "Test", authors: "Author", pages: 100 }],
          stats: [],
          annotations: {
            [bookMd5]: [
              { chapter: "Chapter 1", text: "Important passage", page: 15, type: "highlight" },
              { chapter: "Chapter 2", text: "Another bit", note: "my note", page: 30, type: "highlight" },
            ],
          },
        },
      });
      expect(res.statusCode).toBe(200);

      const anns = await ctx.db.select().from(annotations).all();
      expect(anns).toHaveLength(2);
      expect(anns[0].source).toBe("koinsight");
      expect(anns[0].pageNumber).toBe(15);
      expect(anns[0].cfiPosition).toBeNull();
    });

    it("handles dedup on re-import", async () => {
      await registerDevice();
      const bookMd5 = "dedup_test_md5_1234567890abcdef";
      await insertBook(bookMd5);

      const app = await buildApp(ctx.config);
      const payload = {
        version: "0.3.0",
        device_id: "kobo-001",
        books: [{ md5: bookMd5, title: "Test", authors: "Author", pages: 100 }],
        stats: [
          { md5: bookMd5, page: 1, start_time: 1700000000, duration: 60, total_pages: 100 },
        ],
        annotations: {},
      };

      // Import twice
      await app.inject({ method: "POST", url: "/api/plugin/import", headers: { authorization: authHeader() }, payload });
      await app.inject({ method: "POST", url: "/api/plugin/import", headers: { authorization: authHeader() }, payload });

      const stats = await ctx.db.select().from(pageStats).all();
      expect(stats).toHaveLength(1); // dedup via unique index
    });

    it("rejects version below 0.3.0", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({
        method: "POST",
        url: "/api/plugin/import",
        headers: { authorization: authHeader() },
        payload: {
          version: "0.2.0",
          device_id: "kobo-001",
          books: [],
          stats: [],
          annotations: {},
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: FAIL — import route not found.

- [ ] **Step 3: Implement import endpoint**

In `packages/server/src/routes/koinsight.ts`, add imports and the endpoint:

```typescript
import { eq, and, sql } from "drizzle-orm";
import {
  devices,
  books,
  pageStats,
  readingSessions,
  readingProgress,
  annotations,
  koinsightDeviceInput,
  koinsightImportInput,
} from "@verso/shared";

  // POST /api/plugin/import — import stats + annotations
  app.post("/api/plugin/import", { preHandler: authHook }, async (req, reply) => {
    const parsed = koinsightImportInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid request body" });
    }

    const { version, device_id, books: importBooks, stats, annotations: importAnnotations } = parsed.data;
    if (!isVersionValid(version)) {
      return reply.code(400).send({ message: `Plugin version ${version} is below minimum 0.3.0` });
    }

    const userId = req.user!.sub;

    // Verify device belongs to user
    const device = await db.select().from(devices).where(and(eq(devices.id, device_id), eq(devices.userId, userId))).get();
    if (!device) {
      return reply.code(403).send({ message: "Device not registered to this user" });
    }

    // Build MD5 → bookId map
    const md5ToBookId = new Map<string, string>();
    const md5ToTitle = new Map<string, string>();
    for (const b of importBooks) {
      md5ToTitle.set(b.md5, b.title);
      const matched = await db.select({ id: books.id }).from(books).where(eq(books.md5Hash, b.md5)).get();
      if (matched) {
        md5ToBookId.set(b.md5, matched.id);
      }
    }

    // Insert page stats (ON CONFLICT DO NOTHING via try/catch on unique constraint)
    for (const stat of stats) {
      try {
        await db.insert(pageStats).values({
          userId,
          bookId: md5ToBookId.get(stat.md5) || null,
          bookMd5: stat.md5,
          deviceId: device_id,
          page: stat.page,
          startTime: stat.start_time,
          duration: stat.duration,
          totalPages: stat.total_pages,
        }).onConflictDoNothing();
      } catch {
        // Ignore duplicate
      }
    }

    // Synthesize reading sessions from page stats
    // Group stats by book md5, sort by start_time, split on 5-min gaps
    const statsByBook = new Map<string, typeof stats>();
    for (const stat of stats) {
      const existing = statsByBook.get(stat.md5) || [];
      existing.push(stat);
      statsByBook.set(stat.md5, existing);
    }

    const SESSION_GAP_SECONDS = 5 * 60;

    for (const [md5, bookStats] of statsByBook) {
      const sorted = [...bookStats].sort((a, b) => a.start_time - b.start_time);
      const bookId = md5ToBookId.get(md5) || null;
      const bookTitle = bookId ? null : (md5ToTitle.get(md5) || null);

      // Group into sessions
      const sessionGroups: (typeof sorted)[] = [];
      let currentGroup: typeof sorted = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (curr.start_time - (prev.start_time + prev.duration) > SESSION_GAP_SECONDS) {
          sessionGroups.push(currentGroup);
          currentGroup = [curr];
        } else {
          currentGroup.push(curr);
        }
      }
      sessionGroups.push(currentGroup);

      // Create sessions
      for (const group of sessionGroups) {
        const first = group[0];
        const last = group[group.length - 1];
        const totalDuration = group.reduce((sum, s) => sum + s.duration, 0);
        const durationMinutes = Math.ceil(totalDuration / 60);

        const startedAt = new Date(first.start_time * 1000).toISOString();
        const endedAt = new Date((last.start_time + last.duration) * 1000).toISOString();

        // Check for existing session to avoid duplicates
        const existingSession = await db
          .select()
          .from(readingSessions)
          .where(
            and(
              eq(readingSessions.userId, userId),
              eq(readingSessions.startedAt, startedAt),
              bookId ? eq(readingSessions.bookId, bookId) : sql`${readingSessions.bookTitle} = ${bookTitle}`,
            ),
          )
          .get();

        if (!existingSession && bookId) {
          await db.insert(readingSessions).values({
            userId,
            bookId,
            startedAt,
            endedAt,
            durationMinutes,
            deviceId: device_id,
            source: "koinsight",
            bookTitle: null,
          });
        }
      }

      // Update readingProgress for matched books
      if (bookId) {
        const totalTime = sorted.reduce((sum, s) => sum + s.duration, 0);
        const lastStat = sorted[sorted.length - 1];
        const percentage = lastStat.total_pages > 0
          ? Math.min(100, Math.round((lastStat.page / lastStat.total_pages) * 100))
          : 0;
        const now = new Date().toISOString();

        const existing = await db
          .select()
          .from(readingProgress)
          .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, bookId)))
          .get();

        if (existing) {
          await db.update(readingProgress).set({
            percentage,
            currentPage: lastStat.page,
            totalPages: lastStat.total_pages,
            timeSpentMinutes: Math.ceil(totalTime / 60),
            lastReadAt: now,
            deviceId: device_id,
            finishedAt: existing.finishedAt ?? (percentage >= 98 ? now : null),
          }).where(eq(readingProgress.id, existing.id));
        } else {
          await db.insert(readingProgress).values({
            userId,
            bookId,
            percentage,
            currentPage: lastStat.page,
            totalPages: lastStat.total_pages,
            timeSpentMinutes: Math.ceil(totalTime / 60),
            startedAt: now,
            lastReadAt: now,
            deviceId: device_id,
            finishedAt: percentage >= 98 ? now : null,
          });
        }
      }
    }

    // Import annotations — replace per book_md5 + device
    for (const [md5, anns] of Object.entries(importAnnotations)) {
      const bookId = md5ToBookId.get(md5);
      if (!bookId) continue; // Skip annotations for unmatched books

      // Delete existing annotations from this device for this book
      await db.delete(annotations).where(
        and(
          eq(annotations.userId, userId),
          eq(annotations.bookId, bookId),
          eq(annotations.deviceId, device_id),
          eq(annotations.source, "koinsight"),
        ),
      );

      // Insert new annotations
      for (const ann of anns) {
        await db.insert(annotations).values({
          userId,
          bookId,
          type: ann.type || "highlight",
          content: ann.text || null,
          note: ann.note || null,
          cfiPosition: null,
          pageNumber: ann.page,
          chapter: ann.chapter || null,
          deviceId: device_id,
          source: "koinsight",
        });
      }
    }

    return reply.send({ message: "Upload successful" });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: PASS.

**Important:** `readingSessions.bookId` is NOT NULL with a FK constraint. For unmatched books (no bookId), skip session creation entirely. Sessions are only synthesized for books that exist in Verso's catalog. This is acceptable — unmatched books have no reading time stats until they're uploaded.

- [ ] **Step 5: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/koinsight.ts packages/server/src/__tests__/koinsight.test.ts
git commit -m "feat: KoInsight POST /api/plugin/import endpoint"
```

---

## Task 13: KoInsight — GET /api/plugin/download Endpoint

**Files:**
- Modify: `packages/server/src/routes/koinsight.ts`

- [ ] **Step 1: Add download endpoint**

In `packages/server/src/routes/koinsight.ts`, add inside `registerKoInsightRoutes`:

```typescript
  // GET /api/plugin/download — serve KoInsight plugin zip (no auth)
  app.get("/api/plugin/download", async (_req, reply) => {
    // Plugin download is optional — return 404 if no plugin zip is configured
    return reply.code(404).send({ message: "Plugin download not configured" });
  });
```

This is a placeholder that returns 404. When the user wants to host the plugin zip, they can place it in storage and update this endpoint to serve it. The KoInsight plugin doesn't require this endpoint to function — it's a convenience for distribution.

- [ ] **Step 2: Write test**

Add to `packages/server/src/__tests__/koinsight.test.ts`:

```typescript
  describe("GET /api/plugin/download", () => {
    it("returns 404 when no plugin configured", async () => {
      const app = await buildApp(ctx.config);
      const res = await app.inject({ method: "GET", url: "/api/plugin/download" });
      expect(res.statusCode).toBe(404);
    });
  });
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/koinsight.ts packages/server/src/__tests__/koinsight.test.ts
git commit -m "feat: KoInsight GET /api/plugin/download endpoint (placeholder)"
```

---

## Task 14: Stats Router — LEFT JOIN for readingLog

**Files:**
- Modify: `packages/server/src/trpc/routers/stats.ts`

- [ ] **Step 1: Write test**

Add to `packages/server/src/__tests__/koinsight.test.ts` or create a new section in the existing stats test file:

```typescript
import { readingSessions } from "@verso/shared";

describe("stats.readingLog with e-reader sessions", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);

    // Insert a session with bookTitle but no valid book FK
    // This simulates a KoInsight session for an unmatched book
    // We need bookId to be nullable for this to work
  });

  it("returns sessions with bookTitle fallback", async () => {
    // This test verifies that LEFT JOIN works and COALESCE falls back to bookTitle
    const bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Real Book",
      author: "Real Author",
      filePath: "books/test.epub",
      fileFormat: "epub",
      fileSize: 1000,
      fileHash: "abc",
      addedBy: (await ctx.db.select().from(users).get())!.id,
    });

    const now = new Date().toISOString();
    await ctx.db.insert(readingSessions).values({
      userId: (await ctx.db.select().from(users).get())!.id,
      bookId,
      startedAt: now,
      endedAt: now,
      durationMinutes: 30,
      source: "koinsight",
      bookTitle: null,
    });

    const result = await authedCaller.stats.readingLog({ limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].bookTitle).toBe("Real Book");
  });
});
```

- [ ] **Step 2: Run test to see current behavior**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
This should pass with the current innerJoin since the book exists. But the point is to verify the COALESCE pattern works.

- [ ] **Step 3: Update readingLog to use LEFT JOIN**

In `packages/server/src/trpc/routers/stats.ts`, modify the `readingLog` procedure (lines 174-188). Change `innerJoin` to `leftJoin` and update the select to use `sql` for COALESCE:

```typescript
    const rows = await ctx.db
      .select({
        id: readingSessions.id,
        bookId: readingSessions.bookId,
        bookTitle: sql<string>`coalesce(${books.title}, ${readingSessions.bookTitle}, 'Unknown')`.as("book_title"),
        bookAuthor: sql<string>`coalesce(${books.author}, 'Unknown')`.as("book_author"),
        coverPath: books.coverPath,
        durationMinutes: readingSessions.durationMinutes,
        startedAt: readingSessions.startedAt,
      })
      .from(readingSessions)
      .leftJoin(books, eq(readingSessions.bookId, books.id))
      .where(and(...conditions))
      .orderBy(desc(readingSessions.startedAt))
      .limit(limit + 1);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass including the new one.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/trpc/routers/stats.ts packages/server/src/__tests__/koinsight.test.ts
git commit -m "feat: stats.readingLog uses LEFT JOIN for e-reader sessions"
```

---

## Task 15: Final Integration Test + Full Suite

**Files:**
- All test files

- [ ] **Step 1: Run the full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run with coverage**

Run: `cd packages/server && npx vitest run --coverage`
Expected: Coverage meets the 80% threshold. New route files (`kosync.ts`, `koinsight.ts`) may be excluded from coverage requirements per the existing vitest config pattern.

- [ ] **Step 3: Verify existing functionality isn't broken**

Run: `cd packages/server && npx vitest run src/__tests__/books.test.ts src/__tests__/auth.test.ts src/__tests__/progress.test.ts`
Expected: All existing tests still pass.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration fixes from full test suite run"
```

(Skip if no fixes needed.)
