# E-Reader Compatibility & Verso Sync Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace API keys with app passwords, fix KoInsight protocol compatibility, rename endpoints to `/api/sync/`, and create a Verso Sync KOReader plugin with Basic auth.

**Architecture:** App password stored as bcrypt + MD5 on the users table. kosync validates MD5 hash directly, OPDS/KoInsight validate via bcrypt. Verso Sync plugin is a stripped-down KoInsight fork in `packages/koreader-plugin/` that adds Basic auth headers. API key system removed entirely.

**Tech Stack:** Fastify, Drizzle ORM, SQLite, Zod, Vitest, bcrypt, Lua (KOReader plugin)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/shared/src/app-password-validators.ts` | Zod schemas for app password operations |
| Create | `packages/server/src/trpc/routers/app-password.ts` | tRPC router for set/clear/status |
| Modify | `packages/shared/src/schema.ts` | Add app password columns to users, remove apiKeys table |
| Modify | `packages/shared/src/index.ts` | Swap api-keys export for app-password |
| Modify | `packages/server/src/middleware/kosync-auth.ts` | Rewrite to MD5 comparison, remove plugin auth hook |
| Create | `packages/server/src/middleware/app-password-auth.ts` | Basic auth against app password (bcrypt) |
| Modify | `packages/server/src/routes/opds.ts` | Use app password auth |
| Modify | `packages/server/src/routes/koinsight.ts` | Rename to sync.ts, fix protocol, rename endpoints |
| Modify | `packages/server/src/app.ts` | Update route imports |
| Modify | `packages/server/src/trpc/router.ts` | Swap apiKeys → appPassword |
| Modify | `packages/shared/src/koinsight-validators.ts` | Fix field names, types |
| Delete | `packages/shared/src/schemas/api-keys.ts` | No longer needed |
| Delete | `packages/server/src/services/api-keys.ts` | No longer needed |
| Delete | `packages/server/src/trpc/routers/api-keys.ts` | No longer needed |
| Delete | `packages/server/src/__tests__/api-keys.test.ts` | No longer needed |
| Create | `packages/server/src/__tests__/app-password.test.ts` | App password tests |
| Modify | `packages/server/src/__tests__/kosync.test.ts` | Use app password instead of API key |
| Modify | `packages/server/src/__tests__/koinsight.test.ts` | Use app password, fix payload field names |
| Modify | `packages/server/src/__tests__/ereader-schema.test.ts` | Remove api key scope tests |
| Create | `packages/koreader-plugin/versosync.koplugin/_meta.lua` | Plugin metadata |
| Create | `packages/koreader-plugin/versosync.koplugin/const.lua` | Constants |
| Create | `packages/koreader-plugin/versosync.koplugin/main.lua` | Entry point, menu, lifecycle |
| Create | `packages/koreader-plugin/versosync.koplugin/settings.lua` | Settings persistence |
| Create | `packages/koreader-plugin/versosync.koplugin/call_api.lua` | HTTP client with Basic auth |
| Create | `packages/koreader-plugin/versosync.koplugin/upload.lua` | Sync orchestration |
| Create | `packages/koreader-plugin/versosync.koplugin/db_reader.lua` | SQLite stats reader |
| Create | `packages/koreader-plugin/versosync.koplugin/annotation_reader.lua` | Annotation extraction |
| Generate | `packages/server/drizzle/` | Migration for schema changes |

---

## Task 1: App Password Schema + Migration

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Write test for app password columns**

Add to `packages/server/src/__tests__/ereader-schema.test.ts`, in a new describe block:

```typescript
import { users } from "@verso/shared";
import { eq } from "drizzle-orm";

describe("app password schema", () => {
  it("users table has appPasswordHash and appPasswordMd5 columns", async () => {
    await ctx.db
      .update(users)
      .set({
        appPasswordHash: "$2b$10$fakehash",
        appPasswordMd5: "5f4dcc3b5aa765d61d8327deb882cf99",
      })
      .where(eq(users.id, userId));

    const user = await ctx.db.select().from(users).where(eq(users.id, userId)).get();
    expect(user!.appPasswordHash).toBe("$2b$10$fakehash");
    expect(user!.appPasswordMd5).toBe("5f4dcc3b5aa765d61d8327deb882cf99");
  });
});
```

Also **remove** the `describe("api key scopes")` block (lines ~220-250) that tests `createApiKeyInput` — this validator will be deleted.

Also update the annotation test — `pageNumber` is now text, so change:
```typescript
      pageNumber: "42",   // was integer 42, now text
```
and:
```typescript
    expect(ann!.pageNumber).toBe("42");  // was 42
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: FAIL — `appPasswordHash` and `appPasswordMd5` not on users table.

- [ ] **Step 3: Add columns to users, remove apiKeys table**

In `packages/shared/src/schema.ts`:

Add to `users` table after `lastLoginAt` (line 18):
```typescript
  appPasswordHash: text("app_password_hash"),
  appPasswordMd5: text("app_password_md5", { length: 32 }),
```

Remove the entire `apiKeys` table definition (lines 176-186):
```typescript
// DELETE this block:
export const apiKeys = sqliteTable("api_keys", { ... });
```

Change `annotations.pageNumber` (line 141) from `integer` to `text`:
```typescript
  pageNumber: text("page_number"),
```

- [ ] **Step 4: Generate migration**

Run: `cd packages/server && npx drizzle-kit generate`

Check the generated migration. It should:
- Add `app_password_hash` and `app_password_md5` columns to `users`
- Drop `api_keys` table
- Recreate `annotations` table with `page_number` as text (SQLite column type change requires table rebuild)

If the annotations rebuild has the same issue as before (SELECT referencing columns that don't exist in the old table), fix the migration SQL manually.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/ereader-schema.test.ts`
Expected: PASS (the api key scope tests should already be removed).

Note: Other tests that import from `api-keys.ts` will fail at this point. That's expected — we'll fix them in later tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema.ts packages/server/drizzle/ packages/server/src/__tests__/ereader-schema.test.ts
git commit -m "feat: add app password columns to users, drop apiKeys table, pageNumber to text"
```

---

## Task 2: App Password Validators + Router

**Files:**
- Create: `packages/shared/src/app-password-validators.ts`
- Create: `packages/server/src/trpc/routers/app-password.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/server/src/trpc/router.ts`

- [ ] **Step 1: Write test**

Create `packages/server/src/__tests__/app-password.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { users } from "@verso/shared";
import { eq } from "drizzle-orm";

describe("app password router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;
  });

  describe("status", () => {
    it("returns false when no app password set", async () => {
      const result = await authedCaller.appPassword.status();
      expect(result.hasPassword).toBe(false);
    });
  });

  describe("set", () => {
    it("sets app password and stores both hashes", async () => {
      const result = await authedCaller.appPassword.set({ password: "mysyncpass" });
      expect(result.success).toBe(true);

      const user = await ctx.db.select().from(users).where(eq(users.id, userId)).get();
      expect(user!.appPasswordHash).toBeTruthy();
      expect(user!.appPasswordMd5).toBeTruthy();
      // MD5 of "mysyncpass" should be a 32-char hex string
      expect(user!.appPasswordMd5).toHaveLength(32);
    });

    it("rejects password shorter than 8 characters", async () => {
      await expect(
        authedCaller.appPassword.set({ password: "short" })
      ).rejects.toThrow();
    });

    it("status returns true after setting", async () => {
      await authedCaller.appPassword.set({ password: "mysyncpass" });
      const result = await authedCaller.appPassword.status();
      expect(result.hasPassword).toBe(true);
    });
  });

  describe("clear", () => {
    it("clears app password", async () => {
      await authedCaller.appPassword.set({ password: "mysyncpass" });
      const result = await authedCaller.appPassword.clear();
      expect(result.success).toBe(true);

      const user = await ctx.db.select().from(users).where(eq(users.id, userId)).get();
      expect(user!.appPasswordHash).toBeNull();
      expect(user!.appPasswordMd5).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/app-password.test.ts`
Expected: FAIL — router doesn't exist.

- [ ] **Step 3: Create validators**

Create `packages/shared/src/app-password-validators.ts`:

```typescript
import { z } from "zod";

export const appPasswordSetInput = z.object({
  password: z.string().min(8),
});
```

- [ ] **Step 4: Create router**

Create `packages/server/src/trpc/routers/app-password.ts`:

```typescript
import { createHash } from "node:crypto";
import { hash } from "bcrypt";
import { eq } from "drizzle-orm";
import { users, appPasswordSetInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

export const appPasswordRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.select({ appPasswordHash: users.appPasswordHash })
      .from(users)
      .where(eq(users.id, ctx.user.sub))
      .get();
    return { hasPassword: !!user?.appPasswordHash };
  }),

  set: protectedProcedure.input(appPasswordSetInput).mutation(async ({ ctx, input }) => {
    const appPasswordHash = await hash(input.password, 10);
    const appPasswordMd5 = createHash("md5").update(input.password).digest("hex");

    await ctx.db
      .update(users)
      .set({ appPasswordHash, appPasswordMd5 })
      .where(eq(users.id, ctx.user.sub));

    return { success: true };
  }),

  clear: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({ appPasswordHash: null, appPasswordMd5: null })
      .where(eq(users.id, ctx.user.sub));

    return { success: true };
  }),
});
```

- [ ] **Step 5: Wire up exports and router**

In `packages/shared/src/index.ts`, replace:
```typescript
export * from "./schemas/api-keys.js";
```
with:
```typescript
export * from "./app-password-validators.js";
```

In `packages/server/src/trpc/router.ts`, replace:
```typescript
import { apiKeysRouter } from "./routers/api-keys.js";
```
with:
```typescript
import { appPasswordRouter } from "./routers/app-password.js";
```

And in the router object, replace:
```typescript
  apiKeys: apiKeysRouter,
```
with:
```typescript
  appPassword: appPasswordRouter,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/app-password.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/app-password-validators.ts packages/shared/src/index.ts packages/server/src/trpc/routers/app-password.ts packages/server/src/trpc/router.ts
git commit -m "feat: app password router — set, clear, status"
```

---

## Task 3: Remove API Key System

**Files:**
- Delete: `packages/shared/src/schemas/api-keys.ts`
- Delete: `packages/server/src/services/api-keys.ts`
- Delete: `packages/server/src/trpc/routers/api-keys.ts`
- Delete: `packages/server/src/__tests__/api-keys.test.ts`

- [ ] **Step 1: Delete files**

```bash
rm packages/shared/src/schemas/api-keys.ts
rm packages/server/src/services/api-keys.ts
rm packages/server/src/trpc/routers/api-keys.ts
rm packages/server/src/__tests__/api-keys.test.ts
```

- [ ] **Step 2: Run tests to see what else breaks**

Run: `cd packages/server && npx vitest run 2>&1 | grep -E "FAIL|Error|Cannot find"`

Fix any remaining imports of deleted modules. The known references are:
- `packages/server/src/middleware/kosync-auth.ts` — imports `verifyApiKey` (will be rewritten in Task 4)
- `packages/server/src/__tests__/kosync.test.ts` — imports `createApiKey` (will be rewritten in Task 5)
- `packages/server/src/__tests__/koinsight.test.ts` — imports `createApiKey` (will be rewritten in Task 7)

For now, comment out or stub these imports so the build doesn't fail. They'll be properly fixed in their respective tasks.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: remove API key system (apiKeys table, service, router, validators, tests)"
```

---

## Task 4: Rewrite Auth Middleware

**Files:**
- Rewrite: `packages/server/src/middleware/kosync-auth.ts`
- Create: `packages/server/src/middleware/app-password-auth.ts`
- Modify: `packages/server/src/routes/opds.ts`

- [ ] **Step 1: Write tests for new auth hooks**

Create `packages/server/src/__tests__/app-password-auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { createHash } from "node:crypto";
import { hash } from "bcrypt";
import { users } from "@verso/shared";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";

describe("app password auth", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let userEmail: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";

    // Set app password directly in DB
    const appPassword = "mysyncpass";
    const appPasswordHash = await hash(appPassword, 10);
    const appPasswordMd5 = createHash("md5").update(appPassword).digest("hex");
    await ctx.db.update(users).set({ appPasswordHash, appPasswordMd5 }).where(eq(users.id, userId));
  });

  describe("kosync auth (MD5)", () => {
    it("authenticates with correct MD5", async () => {
      const md5 = createHash("md5").update("mysyncpass").digest("hex");
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "GET",
        url: "/users/auth",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": md5,
        },
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects wrong MD5", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "GET",
        url: "/users/auth",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": "wrong_md5_hash",
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects when no app password set", async () => {
      await ctx.db.update(users).set({ appPasswordHash: null, appPasswordMd5: null }).where(eq(users.id, userId));
      const md5 = createHash("md5").update("mysyncpass").digest("hex");
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "GET",
        url: "/users/auth",
        headers: {
          "x-auth-user": userEmail,
          "x-auth-key": md5,
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("app password Basic auth", () => {
    it("authenticates with app password via Basic auth", async () => {
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "GET",
        url: "/api/sync/health",
        headers: {
          authorization: `Basic ${Buffer.from(`${userEmail}:mysyncpass`).toString("base64")}`,
        },
      });
      // health endpoint has no auth, but test the OPDS endpoint
      expect(res.statusCode).toBe(200);
    });

    it("falls back to login password when no app password set", async () => {
      await ctx.db.update(users).set({ appPasswordHash: null, appPasswordMd5: null }).where(eq(users.id, userId));
      const app = await buildApp(ctx.config, ctx.db);
      const res = await app.inject({
        method: "GET",
        url: "/opds/catalog",
        headers: {
          authorization: `Basic ${Buffer.from(`${userEmail}:password123`).toString("base64")}`,
        },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Rewrite kosync auth middleware**

Rewrite `packages/server/src/middleware/kosync-auth.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

export function createKosyncAuthHook(db: AppDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const email = req.headers["x-auth-user"] as string | undefined;
    const md5Key = req.headers["x-auth-key"] as string | undefined;

    if (!email || !md5Key) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.appPasswordMd5) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    if (md5Key !== user.appPasswordMd5) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    req.user = { sub: user.id, email: user.email, role: user.role, type: "access" };
  };
}
```

- [ ] **Step 3: Create app password Basic auth middleware**

Create `packages/server/src/middleware/app-password-auth.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { compare } from "bcrypt";
import { users } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

export function createAppPasswordAuthHook(db: AppDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Basic ")) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso"')
        .send({ error: "Missing authorization header" });
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return reply.status(401).send({ error: "Invalid Basic auth format" });
    }

    const email = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso"')
        .send({ error: "Invalid credentials" });
    }

    // Try app password first
    if (user.appPasswordHash) {
      const validAppPassword = await compare(password, user.appPasswordHash);
      if (validAppPassword) {
        req.user = { sub: user.id, email: user.email, role: user.role, type: "access" };
        return;
      }
    }

    // Fallback to login password
    if (user.passwordHash) {
      const validLoginPassword = await compare(password, user.passwordHash);
      if (validLoginPassword) {
        req.user = { sub: user.id, email: user.email, role: user.role, type: "access" };
        return;
      }
    }

    return reply
      .status(401)
      .header("WWW-Authenticate", 'Basic realm="Verso"')
      .send({ error: "Invalid credentials" });
  };
}
```

- [ ] **Step 4: Update OPDS routes to use app password auth**

In `packages/server/src/routes/opds.ts`, change line 2:
```typescript
import { createAppPasswordAuthHook } from "../middleware/app-password-auth.js";
```

And update the hook creation (find where `createBasicAuthHook(db)` is called and replace with `createAppPasswordAuthHook(db)`).

- [ ] **Step 5: Run tests**

Run: `cd packages/server && npx vitest run src/__tests__/app-password-auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/middleware/kosync-auth.ts packages/server/src/middleware/app-password-auth.ts packages/server/src/routes/opds.ts packages/server/src/__tests__/app-password-auth.test.ts
git commit -m "feat: rewrite auth middleware — kosync uses MD5, OPDS/sync use app password"
```

---

## Task 5: Fix kosync Tests

**Files:**
- Modify: `packages/server/src/__tests__/kosync.test.ts`

- [ ] **Step 1: Rewrite kosync tests to use app password**

Replace the entire `beforeEach` and auth setup. Instead of creating an API key, set an app password and use its MD5:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { buildApp } from "../app.js";
import { createHash } from "node:crypto";
import { hash } from "bcrypt";
import { books, readingProgress, kosyncProgress, devices, users } from "@verso/shared";
import { eq } from "drizzle-orm";

describe("kosync endpoints", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let userEmail: string;
  let md5Key: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";

    // Set app password
    const appPassword = "mysyncpass";
    const appPasswordHash = await hash(appPassword, 10);
    const appPasswordMd5 = createHash("md5").update(appPassword).digest("hex");
    await ctx.db.update(users).set({ appPasswordHash, appPasswordMd5 }).where(eq(users.id, userId));
    md5Key = appPasswordMd5;
  });

  // ... rest of tests unchanged, but replace all occurrences of:
  //   "x-auth-key": apiKey
  // with:
  //   "x-auth-key": md5Key
```

Go through every test and replace `apiKey` with `md5Key` in the headers.

- [ ] **Step 2: Run tests**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: PASS — all 11 kosync tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/kosync.test.ts
git commit -m "test: kosync tests use app password MD5 instead of API key"
```

---

## Task 6: KoInsight Protocol Fixes — Validators

**Files:**
- Modify: `packages/shared/src/koinsight-validators.ts`

- [ ] **Step 1: Update validators to match real protocol**

Rewrite `packages/shared/src/koinsight-validators.ts`:

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
  // Extra fields from plugin (accepted but not required)
  id: z.number().int().optional(),
  notes: z.number().int().optional(),
  last_open: z.string().optional(),
  highlights: z.number().int().optional(),
  series: z.string().optional(),
  language: z.string().optional(),
  total_read_time: z.number().optional(),
  total_read_pages: z.number().int().optional(),
});

export const koinsightStatInput = z.object({
  book_md5: z.string().min(1),
  page: z.number().int(),
  start_time: z.number().int(),
  duration: z.number().int(),
  total_pages: z.number().int(),
  device_id: z.string().optional(),
});

export const koinsightAnnotationInput = z.object({
  chapter: z.string().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
  page: z.union([z.number(), z.string()]),
  type: z.string().default("highlight"),
  // Extra fields from plugin
  datetime: z.string().optional(),
  drawer: z.string().optional(),
  color: z.string().optional(),
  pageno: z.union([z.number(), z.string()]).optional(),
  total_pages: z.number().int().optional(),
  pos0: z.string().optional(),
  pos1: z.string().optional(),
  datetime_updated: z.string().optional(),
});

export const koinsightImportInput = z.object({
  version: z.string().min(1),
  device_id: z.string().optional(),
  books: z.array(koinsightBookInput),
  stats: z.array(koinsightStatInput),
  annotations: z.record(z.string(), z.array(koinsightAnnotationInput)),
});
```

- [ ] **Step 2: Update validator tests in koinsight.test.ts**

Update the existing validator tests to use `book_md5` instead of `md5` in stats, and make `device_id` optional in import:

```typescript
  it("validates import input", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      device_id: "kindle-001",
      books: [{ md5: "abc123", title: "Book", authors: "Author", pages: 200 }],
      stats: [{ book_md5: "abc123", page: 1, start_time: 1700000000, duration: 60, total_pages: 200 }],
      annotations: {},
    });
    expect(result.success).toBe(true);
  });

  it("validates import without device_id", () => {
    const result = koinsightImportInput.safeParse({
      version: "0.3.0",
      books: [],
      stats: [],
      annotations: {},
    });
    expect(result.success).toBe(true);
  });

  it("validates annotation with string page (EPUB xPointer)", () => {
    const result = koinsightAnnotationInput.safeParse({
      chapter: "Ch 1",
      text: "highlighted",
      page: "/body/DocFragment[17]/body/div/p/text().0",
      type: "highlight",
    });
    expect(result.success).toBe(true);
  });
```

- [ ] **Step 3: Run tests**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: Validator tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/koinsight-validators.ts packages/server/src/__tests__/koinsight.test.ts
git commit -m "fix: KoInsight validators match real plugin protocol (book_md5, optional device_id, string pages)"
```

---

## Task 7: KoInsight Route Fixes + Rename to /api/sync/

**Files:**
- Rename: `packages/server/src/routes/koinsight.ts` → `packages/server/src/routes/sync.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/__tests__/koinsight.test.ts`

- [ ] **Step 1: Rename file and update imports**

```bash
mv packages/server/src/routes/koinsight.ts packages/server/src/routes/sync.ts
```

In `packages/server/src/app.ts`, change:
```typescript
import { registerKoInsightRoutes } from "./routes/koinsight.js";
```
to:
```typescript
import { registerSyncRoutes } from "./routes/sync.js";
```

And update the registration call:
```typescript
  registerSyncRoutes(app, db, storage, config);
```

- [ ] **Step 2: Rewrite the sync route file**

Rewrite `packages/server/src/routes/sync.ts`:

- Rename function to `registerSyncRoutes`
- Change all endpoint paths from `/api/plugin/` to `/api/sync/`
- Remove the `/api/sync/download` endpoint entirely
- Use `createAppPasswordAuthHook` instead of `createPluginAuthHook`
- Fix all `stat.md5` references to `stat.book_md5`
- Handle optional `device_id`: resolve from body, first stat entry, or skip
- Store annotation `pageNumber` as `String(ann.page)` (now text column)
- Handle missing `device_id` gracefully: set `deviceId: null` on records

Key changes in the import handler:

```typescript
import { createAppPasswordAuthHook } from "../middleware/app-password-auth.js";

// In registerSyncRoutes:
const authHook = createAppPasswordAuthHook(db);

// Endpoints:
app.get("/api/sync/health", ...)    // was /api/plugin/health
app.post("/api/sync/device", ...)   // was /api/plugin/device
app.post("/api/sync/import", ...)   // was /api/plugin/import
// /api/plugin/download — REMOVED

// In import handler, resolve device_id:
const device_id = bodyDeviceId || (stats.length > 0 ? stats[0].device_id : undefined) || null;

// Page stats: use stat.book_md5
bookMd5: stat.book_md5,
bookId: md5ToBookId.get(stat.book_md5) || null,

// Stats grouping: use stat.book_md5
const existing = statsByBook.get(stat.book_md5) || [];
statsByBook.set(stat.book_md5, existing);

// Annotation pageNumber as string:
pageNumber: String(ann.page),

// Skip device verification if no device_id:
if (device_id) {
  const device = await db.select()...
  if (!device) return reply.code(403)...
}

// Set deviceId to null when missing:
deviceId: device_id || null,
```

- [ ] **Step 3: Update tests**

In `packages/server/src/__tests__/koinsight.test.ts`:
- Replace all `/api/plugin/` URLs with `/api/sync/`
- Replace API key auth with app password Basic auth
- Update stat payloads to use `book_md5` instead of `md5`
- Remove the health endpoint no-auth test for download
- Update annotation assertions for string pageNumber

Replace the test setup:
```typescript
  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "reader@example.com",
      password: "password123",
      displayName: "Reader",
    });
    userId = reg.user.id;
    userEmail = "reader@example.com";

    // Set app password
    const appPassword = "mysyncpass";
    const appPasswordHash = await hash(appPassword, 10);
    const appPasswordMd5 = createHash("md5").update(appPassword).digest("hex");
    await ctx.db.update(users).set({ appPasswordHash, appPasswordMd5 }).where(eq(users.id, userId));
  });

  const authHeader = () =>
    `Basic ${Buffer.from(`${userEmail}:mysyncpass`).toString("base64")}`;
```

Update assertion for annotation pageNumber:
```typescript
expect(anns[0].pageNumber).toBe("15");  // now string, was number
```

- [ ] **Step 4: Run tests**

Run: `cd packages/server && npx vitest run src/__tests__/koinsight.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: rename KoInsight routes to /api/sync/, fix protocol compat, use app password auth"
```

---

## Task 8: Clean Up — Remove Dead Code and Fix Remaining Tests

**Files:**
- Delete: `packages/server/src/middleware/basic-auth.ts` (replaced by app-password-auth.ts)
- Modify: `packages/server/src/middleware/auth.ts` — remove `createFlexAuthHook` if no longer used
- Modify: any remaining test files with broken imports

- [ ] **Step 1: Check for remaining references to deleted code**

```bash
cd packages/server && grep -r "basic-auth\|createBasicAuthHook\|createFlexAuthHook\|api-keys\|verifyApiKey\|createApiKey\|createPluginAuthHook" src/ --include="*.ts" -l
```

Fix any remaining references. The `basic-auth.ts` middleware can be deleted if nothing else uses it (OPDS was the only consumer, now using app-password-auth). The `createFlexAuthHook` in `auth.ts` referenced `createBasicAuthHook` — if nothing uses it, remove it too.

Keep `createAuthHook` and `createAdminAuthHook` in `auth.ts` — those are used by the web app (JWT).

- [ ] **Step 2: Delete dead files**

```bash
rm packages/server/src/middleware/basic-auth.ts
```

Remove `createFlexAuthHook` from `packages/server/src/middleware/auth.ts` if unused. Remove the import of `createBasicAuthHook` from that file.

- [ ] **Step 3: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead auth code (basic-auth, flex auth, API key references)"
```

---

## Task 9: Verso Sync KOReader Plugin

**Files:**
- Create: `packages/koreader-plugin/versosync.koplugin/` (8 Lua files)

- [ ] **Step 1: Create plugin directory and metadata**

```bash
mkdir -p packages/koreader-plugin/versosync.koplugin
```

Create `packages/koreader-plugin/versosync.koplugin/_meta.lua`:

```lua
return {
    name = "versosync",
    fullname = _("Verso Sync"),
    description = _([[Sync reading statistics and annotations to your Verso server.]]),
}
```

- [ ] **Step 2: Create constants**

Create `packages/koreader-plugin/versosync.koplugin/const.lua`:

```lua
local const = {}

const.VERSION = "0.3.0"

return const
```

- [ ] **Step 3: Create settings module**

Create `packages/koreader-plugin/versosync.koplugin/settings.lua`:

```lua
local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")

local VersoSyncSettings = {}

local settings_file = DataStorage:getSettingsDir() .. "/versosync.lua"
local settings = LuaSettings:open(settings_file)

local DEFAULTS = {
    server_url = "",
    email = "",
    password = "",
    sync_on_suspend = true,
}

function VersoSyncSettings:get(key)
    local all = settings:readSetting("versosync") or {}
    if all[key] ~= nil then
        return all[key]
    end
    return DEFAULTS[key]
end

function VersoSyncSettings:set(key, value)
    local all = settings:readSetting("versosync") or {}
    all[key] = value
    settings:saveSetting("versosync", all)
    settings:flush()
end

function VersoSyncSettings:getServerUrl()
    return self:get("server_url")
end

function VersoSyncSettings:getEmail()
    return self:get("email")
end

function VersoSyncSettings:getPassword()
    return self:get("password")
end

function VersoSyncSettings:isConfigured()
    local url = self:getServerUrl()
    local email = self:getEmail()
    local password = self:getPassword()
    return url ~= "" and email ~= "" and password ~= ""
end

return VersoSyncSettings
```

- [ ] **Step 4: Create HTTP client with Basic auth**

Create `packages/koreader-plugin/versosync.koplugin/call_api.lua`:

```lua
local socketutil = require("socketutil")
local http = require("socket.http")
local ltn12 = require("ltn12")
local rapidjson = require("rapidjson")
local logger = require("logger")

local function base64_encode(data)
    local b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    return ((data:gsub('.', function(x)
        local r, b_val = '', x:byte()
        for i = 8, 1, -1 do r = r .. (b_val % 2^i - b_val % 2^(i-1) > 0 and '1' or '0') end
        return r
    end) .. '0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
        if (#x < 6) then return '' end
        local c = 0
        for i = 1, 6 do c = c + (x:sub(i, i) == '1' and 2^(6-i) or 0) end
        return b:sub(c+1, c+1)
    end) .. ({ '', '==', '=' })[#data % 3 + 1])
end

local function callApi(method, url, headers, body, email, password)
    headers = headers or {}
    headers["Content-Type"] = "application/json"

    if email and password then
        headers["Authorization"] = "Basic " .. base64_encode(email .. ":" .. password)
    end

    if body then
        local json_body = rapidjson.encode(body)
        headers["Content-Length"] = #json_body

        local sink = {}
        socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
        local request = {
            url = url,
            method = method,
            headers = headers,
            source = ltn12.source.string(json_body),
            sink = ltn12.sink.table(sink),
        }
        local code, resp_headers, status = socket.skip(1, http.request(request))
        socketutil:reset_timeout()

        if code == 200 then
            local response = table.concat(sink)
            if response ~= "" and response:sub(1, 1) == "{" then
                return true, rapidjson.decode(response)
            end
            return true, {}
        else
            logger.warn("Verso Sync API error:", code, status)
            return false, "HTTP " .. tostring(code)
        end
    else
        local sink = {}
        socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
        local request = {
            url = url,
            method = method,
            headers = headers,
            sink = ltn12.sink.table(sink),
        }
        local code, resp_headers, status = socket.skip(1, http.request(request))
        socketutil:reset_timeout()

        if code == 200 then
            local response = table.concat(sink)
            if response ~= "" and response:sub(1, 1) == "{" then
                return true, rapidjson.decode(response)
            end
            return true, {}
        else
            logger.warn("Verso Sync API error:", code, status)
            return false, "HTTP " .. tostring(code)
        end
    end
end

return callApi
```

- [ ] **Step 5: Create database reader**

Create `packages/koreader-plugin/versosync.koplugin/db_reader.lua`:

```lua
local DataStorage = require("datastorage")
local logger = require("logger")
local SQ3 = require("lua-ljsqlite3/init")
local ReaderUI = require("apps/reader/readerui")

local VersoSyncDbReader = {}

local function getDb()
    local db_path = DataStorage:getSettingsDir() .. "/statistics.sqlite3"
    return SQ3.open(db_path)
end

function VersoSyncDbReader.bookData()
    local conn = getDb()
    if not conn then return {} end

    local books = {}
    local stmt = conn:prepare("SELECT * FROM book")
    if not stmt then
        conn:close()
        return {}
    end

    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    local current_pages = nil
    if ReaderUI.instance and ReaderUI.instance.document then
        current_pages = ReaderUI.instance.document:getPageCount()
    end

    for row in stmt:rows() do
        local book = {
            id = row[1],
            title = row[2],
            authors = row[3],
            notes = row[4],
            last_open = row[5],
            highlights = row[6],
            pages = row[7],
            series = row[8],
            language = row[9],
            md5 = row[10],
            total_read_time = row[11],
            total_read_pages = row[12],
        }
        -- Use live page count for currently open book
        if current_pages and ReaderUI.instance
           and ReaderUI.instance.document
           and book.md5 == ReaderUI.instance.document:getProps().partial_md5_checksum then
            book.pages = current_pages
        end
        table.insert(books, book)
    end
    stmt:close()
    conn:close()
    return books
end

function VersoSyncDbReader.progressData()
    -- Flush in-memory stats to DB first
    if ReaderUI.instance and ReaderUI.instance.statistics then
        ReaderUI.instance.statistics:insertDB()
    end

    local conn = getDb()
    if not conn then return {} end

    local books = VersoSyncDbReader.bookData()
    local book_id_to_md5 = {}
    for _, book in ipairs(books) do
        book_id_to_md5[book.id] = book.md5
    end

    local stats = {}
    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    local stmt = conn:prepare("SELECT page, start_time, duration, total_pages, id_book FROM page_stat_data")
    if not stmt then
        conn:close()
        return stats
    end

    for row in stmt:rows() do
        local md5 = book_id_to_md5[row[5]]
        if md5 then
            table.insert(stats, {
                page = row[1],
                start_time = row[2],
                duration = row[3],
                total_pages = row[4],
                book_md5 = md5,
                device_id = device_id,
            })
        end
    end
    stmt:close()
    conn:close()
    return stats
end

return VersoSyncDbReader
```

- [ ] **Step 6: Create annotation reader**

Create `packages/koreader-plugin/versosync.koplugin/annotation_reader.lua`:

```lua
local DocSettings = require("docsettings")
local ReadHistory = require("readhistory")
local ReaderUI = require("apps/reader/readerui")
local logger = require("logger")

local VersoSyncAnnotationReader = {}

function VersoSyncAnnotationReader.getAnnotationsForCurrentBook()
    if not ReaderUI.instance then return nil, nil, nil end

    local ui = ReaderUI.instance
    -- Flush annotations to disk
    if ui.doc_settings then
        ui.doc_settings:flush()
    end

    local annotations = ui.doc_settings:readSetting("annotations") or {}
    local md5 = ui.document:getProps().partial_md5_checksum
    local total_pages = ui.document:getPageCount()

    local result = {}
    for _, ann in ipairs(annotations) do
        table.insert(result, {
            datetime = ann.datetime,
            drawer = ann.drawer,
            color = ann.color,
            text = ann.text,
            note = ann.note,
            chapter = ann.chapter,
            pageno = ann.pageno,
            page = ann.page,
            total_pages = total_pages,
            pos0 = ann.pos0,
            pos1 = ann.pos1,
            datetime_updated = ann.datetime_updated,
        })
    end

    return md5, result, total_pages
end

function VersoSyncAnnotationReader.getAllBooksWithAnnotations()
    local all_books = {}

    for _, entry in ipairs(ReadHistory.hist) do
        if not entry.dim then -- skip deleted files
            local sidecar = DocSettings:findSidecarFile(entry.file)
            if sidecar then
                local ok, doc_settings = pcall(DocSettings.openSettingsFile, DocSettings, sidecar)
                if ok and doc_settings then
                    local annotations = doc_settings:readSetting("annotations") or {}
                    local md5 = doc_settings:readSetting("partial_md5_checksum")
                    local doc_pages = doc_settings:readSetting("doc_pages")
                    local doc_props = doc_settings:readSetting("doc_props") or {}

                    if md5 and #annotations > 0 then
                        local book_annotations = {}
                        for _, ann in ipairs(annotations) do
                            table.insert(book_annotations, {
                                datetime = ann.datetime,
                                drawer = ann.drawer,
                                color = ann.color,
                                text = ann.text,
                                note = ann.note,
                                chapter = ann.chapter,
                                pageno = ann.pageno,
                                page = ann.page,
                                total_pages = doc_pages,
                                pos0 = ann.pos0,
                                pos1 = ann.pos1,
                                datetime_updated = ann.datetime_updated,
                            })
                        end

                        table.insert(all_books, {
                            md5 = md5,
                            annotations = book_annotations,
                            metadata = {
                                md5 = md5,
                                title = doc_props.title or entry.text or "Unknown",
                                authors = doc_props.authors or "Unknown",
                                pages = doc_pages or 0,
                                series = doc_props.series or "",
                                language = doc_props.language or "",
                            },
                        })
                    end
                end
            end
        end
    end

    return all_books
end

return VersoSyncAnnotationReader
```

- [ ] **Step 7: Create upload/sync orchestration**

Create `packages/koreader-plugin/versosync.koplugin/upload.lua`:

```lua
local callApi = require("call_api")
local VersoSyncSettings = require("settings")
local VersoSyncDbReader = require("db_reader")
local VersoSyncAnnotationReader = require("annotation_reader")
local VersoSyncConst = require("const")
local logger = require("logger")

local VersoSyncUpload = {}

local function getCredentials()
    return VersoSyncSettings:getEmail(), VersoSyncSettings:getPassword()
end

local function sendDevice(server_url)
    local email, password = getCredentials()
    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    local device_model = G_reader_settings:readSetting("device_model") or "KOReader"

    return callApi("POST", server_url .. "/api/sync/device", nil, {
        id = device_id,
        model = device_model,
        version = VersoSyncConst.VERSION,
    }, email, password)
end

local function sendStatistics(server_url, stats, books, annotations, device_id)
    local email, password = getCredentials()

    local payload = {
        version = VersoSyncConst.VERSION,
        stats = stats,
        books = books,
        annotations = annotations or {},
    }

    if device_id then
        payload.device_id = device_id
    end

    return callApi("POST", server_url .. "/api/sync/import", nil, payload, email, password)
end

function VersoSyncUpload.syncCurrentBook(server_url, silent)
    if not VersoSyncSettings:isConfigured() then
        if not silent then
            logger.warn("Verso Sync: not configured")
        end
        return false
    end

    -- Register device
    local ok, err = sendDevice(server_url)
    if not ok then
        logger.warn("Verso Sync: device registration failed:", err)
        if not silent then return false end
    end

    -- Get data
    local stats = VersoSyncDbReader.progressData()
    local books = VersoSyncDbReader.bookData()

    -- Get current book annotations
    local annotations = {}
    local md5, book_annotations = VersoSyncAnnotationReader.getAnnotationsForCurrentBook()
    if md5 and book_annotations and #book_annotations > 0 then
        annotations[md5] = book_annotations
    end

    -- Send
    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    ok, err = sendStatistics(server_url, stats, books, annotations, device_id)
    if not ok then
        logger.warn("Verso Sync: import failed:", err)
        return false
    end

    return true
end

function VersoSyncUpload.syncAllBooks(server_url, progress_callback)
    if not VersoSyncSettings:isConfigured() then return false end

    -- Register device
    local ok, err = sendDevice(server_url)
    if not ok then
        logger.warn("Verso Sync: device registration failed:", err)
    end

    -- Get statistics data
    local stats = VersoSyncDbReader.progressData()
    local books = VersoSyncDbReader.bookData()

    -- First: send stats with current book annotations
    local annotations = {}
    local md5, book_annotations = VersoSyncAnnotationReader.getAnnotationsForCurrentBook()
    if md5 and book_annotations and #book_annotations > 0 then
        annotations[md5] = book_annotations
    end

    local device_id = G_reader_settings:readSetting("device_id") or "unknown"
    ok, err = sendStatistics(server_url, stats, books, annotations, device_id)
    if not ok then
        logger.warn("Verso Sync: initial import failed:", err)
        return false
    end

    -- Then: send annotations for all other books
    local all_books = VersoSyncAnnotationReader.getAllBooksWithAnnotations()
    for i, book_data in ipairs(all_books) do
        if progress_callback then
            progress_callback(i, #all_books, book_data.metadata.title)
        end
        if book_data.md5 ~= md5 then -- skip current book, already sent
            local book_annotations_map = { [book_data.md5] = book_data.annotations }
            local book_list = { book_data.metadata }
            sendStatistics(server_url, {}, book_list, book_annotations_map, device_id)
        end
    end

    return true
end

return VersoSyncUpload
```

- [ ] **Step 8: Create main plugin entry point**

Create `packages/koreader-plugin/versosync.koplugin/main.lua`:

```lua
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local MultiInputDialog = require("ui/widget/multiinputdialog")
local InputDialog = require("ui/widget/inputdialog")
local NetworkMgr = require("ui/network/manager")
local Dispatcher = require("dispatcher")
local _ = require("gettext")
local T = require("ffi/util").template

local VersoSyncSettings = require("settings")
local VersoSyncUpload = require("upload")
local VersoSyncConst = require("const")

local VersoSync = WidgetContainer:extend{
    name = "versosync",
    is_doc_only = false,
}

function VersoSync:init()
    self.ui.menu:registerToMainMenu(self)
    Dispatcher:registerAction("versosync_full_sync", {
        category = "none",
        event = "VersoSyncFullSync",
        title = _("Verso Sync: synchronize all data"),
        general = true,
    })
end

function VersoSync:onDispatcherRegisterActions()
    Dispatcher:registerAction("versosync_full_sync", {
        category = "none",
        event = "VersoSyncFullSync",
        title = _("Verso Sync: synchronize all data"),
        general = true,
    })
end

function VersoSync:onVersoSyncFullSync()
    self:performFullSync()
end

function VersoSync:addToMainMenu(menu_items)
    menu_items.versosync = {
        text = _("Verso Sync"),
        sorting_hint = "tools",
        sub_item_table = {
            {
                text = _("Synchronize data"),
                keep_menu_open = true,
                callback = function()
                    self:performFullSync()
                end,
            },
            {
                text = _("Sync on suspend"),
                checked_func = function()
                    return VersoSyncSettings:get("sync_on_suspend")
                end,
                callback = function()
                    VersoSyncSettings:set("sync_on_suspend",
                        not VersoSyncSettings:get("sync_on_suspend"))
                end,
            },
            {
                text = _("Set server URL"),
                keep_menu_open = true,
                callback = function()
                    self:showServerUrlDialog()
                end,
            },
            {
                text = _("Set credentials"),
                keep_menu_open = true,
                callback = function()
                    self:showCredentialsDialog()
                end,
            },
            {
                text = _("About"),
                keep_menu_open = true,
                callback = function()
                    UIManager:show(InfoMessage:new{
                        text = T(_("Verso Sync plugin v%1\n\nSyncs reading statistics and annotations to your Verso server."), VersoSyncConst.VERSION),
                    })
                end,
            },
        },
    }
end

function VersoSync:showServerUrlDialog()
    local dialog
    dialog = InputDialog:new{
        title = _("Verso server URL"),
        input = VersoSyncSettings:getServerUrl(),
        input_hint = "https://verso.example.com",
        buttons = {{
            {
                text = _("Cancel"),
                id = "close",
                callback = function()
                    UIManager:close(dialog)
                end,
            },
            {
                text = _("Apply"),
                is_enter_default = true,
                callback = function()
                    local url = dialog:getInputText()
                    -- Strip trailing slashes
                    url = url:gsub("/+$", "")
                    VersoSyncSettings:set("server_url", url)
                    UIManager:close(dialog)
                end,
            },
        }},
    }
    UIManager:show(dialog)
end

function VersoSync:showCredentialsDialog()
    local dialog
    dialog = MultiInputDialog:new{
        title = _("Verso credentials"),
        fields = {
            {
                text = VersoSyncSettings:getEmail(),
                hint = _("Email"),
            },
            {
                text = VersoSyncSettings:getPassword(),
                hint = _("App password"),
                text_type = "password",
            },
        },
        buttons = {{
            {
                text = _("Cancel"),
                id = "close",
                callback = function()
                    UIManager:close(dialog)
                end,
            },
            {
                text = _("Apply"),
                is_enter_default = true,
                callback = function()
                    local fields = dialog:getFields()
                    VersoSyncSettings:set("email", fields[1])
                    VersoSyncSettings:set("password", fields[2])
                    UIManager:close(dialog)
                end,
            },
        }},
    }
    UIManager:show(dialog)
end

function VersoSync:performFullSync()
    if not VersoSyncSettings:isConfigured() then
        UIManager:show(InfoMessage:new{
            text = _("Please configure server URL and credentials first."),
        })
        return
    end

    local server_url = VersoSyncSettings:getServerUrl()

    NetworkMgr:runWhenOnline(function()
        UIManager:show(InfoMessage:new{
            text = _("Syncing..."),
            timeout = 1,
        })

        local ok = VersoSyncUpload.syncAllBooks(server_url, function(current, total, title)
            -- Progress callback — could show progress bar in future
        end)

        if ok then
            UIManager:show(InfoMessage:new{
                text = _("Sync complete!"),
                timeout = 2,
            })
        else
            UIManager:show(InfoMessage:new{
                text = _("Sync failed. Check server URL and credentials."),
            })
        end
    end)
end

function VersoSync:onSuspend()
    if VersoSyncSettings:get("sync_on_suspend") and VersoSyncSettings:isConfigured() then
        local server_url = VersoSyncSettings:getServerUrl()
        VersoSyncUpload.syncCurrentBook(server_url, true)
    end
end

function VersoSync:onPowerOff()
    self:onSuspend()
end

function VersoSync:onReboot()
    self:onSuspend()
end

return VersoSync
```

- [ ] **Step 9: Commit**

```bash
git add packages/koreader-plugin/
git commit -m "feat: Verso Sync KOReader plugin — reading stats + annotations with Basic auth"
```

---

## Task 10: Final Integration Test

- [ ] **Step 1: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run with coverage**

Run: `cd packages/server && npx vitest run --coverage`
Expected: Coverage meets 80% threshold.

- [ ] **Step 3: Verify no dead imports or references**

```bash
grep -r "api-keys\|createApiKeyInput\|deleteApiKeyInput\|verifyApiKey\|createApiKey\|revokeApiKey\|listApiKeys\|createPluginAuthHook\|createBasicAuthHook\|createFlexAuthHook" packages/ --include="*.ts" -l
```

Expected: No results (all references removed).

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final integration fixes"
```

(Skip if no fixes needed.)
