# Session 5: Share and Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Verso production-deployable with Docker packaging and serve user libraries as OPDS catalogs for external readers.

**Architecture:** New OPDS server service mirrors existing `opds-client.ts` pattern. App passwords table + Basic auth middleware enable OPDS reader access. Multi-stage Dockerfile packages the monorepo. Health check endpoint enables container orchestration.

**Tech Stack:** Fastify routes, fast-xml-parser (XML generation), Drizzle ORM (new api_keys table), Docker multi-stage build, Node 20 Alpine.

---

## File Structure

### New Files
- `packages/shared/src/schemas/api-keys.ts` — api_keys table schema + Zod validators
- `packages/server/src/services/api-keys.ts` — create, verify, list, revoke app passwords
- `packages/server/src/middleware/basic-auth.ts` — HTTP Basic auth middleware for OPDS
- `packages/server/src/services/opds-server.ts` — build OPDS feed objects
- `packages/server/src/routes/opds.ts` — OPDS catalog Fastify routes
- `packages/server/src/__tests__/api-keys.test.ts` — app password tests
- `packages/server/src/__tests__/opds-server.test.ts` — OPDS server tests
- `packages/server/src/__tests__/health.test.ts` — health endpoint tests
- `Dockerfile` — multi-stage build
- `docker-compose.yml` — SQLite setup
- `docker-compose.postgres.yml` — PostgreSQL override
- `.dockerignore` — excluded files

### Modified Files
- `packages/shared/src/schema.ts` — add api_keys table, export it
- `packages/server/src/app.ts` — register OPDS routes, enhance health endpoint
- `packages/server/src/middleware/auth.ts` — support both Bearer and Basic auth
- `packages/server/src/trpc/router.ts` — add apiKeys router
- `packages/server/src/trpc/routers/api-keys.ts` — tRPC CRUD for app passwords
- `docs/DEPLOYMENT.md` — reverse proxy examples, backup commands, OPDS setup

---

## Task 1: App Passwords — Schema & Migration

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Create: `packages/shared/src/schemas/api-keys.ts`

- [ ] **Step 1: Add api_keys table to schema**

In `packages/shared/src/schema.ts`, add after the `metadataCache` table:

```typescript
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name", { length: 100 }).notNull(),
  keyHash: text("key_hash", { length: 255 }).notNull(),
  keyPrefix: text("key_prefix", { length: 12 }).notNull(),
  scopes: text("scopes").notNull().default('["opds"]'),
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
```

Add to the `relations` if any exist, and ensure `apiKeys` is exported.

- [ ] **Step 2: Add Zod validators for api key input**

Create `packages/shared/src/schemas/api-keys.ts`:

```typescript
import { z } from "zod";

export const createApiKeyInput = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(["opds", "api"])).min(1),
  expiresAt: z.string().datetime().optional(),
});

export const deleteApiKeyInput = z.object({
  id: z.string().uuid(),
});
```

Export these from the shared package's index.

- [ ] **Step 3: Generate migration**

Run: `cd packages/server && pnpm drizzle-kit generate`
Expected: New migration file in `drizzle/` creating `api_keys` table.

- [ ] **Step 4: Verify migration applies**

Run: `pnpm test:server`
Expected: Existing tests still pass (in-memory SQLite runs migrations automatically).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schema.ts packages/shared/src/schemas/api-keys.ts drizzle/
git commit -m "feat: add api_keys table schema and migration"
```

---

## Task 2: App Passwords — Service & Tests

**Files:**
- Create: `packages/server/src/services/api-keys.ts`
- Create: `packages/server/src/__tests__/api-keys.test.ts`

- [ ] **Step 1: Write failing tests for api key service**

Create `packages/server/src/__tests__/api-keys.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { createApiKey, verifyApiKey, listApiKeys, revokeApiKey } from "../services/api-keys.js";

describe("api-keys service", () => {
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

  describe("createApiKey", () => {
    it("returns a key starting with vso_", async () => {
      const result = await createApiKey(ctx.db, userId, "Test Key", ["opds"]);
      expect(result.plainKey).toMatch(/^vso_/);
      expect(result.apiKey.name).toBe("Test Key");
      expect(result.apiKey.keyPrefix).toBe(result.plainKey.slice(0, 12));
    });
  });

  describe("verifyApiKey", () => {
    it("returns user info for valid key with matching scope", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "OPDS Key", ["opds"]);
      const result = await verifyApiKey(ctx.db, "test@example.com", plainKey, "opds");
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(userId);
    });

    it("returns null for wrong scope", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "OPDS Key", ["opds"]);
      const result = await verifyApiKey(ctx.db, "test@example.com", plainKey, "api");
      expect(result).toBeNull();
    });

    it("returns null for wrong email", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "Key", ["opds"]);
      const result = await verifyApiKey(ctx.db, "wrong@example.com", plainKey, "opds");
      expect(result).toBeNull();
    });

    it("returns null for expired key", async () => {
      const { plainKey } = await createApiKey(ctx.db, userId, "Key", ["opds"], "2020-01-01T00:00:00Z");
      const result = await verifyApiKey(ctx.db, "test@example.com", plainKey, "opds");
      expect(result).toBeNull();
    });
  });

  describe("listApiKeys", () => {
    it("returns all keys for user without hashes", async () => {
      await createApiKey(ctx.db, userId, "Key 1", ["opds"]);
      await createApiKey(ctx.db, userId, "Key 2", ["api"]);
      const keys = await listApiKeys(ctx.db, userId);
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toHaveProperty("keyHash");
    });
  });

  describe("revokeApiKey", () => {
    it("deletes the key", async () => {
      const { apiKey } = await createApiKey(ctx.db, userId, "Key", ["opds"]);
      await revokeApiKey(ctx.db, userId, apiKey.id);
      const keys = await listApiKeys(ctx.db, userId);
      expect(keys).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/api-keys.test.ts`
Expected: FAIL — module `../services/api-keys.js` not found.

- [ ] **Step 3: Implement api-keys service**

Create `packages/server/src/services/api-keys.ts`:

```typescript
import { createHash, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { apiKeys, users } from "@verso/shared";
import type { AppDatabase } from "../db.js";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  return "vso_" + randomBytes(24).toString("base64url");
}

export async function createApiKey(
  db: AppDatabase,
  userId: string,
  name: string,
  scopes: string[],
  expiresAt?: string,
) {
  const plainKey = generateKey();
  const keyHash = hashKey(plainKey);
  const keyPrefix = plainKey.slice(0, 12);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes: JSON.stringify(scopes),
      expiresAt: expiresAt || null,
    })
    .returning();

  return { plainKey, apiKey };
}

export async function verifyApiKey(
  db: AppDatabase,
  email: string,
  key: string,
  requiredScope: string,
): Promise<{ userId: string; email: string; role: string } | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user) return null;

  const prefix = key.slice(0, 12);
  const userKeys = await db.query.apiKeys.findMany({
    where: and(eq(apiKeys.userId, user.id), eq(apiKeys.keyPrefix, prefix)),
  });

  const keyHash = hashKey(key);
  const matched = userKeys.find((k) => k.keyHash === keyHash);
  if (!matched) return null;

  // Check expiry
  if (matched.expiresAt && new Date(matched.expiresAt) < new Date()) return null;

  // Check scope
  const scopes: string[] = JSON.parse(matched.scopes);
  if (!scopes.includes(requiredScope)) return null;

  // Update last_used_at
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, matched.id));

  return { userId: user.id, email: user.email, role: user.role };
}

export async function listApiKeys(db: AppDatabase, userId: string) {
  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.userId, userId),
  });
  return keys.map(({ keyHash, ...rest }) => rest);
}

export async function revokeApiKey(db: AppDatabase, userId: string, keyId: string) {
  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/api-keys.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/api-keys.ts packages/server/src/__tests__/api-keys.test.ts
git commit -m "feat: add app password service with create, verify, list, revoke"
```

---

## Task 3: App Passwords — tRPC Router

**Files:**
- Create: `packages/server/src/trpc/routers/api-keys.ts`
- Modify: `packages/server/src/trpc/router.ts`

- [ ] **Step 1: Create api-keys tRPC router**

Create `packages/server/src/trpc/routers/api-keys.ts`:

```typescript
import { router, protectedProcedure } from "../index.js";
import { createApiKeyInput, deleteApiKeyInput } from "@verso/shared";
import { createApiKey, listApiKeys, revokeApiKey } from "../../services/api-keys.js";

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listApiKeys(ctx.db, ctx.user.sub);
  }),

  create: protectedProcedure.input(createApiKeyInput).mutation(async ({ ctx, input }) => {
    const result = await createApiKey(
      ctx.db,
      ctx.user.sub,
      input.name,
      input.scopes,
      input.expiresAt,
    );
    return { id: result.apiKey.id, plainKey: result.plainKey, name: result.apiKey.name };
  }),

  revoke: protectedProcedure.input(deleteApiKeyInput).mutation(async ({ ctx, input }) => {
    await revokeApiKey(ctx.db, ctx.user.sub, input.id);
    return { success: true };
  }),
});
```

- [ ] **Step 2: Register in main router**

In `packages/server/src/trpc/router.ts`, add:

```typescript
import { apiKeysRouter } from "./routers/api-keys.js";
```

And add to the merged router:

```typescript
apiKeys: apiKeysRouter,
```

- [ ] **Step 3: Run all tests**

Run: `pnpm test:server`
Expected: All tests pass including existing ones.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/api-keys.ts packages/server/src/trpc/router.ts packages/shared/src/schemas/api-keys.ts
git commit -m "feat: add api-keys tRPC router for managing app passwords"
```

---

## Task 4: Basic Auth Middleware

**Files:**
- Create: `packages/server/src/middleware/basic-auth.ts`
- Modify: `packages/server/src/middleware/auth.ts`

- [ ] **Step 1: Create Basic auth middleware**

Create `packages/server/src/middleware/basic-auth.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyApiKey } from "../services/api-keys.js";
import type { AppDatabase } from "../db.js";

export function createBasicAuthHook(db: AppDatabase, requiredScope: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Basic ")) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso OPDS"')
        .send({ error: "Missing authorization header" });
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return reply.status(401).send({ error: "Invalid Basic auth format" });
    }

    const email = decoded.slice(0, colonIndex);
    const key = decoded.slice(colonIndex + 1);

    const result = await verifyApiKey(db, email, key, requiredScope);
    if (!result) {
      return reply
        .status(401)
        .header("WWW-Authenticate", 'Basic realm="Verso OPDS"')
        .send({ error: "Invalid credentials or insufficient scope" });
    }

    req.user = {
      sub: result.userId,
      email: result.email,
      role: result.role,
      type: "access",
    };
  };
}
```

- [ ] **Step 2: Create combined auth hook for stream/covers**

Update `packages/server/src/middleware/auth.ts` — add a combined hook that tries Bearer first, then Basic:

```typescript
export function createFlexAuthHook(config: Config, db: AppDatabase, basicScope: string) {
  const bearerHook = createAuthHook(config);
  const basicHook = createBasicAuthHook(db, basicScope);

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Basic ")) {
      return basicHook(req, reply);
    }
    return bearerHook(req, reply);
  };
}
```

Import `createBasicAuthHook` at the top of `auth.ts`.

- [ ] **Step 3: Update stream route to accept Basic auth**

In `packages/server/src/routes/stream.ts`, change:

```typescript
const authHook = createAuthHook(config);
```

to:

```typescript
const authHook = createFlexAuthHook(config, db, "opds");
```

Update the import to use `createFlexAuthHook` from `../middleware/auth.js`. The route signature already receives `db`.

- [ ] **Step 4: Run existing tests**

Run: `pnpm test:server`
Expected: All tests pass — Bearer auth still works for existing routes.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/middleware/basic-auth.ts packages/server/src/middleware/auth.ts packages/server/src/routes/stream.ts
git commit -m "feat: add Basic auth middleware for OPDS, flex auth on stream route"
```

---

## Task 5: OPDS Server Service — Feed Builder

**Files:**
- Create: `packages/server/src/services/opds-server.ts`
- Create: `packages/server/src/__tests__/opds-server.test.ts`

- [ ] **Step 1: Write failing tests for OPDS feed builder**

Create `packages/server/src/__tests__/opds-server.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, shelves, shelfBooks } from "@verso/shared";
import {
  buildRootFeed,
  buildAllBooks,
  buildRecentBooks,
  buildAuthorsList,
  buildAuthorBooks,
  buildGenresList,
  buildGenreBooks,
  buildShelvesList,
  buildShelfBooks,
  buildSearchResults,
  serializeFeed,
} from "../services/opds-server.js";
import { parseOpdsCatalog } from "../services/opds-client.js";
import crypto from "node:crypto";

describe("opds-server service", () => {
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

  async function insertBook(overrides: Partial<typeof books.$inferInsert> = {}) {
    const id = crypto.randomUUID();
    const defaults = {
      id,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${id}.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ctx.db.insert(books).values({ ...defaults, ...overrides });
    return { ...defaults, ...overrides };
  }

  describe("buildRootFeed", () => {
    it("returns a navigation feed with expected sections", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      expect(feed.type).toBe("navigation");
      expect(feed.title).toBe("Verso Library");
      expect(feed.entries.length).toBeGreaterThanOrEqual(5);

      // Should round-trip through the OPDS client parser
      const xml = serializeFeed(feed);
      const parsed = parseOpdsCatalog(xml);
      expect(parsed.type).toBe("navigation");
    });
  });

  describe("buildAllBooks", () => {
    it("returns empty acquisition feed when no books", async () => {
      const feed = await buildAllBooks(ctx.db, userId, 1);
      expect(feed.type).toBe("acquisition");
      expect(feed.entries).toHaveLength(0);
    });

    it("returns books owned by this user", async () => {
      await insertBook({ title: "My Book" });
      const feed = await buildAllBooks(ctx.db, userId, 1);
      expect(feed.entries).toHaveLength(1);
      expect(feed.entries[0].title).toBe("My Book");
    });

    it("does not return books from other users", async () => {
      const reg2 = await ctx.caller.auth.register({
        email: "other@example.com",
        password: "password123",
        displayName: "Other",
      });
      await insertBook({ title: "Other's Book", addedBy: reg2.user.id });
      const feed = await buildAllBooks(ctx.db, userId, 1);
      expect(feed.entries).toHaveLength(0);
    });

    it("paginates at 50 entries", async () => {
      for (let i = 0; i < 55; i++) {
        await insertBook({ title: `Book ${i}` });
      }
      const page1 = await buildAllBooks(ctx.db, userId, 1);
      expect(page1.entries).toHaveLength(50);
      expect(page1.nextUrl).toBe("/opds/all?page=2");

      const page2 = await buildAllBooks(ctx.db, userId, 2);
      expect(page2.entries).toHaveLength(5);
      expect(page2.nextUrl).toBeUndefined();
    });
  });

  describe("buildAuthorsList", () => {
    it("returns unique authors with counts", async () => {
      await insertBook({ author: "Alice" });
      await insertBook({ author: "Alice" });
      await insertBook({ author: "Bob" });
      const feed = await buildAuthorsList(ctx.db, userId);
      expect(feed.type).toBe("navigation");
      expect(feed.entries).toHaveLength(2);
      const alice = feed.entries.find((e: any) => e.title === "Alice");
      expect(alice).toBeDefined();
    });
  });

  describe("buildGenresList", () => {
    it("returns unique genres with counts", async () => {
      await insertBook({ genre: "Fiction" });
      await insertBook({ genre: "Fiction" });
      await insertBook({ genre: "Science" });
      await insertBook({ genre: null });
      const feed = await buildGenresList(ctx.db, userId);
      expect(feed.entries).toHaveLength(2);
    });
  });

  describe("buildShelvesList", () => {
    it("returns user shelves", async () => {
      const feed = await buildShelvesList(ctx.db, userId);
      expect(feed.type).toBe("navigation");
      // Default shelves are created on registration
      expect(feed.entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("serializeFeed", () => {
    it("produces valid XML that round-trips through opds-client parser", async () => {
      await insertBook({ title: "Round Trip Book", author: "RT Author", description: "A test book" });
      const feed = await buildAllBooks(ctx.db, userId, 1);
      const xml = serializeFeed(feed);

      expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
      expect(xml).toContain("Round Trip Book");

      const parsed = parseOpdsCatalog(xml);
      expect(parsed.type).toBe("acquisition");
      if (parsed.type === "acquisition") {
        expect(parsed.entries[0].title).toBe("Round Trip Book");
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/opds-server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement OPDS server service**

Create `packages/server/src/services/opds-server.ts`:

```typescript
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import { XMLBuilder } from "fast-xml-parser";
import { books, shelves, shelfBooks } from "@verso/shared";
import type { AppDatabase } from "../db.js";

const PAGE_SIZE = 50;

// --- Types ---

interface FeedLink {
  rel: string;
  href: string;
  type: string;
}

interface FeedEntry {
  id: string;
  title: string;
  updated: string;
  author?: string;
  summary?: string;
  content?: string;
  links: FeedLink[];
}

interface OpdsFeed {
  type: "navigation" | "acquisition";
  id: string;
  title: string;
  updated: string;
  selfUrl: string;
  entries: FeedEntry[];
  nextUrl?: string;
  prevUrl?: string;
}

// --- Helpers ---

const now = () => new Date().toISOString();

function bookToEntry(book: typeof books.$inferSelect): FeedEntry {
  const links: FeedLink[] = [];

  const mimeType = book.fileFormat === "pdf" ? "application/pdf" : "application/epub+zip";
  links.push({
    rel: "http://opds-spec.org/acquisition",
    href: `/api/books/${book.id}/file`,
    type: mimeType,
  });

  if (book.coverPath) {
    links.push({
      rel: "http://opds-spec.org/image",
      href: `/api/covers/${book.id}`,
      type: "image/jpeg",
    });
    links.push({
      rel: "http://opds-spec.org/image/thumbnail",
      href: `/api/covers/${book.id}?w=100`,
      type: "image/jpeg",
    });
  }

  return {
    id: `urn:verso:book:${book.id}`,
    title: book.title,
    updated: book.updatedAt || book.createdAt,
    author: book.author,
    summary: book.description || undefined,
    links,
  };
}

function navEntry(id: string, title: string, href: string, content?: string): FeedEntry {
  return {
    id,
    title,
    updated: now(),
    content,
    links: [
      {
        rel: "subsection",
        href,
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      },
    ],
  };
}

function navFeedEntry(id: string, title: string, href: string, content?: string): FeedEntry {
  return {
    id,
    title,
    updated: now(),
    content,
    links: [
      {
        rel: "subsection",
        href,
        type: "application/atom+xml;profile=opds-catalog;kind=navigation",
      },
    ],
  };
}

function paginate<T>(items: T[], page: number, baseUrl: string): { items: T[]; nextUrl?: string; prevUrl?: string } {
  const start = (page - 1) * PAGE_SIZE;
  const paged = items.slice(start, start + PAGE_SIZE);
  const nextUrl = start + PAGE_SIZE < items.length ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${page + 1}` : undefined;
  const prevUrl = page > 1 ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${page - 1}` : undefined;
  return { items: paged, nextUrl, prevUrl };
}

// --- Feed Builders ---

export async function buildRootFeed(db: AppDatabase, userId: string): Promise<OpdsFeed> {
  const [bookCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(books)
    .where(eq(books.addedBy, userId));

  const [shelfCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(shelves)
    .where(eq(shelves.userId, userId));

  return {
    type: "navigation",
    id: `urn:verso:user:${userId}:root`,
    title: "Verso Library",
    updated: now(),
    selfUrl: "/opds/catalog",
    entries: [
      navEntry(`urn:verso:user:${userId}:all`, "All Books", "/opds/all", `${bookCount.count} books`),
      navEntry(`urn:verso:user:${userId}:recent`, "Recently Added", "/opds/recent"),
      navFeedEntry(`urn:verso:user:${userId}:authors`, "Authors", "/opds/authors"),
      navFeedEntry(`urn:verso:user:${userId}:genres`, "Genres", "/opds/genres"),
      navFeedEntry(`urn:verso:user:${userId}:shelves`, "Shelves", "/opds/shelves", `${shelfCount.count} shelves`),
    ],
  };
}

export async function buildAllBooks(db: AppDatabase, userId: string, page: number): Promise<OpdsFeed> {
  const allBooks = await db.query.books.findMany({
    where: eq(books.addedBy, userId),
    orderBy: [desc(books.createdAt)],
  });
  const { items, nextUrl, prevUrl } = paginate(allBooks, page, "/opds/all");
  return {
    type: "acquisition",
    id: `urn:verso:user:${userId}:all`,
    title: "All Books",
    updated: now(),
    selfUrl: `/opds/all?page=${page}`,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

export async function buildRecentBooks(db: AppDatabase, userId: string, page: number): Promise<OpdsFeed> {
  const recentBooks = await db.query.books.findMany({
    where: eq(books.addedBy, userId),
    orderBy: [desc(books.createdAt)],
    limit: PAGE_SIZE,
  });
  return {
    type: "acquisition",
    id: `urn:verso:user:${userId}:recent`,
    title: "Recently Added",
    updated: now(),
    selfUrl: "/opds/recent",
    entries: recentBooks.map(bookToEntry),
  };
}

export async function buildAuthorsList(db: AppDatabase, userId: string): Promise<OpdsFeed> {
  const rows = await db
    .select({
      author: books.author,
      count: sql<number>`count(*)`,
    })
    .from(books)
    .where(eq(books.addedBy, userId))
    .groupBy(books.author)
    .orderBy(books.author);

  return {
    type: "navigation",
    id: `urn:verso:user:${userId}:authors`,
    title: "Authors",
    updated: now(),
    selfUrl: "/opds/authors",
    entries: rows.map((r) =>
      navEntry(
        `urn:verso:user:${userId}:author:${encodeURIComponent(r.author)}`,
        r.author,
        `/opds/authors/${encodeURIComponent(r.author)}`,
        `${r.count} books`,
      ),
    ),
  };
}

export async function buildAuthorBooks(db: AppDatabase, userId: string, author: string, page: number): Promise<OpdsFeed> {
  const authorBooks = await db.query.books.findMany({
    where: and(eq(books.addedBy, userId), eq(books.author, author)),
    orderBy: [desc(books.createdAt)],
  });
  const { items, nextUrl, prevUrl } = paginate(authorBooks, page, `/opds/authors/${encodeURIComponent(author)}`);
  return {
    type: "acquisition",
    id: `urn:verso:user:${userId}:author:${encodeURIComponent(author)}`,
    title: `Books by ${author}`,
    updated: now(),
    selfUrl: `/opds/authors/${encodeURIComponent(author)}?page=${page}`,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

export async function buildGenresList(db: AppDatabase, userId: string): Promise<OpdsFeed> {
  const rows = await db
    .select({
      genre: books.genre,
      count: sql<number>`count(*)`,
    })
    .from(books)
    .where(and(eq(books.addedBy, userId), isNotNull(books.genre)))
    .groupBy(books.genre)
    .orderBy(books.genre);

  return {
    type: "navigation",
    id: `urn:verso:user:${userId}:genres`,
    title: "Genres",
    updated: now(),
    selfUrl: "/opds/genres",
    entries: rows.map((r) =>
      navEntry(
        `urn:verso:user:${userId}:genre:${encodeURIComponent(r.genre!)}`,
        r.genre!,
        `/opds/genres/${encodeURIComponent(r.genre!)}`,
        `${r.count} books`,
      ),
    ),
  };
}

export async function buildGenreBooks(db: AppDatabase, userId: string, genre: string, page: number): Promise<OpdsFeed> {
  const genreBooks = await db.query.books.findMany({
    where: and(eq(books.addedBy, userId), eq(books.genre, genre)),
    orderBy: [desc(books.createdAt)],
  });
  const { items, nextUrl, prevUrl } = paginate(genreBooks, page, `/opds/genres/${encodeURIComponent(genre)}`);
  return {
    type: "acquisition",
    id: `urn:verso:user:${userId}:genre:${encodeURIComponent(genre)}`,
    title: genre,
    updated: now(),
    selfUrl: `/opds/genres/${encodeURIComponent(genre)}?page=${page}`,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

export async function buildShelvesList(db: AppDatabase, userId: string): Promise<OpdsFeed> {
  const userShelves = await db.query.shelves.findMany({
    where: eq(shelves.userId, userId),
    orderBy: [shelves.position],
  });

  return {
    type: "navigation",
    id: `urn:verso:user:${userId}:shelves`,
    title: "Shelves",
    updated: now(),
    selfUrl: "/opds/shelves",
    entries: userShelves.map((s) =>
      navEntry(
        `urn:verso:user:${userId}:shelf:${s.id}`,
        `${s.emoji ? s.emoji + " " : ""}${s.name}`,
        `/opds/shelves/${s.id}`,
        s.description || undefined,
      ),
    ),
  };
}

export async function buildShelfBooks(db: AppDatabase, userId: string, shelfId: string, page: number): Promise<OpdsFeed> {
  const shelf = await db.query.shelves.findFirst({
    where: and(eq(shelves.id, shelfId), eq(shelves.userId, userId)),
  });
  if (!shelf) {
    return {
      type: "acquisition",
      id: `urn:verso:shelf:${shelfId}`,
      title: "Shelf Not Found",
      updated: now(),
      selfUrl: `/opds/shelves/${shelfId}`,
      entries: [],
    };
  }

  const rows = await db
    .select({ book: books })
    .from(shelfBooks)
    .innerJoin(books, eq(shelfBooks.bookId, books.id))
    .where(eq(shelfBooks.shelfId, shelfId))
    .orderBy(shelfBooks.position);

  const { items, nextUrl, prevUrl } = paginate(
    rows.map((r) => r.book),
    page,
    `/opds/shelves/${shelfId}`,
  );

  return {
    type: "acquisition",
    id: `urn:verso:user:${userId}:shelf:${shelf.id}`,
    title: `${shelf.emoji ? shelf.emoji + " " : ""}${shelf.name}`,
    updated: now(),
    selfUrl: `/opds/shelves/${shelfId}?page=${page}`,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

export async function buildSearchResults(db: AppDatabase, userId: string, query: string, page: number): Promise<OpdsFeed> {
  const term = `%${query}%`;
  const matchingBooks = await db.query.books.findMany({
    where: and(
      eq(books.addedBy, userId),
      sql`(${books.title} LIKE ${term} OR ${books.author} LIKE ${term})`,
    ),
    orderBy: [desc(books.createdAt)],
  });
  const { items, nextUrl, prevUrl } = paginate(matchingBooks, page, `/opds/search?q=${encodeURIComponent(query)}`);
  return {
    type: "acquisition",
    id: `urn:verso:user:${userId}:search:${encodeURIComponent(query)}`,
    title: `Search: ${query}`,
    updated: now(),
    selfUrl: `/opds/search?q=${encodeURIComponent(query)}&page=${page}`,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

// --- XML Serializer ---

export function serializeFeed(feed: OpdsFeed): string {
  const kind = feed.type === "navigation" ? "kind=navigation" : "kind=acquisition";
  const feedType = `application/atom+xml;profile=opds-catalog;${kind}`;

  const links: any[] = [
    { "@_rel": "self", "@_href": feed.selfUrl, "@_type": feedType },
    { "@_rel": "start", "@_href": "/opds/catalog", "@_type": "application/atom+xml;profile=opds-catalog;kind=navigation" },
    { "@_rel": "search", "@_href": "/opds/search-descriptor", "@_type": "application/opensearchdescription+xml" },
  ];

  if (feed.nextUrl) {
    links.push({ "@_rel": "next", "@_href": feed.nextUrl, "@_type": feedType });
  }
  if (feed.prevUrl) {
    links.push({ "@_rel": "previous", "@_href": feed.prevUrl, "@_type": feedType });
  }

  const entries = feed.entries.map((e) => {
    const entry: any = {
      title: e.title,
      id: e.id,
      updated: e.updated,
      link: e.links.map((l) => ({
        "@_rel": l.rel,
        "@_href": l.href,
        "@_type": l.type,
      })),
    };
    if (e.author) entry.author = { name: e.author };
    if (e.summary) entry.summary = e.summary;
    if (e.content) entry.content = { "#text": e.content, "@_type": "text" };
    return entry;
  });

  const feedObj = {
    feed: {
      "@_xmlns": "http://www.w3.org/2005/Atom",
      "@_xmlns:opds": "http://opds-spec.org/2010/catalog",
      "@_xmlns:dc": "http://purl.org/dc/terms/",
      id: feed.id,
      title: feed.title,
      updated: feed.updated,
      link: links,
      entry: entries.length > 0 ? entries : undefined,
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressEmptyNode: true,
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(feedObj);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/opds-server.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/opds-server.ts packages/server/src/__tests__/opds-server.test.ts
git commit -m "feat: add OPDS server service with feed builders and XML serializer"
```

---

## Task 6: OPDS Catalog Routes

**Files:**
- Create: `packages/server/src/routes/opds.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create OPDS routes**

Create `packages/server/src/routes/opds.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import type { AppDatabase } from "../db.js";
import type { Config } from "../config.js";
import { createBasicAuthHook } from "../middleware/basic-auth.js";
import {
  buildRootFeed,
  buildAllBooks,
  buildRecentBooks,
  buildAuthorsList,
  buildAuthorBooks,
  buildGenresList,
  buildGenreBooks,
  buildShelvesList,
  buildShelfBooks,
  buildSearchResults,
  serializeFeed,
} from "../services/opds-server.js";

const ATOM_NAV = "application/atom+xml;profile=opds-catalog;kind=navigation";
const ATOM_ACQ = "application/atom+xml;profile=opds-catalog;kind=acquisition";

function sendFeed(reply: any, feed: ReturnType<typeof serializeFeed> extends infer R ? R : never, contentType: string) {
  // serializeFeed returns a string
}

export function registerOpdsRoutes(app: FastifyInstance, db: AppDatabase, config: Config) {
  const authHook = createBasicAuthHook(db, "opds");

  const sendAtom = (reply: any, xml: string, type: string) =>
    reply.header("Content-Type", type).send(xml);

  // Root catalog
  app.get("/opds/catalog", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildRootFeed(db, req.user!.sub);
    return sendAtom(reply, serializeFeed(feed), ATOM_NAV);
  });

  // All books
  app.get("/opds/all", { preHandler: authHook }, async (req, reply) => {
    const { page = "1" } = req.query as { page?: string };
    const feed = await buildAllBooks(db, req.user!.sub, parseInt(page, 10));
    return sendAtom(reply, serializeFeed(feed), ATOM_ACQ);
  });

  // Recently added
  app.get("/opds/recent", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildRecentBooks(db, req.user!.sub, 1);
    return sendAtom(reply, serializeFeed(feed), ATOM_ACQ);
  });

  // Authors list
  app.get("/opds/authors", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildAuthorsList(db, req.user!.sub);
    return sendAtom(reply, serializeFeed(feed), ATOM_NAV);
  });

  // Books by author
  app.get("/opds/authors/:name", { preHandler: authHook }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const { page = "1" } = req.query as { page?: string };
    const feed = await buildAuthorBooks(db, req.user!.sub, decodeURIComponent(name), parseInt(page, 10));
    return sendAtom(reply, serializeFeed(feed), ATOM_ACQ);
  });

  // Genres list
  app.get("/opds/genres", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildGenresList(db, req.user!.sub);
    return sendAtom(reply, serializeFeed(feed), ATOM_NAV);
  });

  // Books by genre
  app.get("/opds/genres/:genre", { preHandler: authHook }, async (req, reply) => {
    const { genre } = req.params as { genre: string };
    const { page = "1" } = req.query as { page?: string };
    const feed = await buildGenreBooks(db, req.user!.sub, decodeURIComponent(genre), parseInt(page, 10));
    return sendAtom(reply, serializeFeed(feed), ATOM_ACQ);
  });

  // Shelves list
  app.get("/opds/shelves", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildShelvesList(db, req.user!.sub);
    return sendAtom(reply, serializeFeed(feed), ATOM_NAV);
  });

  // Books on shelf
  app.get("/opds/shelves/:id", { preHandler: authHook }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { page = "1" } = req.query as { page?: string };
    const feed = await buildShelfBooks(db, req.user!.sub, id, parseInt(page, 10));
    return sendAtom(reply, serializeFeed(feed), ATOM_ACQ);
  });

  // Search
  app.get("/opds/search", { preHandler: authHook }, async (req, reply) => {
    const { q = "", page = "1" } = req.query as { q?: string; page?: string };
    if (!q.trim()) {
      const feed = await buildAllBooks(db, req.user!.sub, parseInt(page, 10));
      return sendAtom(reply, serializeFeed(feed), ATOM_ACQ);
    }
    const feed = await buildSearchResults(db, req.user!.sub, q, parseInt(page, 10));
    return sendAtom(reply, serializeFeed(feed), ATOM_ACQ);
  });

  // OpenSearch descriptor
  app.get("/opds/search-descriptor", async (_req, reply) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Verso</ShortName>
  <Description>Search your Verso library</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
       template="/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`;
    return reply.header("Content-Type", "application/opensearchdescription+xml").send(xml);
  });
}
```

- [ ] **Step 2: Register routes in app.ts**

In `packages/server/src/app.ts`, add:

```typescript
import { registerOpdsRoutes } from "./routes/opds.js";
```

And add after the other route registrations:

```typescript
registerOpdsRoutes(app, db, config);
```

- [ ] **Step 3: Run all tests**

Run: `pnpm test:server`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/opds.ts packages/server/src/app.ts
git commit -m "feat: add OPDS catalog routes with Basic auth"
```

---

## Task 7: Health Check Endpoint

**Files:**
- Modify: `packages/server/src/app.ts`
- Create: `packages/server/src/__tests__/health.test.ts`

- [ ] **Step 1: Write failing test for health endpoint**

Create `packages/server/src/__tests__/health.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";

describe("GET /health", () => {
  it("returns status ok with database connected", async () => {
    const app = await buildApp({
      PORT: 0,
      HOST: "127.0.0.1",
      JWT_SECRET: "a".repeat(32),
      JWT_ACCESS_EXPIRES: "15m",
      JWT_REFRESH_EXPIRES: "7d",
      DB_DRIVER: "sqlite" as const,
      DATABASE_URL: "file::memory:",
      STORAGE_DRIVER: "local" as const,
      STORAGE_PATH: "./test-data",
      AUTH_MODE: "local" as const,
      MAX_UPLOAD_SIZE: 104857600,
      CORS_ORIGIN: "*",
      NODE_ENV: "test" as const,
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("version");

    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/health.test.ts`
Expected: FAIL — current `/health` returns `{ status: "ok" }` only, missing `database`, `uptime`, `version`.

- [ ] **Step 3: Enhance health endpoint in app.ts**

Replace the existing health endpoint in `packages/server/src/app.ts`:

```typescript
app.get("/health", async (_req, reply) => {
  try {
    // Verify database connectivity
    db.run(sql`SELECT 1`);
    return reply.send({
      status: "ok",
      version: "1.0.0",
      uptime: Math.floor(process.uptime()),
      database: "connected",
    });
  } catch {
    return reply.status(503).send({
      status: "error",
      version: "1.0.0",
      uptime: Math.floor(process.uptime()),
      database: "disconnected",
    });
  }
});
```

Add `import { sql } from "drizzle-orm";` if not already imported in app.ts.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `pnpm test:server`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/__tests__/health.test.ts
git commit -m "feat: enhance health endpoint with DB check, version, uptime"
```

---

## Task 8: Docker Packaging

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-compose.postgres.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

Create `.dockerignore` at repo root:

```
node_modules
.git
data/
.env
docs/
*.md
.vscode
.DS_Store
```

- [ ] **Step 2: Create Dockerfile**

Create `Dockerfile` at repo root:

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .
RUN pnpm run build

# Stage 3: Runtime
FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy built output and production deps
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/server/drizzle ./packages/server/drizzle
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/packages/web/package.json ./packages/web/
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./

# Install production-only dependencies
RUN pnpm install --frozen-lockfile --prod

# Create non-root user and data directory
RUN addgroup -g 1000 verso && adduser -u 1000 -G verso -s /bin/sh -D verso
RUN mkdir -p /data/files && chown -R verso:verso /data

ENV NODE_ENV=production
ENV STORAGE_PATH=/data/files
ENV DATABASE_URL=file:/data/db.sqlite

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER verso
CMD ["node", "packages/server/dist/index.js"]
```

- [ ] **Step 3: Create docker-compose.yml (SQLite)**

Create `docker-compose.yml` at repo root:

```yaml
services:
  verso:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - verso-data:/data
    environment:
      - JWT_SECRET=${JWT_SECRET:?Set JWT_SECRET in .env (min 32 chars)}
      - DATABASE_URL=file:/data/db.sqlite
      - STORAGE_PATH=/data/files
      - CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:3000}
    restart: unless-stopped

volumes:
  verso-data:
```

- [ ] **Step 4: Create docker-compose.postgres.yml**

Create `docker-compose.postgres.yml` at repo root:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=verso
      - POSTGRES_USER=verso
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U verso"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  verso:
    environment:
      - DB_DRIVER=postgres
      - DATABASE_URL=postgresql://verso:${POSTGRES_PASSWORD}@postgres:5432/verso
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

- [ ] **Step 5: Verify Docker build**

Run: `docker build -t verso:test .`
Expected: Build completes successfully. (This is a manual verification step — skip if Docker is not available locally.)

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml docker-compose.postgres.yml .dockerignore
git commit -m "feat: add Docker packaging with SQLite and PostgreSQL compose files"
```

---

## Task 9: Deployment Documentation

**Files:**
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Update DEPLOYMENT.md**

Rewrite `docs/DEPLOYMENT.md` with comprehensive deployment guide. Read the current file first, then update it to include all the sections from the spec:

- Quick start with Docker
- PostgreSQL setup with override compose
- Environment variable reference (complete table)
- Reverse proxy snippets (Nginx, Caddy, Traefik)
- Backup & restore commands (SQLite, PostgreSQL, file volumes)
- OPDS setup guide (creating app password, configuring KOReader/Moon+ Reader)
- Security notes

Here's the content to write:

```markdown
# Deployment Guide

## Quick Start (Docker)

1. Clone the repository and create a `.env` file:

```bash
git clone https://github.com/your-org/verso.git
cd verso
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
```

2. Start with Docker Compose:

```bash
docker compose up -d
```

3. Open `http://localhost:3000` — the first user to register becomes admin.

## PostgreSQL Setup

By default Verso uses SQLite (zero-config). For PostgreSQL, use the override compose file:

```bash
# Add to your .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env

# Start with both compose files
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | **required** | Signing key for JWT tokens (min 32 chars) |
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DB_DRIVER` | `sqlite` | Database driver: `sqlite` or `postgres` |
| `DATABASE_URL` | `file:./data/db.sqlite` | Database connection string |
| `STORAGE_DRIVER` | `local` | File storage: `local` or `s3` |
| `STORAGE_PATH` | `./data` | Local file storage path |
| `AUTH_MODE` | `both` | Auth mode: `local`, `oidc`, or `both` |
| `MAX_UPLOAD_SIZE` | `104857600` | Max upload size in bytes (100 MB) |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `OIDC_ISSUER` | — | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | — | OIDC client ID |
| `OIDC_CLIENT_SECRET` | — | OIDC client secret |
| `OIDC_REDIRECT_URI` | — | OIDC redirect URI |
| `OIDC_AUTO_REGISTER` | `false` | Auto-create users on OIDC login |
| `OIDC_DEFAULT_ROLE` | `user` | Default role for OIDC-created users |

## Reverse Proxy

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name books.example.com;

    ssl_certificate     /etc/ssl/certs/books.example.com.pem;
    ssl_certificate_key /etc/ssl/private/books.example.com.key;

    client_max_body_size 100m;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

```
books.example.com {
    reverse_proxy localhost:3000
}
```

Caddy handles TLS certificates automatically via Let's Encrypt.

### Traefik (Docker labels)

Add these labels to the `verso` service in `docker-compose.yml`:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.verso.rule=Host(`books.example.com`)"
  - "traefik.http.routers.verso.tls.certresolver=letsencrypt"
  - "traefik.http.services.verso.loadbalancer.server.port=3000"
```

## Backup & Restore

### SQLite

```bash
# Backup database
docker compose exec verso sqlite3 /data/db.sqlite ".backup /data/backup.db"
docker compose cp verso:/data/backup.db ./verso-backup.db

# Backup files
docker compose cp verso:/data/files ./files-backup

# Restore
docker compose cp ./verso-backup.db verso:/data/db.sqlite
docker compose cp ./files-backup verso:/data/files
docker compose restart verso
```

### PostgreSQL

```bash
# Backup
docker compose exec postgres pg_dump -U verso verso > verso-backup.sql

# Backup files
docker compose cp verso:/data/files ./files-backup

# Restore
docker compose exec -T postgres psql -U verso verso < verso-backup.sql
docker compose cp ./files-backup verso:/data/files
docker compose restart verso
```

## OPDS Setup

Verso serves your library as an OPDS catalog for e-reader apps like KOReader, Moon+ Reader, and Librera.

### 1. Create an App Password

1. Go to **Settings → API Keys → Create**
2. Enter a name (e.g., "KOReader on tablet")
3. Select the `opds` scope
4. Copy the generated key (shown once) — it starts with `vso_`

### 2. Configure Your Reader

**Feed URL:** `https://your-domain.com/opds/catalog`

**KOReader:**
1. Open KOReader → OPDS catalog
2. Add new catalog: enter your feed URL
3. When prompted, enter your **email** as username and the **app password** as password

**Moon+ Reader:**
1. Open Moon+ Reader → Net Library → OPDS
2. Add catalog: enter your feed URL
3. Enter credentials when prompted

**Librera:**
1. Open Librera → OPDS Catalogs
2. Add new: enter feed URL + credentials

### Available Feeds

| Feed | URL | Description |
|------|-----|-------------|
| Root catalog | `/opds/catalog` | Navigation hub |
| All books | `/opds/all` | Browse all your books |
| Recent | `/opds/recent` | Recently added |
| Authors | `/opds/authors` | Browse by author |
| Genres | `/opds/genres` | Browse by genre |
| Shelves | `/opds/shelves` | Browse by shelf |
| Search | `/opds/search?q=term` | Search your library |

## Security Notes

- **Always use HTTPS** in production — set up a reverse proxy with TLS
- **Set `CORS_ORIGIN`** to your actual domain (not `*`)
- **Rotate `JWT_SECRET`** periodically (invalidates all sessions)
- **App passwords**: create separate passwords per device, revoke when no longer needed
- **Rate limiting** is enabled by default (100 requests/minute)
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEPLOYMENT.md
git commit -m "docs: comprehensive deployment guide with Docker, proxies, OPDS setup"
```

---

## Task 10: Final Integration & Verification

**Files:** None new — this is a verification task.

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:server`
Expected: All tests pass, no regressions.

- [ ] **Step 2: Run lint**

Run: `pnpm lint` (if available)
Expected: No lint errors.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: All packages build successfully.

- [ ] **Step 4: Manual smoke test**

Start the dev server and verify:
1. Register/login works
2. Upload a book
3. Create an app password via tRPC (use the API or add a quick UI test)
4. Test OPDS catalog in browser: `curl -u email:vso_key http://localhost:3000/opds/catalog`
5. Health check: `curl http://localhost:3000/health`

- [ ] **Step 5: Commit any fixes from integration**

```bash
git add -A
git commit -m "fix: integration fixes from smoke testing"
```

(Skip this step if no fixes needed.)

- [ ] **Step 6: Update ROADMAP.md**

Mark Session 5 as complete in `docs/ROADMAP.md`:
- Add ✅ to Session 5 heading
- Add checkmarks to completed items

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark Session 5 complete in roadmap"
```
