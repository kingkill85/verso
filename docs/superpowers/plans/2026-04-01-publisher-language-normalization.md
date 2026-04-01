# Publisher & Language Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize publishers into a dedicated table with deduplication and normalize language codes to ISO 639-1 at every entry point.

**Architecture:** New `publishers` table with `publisherId` FK on `books` (one-to-one). A `syncBookPublisher` service handles case-insensitive upsert at all entry points (upload, book edit, metadata apply). Languages normalized via a shared `normalizeLanguage()` utility mapping ISO 639-2, full names, and BCP-47 tags to ISO 639-1 two-letter codes. UI gets a publisher combobox and language dropdown. Migration normalizes existing data.

**Tech Stack:** Drizzle ORM (SQLite), tRPC v11, Zod, React 19, TanStack Router, i18next, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/shared/src/language.ts` | **NEW** — `normalizeLanguage()` function, ISO 639 mapping, display name map |
| `packages/shared/src/publisher-validators.ts` | **NEW** — Zod validators for publisher router inputs |
| `packages/shared/src/schema.ts` | **MODIFY** — Add `publishers` table, add `publisherId` FK to `books` |
| `packages/shared/src/shelf-validators.ts` | **MODIFY** — Add `publisher` to `smartFilterField` enum |
| `packages/shared/src/index.ts` | **MODIFY** — Export new modules |
| `packages/server/src/services/sync-book-publisher.ts` | **NEW** — `syncBookPublisher()` service |
| `packages/server/src/trpc/routers/publishers.ts` | **NEW** — `list` and `update` procedures |
| `packages/server/src/trpc/router.ts` | **MODIFY** — Register `publishersRouter` |
| `packages/server/src/trpc/routers/books.ts` | **MODIFY** — Call `syncBookPublisher` + `normalizeLanguage` in `update` |
| `packages/server/src/trpc/routers/metadata.ts` | **MODIFY** — Call `syncBookPublisher` + `normalizeLanguage` in `applyFields` |
| `packages/server/src/routes/upload.ts` | **MODIFY** — Call `syncBookPublisher` + `normalizeLanguage` after extraction |
| `packages/server/src/trpc/routers/build-filter.ts` | **MODIFY** — Add `publisher` to `columnMap` |
| `packages/server/src/__tests__/language.test.ts` | **NEW** — Tests for `normalizeLanguage` |
| `packages/server/src/__tests__/sync-book-publisher.test.ts` | **NEW** — Tests for `syncBookPublisher` |
| `packages/server/src/__tests__/publishers.test.ts` | **NEW** — Tests for publisher router |
| `packages/web/src/routes/_app/books/$id_.edit.tsx` | **MODIFY** — Publisher combobox, language dropdown |
| `packages/web/src/routes/_app/books/$id.tsx` | **MODIFY** — Display human-readable language name |
| `packages/web/src/components/shelves/filter-builder.tsx` | **MODIFY** — Add publisher to filter fields |
| `packages/web/src/locales/*.json` | **MODIFY** — i18n keys for new UI elements |
| `packages/server/drizzle/` | **NEW** — Migration SQL for schema + data normalization |

---

### Task 1: Language Normalization Utility

**Files:**
- Create: `packages/shared/src/language.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/server/src/__tests__/language.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/language.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeLanguage, LANGUAGE_DISPLAY_NAMES } from "@verso/shared";

describe("normalizeLanguage", () => {
  it("passes through ISO 639-1 codes unchanged", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("de")).toBe("de");
    expect(normalizeLanguage("fr")).toBe("fr");
  });

  it("normalizes ISO 639-2/B codes", () => {
    expect(normalizeLanguage("eng")).toBe("en");
    expect(normalizeLanguage("ger")).toBe("de");
    expect(normalizeLanguage("fre")).toBe("fr");
    expect(normalizeLanguage("spa")).toBe("es");
    expect(normalizeLanguage("dut")).toBe("nl");
    expect(normalizeLanguage("chi")).toBe("zh");
    expect(normalizeLanguage("cze")).toBe("cs");
    expect(normalizeLanguage("rum")).toBe("ro");
    expect(normalizeLanguage("gre")).toBe("el");
    expect(normalizeLanguage("may")).toBe("ms");
    expect(normalizeLanguage("slo")).toBe("sk");
  });

  it("normalizes ISO 639-2/T codes", () => {
    expect(normalizeLanguage("deu")).toBe("de");
    expect(normalizeLanguage("fra")).toBe("fr");
    expect(normalizeLanguage("ces")).toBe("cs");
    expect(normalizeLanguage("ron")).toBe("ro");
    expect(normalizeLanguage("ell")).toBe("el");
    expect(normalizeLanguage("msa")).toBe("ms");
    expect(normalizeLanguage("slk")).toBe("sk");
  });

  it("normalizes full language names (case-insensitive)", () => {
    expect(normalizeLanguage("English")).toBe("en");
    expect(normalizeLanguage("german")).toBe("de");
    expect(normalizeLanguage("FRENCH")).toBe("fr");
    expect(normalizeLanguage("Spanish")).toBe("es");
    expect(normalizeLanguage("Japanese")).toBe("ja");
  });

  it("strips BCP-47 region tags", () => {
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("pt-BR")).toBe("pt");
    expect(normalizeLanguage("zh-TW")).toBe("zh");
    expect(normalizeLanguage("en-GB")).toBe("en");
  });

  it("handles case-insensitive three-letter codes", () => {
    expect(normalizeLanguage("ENG")).toBe("en");
    expect(normalizeLanguage("Ger")).toBe("de");
    expect(normalizeLanguage("DEU")).toBe("de");
  });

  it("returns unknown input as-is", () => {
    expect(normalizeLanguage("xyz")).toBe("xyz");
    expect(normalizeLanguage("")).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeLanguage("  en  ")).toBe("en");
    expect(normalizeLanguage(" eng ")).toBe("en");
  });
});

describe("LANGUAGE_DISPLAY_NAMES", () => {
  it("contains common languages", () => {
    expect(LANGUAGE_DISPLAY_NAMES["en"]).toBe("English");
    expect(LANGUAGE_DISPLAY_NAMES["de"]).toBe("German");
    expect(LANGUAGE_DISPLAY_NAMES["fr"]).toBe("French");
    expect(LANGUAGE_DISPLAY_NAMES["ja"]).toBe("Japanese");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && pnpm vitest run src/__tests__/language.test.ts`
Expected: FAIL — `normalizeLanguage` not found in `@verso/shared`

- [ ] **Step 3: Implement `normalizeLanguage`**

Create `packages/shared/src/language.ts`:

```typescript
/**
 * ISO 639-1 display names for human-readable language rendering.
 */
export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  pl: "Polish",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  cs: "Czech",
  tr: "Turkish",
  hu: "Hungarian",
  ro: "Romanian",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  uk: "Ukrainian",
  ca: "Catalan",
  hr: "Croatian",
  sr: "Serbian",
  sk: "Slovak",
  sl: "Slovenian",
  bg: "Bulgarian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  ga: "Irish",
  is: "Icelandic",
  mt: "Maltese",
  sq: "Albanian",
  mk: "Macedonian",
  bs: "Bosnian",
  cy: "Welsh",
  gl: "Galician",
  eu: "Basque",
  af: "Afrikaans",
  sw: "Swahili",
  la: "Latin",
  eo: "Esperanto",
};

/**
 * Maps ISO 639-2 (both /B and /T variants) and full language names
 * to ISO 639-1 two-letter codes.
 */
const CODE_MAP: Record<string, string> = {
  // ISO 639-2/B and /T codes
  eng: "en", deu: "de", ger: "de", fra: "fr", fre: "fr",
  spa: "es", ita: "it", por: "pt", nld: "nl", dut: "nl",
  jpn: "ja", kor: "ko", zho: "zh", chi: "zh",
  rus: "ru", ara: "ar", hin: "hi", pol: "pl",
  swe: "sv", nor: "no", dan: "da", fin: "fi",
  ces: "cs", cze: "cs", tur: "tr", hun: "hu",
  ron: "ro", rum: "ro", ell: "el", gre: "el",
  heb: "he", tha: "th", vie: "vi", ind: "id",
  msa: "ms", may: "ms", ukr: "uk", cat: "ca",
  hrv: "hr", srp: "sr", slk: "sk", slo: "sk",
  slv: "sl", bul: "bg", lit: "lt", lav: "lv",
  est: "et", gle: "ga", isl: "is", mlt: "mt",
  sqi: "sq", alb: "sq", mkd: "mk", mac: "mk",
  bos: "bs", cym: "cy", wel: "cy", glg: "gl",
  eus: "eu", baq: "eu", afr: "af", swa: "sw",
  lat: "la", epo: "eo",
};

// Build a reverse map from full language names to codes
const NAME_MAP: Record<string, string> = {};
for (const [code, name] of Object.entries(LANGUAGE_DISPLAY_NAMES)) {
  NAME_MAP[name.toLowerCase()] = code;
}

/**
 * Normalize a language string to an ISO 639-1 two-letter code.
 *
 * Handles: ISO 639-2/B, ISO 639-2/T, full language names (case-insensitive),
 * and BCP-47 tags (strips region). Unknown inputs are returned as-is.
 */
export function normalizeLanguage(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();

  // Check if already ISO 639-1 (2 letters)
  if (lower.length === 2 && LANGUAGE_DISPLAY_NAMES[lower]) {
    return lower;
  }

  // Check ISO 639-2 three-letter codes
  if (CODE_MAP[lower]) {
    return CODE_MAP[lower];
  }

  // Check full language names
  if (NAME_MAP[lower]) {
    return NAME_MAP[lower];
  }

  // Handle BCP-47 tags like "en-US", "pt-BR"
  const bcp47Match = lower.match(/^([a-z]{2})-[a-z]{2,}$/i);
  if (bcp47Match && LANGUAGE_DISPLAY_NAMES[bcp47Match[1]]) {
    return bcp47Match[1];
  }

  // Unknown — return as-is
  return trimmed;
}
```

- [ ] **Step 4: Export from shared package**

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./language.js";
```

- [ ] **Step 5: Build shared package and run tests**

Run: `cd packages/shared && pnpm build && cd ../server && pnpm vitest run src/__tests__/language.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/language.ts packages/shared/src/index.ts packages/server/src/__tests__/language.test.ts
git commit -m "feat: add normalizeLanguage utility for ISO 639-1 normalization"
```

---

### Task 2: Publishers Schema & Shared Validators

**Files:**
- Modify: `packages/shared/src/schema.ts` — lines 23-55 (books table) and after line 95
- Create: `packages/shared/src/publisher-validators.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/shelf-validators.ts` — line 4-7

- [ ] **Step 1: Add publishers table and publisherId FK to schema**

In `packages/shared/src/schema.ts`, add after the `bookAuthors` table (after line 95):

```typescript
export const publishers = sqliteTable("publishers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name", { length: 255 }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

Add `publisherId` FK to the `books` table by adding after the `md5Hash` field (line 40):

```typescript
  publisherId: text("publisher_id").references(() => publishers.id, { onDelete: "set null" }),
```

Note: The `publishers` table definition must come before `books` in the file, or you'll get a circular reference. Move it to right before the `books` table definition, after the `users` table.

- [ ] **Step 2: Create publisher validators**

Create `packages/shared/src/publisher-validators.ts`:

```typescript
import { z } from "zod";

export const publisherListInput = z.object({
  search: z.string().optional(),
});

export const publisherUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
});
```

- [ ] **Step 3: Add publisher to smart filter field enum**

In `packages/shared/src/shelf-validators.ts`, update the `smartFilterField` enum (line 4-7):

```typescript
export const smartFilterField = z.enum([
  "title", "author", "genre", "year",
  "language", "fileFormat", "pageCount", "publisher",
]);
```

- [ ] **Step 4: Export new modules**

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./publisher-validators.js";
```

- [ ] **Step 5: Build shared package**

Run: `cd packages/shared && pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema.ts packages/shared/src/publisher-validators.ts packages/shared/src/shelf-validators.ts packages/shared/src/index.ts
git commit -m "feat: add publishers table, publisherId FK, and publisher validators"
```

---

### Task 3: syncBookPublisher Service

**Files:**
- Create: `packages/server/src/services/sync-book-publisher.ts`
- Create: `packages/server/src/__tests__/sync-book-publisher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/sync-book-publisher.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, publishers } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookPublisher } from "../services/sync-book-publisher.js";

describe("syncBookPublisher", () => {
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

  it("creates a publisher and links to book", async () => {
    const book = await insertBook({ publisher: "Penguin Books" });
    const result = await syncBookPublisher(ctx.db, book.id, "Penguin Books");

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Penguin Books");

    const allPublishers = await ctx.db.select().from(publishers);
    expect(allPublishers).toHaveLength(1);

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.publisherId).toBe(result!.id);
    expect(updatedBook.publisher).toBe("Penguin Books");
  });

  it("reuses existing publisher (case-insensitive)", async () => {
    const book1 = await insertBook({ title: "Book 1", publisher: "Penguin Books" });
    const book2 = await insertBook({ title: "Book 2", publisher: "penguin books" });

    await syncBookPublisher(ctx.db, book1.id, "Penguin Books");
    await syncBookPublisher(ctx.db, book2.id, "penguin books");

    const allPublishers = await ctx.db.select().from(publishers);
    expect(allPublishers).toHaveLength(1);

    const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
    const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
    expect(b1.publisherId).toBe(b2.publisherId);
    // Display name should use canonical (first-created) name
    expect(b2.publisher).toBe("Penguin Books");
  });

  it("clears publisherId when given null", async () => {
    const book = await insertBook({ publisher: "Penguin Books" });
    await syncBookPublisher(ctx.db, book.id, "Penguin Books");
    await syncBookPublisher(ctx.db, book.id, null);

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.publisherId).toBeNull();
    expect(updatedBook.publisher).toBeNull();
  });

  it("clears publisherId when given empty string", async () => {
    const book = await insertBook({ publisher: "Penguin Books" });
    await syncBookPublisher(ctx.db, book.id, "Penguin Books");
    await syncBookPublisher(ctx.db, book.id, "");

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.publisherId).toBeNull();
    expect(updatedBook.publisher).toBeNull();
  });

  it("trims whitespace from publisher names", async () => {
    const book = await insertBook({ publisher: "  Penguin Books  " });
    const result = await syncBookPublisher(ctx.db, book.id, "  Penguin Books  ");

    expect(result!.name).toBe("Penguin Books");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && pnpm vitest run src/__tests__/sync-book-publisher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement syncBookPublisher**

Create `packages/server/src/services/sync-book-publisher.ts`:

```typescript
import { eq, sql } from "drizzle-orm";
import { books, publishers } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Resolve a publisher string to a publishers record, creating if needed.
 * Updates books.publisherId and books.publisher (canonical name).
 */
export async function syncBookPublisher(
  db: BetterSQLite3Database<any>,
  bookId: string,
  publisherString: string | null,
): Promise<{ id: string; name: string } | null> {
  const trimmed = publisherString?.trim() || null;

  if (!trimmed) {
    await db
      .update(books)
      .set({ publisherId: null, publisher: null })
      .where(eq(books.id, bookId));
    return null;
  }

  // Case-insensitive lookup
  const existing = await db
    .select()
    .from(publishers)
    .where(sql`${publishers.name} COLLATE NOCASE = ${trimmed}`)
    .get();

  let publisherId: string;
  let canonicalName: string;

  if (existing) {
    publisherId = existing.id;
    canonicalName = existing.name;
  } else {
    const [created] = await db
      .insert(publishers)
      .values({
        name: trimmed,
        createdAt: new Date().toISOString(),
      })
      .returning();
    publisherId = created.id;
    canonicalName = created.name;
  }

  await db
    .update(books)
    .set({ publisherId, publisher: canonicalName })
    .where(eq(books.id, bookId));

  return { id: publisherId, name: canonicalName };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && pnpm build && cd ../server && pnpm vitest run src/__tests__/sync-book-publisher.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/sync-book-publisher.ts packages/server/src/__tests__/sync-book-publisher.test.ts
git commit -m "feat: add syncBookPublisher service for publisher deduplication"
```

---

### Task 4: Publishers tRPC Router

**Files:**
- Create: `packages/server/src/trpc/routers/publishers.ts`
- Modify: `packages/server/src/trpc/router.ts`
- Create: `packages/server/src/__tests__/publishers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/publishers.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, publishers } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookPublisher } from "../services/sync-book-publisher.js";

describe("publishers router", () => {
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

  describe("list", () => {
    it("returns publishers with book counts", async () => {
      const book1 = await insertBook({ title: "Book 1", publisher: "Penguin" });
      const book2 = await insertBook({ title: "Book 2", publisher: "Penguin" });
      const book3 = await insertBook({ title: "Book 3", publisher: "HarperCollins" });
      await syncBookPublisher(ctx.db, book1.id, "Penguin");
      await syncBookPublisher(ctx.db, book2.id, "Penguin");
      await syncBookPublisher(ctx.db, book3.id, "HarperCollins");

      const result = await ctx.caller.publishers.list({});
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Penguin");
      expect(result[0].bookCount).toBe(2);
      expect(result[1].name).toBe("HarperCollins");
      expect(result[1].bookCount).toBe(1);
    });

    it("filters by search string", async () => {
      const book1 = await insertBook({ title: "Book 1", publisher: "Penguin" });
      const book2 = await insertBook({ title: "Book 2", publisher: "HarperCollins" });
      await syncBookPublisher(ctx.db, book1.id, "Penguin");
      await syncBookPublisher(ctx.db, book2.id, "HarperCollins");

      const result = await ctx.caller.publishers.list({ search: "pen" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Penguin");
    });
  });

  describe("update", () => {
    it("renames a publisher", async () => {
      const book = await insertBook({ publisher: "Penguin" });
      await syncBookPublisher(ctx.db, book.id, "Penguin");

      const pubList = await ctx.caller.publishers.list({});
      const pub = pubList[0];

      const updated = await ctx.caller.publishers.update({ id: pub.id, name: "Penguin Random House" });
      expect(updated.name).toBe("Penguin Random House");

      // Book's denormalized publisher field should also update
      const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
      expect(updatedBook.publisher).toBe("Penguin Random House");
    });

    it("auto-merges when renamed to match existing publisher", async () => {
      const book1 = await insertBook({ title: "Book 1", publisher: "Penguin" });
      const book2 = await insertBook({ title: "Book 2", publisher: "Penguin Books" });
      await syncBookPublisher(ctx.db, book1.id, "Penguin");
      await syncBookPublisher(ctx.db, book2.id, "Penguin Books");

      const pubList = await ctx.caller.publishers.list({});
      const penguinPub = pubList.find((p) => p.name === "Penguin")!;
      const penguinBooksPub = pubList.find((p) => p.name === "Penguin Books")!;

      // Rename "Penguin" to "Penguin Books" — should merge into existing
      await ctx.caller.publishers.update({ id: penguinPub.id, name: "Penguin Books" });

      const afterList = await ctx.caller.publishers.list({});
      expect(afterList).toHaveLength(1);
      expect(afterList[0].name).toBe("Penguin Books");
      expect(afterList[0].bookCount).toBe(2);

      // Both books should point to the surviving publisher
      const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
      const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
      expect(b1.publisherId).toBe(penguinBooksPub.id);
      expect(b2.publisherId).toBe(penguinBooksPub.id);
      expect(b1.publisher).toBe("Penguin Books");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && pnpm vitest run src/__tests__/publishers.test.ts`
Expected: FAIL — `publishers` not found on caller

- [ ] **Step 3: Implement publisher router**

Create `packages/server/src/trpc/routers/publishers.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { eq, sql, like } from "drizzle-orm";
import { books, publishers, publisherListInput, publisherUpdateInput } from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";

export const publishersRouter = router({
  list: protectedProcedure.input(publisherListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: publishers.id,
        name: publishers.name,
        bookCount: sql<number>`count(${books.id})`,
      })
      .from(publishers)
      .leftJoin(books, eq(books.publisherId, publishers.id))
      .where(
        input.search
          ? like(publishers.name, `%${input.search}%`)
          : undefined
      )
      .groupBy(publishers.id)
      .orderBy(sql`count(${books.id}) DESC`, publishers.name);

    return rows;
  }),

  update: adminProcedure.input(publisherUpdateInput).mutation(async ({ ctx, input }) => {
    const publisher = await ctx.db
      .select()
      .from(publishers)
      .where(eq(publishers.id, input.id))
      .get();

    if (!publisher) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Publisher not found" });
    }

    // Check if a publisher with the new name already exists (case-insensitive)
    const existing = await ctx.db
      .select()
      .from(publishers)
      .where(sql`${publishers.name} COLLATE NOCASE = ${input.name} AND ${publishers.id} != ${input.id}`)
      .get();

    if (existing) {
      // Merge: reassign all books from this publisher to the existing one
      await ctx.db
        .update(books)
        .set({ publisherId: existing.id, publisher: existing.name })
        .where(eq(books.publisherId, input.id));

      // Delete the old publisher
      await ctx.db.delete(publishers).where(eq(publishers.id, input.id));

      return existing;
    }

    // Simple rename
    await ctx.db
      .update(publishers)
      .set({ name: input.name })
      .where(eq(publishers.id, input.id));

    // Update denormalized publisher field on all books
    await ctx.db
      .update(books)
      .set({ publisher: input.name })
      .where(eq(books.publisherId, input.id));

    return ctx.db.select().from(publishers).where(eq(publishers.id, input.id)).get()!;
  }),
});
```

- [ ] **Step 4: Register router**

In `packages/server/src/trpc/router.ts`, add the import and register:

```typescript
import { publishersRouter } from "./routers/publishers.js";
```

Add to the `appRouter`:

```typescript
  publishers: publishersRouter,
```

- [ ] **Step 5: Build shared and run tests**

Run: `cd packages/shared && pnpm build && cd ../server && pnpm vitest run src/__tests__/publishers.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/trpc/routers/publishers.ts packages/server/src/trpc/router.ts packages/server/src/__tests__/publishers.test.ts
git commit -m "feat: add publishers tRPC router with list, update, and auto-merge"
```

---

### Task 5: Integrate at Entry Points

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts` — lines 104-139 (update mutation)
- Modify: `packages/server/src/trpc/routers/metadata.ts` — lines 131-177 (applyFields mutation)
- Modify: `packages/server/src/routes/upload.ts` — lines 143-174 (after book insert)

- [ ] **Step 1: Add imports to books router**

In `packages/server/src/trpc/routers/books.ts`, add imports at the top:

```typescript
import { syncBookPublisher } from "../../services/sync-book-publisher.js";
import { normalizeLanguage } from "@verso/shared";
```

- [ ] **Step 2: Update books.update mutation**

In `packages/server/src/trpc/routers/books.ts`, in the `update` mutation, after line 111 (`const updateData: Record<string, any> = { ...fields, ...timestamp(), metadataLocked: true };`), add language normalization:

```typescript
    // Normalize language to ISO 639-1
    if (updateData.language && typeof updateData.language === "string") {
      updateData.language = normalizeLanguage(updateData.language);
    }
```

After the `syncBookAuthors` call (after line 139), add publisher sync:

```typescript
    // Sync publisher record
    const finalPublisher = fields.publisher !== undefined ? fields.publisher : existing.publisher;
    await syncBookPublisher(ctx.db, id, finalPublisher ?? null);
```

- [ ] **Step 3: Update metadata.applyFields mutation**

In `packages/server/src/trpc/routers/metadata.ts`, add imports at the top:

```typescript
import { syncBookPublisher } from "../../services/sync-book-publisher.js";
import { normalizeLanguage } from "@verso/shared";
```

In the `applyFields` mutation, after building `updateData` (after line 148), add:

```typescript
    // Normalize language to ISO 639-1
    if (updateData.language && typeof updateData.language === "string") {
      updateData.language = normalizeLanguage(updateData.language);
    }
```

After the DB update and genre sync (after line 187), add publisher sync:

```typescript
    // Sync publisher record
    if (metadataFields.publisher !== undefined) {
      await syncBookPublisher(ctx.db, input.bookId, metadataFields.publisher ?? null);
    }
```

- [ ] **Step 4: Update upload route**

In `packages/server/src/routes/upload.ts`, add imports at the top:

```typescript
import { syncBookPublisher } from "../services/sync-book-publisher.js";
import { normalizeLanguage } from "@verso/shared";
```

Before the book insert (before line 143), normalize language:

```typescript
        if (metadata.language) {
          metadata.language = normalizeLanguage(metadata.language);
        }
```

After the `syncBookAuthors` call (after line 173), add publisher sync:

```typescript
        // Sync publisher record
        if (metadata.publisher) {
          await syncBookPublisher(db, bookId, metadata.publisher);
        }
```

- [ ] **Step 5: Run existing tests to verify nothing is broken**

Run: `cd packages/shared && pnpm build && cd ../server && pnpm vitest run`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/trpc/routers/books.ts packages/server/src/trpc/routers/metadata.ts packages/server/src/routes/upload.ts
git commit -m "feat: integrate syncBookPublisher and normalizeLanguage at all entry points"
```

---

### Task 6: Smart Shelf Filter — Add Publisher

**Files:**
- Modify: `packages/server/src/trpc/routers/build-filter.ts` — line 9-16
- Modify: `packages/web/src/components/shelves/filter-builder.tsx` — line 10-18

- [ ] **Step 1: Add publisher to server columnMap**

In `packages/server/src/trpc/routers/build-filter.ts`, add `publisher` to the `columnMap`:

```typescript
const columnMap = {
  title: books.title,
  author: books.author,
  publisher: books.publisher,
  year: books.year,
  language: books.language,
  fileFormat: books.fileFormat,
  pageCount: books.pageCount,
} as const;
```

- [ ] **Step 2: Add publisher to filter builder UI**

In `packages/web/src/components/shelves/filter-builder.tsx`, add publisher to the `FIELDS` array:

```typescript
const FIELDS: { value: SmartFilterCondition["field"]; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "publisher", label: "Publisher" },
  { value: "genre", label: "Genre" },
  { value: "year", label: "Year" },
  { value: "language", label: "Language" },
  { value: "fileFormat", label: "Format" },
  { value: "pageCount", label: "Page Count" },
];
```

- [ ] **Step 3: Run existing shelf tests**

Run: `cd packages/server && pnpm vitest run src/__tests__/shelves.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/build-filter.ts packages/web/src/components/shelves/filter-builder.tsx
git commit -m "feat: add publisher to smart shelf filter options"
```

---

### Task 7: Edit UI — Publisher Combobox & Language Dropdown

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id_.edit.tsx`
- Modify: `packages/web/src/routes/_app/books/$id.tsx` — line 79

- [ ] **Step 1: Update book detail page to show human-readable language**

In `packages/web/src/routes/_app/books/$id.tsx`, replace line 79:

```typescript
    { label: t("detail.language"), value: book.language?.toUpperCase() },
```

with:

```typescript
    { label: t("detail.language"), value: book.language ? (LANGUAGE_DISPLAY_NAMES[book.language] ?? book.language.toUpperCase()) : null },
```

Add the import at the top:

```typescript
import { LANGUAGE_DISPLAY_NAMES } from "@verso/shared";
```

- [ ] **Step 2: Remove publisher and language from FIELDS array in edit page**

In `packages/web/src/routes/_app/books/$id_.edit.tsx`, remove publisher and language from the `FIELDS` array (lines 13-25). They will be handled as custom components instead. The updated array:

```typescript
const FIELDS: { key: string; labelKey: string; type: "text" | "number" | "textarea"; half?: boolean; group: string }[] = [
  { key: "title", labelKey: "edit.field.title", type: "text", group: "basic" },
  // author is handled separately as a multi-pick component
  { key: "description", labelKey: "edit.field.description", type: "textarea", group: "basic" },
  // genre is handled separately as a multi-pick component
  // language is handled separately as a dropdown component
  { key: "series", labelKey: "edit.field.series", type: "text", half: true, group: "classification" },
  { key: "seriesIndex", labelKey: "edit.field.seriesIndex", type: "number", half: true, group: "classification" },
  // publisher is handled separately as a combobox component
  { key: "year", labelKey: "edit.field.year", type: "number", half: true, group: "publication" },
  { key: "isbn", labelKey: "edit.field.isbn", type: "text", half: true, group: "publication" },
  { key: "pageCount", labelKey: "edit.field.pages", type: "number", group: "publication" },
];
```

- [ ] **Step 3: Add publisher and language imports**

Add at the top of the edit page:

```typescript
import { LANGUAGE_DISPLAY_NAMES, normalizeLanguage } from "@verso/shared";
```

- [ ] **Step 4: Add publisher combobox state and query**

In the `BookEditPage` function, after the author state declarations (around line 66), add:

```typescript
  // Publisher combobox state
  const [publisherValue, setPublisherValue] = useState("");
  const [initialPublisher, setInitialPublisher] = useState("");
  const publishersQuery = trpc.publishers.list.useQuery({});
```

In the initialization `useEffect` (around line 74), after setting author tags, add:

```typescript
    // Handle publisher separately
    const pubStr = metadataApply?.fields?.publisher ?? bookQuery.data.publisher ?? "";
    setPublisherValue(pubStr);
    setInitialPublisher(pubStr);
```

In the `isDirty` check, add:

```typescript
    if (publisherValue !== initialPublisher) return true;
```

In `handleSave`, add publisher to the fields:

```typescript
    // Include publisher
    if (publisherValue !== (bookQuery.data.publisher ?? "")) {
      fields.publisher = publisherValue.trim() || null;
    }
```

- [ ] **Step 5: Add language dropdown state**

In the `BookEditPage` function, after the publisher state, add:

```typescript
  // Language dropdown state
  const [languageValue, setLanguageValue] = useState("");
  const [initialLanguage, setInitialLanguage] = useState("");
```

In the initialization `useEffect`, add:

```typescript
    // Handle language separately
    const langStr = metadataApply?.fields?.language ?? bookQuery.data.language ?? "";
    setLanguageValue(langStr);
    setInitialLanguage(langStr);
```

In the `isDirty` check, add:

```typescript
    if (languageValue !== initialLanguage) return true;
```

In `handleSave`, add language to the fields:

```typescript
    // Include language
    if (languageValue !== (bookQuery.data.language ?? "")) {
      fields.language = languageValue || null;
    }
```

- [ ] **Step 6: Add PublisherCombobox component**

Add this component at the bottom of the file, before `export`:

```typescript
function PublisherCombobox({ value, onChange, suggestions, t }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: { id: string; name: string; bookCount: number }[];
  t: (key: string) => string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? suggestions.filter(
        (s) => s.name.toLowerCase().includes(value.toLowerCase()) && s.name !== value
      )
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef}>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
        {t("edit.field.publisher")}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      {showSuggestions && filtered.length > 0 && (
        <div
          className="mt-1 rounded-lg border shadow-lg overflow-hidden max-h-40 overflow-y-auto"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          {filtered.slice(0, 8).map((pub) => (
            <button
              key={pub.id}
              type="button"
              onClick={() => { onChange(pub.name); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors"
              style={{ color: "var(--text)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {pub.name}
              <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
                ({pub.bookCount})
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add LanguageCombobox component**

```typescript
function LanguageCombobox({ value, onChange, t }: {
  value: string;
  onChange: (value: string) => void;
  t: (key: string) => string;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayValue = value ? (LANGUAGE_DISPLAY_NAMES[value] ?? value) : "";

  const allLanguages = Object.entries(LANGUAGE_DISPLAY_NAMES).map(([code, name]) => ({ code, name }));

  const filtered = input.trim()
    ? allLanguages.filter(
        (l) =>
          l.name.toLowerCase().includes(input.toLowerCase()) ||
          l.code.toLowerCase().includes(input.toLowerCase())
      )
    : allLanguages;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef}>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
        {t("edit.field.language")}
      </label>
      {showSuggestions ? (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          autoFocus
          placeholder={t("edit.field.language")}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setInput(""); setShowSuggestions(true); }}
          className="w-full rounded-lg border px-3 py-2 text-sm text-left outline-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: value ? "var(--text)" : "var(--text-faint)" }}
        >
          {displayValue || t("edit.field.language")}
        </button>
      )}
      {showSuggestions && (
        <div
          className="mt-1 rounded-lg border shadow-lg overflow-hidden max-h-40 overflow-y-auto"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors italic"
              style={{ color: "var(--text-faint)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {t("common.clear")}
            </button>
          )}
          {filtered.slice(0, 20).map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => { onChange(lang.code); setShowSuggestions(false); setInput(""); }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors"
              style={{ color: "var(--text)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {lang.name}
              <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
                ({lang.code})
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Render the new components in the form**

In the JSX where field groups are rendered, add publisher and language components alongside their groups. In the `classification` group section (where `GenreMultiPick` is rendered), add `LanguageCombobox`:

```typescript
                  {group.id === "classification" && (
                    <>
                      <LanguageCombobox
                        value={languageValue}
                        onChange={setLanguageValue}
                        t={t}
                      />
                      <GenreMultiPick
                        selectedGenres={selectedGenres}
                        onChange={setSelectedGenres}
                        t={t}
                      />
                    </>
                  )}
```

In the `publication` group section, add `PublisherCombobox` before the other fields:

```typescript
                  {group.id === "publication" && (
                    <PublisherCombobox
                      value={publisherValue}
                      onChange={setPublisherValue}
                      suggestions={publishersQuery.data ?? []}
                      t={t}
                    />
                  )}
```

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/routes/_app/books/$id_.edit.tsx packages/web/src/routes/_app/books/$id.tsx
git commit -m "feat: add publisher combobox and language dropdown to edit page"
```

---

### Task 8: i18n Translations

**Files:**
- Modify: `packages/web/src/locales/en.json`
- Modify: `packages/web/src/locales/de.json`
- Modify: `packages/web/src/locales/es.json`
- Modify: `packages/web/src/locales/fr.json`
- Modify: `packages/web/src/locales/it.json`
- Modify: `packages/web/src/locales/nl.json`
- Modify: `packages/web/src/locales/pt.json`

We need a `common.clear` key for the language dropdown's "clear" option. Check if it already exists; if not, add it.

- [ ] **Step 1: Add translation keys to all locale files**

Add `"common.clear"` to each locale file (if not already present):

**en.json:** `"common.clear": "Clear"`
**de.json:** `"common.clear": "Leeren"`
**es.json:** `"common.clear": "Borrar"`
**fr.json:** `"common.clear": "Effacer"`
**it.json:** `"common.clear": "Cancella"`
**nl.json:** `"common.clear": "Wissen"`
**pt.json:** `"common.clear": "Limpar"`

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/locales/*.json
git commit -m "feat: add i18n translations for language dropdown clear option"
```

---

### Task 9: Database Migration

**Files:**
- Create: Migration SQL via `pnpm db:generate`

- [ ] **Step 1: Generate Drizzle migration**

Run: `cd packages/server && pnpm db:generate`
Expected: Migration files created in `packages/server/drizzle/`

- [ ] **Step 2: Review generated migration**

Read the generated SQL to verify it includes:
- `CREATE TABLE publishers`
- `ALTER TABLE books ADD COLUMN publisher_id`

- [ ] **Step 3: Add data normalization to migration**

After the schema changes, we need a custom migration script. Create a new file in `packages/server/src/scripts/normalize-existing-data.ts`:

```typescript
import { eq, sql, isNotNull } from "drizzle-orm";
import { books, publishers } from "@verso/shared";
import { normalizeLanguage } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * One-time migration: normalize existing language codes and
 * create publisher records from existing book publisher strings.
 */
export async function normalizeExistingData(db: BetterSQLite3Database<any>) {
  // 1. Normalize languages
  const booksWithLang = await db
    .select({ id: books.id, language: books.language })
    .from(books)
    .where(isNotNull(books.language));

  for (const book of booksWithLang) {
    if (!book.language) continue;
    const normalized = normalizeLanguage(book.language);
    if (normalized !== book.language) {
      await db
        .update(books)
        .set({ language: normalized })
        .where(eq(books.id, book.id));
    }
  }

  // 2. Create publishers from existing books
  const booksWithPub = await db
    .select({ id: books.id, publisher: books.publisher })
    .from(books)
    .where(isNotNull(books.publisher));

  // Group by case-insensitive name, pick most common casing
  const pubGroups = new Map<string, { name: string; count: number; bookIds: string[] }>();
  for (const book of booksWithPub) {
    if (!book.publisher) continue;
    const key = book.publisher.toLowerCase().trim();
    if (!key) continue;
    const group = pubGroups.get(key) ?? { name: book.publisher.trim(), count: 0, bookIds: [] };
    group.count++;
    group.bookIds.push(book.id);
    // Use the casing that appears most — simple heuristic: count occurrences
    pubGroups.set(key, group);
  }

  for (const group of pubGroups.values()) {
    // Check if publisher already exists (from a previous partial run)
    const existing = await db
      .select()
      .from(publishers)
      .where(sql`${publishers.name} COLLATE NOCASE = ${group.name}`)
      .get();

    let publisherId: string;
    let canonicalName: string;
    if (existing) {
      publisherId = existing.id;
      canonicalName = existing.name;
    } else {
      const [created] = await db
        .insert(publishers)
        .values({ name: group.name, createdAt: new Date().toISOString() })
        .returning();
      publisherId = created.id;
      canonicalName = created.name;
    }

    for (const bookId of group.bookIds) {
      await db
        .update(books)
        .set({ publisherId, publisher: canonicalName })
        .where(eq(books.id, bookId));
    }
  }

  console.log(`Normalized ${booksWithLang.length} language values, created ${pubGroups.size} publishers from ${booksWithPub.length} books`);
}
```

- [ ] **Step 4: Add migration call to server startup**

Find where migrations run at startup and add a call to `normalizeExistingData` after schema migrations. This should be in the database initialization code. Look for `db:migrate` or `migrate()` calls and add:

```typescript
import { normalizeExistingData } from "./scripts/normalize-existing-data.js";
// After migrations run:
await normalizeExistingData(db);
```

Note: The normalization is idempotent — running it multiple times is safe.

- [ ] **Step 5: Run migration locally**

Run: `pnpm db:push` (dev shortcut to push schema directly)
Expected: Schema updated, no errors

- [ ] **Step 6: Run the normalization script manually to test**

Run: `cd packages/server && npx tsx src/scripts/normalize-existing-data.ts`
Or call it from a test. Verify publishers are created and languages are normalized by checking the database.

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/server/drizzle/ packages/server/src/scripts/normalize-existing-data.ts
git commit -m "feat: add migration for publishers table and data normalization"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: Clean build with no errors

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 3: Start dev server and browser-test**

Run: `pnpm dev`

Test in browser:
1. Open a book's edit page — verify publisher shows as a combobox with existing publisher suggestions
2. Verify language shows as a dropdown with human-readable names
3. Edit a book's publisher to an existing publisher name — verify it deduplicates
4. Edit a book's language — verify it saves as ISO 639-1 code
5. Check book detail page — verify language displays as human-readable name (e.g. "German" not "de")
6. Create a smart shelf with a publisher filter — verify it works
7. Upload a new book — verify publisher and language are normalized

- [ ] **Step 4: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found during browser testing"
```
