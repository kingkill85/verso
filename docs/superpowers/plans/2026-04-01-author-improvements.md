# Author Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add localized author descriptions via Wikidata/Wikipedia enrichment, admin-only editing with photo upload, and fix author photo serving.

**Architecture:** New `authorDescriptions` join table stores per-locale bios. Enrichment is refactored to query Wikidata for multilingual Wikipedia summaries with OpenLibrary fallback. A new Fastify route serves/uploads author photos (like covers). The author detail page gains locale-aware bio display and an admin edit modal.

**Tech Stack:** Drizzle ORM (SQLite), Fastify, tRPC v11, Sharp (image processing), Wikidata/Wikipedia REST APIs, React 19, Radix UI Dialog, i18next

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/shared/src/author-description-validators.ts` | Zod validators for author update/description mutations |
| `packages/server/src/services/wikidata-authors.ts` | Wikidata search + Wikipedia summary fetching |
| `packages/server/src/services/enrich-author-v2.ts` | New enrichment orchestrator (Wikidata → OpenLibrary fallback) |
| `packages/server/src/__tests__/wikidata-authors.test.ts` | Tests for Wikidata/Wikipedia service |
| `packages/server/src/__tests__/enrich-author-v2.test.ts` | Tests for new enrichment orchestrator |
| `packages/server/src/routes/author-photos.ts` | Fastify routes for serving/uploading/deleting author photos |
| `packages/web/src/components/authors/author-edit-modal.tsx` | Admin edit modal component |

### Modified files
| File | Changes |
|------|---------|
| `packages/shared/src/schema.ts` | Add `authorDescriptions` table, drop `description` from `authors` |
| `packages/shared/src/index.ts` | Export new validators |
| `packages/shared/src/author-validators.ts` | Add `authorUpdateInput`, `authorUpdateDescriptionInput` |
| `packages/server/src/trpc/routers/authors.ts` | Rewrite `byId` to include localized descriptions, add `update`/`updateDescription` admin mutations, rewire `refreshMetadata` |
| `packages/server/src/services/enrich-author.ts` | Keep as-is for OpenLibrary fallback (called by v2 orchestrator) |
| `packages/server/src/services/migrate-authors.ts` | Update to migrate `authors.description` → `authorDescriptions` |
| `packages/server/src/app.ts` | Register author-photos route, add description migration on startup |
| `packages/server/src/__tests__/authors.test.ts` | Update tests for new schema + add admin mutation tests |
| `packages/web/src/routes/_app/authors/$id.tsx` | Locale-aware bio, larger photo, birth date, admin controls, edit modal |
| `packages/web/src/components/authors/author-card.tsx` | Fix photo URL to use new serving route |
| `packages/web/src/locales/*.json` | Add translation keys for edit modal, locale names, etc. (all 7 locales) |

---

## Task 1: Schema — Add `authorDescriptions` table

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Add `authorDescriptions` table to schema**

Add after the `authors` table definition in `packages/shared/src/schema.ts`:

```typescript
export const authorDescriptions = sqliteTable("author_descriptions", {
  authorId: text("author_id")
    .notNull()
    .references(() => authors.id, { onDelete: "cascade" }),
  locale: text("locale", { length: 10 }).notNull(),
  description: text("description").notNull(),
  manuallyEdited: integer("manually_edited", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  primaryKey({ columns: [table.authorId, table.locale] }),
]);
```

- [ ] **Step 2: Remove `description` column from `authors` table**

In the `authors` table definition, remove the line:
```typescript
  description: text("description"),
```

- [ ] **Step 3: Generate migration**

Run:
```bash
cd packages/server && pnpm db:generate
```

Expected: New migration SQL file in `packages/server/drizzle/` that creates `author_descriptions` and drops `description` from `authors`.

- [ ] **Step 4: Build shared package**

Run:
```bash
pnpm build:shared
```

Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schema.ts packages/server/drizzle/
git commit -m "feat(authors): add authorDescriptions table, drop authors.description"
```

---

## Task 2: Validators — Author update and description inputs

**Files:**
- Modify: `packages/shared/src/author-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add new validators**

Add to `packages/shared/src/author-validators.ts`:

```typescript
export const authorUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(500).optional(),
});

export const authorUpdateDescriptionInput = z.object({
  authorId: z.string().uuid(),
  locale: z.string().min(2).max(10),
  description: z.string().min(1),
});
```

- [ ] **Step 2: Verify shared index exports author-validators**

Check `packages/shared/src/index.ts` already has `export * from "./author-validators.js";`. It does — no change needed.

- [ ] **Step 3: Build shared package**

Run:
```bash
pnpm build:shared
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/author-validators.ts
git commit -m "feat(authors): add authorUpdate and authorUpdateDescription validators"
```

---

## Task 3: Wikidata/Wikipedia service

**Files:**
- Create: `packages/server/src/services/wikidata-authors.ts`
- Create: `packages/server/src/__tests__/wikidata-authors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/wikidata-authors.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchWikidata, fetchWikipediaSummaries } from "../services/wikidata-authors.js";

describe("wikidata-authors", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  afterEach(() => {
    fetchSpy.mockReset();
  });

  describe("searchWikidata", () => {
    it("returns entity data when found", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          search: [{
            id: "Q42",
            label: "Douglas Adams",
            description: "English author and screenwriter",
          }],
        }))
      );

      // Second call: fetch entity details
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          entities: {
            Q42: {
              sitelinks: {
                enwiki: { title: "Douglas Adams" },
                dewiki: { title: "Douglas Adams" },
                frwiki: { title: "Douglas Adams" },
              },
              claims: {
                P569: [{ mainsnak: { datavalue: { value: { time: "+1952-03-11T00:00:00Z" } } } }],
                P18: [{ mainsnak: { datavalue: { value: "Douglas adams portrait cropped.jpg" } } }],
              },
            },
          },
        }))
      );

      const result = await searchWikidata("Douglas Adams");
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe("Q42");
      expect(result!.birthDate).toBe("1952-03-11");
      expect(result!.imageFilename).toBe("Douglas adams portrait cropped.jpg");
      expect(result!.sitelinks.en).toBe("Douglas Adams");
      expect(result!.sitelinks.de).toBe("Douglas Adams");
    });

    it("returns null when no results", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ search: [] }))
      );

      const result = await searchWikidata("Nonexistent Author XYZ");
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network error"));

      const result = await searchWikidata("Douglas Adams");
      expect(result).toBeNull();
    });
  });

  describe("fetchWikipediaSummaries", () => {
    it("fetches summaries for available locales", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          extract: "Douglas Adams was an English author.",
        }))
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          extract: "Douglas Adams war ein englischer Schriftsteller.",
        }))
      );

      const sitelinks = { en: "Douglas Adams", de: "Douglas Adams" };
      const result = await fetchWikipediaSummaries(sitelinks);

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.locale === "en")?.description).toBe(
        "Douglas Adams was an English author."
      );
      expect(result.find((r) => r.locale === "de")?.description).toBe(
        "Douglas Adams war ein englischer Schriftsteller."
      );
    });

    it("skips locales that return errors", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ extract: "English bio." }))
      );
      fetchSpy.mockResolvedValueOnce(
        new Response("Not found", { status: 404 })
      );

      const sitelinks = { en: "Douglas Adams", de: "Nonexistent" };
      const result = await fetchWikipediaSummaries(sitelinks);

      expect(result).toHaveLength(1);
      expect(result[0].locale).toBe("en");
    });

    it("returns empty array when all fetches fail", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"));

      const sitelinks = { en: "Test" };
      const result = await fetchWikipediaSummaries(sitelinks);

      expect(result).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/server && pnpm vitest run src/__tests__/wikidata-authors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Wikidata service**

Create `packages/server/src/services/wikidata-authors.ts`:

```typescript
import { createHash } from "node:crypto";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_BASE = "https://upload.wikimedia.org/wikipedia/commons";

const APP_LOCALES = ["en", "de", "es", "fr", "it", "nl", "pt", "zh", "ja", "ko"] as const;

export type WikidataResult = {
  entityId: string;
  birthDate: string | null;
  imageFilename: string | null;
  sitelinks: Record<string, string>; // locale → article title
};

export async function searchWikidata(name: string): Promise<WikidataResult | null> {
  try {
    // Step 1: Search for the entity
    const searchParams = new URLSearchParams({
      action: "wbsearchentities",
      search: name,
      language: "en",
      type: "item",
      limit: "1",
      format: "json",
    });
    const searchRes = await fetch(`${WIKIDATA_API}?${searchParams}`);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    if (!searchData.search?.length) return null;

    const entityId = searchData.search[0].id;

    // Step 2: Fetch entity details (sitelinks, claims for birth date + image)
    const entityParams = new URLSearchParams({
      action: "wbgetentities",
      ids: entityId,
      props: "sitelinks|claims",
      format: "json",
    });
    const entityRes = await fetch(`${WIKIDATA_API}?${entityParams}`);
    if (!entityRes.ok) return null;
    const entityData = await entityRes.json();
    const entity = entityData.entities?.[entityId];
    if (!entity) return null;

    // Extract sitelinks for our app locales
    const sitelinks: Record<string, string> = {};
    for (const locale of APP_LOCALES) {
      const wikiKey = `${locale}wiki`;
      if (entity.sitelinks?.[wikiKey]) {
        sitelinks[locale] = entity.sitelinks[wikiKey].title;
      }
    }

    // Extract birth date (P569)
    let birthDate: string | null = null;
    const birthClaim = entity.claims?.P569?.[0];
    if (birthClaim?.mainsnak?.datavalue?.value?.time) {
      const raw = birthClaim.mainsnak.datavalue.value.time; // e.g. "+1952-03-11T00:00:00Z"
      const match = raw.match(/\+?(\d{4}-\d{2}-\d{2})/);
      if (match) birthDate = match[1];
    }

    // Extract image filename (P18)
    let imageFilename: string | null = null;
    const imageClaim = entity.claims?.P18?.[0];
    if (imageClaim?.mainsnak?.datavalue?.value) {
      imageFilename = imageClaim.mainsnak.datavalue.value;
    }

    return { entityId, birthDate, imageFilename, sitelinks };
  } catch {
    return null;
  }
}

export function getCommonsImageUrl(filename: string): string {
  const normalized = filename.replace(/ /g, "_");
  const md5 = createMd5Hash(normalized);
  return `${COMMONS_BASE}/${md5[0]}/${md5[0]}${md5[1]}/${encodeURIComponent(normalized)}`;
}

// Wikimedia Commons uses first 2 chars of MD5 hash for file paths
function createMd5Hash(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export async function fetchWikipediaSummaries(
  sitelinks: Record<string, string>,
): Promise<{ locale: string; description: string }[]> {
  const results: { locale: string; description: string }[] = [];

  for (const [locale, title] of Object.entries(sitelinks)) {
    try {
      const url = `https://${locale}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.extract) {
        results.push({ locale, description: data.extract });
      }
    } catch {
      continue;
    }

    // Rate limit: 1s between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/server && pnpm vitest run src/__tests__/wikidata-authors.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/wikidata-authors.ts packages/server/src/__tests__/wikidata-authors.test.ts
git commit -m "feat(authors): add Wikidata/Wikipedia author search and summary service"
```

---

## Task 4: Enrichment orchestrator v2 (Wikidata → OpenLibrary fallback)

**Files:**
- Create: `packages/server/src/services/enrich-author-v2.ts`
- Create: `packages/server/src/__tests__/enrich-author-v2.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/enrich-author-v2.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as wikidataModule from "../services/wikidata-authors.js";
import * as openlibraryModule from "../services/openlibrary-authors.js";
import { enrichAuthorV2 } from "../services/enrich-author-v2.js";
import { createTestContext } from "../test-utils.js";
import { authors, authorDescriptions } from "@verso/shared";
import { eq } from "drizzle-orm";

vi.mock("../services/wikidata-authors.js");
vi.mock("../services/openlibrary-authors.js");

describe("enrichAuthorV2", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authorId: string;

  const mockStorage = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    stream: vi.fn(),
    size: vi.fn(),
    fullPath: vi.fn(),
    removeDir: vi.fn(),
  };

  beforeEach(async () => {
    ctx = await createTestContext();
    const [author] = await ctx.db.insert(authors).values({
      name: "Douglas Adams",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    authorId = author.id;
    vi.resetAllMocks();
  });

  it("enriches from Wikidata when available", async () => {
    const searchWikidata = vi.mocked(wikidataModule.searchWikidata);
    const fetchWikipediaSummaries = vi.mocked(wikidataModule.fetchWikipediaSummaries);
    const getCommonsImageUrl = vi.mocked(wikidataModule.getCommonsImageUrl);

    searchWikidata.mockResolvedValue({
      entityId: "Q42",
      birthDate: "1952-03-11",
      imageFilename: "photo.jpg",
      sitelinks: { en: "Douglas Adams", de: "Douglas Adams" },
    });
    fetchWikipediaSummaries.mockResolvedValue([
      { locale: "en", description: "English author" },
      { locale: "de", description: "Englischer Autor" },
    ]);
    getCommonsImageUrl.mockReturnValue("https://commons.example.com/photo.jpg");

    // Mock photo download
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("fake-image-data"))
    );

    const result = await enrichAuthorV2(ctx.db, authorId, "Douglas Adams", mockStorage as any);
    expect(result).toBe(true);

    // Check descriptions were stored
    const descriptions = ctx.db
      .select()
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, authorId))
      .all();
    expect(descriptions).toHaveLength(2);
    expect(descriptions.find((d) => d.locale === "en")?.description).toBe("English author");
    expect(descriptions.find((d) => d.locale === "de")?.description).toBe("Englischer Autor");

    // Check author record updated
    const updated = ctx.db.select().from(authors).where(eq(authors.id, authorId)).get();
    expect(updated?.birthDate).toBe("1952-03-11");
    expect(updated?.imagePath).toBe(`authors/${authorId}/photo.jpg`);
  });

  it("falls back to OpenLibrary when Wikidata returns nothing", async () => {
    vi.mocked(wikidataModule.searchWikidata).mockResolvedValue(null);
    vi.mocked(openlibraryModule.searchAuthor).mockResolvedValue("OL123A");
    vi.mocked(openlibraryModule.fetchAuthorMetadata).mockResolvedValue({
      description: "English author from OpenLibrary",
      birthDate: "1952-03-11",
      photoUrl: null,
    });

    const result = await enrichAuthorV2(ctx.db, authorId, "Douglas Adams", mockStorage as any);
    expect(result).toBe(true);

    const descriptions = ctx.db
      .select()
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, authorId))
      .all();
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0].locale).toBe("en");
    expect(descriptions[0].description).toBe("English author from OpenLibrary");
  });

  it("skips manually edited descriptions during enrichment", async () => {
    // Pre-insert a manually edited description
    await ctx.db.insert(authorDescriptions).values({
      authorId,
      locale: "en",
      description: "My custom bio",
      manuallyEdited: true,
    });

    vi.mocked(wikidataModule.searchWikidata).mockResolvedValue({
      entityId: "Q42",
      birthDate: "1952-03-11",
      imageFilename: null,
      sitelinks: { en: "Douglas Adams", de: "Douglas Adams" },
    });
    vi.mocked(wikidataModule.fetchWikipediaSummaries).mockResolvedValue([
      { locale: "en", description: "Should not overwrite" },
      { locale: "de", description: "German bio" },
    ]);

    await enrichAuthorV2(ctx.db, authorId, "Douglas Adams", mockStorage as any);

    const descriptions = ctx.db
      .select()
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, authorId))
      .all();
    const enDesc = descriptions.find((d) => d.locale === "en");
    expect(enDesc?.description).toBe("My custom bio"); // Preserved
    expect(enDesc?.manuallyEdited).toBe(true);
    const deDesc = descriptions.find((d) => d.locale === "de");
    expect(deDesc?.description).toBe("German bio"); // Added
  });

  it("returns false when both sources fail", async () => {
    vi.mocked(wikidataModule.searchWikidata).mockResolvedValue(null);
    vi.mocked(openlibraryModule.searchAuthor).mockResolvedValue(null);

    const result = await enrichAuthorV2(ctx.db, authorId, "Unknown Author", mockStorage as any);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/server && pnpm vitest run src/__tests__/enrich-author-v2.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the enrichment orchestrator**

Create `packages/server/src/services/enrich-author-v2.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { authors, authorDescriptions } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { searchWikidata, fetchWikipediaSummaries, getCommonsImageUrl } from "./wikidata-authors.js";
import { searchAuthor, fetchAuthorMetadata } from "./openlibrary-authors.js";

export async function enrichAuthorV2(
  db: BetterSQLite3Database<any>,
  authorId: string,
  authorName: string,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<boolean> {
  // Try Wikidata first
  const wikiResult = await searchWikidata(authorName);

  if (wikiResult) {
    return enrichFromWikidata(db, authorId, wikiResult, storage);
  }

  // Fall back to OpenLibrary
  return enrichFromOpenLibrary(db, authorId, authorName, storage);
}

async function enrichFromWikidata(
  db: BetterSQLite3Database<any>,
  authorId: string,
  wikiResult: NonNullable<Awaited<ReturnType<typeof searchWikidata>>>,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<boolean> {
  try {
    // Fetch localized summaries
    const summaries = await fetchWikipediaSummaries(wikiResult.sitelinks);

    // Get manually edited locales to skip
    const manualEdits = db
      .select({ locale: authorDescriptions.locale })
      .from(authorDescriptions)
      .where(
        and(
          eq(authorDescriptions.authorId, authorId),
          eq(authorDescriptions.manuallyEdited, true),
        )
      )
      .all()
      .map((r) => r.locale);

    const manualSet = new Set(manualEdits);

    // Upsert descriptions for non-manually-edited locales
    for (const { locale, description } of summaries) {
      if (manualSet.has(locale)) continue;

      const existing = db
        .select()
        .from(authorDescriptions)
        .where(
          and(
            eq(authorDescriptions.authorId, authorId),
            eq(authorDescriptions.locale, locale),
          )
        )
        .get();

      if (existing) {
        db.update(authorDescriptions)
          .set({ description })
          .where(
            and(
              eq(authorDescriptions.authorId, authorId),
              eq(authorDescriptions.locale, locale),
            )
          )
          .run();
      } else {
        db.insert(authorDescriptions)
          .values({ authorId, locale, description, manuallyEdited: false })
          .run();
      }
    }

    // Download photo
    let imagePath: string | null = null;
    if (wikiResult.imageFilename) {
      try {
        const photoUrl = getCommonsImageUrl(wikiResult.imageFilename);
        const photoRes = await fetch(photoUrl);
        if (photoRes.ok) {
          const buffer = Buffer.from(await photoRes.arrayBuffer());
          imagePath = `authors/${authorId}/photo.jpg`;
          await storage.put(imagePath, buffer);
        }
      } catch {
        // Photo download failed — continue without
      }
    }

    // Update author record
    db.update(authors)
      .set({
        birthDate: wikiResult.birthDate,
        imagePath: imagePath ?? undefined,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(authors.id, authorId))
      .run();

    return summaries.length > 0 || imagePath !== null;
  } catch {
    return false;
  }
}

async function enrichFromOpenLibrary(
  db: BetterSQLite3Database<any>,
  authorId: string,
  authorName: string,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<boolean> {
  try {
    const olKey = await searchAuthor(authorName);
    if (!olKey) return false;

    const meta = await fetchAuthorMetadata(olKey);
    if (!meta) return false;

    // Store English description if available
    if (meta.description) {
      const manualEn = db
        .select()
        .from(authorDescriptions)
        .where(
          and(
            eq(authorDescriptions.authorId, authorId),
            eq(authorDescriptions.locale, "en"),
            eq(authorDescriptions.manuallyEdited, true),
          )
        )
        .get();

      if (!manualEn) {
        const existing = db
          .select()
          .from(authorDescriptions)
          .where(
            and(
              eq(authorDescriptions.authorId, authorId),
              eq(authorDescriptions.locale, "en"),
            )
          )
          .get();

        if (existing) {
          db.update(authorDescriptions)
            .set({ description: meta.description })
            .where(
              and(
                eq(authorDescriptions.authorId, authorId),
                eq(authorDescriptions.locale, "en"),
              )
            )
            .run();
        } else {
          db.insert(authorDescriptions)
            .values({ authorId, locale: "en", description: meta.description, manuallyEdited: false })
            .run();
        }
      }
    }

    // Download photo
    let imagePath: string | null = null;
    if (meta.photoUrl) {
      try {
        const photoRes = await fetch(meta.photoUrl);
        if (photoRes.ok) {
          const buffer = Buffer.from(await photoRes.arrayBuffer());
          imagePath = `authors/${authorId}/photo.jpg`;
          await storage.put(imagePath, buffer);
        }
      } catch {
        // Photo download failed
      }
    }

    // Update author record
    db.update(authors)
      .set({
        birthDate: meta.birthDate,
        openLibraryKey: olKey,
        imagePath: imagePath ?? undefined,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(authors.id, authorId))
      .run();

    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/server && pnpm vitest run src/__tests__/enrich-author-v2.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/enrich-author-v2.ts packages/server/src/__tests__/enrich-author-v2.test.ts
git commit -m "feat(authors): add enrichment orchestrator with Wikidata→OpenLibrary fallback"
```

---

## Task 5: Author photo routes (serve, upload, delete)

**Files:**
- Create: `packages/server/src/routes/author-photos.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create the author photo routes**

Create `packages/server/src/routes/author-photos.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { authors } from "@verso/shared";
import { verifyAccessToken } from "../services/jwt.js";
import sharp from "sharp";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function registerAuthorPhotosRoute(app: FastifyInstance, db: AppDatabase, storage: StorageService, config: Config) {
  // Serve author photo — no auth (unguessable UUID)
  app.get("/api/authors/:authorId/photo", async (req, reply) => {
    const { authorId } = req.params as { authorId: string };

    const author = await db.query.authors.findFirst({
      where: eq(authors.id, authorId),
    });
    if (!author || !author.imagePath) return reply.status(404).send({ error: "Photo not found" });

    const exists = await storage.exists(author.imagePath);
    if (!exists) return reply.status(404).send({ error: "Photo file not found" });

    const photoData = await storage.get(author.imagePath);
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "no-cache").send(photoData);
  });

  // Upload author photo — admin only
  app.post("/api/authors/:authorId/photo", async (req, reply) => {
    const { authorId } = req.params as { authorId: string };

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ error: "Unauthorized" });
    let user;
    try {
      user = await verifyAccessToken(authHeader.slice(7), config);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (user.role !== "admin") return reply.status(403).send({ error: "Admin access required" });

    const author = await db.query.authors.findFirst({
      where: eq(authors.id, authorId),
    });
    if (!author) return reply.status(404).send({ error: "Author not found" });

    const file = await req.file();
    if (!file) return reply.status(400).send({ error: "No file uploaded" });

    const buffer = await file.toBuffer();
    const processed = await sharp(buffer)
      .resize(400, 400, { fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const imagePath = `authors/${authorId}/photo.jpg`;
    await storage.put(imagePath, processed);

    await db.update(authors).set({
      imagePath,
      updatedAt: new Date().toISOString(),
    }).where(eq(authors.id, authorId));

    return { success: true, imagePath };
  });

  // Delete author photo — admin only
  app.delete("/api/authors/:authorId/photo", async (req, reply) => {
    const { authorId } = req.params as { authorId: string };

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ error: "Unauthorized" });
    let user;
    try {
      user = await verifyAccessToken(authHeader.slice(7), config);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (user.role !== "admin") return reply.status(403).send({ error: "Admin access required" });

    const author = await db.query.authors.findFirst({
      where: eq(authors.id, authorId),
    });
    if (!author) return reply.status(404).send({ error: "Author not found" });

    if (author.imagePath) {
      await storage.delete(author.imagePath);
      await db.update(authors).set({
        imagePath: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(authors.id, authorId));
    }

    return { success: true };
  });
}
```

- [ ] **Step 2: Register the route in app.ts**

In `packages/server/src/app.ts`, add the import at the top:

```typescript
import { registerAuthorPhotosRoute } from "./routes/author-photos.js";
```

Add after the `registerCoversRoute` call (around line 115):

```typescript
registerAuthorPhotosRoute(app, db, storage, config);
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/author-photos.ts packages/server/src/app.ts
git commit -m "feat(authors): add author photo serve/upload/delete routes"
```

---

## Task 6: Update authors tRPC router

**Files:**
- Modify: `packages/server/src/trpc/routers/authors.ts`

- [ ] **Step 1: Update the existing tests for new schema**

Update `packages/server/src/__tests__/authors.test.ts` — replace the entire file:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, authors, bookAuthors, authorDescriptions } from "@verso/shared";
import { eq } from "drizzle-orm";

describe("authors router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let adminCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    // First user is admin
    const reg = await ctx.caller.auth.register({
      email: "admin@example.com",
      password: "password123",
      displayName: "Admin User",
    });
    adminCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    // Second user is regular
    const reg2 = await adminCaller.admin.createUser({
      email: "user@example.com",
      password: "password123",
      displayName: "Regular User",
      role: "user",
    });
    const login = await ctx.caller.auth.login({
      email: "user@example.com",
      password: "password123",
    });
    authedCaller = ctx.createAuthedCaller(login.accessToken);
  });

  async function insertAuthorWithBooks(name: string, bookCount: number) {
    const [author] = await ctx.db
      .insert(authors)
      .values({ name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .returning();

    for (let i = 0; i < bookCount; i++) {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId,
        title: `${name} Book ${i + 1}`,
        author: name,
        filePath: `books/${bookId}.epub`,
        fileFormat: "epub",
        fileSize: 1024,
        addedBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await ctx.db.insert(bookAuthors).values({ bookId, authorId: author.id, position: 0 });
    }

    return author;
  }

  describe("list", () => {
    it("returns empty list when no authors exist", async () => {
      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(0);
    });

    it("returns authors with book counts, sorted by count desc", async () => {
      await insertAuthorWithBooks("Frank Herbert", 3);
      await insertAuthorWithBooks("Neal Stephenson", 1);

      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Frank Herbert");
      expect(result[0].bookCount).toBe(3);
      expect(result[1].name).toBe("Neal Stephenson");
      expect(result[1].bookCount).toBe(1);
    });

    it("excludes authors with zero books", async () => {
      await ctx.db.insert(authors).values({
        name: "No Books Author",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await insertAuthorWithBooks("Has Books", 1);

      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Has Books");
    });

    it("filters by search term", async () => {
      await insertAuthorWithBooks("Frank Herbert", 2);
      await insertAuthorWithBooks("Neal Stephenson", 1);

      const result = await authedCaller.authors.list({ search: "frank" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Frank Herbert");
    });
  });

  describe("byId", () => {
    it("returns author with books and descriptions", async () => {
      const author = await insertAuthorWithBooks("Frank Herbert", 2);
      await ctx.db.insert(authorDescriptions).values([
        { authorId: author.id, locale: "en", description: "English bio" },
        { authorId: author.id, locale: "de", description: "German bio" },
      ]);

      const result = await authedCaller.authors.byId({ id: author.id });
      expect(result.name).toBe("Frank Herbert");
      expect(result.books).toHaveLength(2);
      expect(result.descriptions).toHaveLength(2);
      expect(result.descriptions.find((d: any) => d.locale === "en")?.description).toBe("English bio");
    });

    it("throws NOT_FOUND for missing author", async () => {
      await expect(
        authedCaller.authors.byId({ id: crypto.randomUUID() })
      ).rejects.toThrow("Author not found");
    });
  });

  describe("update (admin only)", () => {
    it("updates author name", async () => {
      const author = await insertAuthorWithBooks("Old Name", 1);
      await adminCaller.authors.update({ id: author.id, name: "New Name" });

      const updated = ctx.db.select().from(authors).where(eq(authors.id, author.id)).get();
      expect(updated?.name).toBe("New Name");
    });

    it("rejects non-admin users", async () => {
      const author = await insertAuthorWithBooks("Test", 1);
      await expect(
        authedCaller.authors.update({ id: author.id, name: "Nope" })
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("updateDescription (admin only)", () => {
    it("creates a new description with manuallyEdited=true", async () => {
      const author = await insertAuthorWithBooks("Test Author", 1);
      await adminCaller.authors.updateDescription({
        authorId: author.id,
        locale: "de",
        description: "German bio written by admin",
      });

      const desc = ctx.db
        .select()
        .from(authorDescriptions)
        .where(eq(authorDescriptions.authorId, author.id))
        .all();
      expect(desc).toHaveLength(1);
      expect(desc[0].locale).toBe("de");
      expect(desc[0].description).toBe("German bio written by admin");
      expect(desc[0].manuallyEdited).toBe(true);
    });

    it("updates existing description and sets manuallyEdited=true", async () => {
      const author = await insertAuthorWithBooks("Test Author", 1);
      await ctx.db.insert(authorDescriptions).values({
        authorId: author.id,
        locale: "en",
        description: "Auto bio",
        manuallyEdited: false,
      });

      await adminCaller.authors.updateDescription({
        authorId: author.id,
        locale: "en",
        description: "Admin bio",
      });

      const desc = ctx.db
        .select()
        .from(authorDescriptions)
        .where(eq(authorDescriptions.authorId, author.id))
        .all();
      expect(desc[0].description).toBe("Admin bio");
      expect(desc[0].manuallyEdited).toBe(true);
    });

    it("rejects non-admin users", async () => {
      const author = await insertAuthorWithBooks("Test", 1);
      await expect(
        authedCaller.authors.updateDescription({
          authorId: author.id,
          locale: "en",
          description: "Nope",
        })
      ).rejects.toThrow("Admin access required");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd packages/server && pnpm vitest run src/__tests__/authors.test.ts
```

Expected: FAIL — `update` and `updateDescription` procedures don't exist, `descriptions` not returned from `byId`.

- [ ] **Step 3: Rewrite the authors router**

Replace `packages/server/src/trpc/routers/authors.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { eq, sql, desc, like, and } from "drizzle-orm";
import {
  authors,
  bookAuthors,
  books,
  authorDescriptions,
  authorListInput,
  authorByIdInput,
  authorRefreshInput,
  authorUpdateInput,
  authorUpdateDescriptionInput,
} from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";
import { enrichAuthorV2 } from "../../services/enrich-author-v2.js";

export const authorsRouter = router({
  list: protectedProcedure.input(authorListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: authors.id,
        name: authors.name,
        imagePath: authors.imagePath,
        bookCount: sql<number>`count(${bookAuthors.bookId})`,
      })
      .from(authors)
      .innerJoin(bookAuthors, eq(bookAuthors.authorId, authors.id))
      .where(
        input.search
          ? like(authors.name, `%${input.search}%`)
          : undefined
      )
      .groupBy(authors.id)
      .orderBy(desc(sql`count(${bookAuthors.bookId})`), authors.name);

    return rows;
  }),

  byId: protectedProcedure.input(authorByIdInput).query(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    // Fetch localized descriptions
    const descriptions = ctx.db
      .select({
        locale: authorDescriptions.locale,
        description: authorDescriptions.description,
        manuallyEdited: authorDescriptions.manuallyEdited,
      })
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, input.id))
      .all();

    // If no descriptions yet, try enriching in background
    if (descriptions.length === 0 && !author.openLibraryKey) {
      enrichAuthorV2(ctx.db, author.id, author.name, ctx.storage).catch(() => {});
    }

    const authorBooks = await ctx.db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverPath: books.coverPath,
        year: books.year,
        fileFormat: books.fileFormat,
      })
      .from(bookAuthors)
      .innerJoin(books, eq(books.id, bookAuthors.bookId))
      .where(eq(bookAuthors.authorId, input.id))
      .orderBy(books.year, books.title);

    return { ...author, descriptions, books: authorBooks };
  }),

  update: adminProcedure.input(authorUpdateInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (input.name) updates.name = input.name;

    await ctx.db.update(authors).set(updates).where(eq(authors.id, input.id));

    return ctx.db.select().from(authors).where(eq(authors.id, input.id)).get()!;
  }),

  updateDescription: adminProcedure.input(authorUpdateDescriptionInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.authorId)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    const existing = ctx.db
      .select()
      .from(authorDescriptions)
      .where(
        and(
          eq(authorDescriptions.authorId, input.authorId),
          eq(authorDescriptions.locale, input.locale),
        )
      )
      .get();

    if (existing) {
      ctx.db
        .update(authorDescriptions)
        .set({ description: input.description, manuallyEdited: true })
        .where(
          and(
            eq(authorDescriptions.authorId, input.authorId),
            eq(authorDescriptions.locale, input.locale),
          )
        )
        .run();
    } else {
      ctx.db
        .insert(authorDescriptions)
        .values({
          authorId: input.authorId,
          locale: input.locale,
          description: input.description,
          manuallyEdited: true,
        })
        .run();
    }

    return { success: true };
  }),

  refreshMetadata: adminProcedure.input(authorRefreshInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    await enrichAuthorV2(ctx.db, author.id, author.name, ctx.storage);

    const updated = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    return updated!;
  }),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd packages/server && pnpm vitest run src/__tests__/authors.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/trpc/routers/authors.ts packages/server/src/__tests__/authors.test.ts packages/shared/src/author-validators.ts
git commit -m "feat(authors): update router with localized descriptions, admin mutations, Wikidata enrichment"
```

---

## Task 7: Migrate existing descriptions on startup

**Files:**
- Modify: `packages/server/src/services/migrate-authors.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Read current migrate-authors.ts**

Read `packages/server/src/services/migrate-authors.ts` to understand the current migration logic before modifying.

- [ ] **Step 2: Add description migration function**

Add to `packages/server/src/services/migrate-authors.ts`:

```typescript
import { authorDescriptions } from "@verso/shared";

export async function migrateAuthorDescriptions(db: AppDatabase): Promise<number> {
  // Move any existing authors.description values into authorDescriptions table
  // This runs once — after migration, authors.description column no longer exists
  // But during the transition, some rows may have been created before the column was dropped
  // Use raw SQL to handle both cases safely
  try {
    const result = db.run(sql`
      INSERT OR IGNORE INTO author_descriptions (author_id, locale, description, manually_edited)
      SELECT id, 'en', description, 0
      FROM authors
      WHERE description IS NOT NULL
        AND description != ''
        AND id NOT IN (
          SELECT author_id FROM author_descriptions WHERE locale = 'en'
        )
    `);
    return result.changes;
  } catch {
    // Column may already be dropped — that's fine
    return 0;
  }
}
```

- [ ] **Step 3: Call the migration in app.ts startup**

In `packages/server/src/app.ts`, add import:

```typescript
import { migrateAuthorDescriptions } from "./services/migrate-authors.js";
```

Add after the existing author migration block (around line 79):

```typescript
// Migrate existing author descriptions to new table
if (!externalDb) {
  const descCount = await migrateAuthorDescriptions(db);
  if (descCount > 0) {
    console.log(`Migrated ${descCount} author descriptions to localized table`);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/migrate-authors.ts packages/server/src/app.ts
git commit -m "feat(authors): migrate existing descriptions to authorDescriptions table on startup"
```

---

## Task 8: i18n — Add translation keys for all 7 locales

**Files:**
- Modify: `packages/web/src/locales/en.json`
- Modify: `packages/web/src/locales/de.json`
- Modify: `packages/web/src/locales/es.json`
- Modify: `packages/web/src/locales/fr.json`
- Modify: `packages/web/src/locales/it.json`
- Modify: `packages/web/src/locales/nl.json`
- Modify: `packages/web/src/locales/pt.json`

- [ ] **Step 1: Add English translation keys**

Add to `packages/web/src/locales/en.json` after the existing `authors.*` keys:

```json
  "authors.edit": "Edit",
  "authors.editAuthor": "Edit Author",
  "authors.editName": "Name",
  "authors.editPhoto": "Photo",
  "authors.editBio": "Biography",
  "authors.uploadPhoto": "Upload photo",
  "authors.removePhoto": "Remove photo",
  "authors.uploading": "Uploading...",
  "authors.save": "Save",
  "authors.cancel": "Cancel",
  "authors.saving": "Saving...",
  "authors.saveFailed": "Failed to save changes",
  "authors.addLocale": "Add language",
  "authors.born": "Born {{date}}",
  "authors.locale.en": "English",
  "authors.locale.de": "German",
  "authors.locale.es": "Spanish",
  "authors.locale.fr": "French",
  "authors.locale.it": "Italian",
  "authors.locale.nl": "Dutch",
  "authors.locale.pt": "Portuguese",
  "authors.locale.zh": "Chinese",
  "authors.locale.ja": "Japanese",
  "authors.locale.ko": "Korean",
```

- [ ] **Step 2: Add German translations**

Add to `packages/web/src/locales/de.json`:

```json
  "authors.edit": "Bearbeiten",
  "authors.editAuthor": "Autor bearbeiten",
  "authors.editName": "Name",
  "authors.editPhoto": "Foto",
  "authors.editBio": "Biografie",
  "authors.uploadPhoto": "Foto hochladen",
  "authors.removePhoto": "Foto entfernen",
  "authors.uploading": "Wird hochgeladen...",
  "authors.save": "Speichern",
  "authors.cancel": "Abbrechen",
  "authors.saving": "Wird gespeichert...",
  "authors.saveFailed": "Änderungen konnten nicht gespeichert werden",
  "authors.addLocale": "Sprache hinzufügen",
  "authors.born": "Geboren {{date}}",
  "authors.locale.en": "Englisch",
  "authors.locale.de": "Deutsch",
  "authors.locale.es": "Spanisch",
  "authors.locale.fr": "Französisch",
  "authors.locale.it": "Italienisch",
  "authors.locale.nl": "Niederländisch",
  "authors.locale.pt": "Portugiesisch",
  "authors.locale.zh": "Chinesisch",
  "authors.locale.ja": "Japanisch",
  "authors.locale.ko": "Koreanisch",
```

- [ ] **Step 3: Add Spanish translations**

Add to `packages/web/src/locales/es.json`:

```json
  "authors.edit": "Editar",
  "authors.editAuthor": "Editar autor",
  "authors.editName": "Nombre",
  "authors.editPhoto": "Foto",
  "authors.editBio": "Biografía",
  "authors.uploadPhoto": "Subir foto",
  "authors.removePhoto": "Eliminar foto",
  "authors.uploading": "Subiendo...",
  "authors.save": "Guardar",
  "authors.cancel": "Cancelar",
  "authors.saving": "Guardando...",
  "authors.saveFailed": "No se pudieron guardar los cambios",
  "authors.addLocale": "Añadir idioma",
  "authors.born": "Nacido el {{date}}",
  "authors.locale.en": "Inglés",
  "authors.locale.de": "Alemán",
  "authors.locale.es": "Español",
  "authors.locale.fr": "Francés",
  "authors.locale.it": "Italiano",
  "authors.locale.nl": "Neerlandés",
  "authors.locale.pt": "Portugués",
  "authors.locale.zh": "Chino",
  "authors.locale.ja": "Japonés",
  "authors.locale.ko": "Coreano",
```

- [ ] **Step 4: Add French translations**

Add to `packages/web/src/locales/fr.json`:

```json
  "authors.edit": "Modifier",
  "authors.editAuthor": "Modifier l'auteur",
  "authors.editName": "Nom",
  "authors.editPhoto": "Photo",
  "authors.editBio": "Biographie",
  "authors.uploadPhoto": "Télécharger une photo",
  "authors.removePhoto": "Supprimer la photo",
  "authors.uploading": "Téléchargement...",
  "authors.save": "Enregistrer",
  "authors.cancel": "Annuler",
  "authors.saving": "Enregistrement...",
  "authors.saveFailed": "Impossible d'enregistrer les modifications",
  "authors.addLocale": "Ajouter une langue",
  "authors.born": "Né le {{date}}",
  "authors.locale.en": "Anglais",
  "authors.locale.de": "Allemand",
  "authors.locale.es": "Espagnol",
  "authors.locale.fr": "Français",
  "authors.locale.it": "Italien",
  "authors.locale.nl": "Néerlandais",
  "authors.locale.pt": "Portugais",
  "authors.locale.zh": "Chinois",
  "authors.locale.ja": "Japonais",
  "authors.locale.ko": "Coréen",
```

- [ ] **Step 5: Add Italian translations**

Add to `packages/web/src/locales/it.json`:

```json
  "authors.edit": "Modifica",
  "authors.editAuthor": "Modifica autore",
  "authors.editName": "Nome",
  "authors.editPhoto": "Foto",
  "authors.editBio": "Biografia",
  "authors.uploadPhoto": "Carica foto",
  "authors.removePhoto": "Rimuovi foto",
  "authors.uploading": "Caricamento...",
  "authors.save": "Salva",
  "authors.cancel": "Annulla",
  "authors.saving": "Salvataggio...",
  "authors.saveFailed": "Impossibile salvare le modifiche",
  "authors.addLocale": "Aggiungi lingua",
  "authors.born": "Nato il {{date}}",
  "authors.locale.en": "Inglese",
  "authors.locale.de": "Tedesco",
  "authors.locale.es": "Spagnolo",
  "authors.locale.fr": "Francese",
  "authors.locale.it": "Italiano",
  "authors.locale.nl": "Olandese",
  "authors.locale.pt": "Portoghese",
  "authors.locale.zh": "Cinese",
  "authors.locale.ja": "Giapponese",
  "authors.locale.ko": "Coreano",
```

- [ ] **Step 6: Add Dutch translations**

Add to `packages/web/src/locales/nl.json`:

```json
  "authors.edit": "Bewerken",
  "authors.editAuthor": "Auteur bewerken",
  "authors.editName": "Naam",
  "authors.editPhoto": "Foto",
  "authors.editBio": "Biografie",
  "authors.uploadPhoto": "Foto uploaden",
  "authors.removePhoto": "Foto verwijderen",
  "authors.uploading": "Uploaden...",
  "authors.save": "Opslaan",
  "authors.cancel": "Annuleren",
  "authors.saving": "Opslaan...",
  "authors.saveFailed": "Wijzigingen konden niet worden opgeslagen",
  "authors.addLocale": "Taal toevoegen",
  "authors.born": "Geboren {{date}}",
  "authors.locale.en": "Engels",
  "authors.locale.de": "Duits",
  "authors.locale.es": "Spaans",
  "authors.locale.fr": "Frans",
  "authors.locale.it": "Italiaans",
  "authors.locale.nl": "Nederlands",
  "authors.locale.pt": "Portugees",
  "authors.locale.zh": "Chinees",
  "authors.locale.ja": "Japans",
  "authors.locale.ko": "Koreaans",
```

- [ ] **Step 7: Add Portuguese translations**

Add to `packages/web/src/locales/pt.json`:

```json
  "authors.edit": "Editar",
  "authors.editAuthor": "Editar autor",
  "authors.editName": "Nome",
  "authors.editPhoto": "Foto",
  "authors.editBio": "Biografia",
  "authors.uploadPhoto": "Carregar foto",
  "authors.removePhoto": "Remover foto",
  "authors.uploading": "Carregando...",
  "authors.save": "Salvar",
  "authors.cancel": "Cancelar",
  "authors.saving": "Salvando...",
  "authors.saveFailed": "Não foi possível salvar as alterações",
  "authors.addLocale": "Adicionar idioma",
  "authors.born": "Nascido em {{date}}",
  "authors.locale.en": "Inglês",
  "authors.locale.de": "Alemão",
  "authors.locale.es": "Espanhol",
  "authors.locale.fr": "Francês",
  "authors.locale.it": "Italiano",
  "authors.locale.nl": "Holandês",
  "authors.locale.pt": "Português",
  "authors.locale.zh": "Chinês",
  "authors.locale.ja": "Japonês",
  "authors.locale.ko": "Coreano",
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/locales/
git commit -m "feat(authors): add i18n keys for author edit modal and locale names in all 7 locales"
```

---

## Task 9: Author edit modal component

**Files:**
- Create: `packages/web/src/components/authors/author-edit-modal.tsx`

- [ ] **Step 1: Create the edit modal component**

Create `packages/web/src/components/authors/author-edit-modal.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/trpc";
import { getAccessToken } from "@/lib/auth";

const ALL_LOCALES = ["en", "de", "es", "fr", "it", "nl", "pt", "zh", "ja", "ko"] as const;

type Description = {
  locale: string;
  description: string;
  manuallyEdited: boolean;
};

type AuthorEditModalProps = {
  open: boolean;
  onClose: () => void;
  author: {
    id: string;
    name: string;
    imagePath: string | null;
    descriptions: Description[];
  };
};

export function AuthorEditModal({ open, onClose, author }: AuthorEditModalProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(author.name);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [activeLocale, setActiveLocale] = useState("en");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize descriptions from author data
  useEffect(() => {
    if (open) {
      setName(author.name);
      const descMap: Record<string, string> = {};
      for (const d of author.descriptions) {
        descMap[d.locale] = d.description;
      }
      setDescriptions(descMap);
      setActiveLocale(
        author.descriptions.length > 0 ? author.descriptions[0].locale : "en"
      );
      setError(null);
    }
  }, [open, author]);

  const updateMutation = trpc.authors.update.useMutation();
  const updateDescMutation = trpc.authors.updateDescription.useMutation();

  const localesWithContent = Object.keys(descriptions).filter((l) => descriptions[l]?.trim());
  const availableToAdd = ALL_LOCALES.filter((l) => !localesWithContent.includes(l));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Update name if changed
      if (name !== author.name) {
        await updateMutation.mutateAsync({ id: author.id, name });
      }

      // Update descriptions that changed
      const originalDescs: Record<string, string> = {};
      for (const d of author.descriptions) {
        originalDescs[d.locale] = d.description;
      }

      for (const [locale, desc] of Object.entries(descriptions)) {
        if (desc.trim() && desc !== originalDescs[locale]) {
          await updateDescMutation.mutateAsync({
            authorId: author.id,
            locale,
            description: desc.trim(),
          });
        }
      }

      utils.authors.byId.invalidate({ id: author.id });
      utils.authors.list.invalidate();
      onClose();
    } catch {
      setError(t("authors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAccessToken();
      const res = await fetch(`/api/authors/${author.id}/photo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (res.ok) {
        utils.authors.byId.invalidate({ id: author.id });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePhotoDelete = async () => {
    const token = getAccessToken();
    await fetch(`/api/authors/${author.id}/photo`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    utils.authors.byId.invalidate({ id: author.id });
  };

  const addLocale = (locale: string) => {
    setDescriptions((prev) => ({ ...prev, [locale]: "" }));
    setActiveLocale(locale);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("authors.editAuthor")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: "rgba(200,50,50,0.1)", color: "#c44" }}>
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
              {t("authors.editName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Photo */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
              {t("authors.editPhoto")}
            </label>
            <div className="flex items-center gap-3">
              {author.imagePath && (
                <img
                  src={`/api/authors/${author.id}/photo`}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover"
                />
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
              >
                {uploading ? t("authors.uploading") : t("authors.uploadPhoto")}
              </button>
              {author.imagePath && (
                <button
                  onClick={handlePhotoDelete}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "#c44" }}
                >
                  {t("authors.removePhoto")}
                </button>
              )}
            </div>
          </div>

          {/* Bio with locale tabs */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
              {t("authors.editBio")}
            </label>
            <div className="flex gap-1 mb-2 flex-wrap">
              {localesWithContent.map((locale) => (
                <button
                  key={locale}
                  onClick={() => setActiveLocale(locale)}
                  className="px-2 py-1 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activeLocale === locale ? "var(--warm)" : "var(--card)",
                    color: activeLocale === locale ? "white" : "var(--text-dim)",
                  }}
                >
                  {t(`authors.locale.${locale}`)}
                </button>
              ))}
              {/* Also show activeLocale tab if it's new and empty */}
              {!localesWithContent.includes(activeLocale) && (
                <button
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: "var(--warm)", color: "white" }}
                >
                  {t(`authors.locale.${activeLocale}`)}
                </button>
              )}
              {availableToAdd.length > 0 && (
                <select
                  onChange={(e) => { if (e.target.value) addLocale(e.target.value); e.target.value = ""; }}
                  className="px-2 py-1 rounded text-xs border outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text-dim)" }}
                  defaultValue=""
                >
                  <option value="" disabled>{t("authors.addLocale")}</option>
                  {availableToAdd.map((l) => (
                    <option key={l} value={l}>{t(`authors.locale.${l}`)}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              value={descriptions[activeLocale] ?? ""}
              onChange={(e) => setDescriptions((prev) => ({ ...prev, [activeLocale]: e.target.value }))}
              rows={5}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
              style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          >
            {t("authors.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ backgroundColor: "var(--warm)" }}
          >
            {saving ? t("authors.saving") : t("authors.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/authors/author-edit-modal.tsx
git commit -m "feat(authors): add admin edit modal with locale tabs and photo upload"
```

---

## Task 10: Update author detail page

**Files:**
- Modify: `packages/web/src/routes/_app/authors/$id.tsx`

- [ ] **Step 1: Rewrite the author detail page**

Replace `packages/web/src/routes/_app/authors/$id.tsx`:

```typescript
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/use-auth";
import { BookCard } from "@/components/books/book-card";
import { AuthorEditModal } from "@/components/authors/author-edit-modal";

export const Route = createFileRoute("/_app/authors/$id")({
  component: AuthorDetailPage,
});

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 35%)`;
}

function AuthorDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = Route.useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const query = trpc.authors.byId.useQuery({ id });
  const utils = trpc.useUtils();
  const refreshMutation = trpc.authors.refreshMetadata.useMutation({
    onSuccess: () => utils.authors.byId.invalidate({ id }),
  });
  const [editOpen, setEditOpen] = useState(false);

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: "var(--text-dim)" }}>Loading...</p>
      </div>
    );
  }

  const author = query.data;
  if (!author) return null;

  // Locale fallback: user locale → "en" → first available → null
  const currentLocale = i18n.language?.split("-")[0] ?? "en";
  const bio =
    author.descriptions.find((d: any) => d.locale === currentLocale)?.description ??
    author.descriptions.find((d: any) => d.locale === "en")?.description ??
    author.descriptions[0]?.description ??
    null;

  return (
    <div>
      {/* Author header */}
      <div className="flex gap-4 md:gap-6 mb-6 md:mb-8">
        <div
          className="w-24 h-24 md:w-[160px] md:h-[160px] rounded-full flex items-center justify-center text-2xl md:text-5xl font-bold text-white shrink-0 overflow-hidden"
          style={{ backgroundColor: hashColor(author.name) }}
        >
          {author.imagePath ? (
            <img
              src={`/api/authors/${author.id}/photo`}
              alt={author.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.textContent = getInitials(author.name);
              }}
            />
          ) : (
            getInitials(author.name)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1
                className="font-display text-xl md:text-2xl font-bold"
                style={{ color: "var(--text)" }}
              >
                {author.name}
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
                {t("authors.books", { count: author.books.length })}
              </p>
              {author.birthDate && (
                <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                  {t("authors.born", { date: author.birthDate })}
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                >
                  {t("authors.edit")}
                </button>
                <button
                  onClick={() => refreshMutation.mutate({ id })}
                  disabled={refreshMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--warm)" }}
                >
                  {refreshMutation.isPending ? "..." : t("authors.refreshMetadata")}
                </button>
              </div>
            )}
          </div>
          {bio ? (
            <p
              className="text-sm mt-3 leading-relaxed line-clamp-3"
              style={{ color: "var(--text-dim)" }}
            >
              {bio}
            </p>
          ) : (
            <p className="text-sm italic mt-3" style={{ color: "var(--text-faint)" }}>
              {t("authors.noBio")}
            </p>
          )}
        </div>
      </div>

      {/* Books section */}
      <h2
        className="font-display text-base font-bold mb-3"
        style={{ color: "var(--text)" }}
      >
        {t("authors.booksSection")}
      </h2>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {author.books.map((book: any) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            coverPath={book.coverPath}
          />
        ))}
      </div>

      {/* Edit modal */}
      {isAdmin && (
        <AuthorEditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          author={{
            id: author.id,
            name: author.name,
            imagePath: author.imagePath,
            descriptions: author.descriptions,
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/_app/authors/$id.tsx
git commit -m "feat(authors): update detail page with locale-aware bio, larger photo, admin controls"
```

---

## Task 11: Fix author photo URLs in author card

**Files:**
- Modify: `packages/web/src/components/authors/author-card.tsx`

- [ ] **Step 1: Update photo URL**

In `packages/web/src/components/authors/author-card.tsx`, change the image `src` from:

```typescript
src={`/api/storage/${imagePath}`}
```

to:

```typescript
src={`/api/authors/${id}/photo`}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/authors/author-card.tsx
git commit -m "fix(authors): use correct photo serving URL in author cards"
```

---

## Task 12: Build and test

- [ ] **Step 1: Build shared package**

Run:
```bash
pnpm build:shared
```

Expected: Compiles without errors.

- [ ] **Step 2: Run all server tests**

Run:
```bash
pnpm test:server
```

Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run:
```bash
pnpm lint
```

Expected: No lint errors.

- [ ] **Step 4: Build full project**

Run:
```bash
pnpm build
```

Expected: Builds without errors.

- [ ] **Step 5: Browser test**

Start dev server and manually verify:
```bash
pnpm dev
```

1. Visit `/authors` — cards should show (photos won't load until enrichment runs)
2. Click an author — detail page shows with correct layout, birth date if available
3. As admin: "Edit" and "Refresh Metadata" buttons are visible
4. As admin: click "Refresh Metadata" — should enrich from Wikidata, bio appears in current locale
5. As admin: click "Edit" — modal opens, can switch locale tabs, edit bio, upload photo
6. As non-admin: "Edit" and "Refresh Metadata" buttons are NOT visible

- [ ] **Step 6: Commit any fixes**

If any issues found during testing, fix and commit.
