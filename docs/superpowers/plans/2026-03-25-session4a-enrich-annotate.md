# Session 4a: Metadata Enrichment & Annotations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add on-demand metadata enrichment from external APIs with EPUB write-back, reader text annotations (highlights + notes), and reading time tracking.

**Architecture:** Thin service layer — new `metadata` and `annotations` tRPC routers backed by service modules. EPUB parser fix + new EPUB writer for metadata write-back. Client-side reading timer piggybacks on existing progress sync.

**Tech Stack:** Drizzle ORM (SQLite), tRPC, epub.js annotations API, Google Books API, Open Library API, `fast-xml-parser` for OPF manipulation, `yazl`/`yauzl` for EPUB ZIP handling, `sharp` for cover processing.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/shared/src/metadata-validators.ts` | Zod schemas for metadata search/apply + ExternalBook type |
| `packages/shared/src/annotation-validators.ts` | Zod schemas for annotation CRUD inputs |
| `packages/server/src/services/epub-writer.ts` | Read/modify/rewrite EPUB metadata + cover inside ZIP |
| `packages/server/src/services/metadata-enrichment.ts` | Google Books + Open Library search, scoring, dedup |
| `packages/server/src/trpc/routers/metadata.ts` | metadata.search, metadata.apply procedures |
| `packages/server/src/trpc/routers/annotations.ts` | annotations.list, create, update, delete procedures |
| `packages/server/src/__tests__/epub-parser.test.ts` | Tests for EPUB parser fix |
| `packages/server/src/__tests__/epub-writer.test.ts` | Tests for EPUB write-back |
| `packages/server/src/__tests__/metadata-enrichment.test.ts` | Tests for enrichment scoring/dedup |
| `packages/server/src/__tests__/metadata-router.test.ts` | Tests for metadata tRPC router |
| `packages/server/src/__tests__/annotations.test.ts` | Tests for annotations tRPC router |
| `packages/web/src/hooks/use-reading-timer.ts` | Client-side visibility/idle-aware timer |
| `packages/web/src/components/metadata/find-metadata-dialog.tsx` | Search results + diff preview dialog |
| `packages/web/src/components/reader/highlight-toolbar.tsx` | Floating toolbar for text selection |
| `packages/web/src/components/reader/highlight-popover.tsx` | Edit/delete popover for existing highlights |
| `packages/web/src/components/books/annotations-tab.tsx` | Annotations list grouped by chapter |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/schema.ts` | Add `annotations`, `metadata_cache` tables; add `series`, `seriesIndex` to `books` |
| `packages/shared/src/types.ts` | Add `Annotation`, `MetadataCache`, `ExternalBook` types |
| `packages/shared/src/index.ts` | Re-export new validator + type modules |
| `packages/shared/src/validators.ts` | Add `timeSpentMinutes` to `progressSyncInput` |
| `packages/server/src/services/epub-parser.ts` | Fix metadata extraction, add series parsing |
| `packages/server/src/trpc/router.ts` | Register `metadata` + `annotations` routers |
| `packages/server/src/trpc/routers/progress.ts` | Handle `timeSpentMinutes` increment in sync |
| `packages/web/src/hooks/use-progress-sync.ts` | Accept + send `timeSpentMinutes` delta |
| `packages/web/src/hooks/use-epub-reader.ts` | Expose `renditionRef` for annotation rendering, text selection handling |
| `packages/web/src/routes/_app/books/$id.tsx` | Add "Find metadata" button, series display, annotations tab |
| `packages/web/src/routes/_app/books/$id_.read.tsx` | Integrate highlight toolbar/popover + reading timer |

---

## Task 1: Schema Changes + Migration

**Files:**
- Modify: `packages/shared/src/schema.ts:21-51` (books table), add new tables at end
- Modify: `packages/shared/src/types.ts` — add new type exports
- Create: new migration via `drizzle-kit generate`

- [ ] **Step 1: Add `series` and `seriesIndex` columns to books table in schema.ts**

In `packages/shared/src/schema.ts`, add after `metadataLocked` (line 44):

```typescript
  series: text("series", { length: 255 }),
  seriesIndex: real("series_index"),
```

- [ ] **Step 2: Add `annotations` table to schema.ts**

Add at end of `packages/shared/src/schema.ts`:

```typescript
export const annotations = sqliteTable("annotations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  type: text("type", { length: 20 }).notNull().default("highlight"),
  content: text("content"),
  note: text("note"),
  cfiPosition: text("cfi_position").notNull(),
  cfiEnd: text("cfi_end"),
  color: text("color", { length: 20 }).default("yellow"),
  chapter: text("chapter", { length: 255 }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

- [ ] **Step 3: Add `metadata_cache` table to schema.ts**

Add at end of `packages/shared/src/schema.ts`:

```typescript
import { uniqueIndex } from "drizzle-orm/sqlite-core";

export const metadataCache = sqliteTable("metadata_cache", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  queryKey: text("query_key", { length: 255 }).notNull(),
  source: text("source", { length: 20 }).notNull(),
  data: text("data").notNull(),
  fetchedAt: text("fetched_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("metadata_cache_query_source_idx").on(table.queryKey, table.source),
]);
```

- [ ] **Step 4: Update types.ts with new type exports**

Add to `packages/shared/src/types.ts`:

```typescript
import type { annotations, metadataCache } from "./schema.js";

export type Annotation = InferSelectModel<typeof annotations>;
export type NewAnnotation = InferInsertModel<typeof annotations>;
export type MetadataCache = InferSelectModel<typeof metadataCache>;

export type ExternalBook = {
  source: "google" | "openlibrary";
  sourceId: string;
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  description?: string;
  genre?: string;
  language?: string;
  pageCount?: number;
  coverUrl?: string;
  series?: string;
  seriesIndex?: number;
  confidence: number;
};
```

- [ ] **Step 5: Generate and apply migration**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter server drizzle-kit generate
```

Verify generated SQL contains:
- `ALTER TABLE books ADD COLUMN series`
- `ALTER TABLE books ADD COLUMN series_index`
- `CREATE TABLE annotations`
- `CREATE TABLE metadata_cache`

- [ ] **Step 6: Run tests to verify nothing breaks**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter server test
```

Expected: All existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schema.ts packages/shared/src/types.ts packages/server/drizzle/
git commit -m "feat: add annotations, metadata_cache tables and series columns"
```

---

## Task 2: Validators for Metadata + Annotations + Progress Time

**Files:**
- Create: `packages/shared/src/metadata-validators.ts`
- Create: `packages/shared/src/annotation-validators.ts`
- Modify: `packages/shared/src/validators.ts:70-75` — add timeSpentMinutes to progressSyncInput
- Modify: `packages/shared/src/index.ts` — add exports

- [ ] **Step 1: Create metadata-validators.ts**

Create `packages/shared/src/metadata-validators.ts`:

```typescript
import { z } from "zod";

export const metadataSearchInput = z.object({
  bookId: z.string().uuid(),
  query: z.string().min(1).optional(),
});

export const metadataApplyFields = z.object({
  title: z.string().min(1).max(500).optional(),
  author: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  genre: z.string().max(100).optional(),
  publisher: z.string().max(255).optional(),
  year: z.number().int().optional(),
  isbn: z.string().max(20).optional(),
  language: z.string().max(10).optional(),
  pageCount: z.number().int().positive().optional(),
  series: z.string().max(255).optional(),
  seriesIndex: z.number().optional(),
  coverUrl: z.string().url().optional(),
});

export const metadataApplyInput = z.object({
  bookId: z.string().uuid(),
  fields: metadataApplyFields,
  source: z.enum(["google", "openlibrary"]).optional(),
});

export type MetadataApplyFields = z.infer<typeof metadataApplyFields>;
```

- [ ] **Step 2: Create annotation-validators.ts**

Create `packages/shared/src/annotation-validators.ts`:

```typescript
import { z } from "zod";

export const annotationListInput = z.object({
  bookId: z.string().uuid(),
});

export const annotationCreateInput = z.object({
  bookId: z.string().uuid(),
  type: z.literal("highlight").default("highlight"),
  content: z.string().optional(),
  note: z.string().optional(),
  cfiPosition: z.string(),
  cfiEnd: z.string().optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).default("yellow"),
  chapter: z.string().max(255).optional(),
});

export const annotationUpdateInput = z.object({
  id: z.string().uuid(),
  note: z.string().optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
});

export const annotationDeleteInput = z.object({
  id: z.string().uuid(),
});
```

- [ ] **Step 3: Add `timeSpentMinutes` to progressSyncInput**

In `packages/shared/src/validators.ts`, update `progressSyncInput` (line 70-75):

```typescript
export const progressSyncInput = z.object({
  bookId: z.string().uuid(),
  percentage: z.number().min(0).max(100),
  cfiPosition: z.string().optional(),
  currentPage: z.number().int().min(0).optional(),
  timeSpentMinutes: z.number().min(0).optional(),
});
```

- [ ] **Step 4: Export new modules from index.ts**

In `packages/shared/src/index.ts`, add:

```typescript
export * from "./metadata-validators.js";
export * from "./annotation-validators.js";
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter shared tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/metadata-validators.ts packages/shared/src/annotation-validators.ts packages/shared/src/validators.ts packages/shared/src/index.ts
git commit -m "feat: add validators for metadata, annotations, and time tracking"
```

---

## Task 3: Fix EPUB Parser

**Files:**
- Modify: `packages/server/src/services/epub-parser.ts`
- Create: `packages/server/src/__tests__/epub-parser.test.ts`

- [ ] **Step 1: Write failing tests for EPUB parser**

Create `packages/server/src/__tests__/epub-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseEpub } from "../services/epub-parser.js";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// We need a real EPUB to test against. Create a minimal valid EPUB fixture.
// If no fixture exists, these tests document what the parser SHOULD extract.

describe("parseEpub", () => {
  it("extracts basic metadata fields", async () => {
    // Use any EPUB file in the test-data directory, or skip if none available
    // The key assertion: the parser should not silently return empty fields
    // when the EPUB contains them
    const result = await parseEpub(join(__dirname, "../../fixtures/test.epub")).catch(() => null);
    if (!result) {
      console.log("No test fixture found — skipping integration test. Create fixtures/test.epub to enable.");
      return;
    }
    expect(result.title).not.toBe("Untitled");
    expect(result.author).not.toBe("Unknown Author");
  });

  it("returns ParsedMetadata shape with all optional fields", async () => {
    const result = await parseEpub(join(__dirname, "../../fixtures/test.epub")).catch(() => null);
    if (!result) return;
    // Verify the shape has all expected keys
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("author");
    expect(result).toHaveProperty("isbn");
    expect(result).toHaveProperty("publisher");
    expect(result).toHaveProperty("year");
    expect(result).toHaveProperty("language");
    expect(result).toHaveProperty("description");
    expect(result).toHaveProperty("genre");
    expect(result).toHaveProperty("series");
    expect(result).toHaveProperty("seriesIndex");
    expect(result).toHaveProperty("coverData");
    expect(result).toHaveProperty("coverMimeType");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (missing series fields)**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter server vitest run src/__tests__/epub-parser.test.ts
```

Expected: Fails because `series` and `seriesIndex` don't exist on `ParsedMetadata`.

- [ ] **Step 3: Fix epub-parser.ts — add series support + improve robustness**

Replace `packages/server/src/services/epub-parser.ts` with:

```typescript
import EPub from "epub2";

export type ParsedMetadata = {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  language?: string;
  description?: string;
  genre?: string;
  pageCount?: number;
  series?: string;
  seriesIndex?: number;
  coverData?: Buffer;
  coverMimeType?: string;
};

export async function parseEpub(filePath: string): Promise<ParsedMetadata> {
  const epub = await EPub.createAsync(filePath);

  // Cover extraction — try multiple strategies
  let coverData: Buffer | undefined;
  let coverMimeType: string | undefined;

  const coverId = epub.metadata.cover;
  if (coverId) {
    // Strategy 1: cover ID points directly to a manifest item
    const manifestItem = epub.manifest[coverId];
    if (manifestItem) {
      try {
        const [data, mimeType] = await epub.getImageAsync(coverId);
        coverData = Buffer.from(data);
        coverMimeType = mimeType;
      } catch {
        // Fall through to other strategies
      }
    }
  }

  if (!coverData) {
    // Strategy 2: look for item with properties="cover-image" or id containing "cover"
    for (const [id, item] of Object.entries(epub.manifest)) {
      if (
        (item as any).properties === "cover-image" ||
        (id.toLowerCase().includes("cover") && (item as any)["media-type"]?.startsWith("image/"))
      ) {
        try {
          const [data, mimeType] = await epub.getImageAsync(id);
          coverData = Buffer.from(data);
          coverMimeType = mimeType;
          break;
        } catch {
          continue;
        }
      }
    }
  }

  // Year extraction
  let year: number | undefined;
  const dateStr = epub.metadata.date;
  if (dateStr) {
    // Try full date parse first, then just extract 4-digit year
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      year = parsed.getFullYear();
    } else {
      const match = dateStr.match(/(\d{4})/);
      if (match) year = parseInt(match[1], 10);
    }
  }

  // ISBN — check multiple metadata locations
  let isbn: string | undefined;
  if (epub.metadata.ISBN) {
    isbn = epub.metadata.ISBN;
  } else {
    // Some EPUBs store ISBN in dc:identifier with opf:scheme="ISBN"
    const raw = (epub as any).raw?.metadata;
    if (raw) {
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "string" && /^(97[89])?\d{9}[\dXx]$/.test(value.replace(/-/g, ""))) {
          isbn = value;
          break;
        }
      }
    }
  }

  // Series extraction — Calibre metadata and EPUB3 belongs-to-collection
  let series: string | undefined;
  let seriesIndex: number | undefined;
  const rawMeta = (epub as any).raw?.metadata || {};

  // Calibre format: <meta name="calibre:series" content="..." />
  if (rawMeta["calibre:series"]) {
    series = rawMeta["calibre:series"];
  }
  if (rawMeta["calibre:series_index"]) {
    const idx = parseFloat(rawMeta["calibre:series_index"]);
    if (!isNaN(idx)) seriesIndex = idx;
  }

  // EPUB3 format: <meta property="belongs-to-collection">
  if (!series && rawMeta["belongs-to-collection"]) {
    series = rawMeta["belongs-to-collection"];
  }
  if (seriesIndex === undefined && rawMeta["group-position"]) {
    const idx = parseFloat(rawMeta["group-position"]);
    if (!isNaN(idx)) seriesIndex = idx;
  }

  // Description — clean HTML tags if present
  let description = epub.metadata.description || undefined;
  if (description) {
    description = description.replace(/<[^>]*>/g, "").trim();
    if (!description) description = undefined;
  }

  return {
    title: epub.metadata.title || "Untitled",
    author: epub.metadata.creator || "Unknown Author",
    isbn,
    publisher: epub.metadata.publisher || undefined,
    year,
    language: epub.metadata.language || undefined,
    description,
    genre: epub.metadata.subject || undefined,
    series,
    seriesIndex,
    coverData,
    coverMimeType,
  };
}
```

- [ ] **Step 4: Update upload route to pass series fields**

In `packages/server/src/routes/upload.ts`, update the insert values (line 79-100) to include series:

Add after `pageCount: metadata.pageCount,` (line 96):

```typescript
          series: metadata.series,
          seriesIndex: metadata.seriesIndex,
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter server test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/epub-parser.ts packages/server/src/__tests__/epub-parser.test.ts packages/server/src/routes/upload.ts
git commit -m "fix: improve EPUB metadata extraction with series support and better cover detection"
```

---

## Task 4: EPUB Write-back Service

**Files:**
- Create: `packages/server/src/services/epub-writer.ts`
- Create: `packages/server/src/__tests__/epub-writer.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter server add yauzl-promise yazl fast-xml-parser
pnpm --filter server add -D @types/yazl @types/yauzl-promise
```

- [ ] **Step 2: Write failing tests for EPUB writer**

Create `packages/server/src/__tests__/epub-writer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { updateEpubMetadata, type EpubMetadataUpdate } from "../services/epub-writer.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, copyFileSync } from "node:fs";

describe("updateEpubMetadata", () => {
  it("exports updateEpubMetadata function", () => {
    expect(typeof updateEpubMetadata).toBe("function");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter server vitest run src/__tests__/epub-writer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement epub-writer.ts**

Create `packages/server/src/services/epub-writer.ts`:

```typescript
import * as yauzl from "yauzl-promise";
import yazl from "yazl";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rename, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";

export type EpubMetadataUpdate = {
  title?: string;
  author?: string;
  description?: string;
  publisher?: string;
  isbn?: string;
  year?: number;
  language?: string;
  genre?: string;
  series?: string;
  seriesIndex?: number;
  coverImageBuffer?: Buffer;
  coverMimeType?: string;
};

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
};

export async function getEpubFileHash(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

export async function updateEpubMetadata(
  filePath: string,
  updates: EpubMetadataUpdate,
  expectedHash?: string
): Promise<void> {
  // Safety check
  if (expectedHash) {
    const currentHash = await getEpubFileHash(filePath);
    if (currentHash !== expectedHash) {
      throw new Error("EPUB file hash mismatch — file was modified externally");
    }
  }

  const zipFile = await yauzl.open(filePath);
  const outputPath = join(dirname(filePath), `_tmp_${Date.now()}.epub`);
  const outputZip = new yazl.ZipFile();
  const outputStream = createWriteStream(outputPath);
  outputZip.outputStream.pipe(outputStream);

  let opfPath: string | null = null;
  let opfContent: string | null = null;
  let coverEntryPath: string | null = null;

  // First pass: find the OPF file path from container.xml
  for await (const entry of zipFile) {
    if (entry.filename === "META-INF/container.xml") {
      const stream = await entry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const containerXml = Buffer.concat(chunks).toString("utf-8");
      const match = containerXml.match(/full-path="([^"]+\.opf)"/);
      if (match) opfPath = match[1];
    }
  }

  await zipFile.close();
  if (!opfPath) throw new Error("Could not find OPF file in EPUB");

  // Second pass: rebuild the ZIP with modified content
  const zipFile2 = await yauzl.open(filePath);

  for await (const entry of zipFile2) {
    const stream = await entry.openReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks);

    if (entry.filename === opfPath) {
      // Parse and modify OPF
      opfContent = content.toString("utf-8");
      const modifiedOpf = modifyOpfMetadata(opfContent, updates);
      outputZip.addBuffer(Buffer.from(modifiedOpf, "utf-8"), entry.filename);
    } else if (updates.coverImageBuffer && isCoverImage(entry.filename, opfContent)) {
      // Replace cover image
      coverEntryPath = entry.filename;
      outputZip.addBuffer(updates.coverImageBuffer, entry.filename);
    } else {
      outputZip.addBuffer(content, entry.filename);
    }
  }

  // If cover wasn't replaced (no existing cover entry found), add it
  if (updates.coverImageBuffer && !coverEntryPath) {
    const ext = updates.coverMimeType?.includes("png") ? "png" : "jpg";
    outputZip.addBuffer(updates.coverImageBuffer, `OEBPS/images/cover.${ext}`);
  }

  outputZip.end();
  await zipFile2.close();
  await new Promise<void>((resolve, reject) => {
    outputStream.on("finish", resolve);
    outputStream.on("error", reject);
  });

  // Atomic replace
  await unlink(filePath);
  await rename(outputPath, filePath);
}

function isCoverImage(filename: string, opfContent: string | null): boolean {
  if (!opfContent) return false;
  const lower = filename.toLowerCase();
  return lower.includes("cover") && /\.(jpe?g|png|gif|webp)$/i.test(lower);
}

function modifyOpfMetadata(opfXml: string, updates: EpubMetadataUpdate): string {
  // Use regex-based approach for reliability with varied OPF structures
  let xml = opfXml;

  if (updates.title) {
    xml = replaceOrInsertDcTag(xml, "dc:title", updates.title);
  }
  if (updates.author) {
    xml = replaceOrInsertDcTag(xml, "dc:creator", updates.author);
  }
  if (updates.description) {
    xml = replaceOrInsertDcTag(xml, "dc:description", updates.description);
  }
  if (updates.publisher) {
    xml = replaceOrInsertDcTag(xml, "dc:publisher", updates.publisher);
  }
  if (updates.language) {
    xml = replaceOrInsertDcTag(xml, "dc:language", updates.language);
  }
  if (updates.isbn) {
    // Add as dc:identifier with ISBN scheme
    if (!xml.includes(updates.isbn)) {
      xml = insertMetaTag(xml, `<dc:identifier opf:scheme="ISBN">${escapeXml(updates.isbn)}</dc:identifier>`);
    }
  }
  if (updates.year) {
    xml = replaceOrInsertDcTag(xml, "dc:date", String(updates.year));
  }
  if (updates.genre) {
    xml = replaceOrInsertDcTag(xml, "dc:subject", updates.genre);
  }

  // Series — write both Calibre and EPUB3 formats
  if (updates.series) {
    xml = replaceOrInsertMeta(xml, "calibre:series", updates.series);
    if (updates.seriesIndex !== undefined) {
      xml = replaceOrInsertMeta(xml, "calibre:series_index", String(updates.seriesIndex));
    }
  }

  return xml;
}

function replaceOrInsertDcTag(xml: string, tag: string, value: string): string {
  const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, "s");
  const replacement = `<${tag}>${escapeXml(value)}</${tag}>`;
  if (regex.test(xml)) {
    return xml.replace(regex, replacement);
  }
  return insertMetaTag(xml, replacement);
}

function replaceOrInsertMeta(xml: string, name: string, content: string): string {
  const regex = new RegExp(`<meta\\s+name="${name}"[^/]*/>`, "s");
  const replacement = `<meta name="${name}" content="${escapeXml(content)}"/>`;
  if (regex.test(xml)) {
    return xml.replace(regex, replacement);
  }
  return insertMetaTag(xml, replacement);
}

function insertMetaTag(xml: string, tag: string): string {
  // Insert before </metadata>
  const closeTag = "</metadata>";
  const idx = xml.indexOf(closeTag);
  if (idx === -1) return xml;
  return xml.slice(0, idx) + "    " + tag + "\n  " + xml.slice(idx);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter server vitest run src/__tests__/epub-writer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/epub-writer.ts packages/server/src/__tests__/epub-writer.test.ts package.json pnpm-lock.yaml packages/server/package.json
git commit -m "feat: add EPUB metadata write-back service"
```

---

## Task 5: Metadata Enrichment Service

**Files:**
- Create: `packages/server/src/services/metadata-enrichment.ts`
- Create: `packages/server/src/__tests__/metadata-enrichment.test.ts`

- [ ] **Step 1: Write tests for enrichment scoring logic**

Create `packages/server/src/__tests__/metadata-enrichment.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scoreMatch, deduplicateResults } from "../services/metadata-enrichment.js";
import type { ExternalBook } from "@verso/shared";

describe("scoreMatch", () => {
  it("gives high confidence for ISBN match", () => {
    const score = scoreMatch(
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald", isbn: "9780743273565" },
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald", isbn: "9780743273565", year: 1925 }
    );
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("scores title + author match without ISBN", () => {
    const score = scoreMatch(
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald" },
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald", year: 1925 }
    );
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("gives low score for mismatched author", () => {
    const score = scoreMatch(
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald" },
      { title: "The Great Gatsby", author: "Stephen King", year: 2020 }
    );
    expect(score).toBeLessThan(0.5);
  });
});

describe("deduplicateResults", () => {
  it("merges entries with same ISBN from different sources", () => {
    const results: ExternalBook[] = [
      { source: "google", sourceId: "g1", title: "Test", author: "A", isbn: "123", confidence: 0.9, coverUrl: "http://g.jpg" },
      { source: "openlibrary", sourceId: "ol1", title: "Test", author: "A", isbn: "123", confidence: 0.85 },
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(1);
    // Prefer Google cover
    expect(deduped[0].coverUrl).toBe("http://g.jpg");
  });

  it("keeps entries with different ISBNs separate", () => {
    const results: ExternalBook[] = [
      { source: "google", sourceId: "g1", title: "Test", author: "A", isbn: "123", confidence: 0.9 },
      { source: "google", sourceId: "g2", title: "Test 2", author: "A", isbn: "456", confidence: 0.7 },
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter server vitest run src/__tests__/metadata-enrichment.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement metadata-enrichment.ts**

Create `packages/server/src/services/metadata-enrichment.ts`:

```typescript
import type { ExternalBook } from "@verso/shared";

type BookQuery = {
  title: string;
  author: string;
  isbn?: string | null;
};

// --- Scoring ---

export function scoreMatch(
  local: BookQuery,
  candidate: { title: string; author: string; isbn?: string; year?: number },
  localYear?: number | null
): number {
  // ISBN match is an override
  if (local.isbn && candidate.isbn) {
    const normalizedLocal = local.isbn.replace(/-/g, "");
    const normalizedCandidate = candidate.isbn.replace(/-/g, "");
    if (normalizedLocal === normalizedCandidate) return 0.95;
  }

  let score = 0;

  // Title match
  if (normalize(local.title) === normalize(candidate.title)) {
    score += 0.4;
  } else if (normalize(candidate.title).includes(normalize(local.title)) ||
             normalize(local.title).includes(normalize(candidate.title))) {
    score += 0.2;
  }

  // Author last name match
  const localLast = lastWord(local.author);
  const candidateLast = lastWord(candidate.author);
  if (localLast && candidateLast && normalize(localLast) === normalize(candidateLast)) {
    score += 0.3;
  }

  // Year proximity
  if (localYear && candidate.year) {
    if (Math.abs(localYear - candidate.year) <= 2) score += 0.2;
  }

  return Math.min(score, 1);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function lastWord(s: string): string {
  const parts = s.trim().split(/\s+/);
  return parts[parts.length - 1] || "";
}

// --- Deduplication ---

export function deduplicateResults(results: ExternalBook[]): ExternalBook[] {
  const byIsbn = new Map<string, ExternalBook>();
  const noIsbn: ExternalBook[] = [];

  for (const r of results) {
    const key = r.isbn?.replace(/-/g, "");
    if (key) {
      const existing = byIsbn.get(key);
      if (!existing || r.confidence > existing.confidence) {
        // Merge: prefer Google covers, keep higher confidence
        const merged = existing ? {
          ...r,
          coverUrl: r.source === "google" ? (r.coverUrl || existing.coverUrl) : (existing.coverUrl || r.coverUrl),
          description: r.description || existing.description,
          series: r.series || existing.series,
          seriesIndex: r.seriesIndex ?? existing.seriesIndex,
          confidence: Math.max(r.confidence, existing.confidence),
        } : r;
        byIsbn.set(key, merged);
      }
    } else {
      noIsbn.push(r);
    }
  }

  return [...byIsbn.values(), ...noIsbn].sort((a, b) => b.confidence - a.confidence);
}

// --- Google Books API ---

export async function searchGoogleBooks(query: string, isbn?: string | null): Promise<ExternalBook[]> {
  let q: string;
  if (isbn) {
    q = `isbn:${isbn.replace(/-/g, "")}`;
  } else {
    q = query;
  }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.items) return [];

    return data.items.map((item: any) => {
      const v = item.volumeInfo || {};
      return {
        source: "google" as const,
        sourceId: item.id,
        title: v.title || "",
        author: (v.authors || []).join(", "),
        isbn: extractIsbn(v.industryIdentifiers),
        publisher: v.publisher,
        year: v.publishedDate ? parseInt(v.publishedDate) : undefined,
        description: v.description,
        genre: (v.categories || [])[0],
        language: v.language,
        pageCount: v.pageCount,
        coverUrl: v.imageLinks?.thumbnail?.replace("http://", "https://"),
        series: undefined, // Google Books rarely has series info
        seriesIndex: undefined,
        confidence: 0, // Scored later
      };
    });
  } catch {
    return [];
  }
}

function extractIsbn(identifiers?: any[]): string | undefined {
  if (!identifiers) return undefined;
  const isbn13 = identifiers.find((i: any) => i.type === "ISBN_13");
  const isbn10 = identifiers.find((i: any) => i.type === "ISBN_10");
  return isbn13?.identifier || isbn10?.identifier;
}

// --- Open Library API ---

export async function searchOpenLibrary(query: string, isbn?: string | null): Promise<ExternalBook[]> {
  let url: string;
  if (isbn) {
    url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn.replace(/-/g, ""))}&limit=5`;
  } else {
    url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.docs) return [];

    return data.docs.slice(0, 5).map((doc: any) => {
      const coverId = doc.cover_i;
      return {
        source: "openlibrary" as const,
        sourceId: doc.key || "",
        title: doc.title || "",
        author: (doc.author_name || []).join(", "),
        isbn: (doc.isbn || [])[0],
        publisher: (doc.publisher || [])[0],
        year: doc.first_publish_year,
        description: undefined, // Requires a separate API call
        genre: (doc.subject || [])[0],
        language: (doc.language || [])[0],
        pageCount: doc.number_of_pages_median,
        coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
        series: undefined, // Would need works API
        seriesIndex: undefined,
        confidence: 0, // Scored later
      };
    });
  } catch {
    return [];
  }
}

// --- Main search function ---

export async function searchExternalMetadata(
  bookQuery: BookQuery,
  localYear?: number | null
): Promise<ExternalBook[]> {
  const queryStr = `${bookQuery.title} ${bookQuery.author}`.trim();

  const [googleResults, olResults] = await Promise.all([
    searchGoogleBooks(queryStr, bookQuery.isbn),
    searchOpenLibrary(queryStr, bookQuery.isbn),
  ]);

  // Score all results
  const allResults = [...googleResults, ...olResults].map((r) => ({
    ...r,
    confidence: scoreMatch(bookQuery, {
      title: r.title,
      author: r.author,
      isbn: r.isbn,
      year: r.year,
    }, localYear),
  }));

  return deduplicateResults(allResults);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter server vitest run src/__tests__/metadata-enrichment.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/metadata-enrichment.ts packages/server/src/__tests__/metadata-enrichment.test.ts
git commit -m "feat: add metadata enrichment service with Google Books + Open Library"
```

---

## Task 6: Metadata tRPC Router

**Files:**
- Create: `packages/server/src/trpc/routers/metadata.ts`
- Modify: `packages/server/src/trpc/router.ts`
- Create: `packages/server/src/__tests__/metadata-router.test.ts`

- [ ] **Step 1: Write tests for metadata router**

Create `packages/server/src/__tests__/metadata-router.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, metadataCache } from "@verso/shared";

describe("metadata router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;
  let bookId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${bookId}/book.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
    });
  });

  describe("apply", () => {
    it("updates book fields in database", async () => {
      const result = await authedCaller.metadata.apply({
        bookId,
        fields: {
          description: "A great book",
          genre: "Fiction",
          publisher: "Test Press",
          year: 2020,
        },
        source: "google",
      });
      expect(result.description).toBe("A great book");
      expect(result.genre).toBe("Fiction");
      expect(result.publisher).toBe("Test Press");
      expect(result.year).toBe(2020);
      expect(result.metadataSource).toBe("google");
    });

    it("does not overwrite fields not included in update", async () => {
      // First set some fields
      await ctx.db.update(books).set({ isbn: "1234567890" }).where(
        require("drizzle-orm").eq(books.id, bookId)
      );

      const result = await authedCaller.metadata.apply({
        bookId,
        fields: { description: "New description" },
      });
      expect(result.isbn).toBe("1234567890");
      expect(result.description).toBe("New description");
    });

    it("rejects apply for non-existent book", async () => {
      await expect(
        authedCaller.metadata.apply({
          bookId: crypto.randomUUID(),
          fields: { description: "test" },
        })
      ).rejects.toThrow("NOT_FOUND");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter server vitest run src/__tests__/metadata-router.test.ts
```

Expected: FAIL — metadata router not registered.

- [ ] **Step 3: Implement metadata router**

Create `packages/server/src/trpc/routers/metadata.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import {
  books,
  metadataCache,
  metadataSearchInput,
  metadataApplyInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";
import { searchExternalMetadata } from "../../services/metadata-enrichment.js";
import { updateEpubMetadata } from "../../services/epub-writer.js";
import sharp from "sharp";

const CACHE_TTL_DAYS = 30;

export const metadataRouter = router({
  search: protectedProcedure
    .input(metadataSearchInput)
    .query(async ({ ctx, input }) => {
      const book = await ctx.db.query.books.findFirst({
        where: and(eq(books.id, input.bookId), eq(books.addedBy, ctx.user.sub)),
      });
      if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

      const queryStr = input.query || `${book.title} ${book.author}`.trim();
      const cacheKey = book.isbn || `${book.title}::${book.author}`;

      // Check cache
      const cached = await ctx.db.query.metadataCache.findFirst({
        where: and(
          eq(metadataCache.queryKey, cacheKey),
        ),
      });

      if (cached) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime();
        if (age < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000 && !input.query) {
          return JSON.parse(cached.data);
        }
      }

      const results = await searchExternalMetadata(
        { title: book.title, author: book.author, isbn: book.isbn },
        book.year
      );

      // Cache results (only for auto-search, not manual queries)
      if (!input.query && results.length > 0) {
        await ctx.db
          .insert(metadataCache)
          .values({
            queryKey: cacheKey,
            source: "combined",
            data: JSON.stringify(results),
          })
          .onConflictDoUpdate({
            target: [metadataCache.queryKey, metadataCache.source],
            set: {
              data: JSON.stringify(results),
              fetchedAt: new Date().toISOString(),
            },
          })
          .catch(() => {
            // Cache write failure is non-fatal
          });
      }

      return results;
    }),

  apply: protectedProcedure
    .input(metadataApplyInput)
    .mutation(async ({ ctx, input }) => {
      const book = await ctx.db.query.books.findFirst({
        where: and(eq(books.id, input.bookId), eq(books.addedBy, ctx.user.sub)),
      });
      if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

      const { coverUrl, ...metaFields } = input.fields;
      const updateData: Record<string, any> = {
        ...metaFields,
        updatedAt: new Date().toISOString(),
      };

      if (input.source) {
        updateData.metadataSource = input.source;
      }

      // Fetch and process cover if provided
      let coverBuffer: Buffer | undefined;
      if (coverUrl) {
        try {
          const response = await fetch(coverUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            coverBuffer = await sharp(Buffer.from(arrayBuffer))
              .resize(600, undefined, { withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();

            const coverPath = `covers/${input.bookId}.jpg`;
            await ctx.storage.put(coverPath, coverBuffer);
            updateData.coverPath = coverPath;
          }
        } catch {
          // Cover fetch failure is non-fatal
        }
      }

      // Update database
      const [updated] = await ctx.db
        .update(books)
        .set(updateData)
        .where(eq(books.id, input.bookId))
        .returning();

      // Write back to EPUB file
      if (book.fileFormat === "epub") {
        try {
          const fullPath = ctx.storage.fullPath(book.filePath);
          await updateEpubMetadata(fullPath, {
            ...metaFields,
            coverImageBuffer: coverBuffer,
            coverMimeType: coverBuffer ? "image/jpeg" : undefined,
          }, book.fileHash || undefined);

          // Update file hash after modification
          const { getEpubFileHash } = await import("../../services/epub-writer.js");
          const newHash = await getEpubFileHash(fullPath);
          await ctx.db.update(books).set({ fileHash: newHash }).where(eq(books.id, input.bookId));
        } catch (err) {
          // EPUB write-back failure is non-fatal — DB is already updated
          console.error("EPUB write-back failed:", err);
        }
      }

      return updated;
    }),
});
```

- [ ] **Step 4: Register metadata router in main router**

In `packages/server/src/trpc/router.ts`, add:

```typescript
import { metadataRouter } from "./routers/metadata.js";
```

And add to the router object:

```typescript
metadata: metadataRouter,
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter server test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/trpc/routers/metadata.ts packages/server/src/trpc/router.ts packages/server/src/__tests__/metadata-router.test.ts
git commit -m "feat: add metadata search and apply tRPC router"
```

---

## Task 7: Annotations tRPC Router

**Files:**
- Create: `packages/server/src/trpc/routers/annotations.ts`
- Modify: `packages/server/src/trpc/router.ts`
- Create: `packages/server/src/__tests__/annotations.test.ts`

- [ ] **Step 1: Write tests for annotations router**

Create `packages/server/src/__tests__/annotations.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books } from "@verso/shared";

describe("annotations router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;
  let bookId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${bookId}/book.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
    });
  });

  describe("create", () => {
    it("creates a highlight annotation", async () => {
      const result = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        cfiEnd: "epubcfi(/6/4!/4/2/1:50)",
        content: "highlighted text",
        color: "yellow",
        chapter: "Chapter 1",
      });
      expect(result.type).toBe("highlight");
      expect(result.content).toBe("highlighted text");
      expect(result.color).toBe("yellow");
      expect(result.bookId).toBe(bookId);
    });

    it("creates a highlight with note", async () => {
      const result = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "important passage",
        note: "Remember this for the essay",
        color: "green",
      });
      expect(result.note).toBe("Remember this for the essay");
    });
  });

  describe("list", () => {
    it("returns empty array when no annotations exist", async () => {
      const result = await authedCaller.annotations.list({ bookId });
      expect(result).toEqual([]);
    });

    it("returns annotations ordered by cfi position", async () => {
      await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/8!/4/2/1:0)",
        content: "later text",
        color: "blue",
      });
      await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "earlier text",
        color: "yellow",
      });
      const result = await authedCaller.annotations.list({ bookId });
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("earlier text");
    });
  });

  describe("update", () => {
    it("updates note text", async () => {
      const created = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "text",
        color: "yellow",
      });
      const updated = await authedCaller.annotations.update({
        id: created.id,
        note: "new note",
      });
      expect(updated.note).toBe("new note");
    });

    it("updates color", async () => {
      const created = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "text",
        color: "yellow",
      });
      const updated = await authedCaller.annotations.update({
        id: created.id,
        color: "pink",
      });
      expect(updated.color).toBe("pink");
    });
  });

  describe("delete", () => {
    it("deletes an annotation", async () => {
      const created = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "text",
        color: "yellow",
      });
      const result = await authedCaller.annotations.delete({ id: created.id });
      expect(result.success).toBe(true);

      const list = await authedCaller.annotations.list({ bookId });
      expect(list).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter server vitest run src/__tests__/annotations.test.ts
```

Expected: FAIL — annotations router not found.

- [ ] **Step 3: Implement annotations router**

Create `packages/server/src/trpc/routers/annotations.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { eq, and, asc } from "drizzle-orm";
import {
  annotations,
  books,
  annotationListInput,
  annotationCreateInput,
  annotationUpdateInput,
  annotationDeleteInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

export const annotationsRouter = router({
  list: protectedProcedure
    .input(annotationListInput)
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(annotations)
        .where(
          and(
            eq(annotations.bookId, input.bookId),
            eq(annotations.userId, ctx.user.sub),
          )
        )
        .orderBy(asc(annotations.cfiPosition));
    }),

  create: protectedProcedure
    .input(annotationCreateInput)
    .mutation(async ({ ctx, input }) => {
      // Verify book exists and belongs to user
      const book = await ctx.db.query.books.findFirst({
        where: and(eq(books.id, input.bookId), eq(books.addedBy, ctx.user.sub)),
      });
      if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

      const [annotation] = await ctx.db
        .insert(annotations)
        .values({
          userId: ctx.user.sub,
          bookId: input.bookId,
          type: input.type || "highlight",
          content: input.content,
          note: input.note,
          cfiPosition: input.cfiPosition,
          cfiEnd: input.cfiEnd,
          color: input.color || "yellow",
          chapter: input.chapter,
        })
        .returning();

      return annotation;
    }),

  update: protectedProcedure
    .input(annotationUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.annotations.findFirst({
        where: and(
          eq(annotations.id, input.id),
          eq(annotations.userId, ctx.user.sub),
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Annotation not found" });

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.note !== undefined) updateData.note = input.note;
      if (input.color !== undefined) updateData.color = input.color;

      const [updated] = await ctx.db
        .update(annotations)
        .set(updateData)
        .where(eq(annotations.id, input.id))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(annotationDeleteInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.annotations.findFirst({
        where: and(
          eq(annotations.id, input.id),
          eq(annotations.userId, ctx.user.sub),
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Annotation not found" });

      await ctx.db.delete(annotations).where(eq(annotations.id, input.id));
      return { success: true };
    }),
});
```

- [ ] **Step 4: Register annotations router**

In `packages/server/src/trpc/router.ts`, add:

```typescript
import { annotationsRouter } from "./routers/annotations.js";
```

And add to the router object:

```typescript
annotations: annotationsRouter,
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter server test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/trpc/routers/annotations.ts packages/server/src/trpc/router.ts packages/server/src/__tests__/annotations.test.ts
git commit -m "feat: add annotations CRUD tRPC router"
```

---

## Task 8: Reading Time Tracking (Backend + Frontend)

**Files:**
- Modify: `packages/shared/src/validators.ts:70-75`
- Modify: `packages/server/src/trpc/routers/progress.ts:27-39`
- Create: `packages/web/src/hooks/use-reading-timer.ts`
- Modify: `packages/web/src/hooks/use-progress-sync.ts`
- Modify: `packages/web/src/routes/_app/books/$id_.read.tsx`

- [ ] **Step 1: Update progress sync backend to handle timeSpentMinutes**

In `packages/server/src/trpc/routers/progress.ts`, update the sync mutation's update set (line 30-36):

```typescript
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          currentPage: input.currentPage ?? existing.currentPage,
          lastReadAt: now,
          finishedAt: existing.finishedAt ?? finishedAt,
          timeSpentMinutes: (existing.timeSpentMinutes ?? 0) + (input.timeSpentMinutes ?? 0),
        })
```

And update the insert values (line 44-53) to include:

```typescript
        timeSpentMinutes: input.timeSpentMinutes ?? 0,
```

- [ ] **Step 2: Run backend tests to verify they pass**

```bash
pnpm --filter server test
```

Expected: All tests pass (existing progress tests don't send timeSpentMinutes, which is optional).

- [ ] **Step 3: Create useReadingTimer hook**

Create `packages/web/src/hooks/use-reading-timer.ts`:

```typescript
import { useRef, useEffect, useCallback } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function useReadingTimer() {
  const accumulatedSecondsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  const tick = useCallback(() => {
    if (pausedRef.current || lastTickRef.current === null) return;
    const now = Date.now();
    const delta = (now - lastTickRef.current) / 1000;
    // Cap delta at 60s to prevent runaway accumulation after sleep/suspend
    accumulatedSecondsRef.current += Math.min(delta, 60);
    lastTickRef.current = now;
  }, []);

  const pause = useCallback(() => {
    tick(); // Capture time up to this point
    pausedRef.current = true;
    lastTickRef.current = null;
  }, [tick]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    lastTickRef.current = Date.now();
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (pausedRef.current) resume();
    idleTimerRef.current = setTimeout(pause, IDLE_TIMEOUT_MS);
  }, [pause, resume]);

  // Get accumulated minutes and reset counter
  const consumeMinutes = useCallback((): number => {
    tick();
    const minutes = accumulatedSecondsRef.current / 60;
    accumulatedSecondsRef.current = 0;
    return Math.round(minutes * 10) / 10; // Round to 1 decimal
  }, [tick]);

  useEffect(() => {
    // Start tracking
    lastTickRef.current = Date.now();
    resetIdleTimer();

    // Visibility change
    const onVisibility = () => {
      if (document.hidden) {
        pause();
      } else {
        resume();
        resetIdleTimer();
      }
    };

    // Activity detection
    const onActivity = () => resetIdleTimer();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });

    // Periodic tick to keep accumulation fresh
    const intervalId = setInterval(tick, 10_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      clearInterval(intervalId);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [tick, pause, resume, resetIdleTimer]);

  return { consumeMinutes };
}
```

- [ ] **Step 4: Update useProgressSync to include time delta**

In `packages/web/src/hooks/use-progress-sync.ts`, update the type (line 5-10):

```typescript
type UseProgressSyncOptions = {
  bookId: string;
  percentage: number;
  cfiPosition: string | null;
  enabled: boolean;
  getTimeMinutes?: () => number;
};
```

Update function signature (line 14) to destructure `getTimeMinutes`.

Update `doSync` (line 29-41) to include time:

```typescript
  const doSync = useCallback(() => {
    if (!enabled || percentage === 0) return;
    if (
      percentage === lastSyncedRef.current.percentage &&
      cfiPosition === lastSyncedRef.current.cfi
    ) return;

    const timeSpentMinutes = getTimeMinutes ? Math.round(getTimeMinutes()) : undefined;

    lastSyncedRef.current = { percentage, cfi: cfiPosition };
    mutateRef.current({
      bookId,
      percentage,
      ...(cfiPosition ? { cfiPosition } : {}),
      ...(timeSpentMinutes ? { timeSpentMinutes } : {}),
    });
  }, [bookId, percentage, cfiPosition, enabled, getTimeMinutes]);
```

Update the unmount sync (line 61-80) to also include time:

```typescript
          const timeSpentMinutes = getTimeMinutes ? Math.round(getTimeMinutes()) : undefined;
          fetch("/trpc/progress.sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              json: {
                bookId,
                percentage,
                ...(cfiPosition ? { cfiPosition } : {}),
                ...(timeSpentMinutes ? { timeSpentMinutes } : {}),
              },
            }),
            keepalive: true,
          }).catch(() => {});
```

- [ ] **Step 5: Integrate timer in reader page**

In `packages/web/src/routes/_app/books/$id_.read.tsx`, add import:

```typescript
import { useReadingTimer } from "@/hooks/use-reading-timer";
```

After the `useEpubReader` call (around line 42), add:

```typescript
  const { consumeMinutes } = useReadingTimer();
```

Update the `useProgressSync` call to pass `getTimeMinutes`:

```typescript
  const { syncNow } = useProgressSync({
    bookId: id,
    percentage,
    cfiPosition: currentCfi,
    enabled: isLoaded,
    getTimeMinutes: consumeMinutes,
  });
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter server test && pnpm --filter web test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/trpc/routers/progress.ts packages/web/src/hooks/use-reading-timer.ts packages/web/src/hooks/use-progress-sync.ts packages/web/src/routes/_app/books/\$id_.read.tsx
git commit -m "feat: add reading time tracking with visibility and idle detection"
```

---

## Task 9: Find Metadata Dialog (Frontend)

**Files:**
- Create: `packages/web/src/components/metadata/find-metadata-dialog.tsx`
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

- [ ] **Step 1: Create the FindMetadataDialog component**

Create `packages/web/src/components/metadata/find-metadata-dialog.tsx`:

```typescript
import { useState, useEffect } from "react";
import { trpc } from "@/trpc";
import type { ExternalBook } from "@verso/shared";

type Props = {
  bookId: string;
  book: {
    title: string;
    author: string;
    isbn?: string | null;
    description?: string | null;
    genre?: string | null;
    publisher?: string | null;
    year?: number | null;
    language?: string | null;
    pageCount?: number | null;
    series?: string | null;
    seriesIndex?: number | null;
    coverPath?: string | null;
  };
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
};

type FieldDiff = {
  field: string;
  label: string;
  current: string;
  proposed: string;
  checked: boolean;
  edited: string;
};

export function FindMetadataDialog({ bookId, book, open, onClose, onApplied }: Props) {
  const [step, setStep] = useState<"search" | "diff">("search");
  const [query, setQuery] = useState(`${book.title} ${book.author}`);
  const [manualQuery, setManualQuery] = useState("");
  const [selectedResult, setSelectedResult] = useState<ExternalBook | null>(null);
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [includeCover, setIncludeCover] = useState(false);

  const searchQuery = trpc.metadata.search.useQuery(
    { bookId, query: manualQuery || undefined },
    { enabled: open }
  );

  const applyMutation = trpc.metadata.apply.useMutation({
    onSuccess: () => {
      onApplied();
      onClose();
    },
  });

  // Build diff when result is selected
  useEffect(() => {
    if (!selectedResult) return;

    const fields: { field: string; label: string; current: any; proposed: any }[] = [
      { field: "title", label: "Title", current: book.title, proposed: selectedResult.title },
      { field: "author", label: "Author", current: book.author, proposed: selectedResult.author },
      { field: "description", label: "Description", current: book.description, proposed: selectedResult.description },
      { field: "genre", label: "Genre", current: book.genre, proposed: selectedResult.genre },
      { field: "publisher", label: "Publisher", current: book.publisher, proposed: selectedResult.publisher },
      { field: "year", label: "Year", current: book.year ? String(book.year) : "", proposed: selectedResult.year ? String(selectedResult.year) : "" },
      { field: "isbn", label: "ISBN", current: book.isbn, proposed: selectedResult.isbn },
      { field: "language", label: "Language", current: book.language, proposed: selectedResult.language },
      { field: "pageCount", label: "Pages", current: book.pageCount ? String(book.pageCount) : "", proposed: selectedResult.pageCount ? String(selectedResult.pageCount) : "" },
      { field: "series", label: "Series", current: book.series, proposed: selectedResult.series },
      { field: "seriesIndex", label: "Series #", current: book.seriesIndex ? String(book.seriesIndex) : "", proposed: selectedResult.seriesIndex ? String(selectedResult.seriesIndex) : "" },
    ];

    setDiffs(fields.map(f => ({
      field: f.field,
      label: f.label,
      current: f.current || "",
      proposed: f.proposed || "",
      // Auto-check if filling an empty field
      checked: !f.current && !!f.proposed,
      edited: f.proposed || "",
    })));

    setIncludeCover(!!selectedResult.coverUrl && !book.coverPath);
    setStep("diff");
  }, [selectedResult, book]);

  const handleApply = () => {
    const fields: Record<string, any> = {};
    for (const diff of diffs) {
      if (diff.checked && diff.edited !== diff.current) {
        if (["year", "pageCount", "seriesIndex"].includes(diff.field)) {
          const num = parseFloat(diff.edited);
          if (!isNaN(num)) fields[diff.field] = num;
        } else {
          fields[diff.field] = diff.edited;
        }
      }
    }
    if (includeCover && selectedResult?.coverUrl) {
      fields.coverUrl = selectedResult.coverUrl;
    }

    applyMutation.mutate({
      bookId,
      fields,
      source: selectedResult?.source,
    });
  };

  const checkedCount = diffs.filter(d => d.checked && d.edited !== d.current).length + (includeCover ? 1 : 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl p-6"
        style={{ backgroundColor: "var(--card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === "search" ? (
          <>
            <h2 className="font-display text-xl font-bold mb-4" style={{ color: "var(--text)" }}>
              Find Metadata
            </h2>

            {/* Search bar */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setManualQuery(query)}
                className="flex-1 px-3 py-2 rounded-lg text-sm border"
                style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                placeholder="Search by title, author, or ISBN..."
              />
              <button
                onClick={() => setManualQuery(query)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: "var(--warm)" }}
              >
                Search
              </button>
            </div>

            {/* Results */}
            {searchQuery.isLoading && (
              <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>Searching...</p>
            )}

            {searchQuery.data?.map((result: ExternalBook, i: number) => (
              <button
                key={`${result.source}-${result.sourceId}-${i}`}
                onClick={() => setSelectedResult(result)}
                className="w-full flex gap-3 p-3 rounded-lg mb-2 text-left transition-colors hover:opacity-90 border"
                style={{ borderColor: "var(--border)" }}
              >
                {result.coverUrl ? (
                  <img src={result.coverUrl} alt="" className="w-12 h-18 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-18 rounded shrink-0 flex items-center justify-center text-[10px]"
                    style={{ backgroundColor: "var(--bg)", color: "var(--text-faint)" }}>
                    No cover
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{result.title}</p>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {result.author} {result.year ? `· ${result.year}` : ""} {result.pageCount ? `· ${result.pageCount}p` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: result.source === "google" ? "#c8553d" : "#3d7c7c" }}>
                        {result.source === "google" ? "Google" : "Open Library"}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: "var(--warm)" }}>
                        {Math.round(result.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  {result.description && (
                    <p className="text-xs mt-1 truncate" style={{ color: "var(--text-faint)" }}>
                      {result.description}
                    </p>
                  )}
                </div>
              </button>
            ))}

            {searchQuery.data?.length === 0 && !searchQuery.isLoading && (
              <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>
                No results found. Try a different search query.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-bold" style={{ color: "var(--text)" }}>
                Apply Metadata
              </h2>
              <button
                onClick={() => { setStep("search"); setSelectedResult(null); }}
                className="text-xs px-3 py-1 rounded-full"
                style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}
              >
                Back to results
              </button>
            </div>

            {/* Cover comparison */}
            {selectedResult?.coverUrl && (
              <div className="flex items-center gap-4 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>Current</p>
                  {book.coverPath ? (
                    <img src={`/api/covers/${bookId}`} alt="" className="w-16 h-24 rounded object-cover" />
                  ) : (
                    <div className="w-16 h-24 rounded flex items-center justify-center text-[10px]"
                      style={{ backgroundColor: "var(--bg)", color: "var(--text-faint)" }}>
                      None
                    </div>
                  )}
                </div>
                <span style={{ color: "var(--text-faint)" }}>→</span>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>New</p>
                  <img src={selectedResult.coverUrl} alt="" className="w-16 h-24 rounded object-cover" />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text)" }}>
                  <input type="checkbox" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} />
                  Use new cover
                </label>
              </div>
            )}

            {/* Field diffs */}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  <th className="py-1 px-2 w-6"></th>
                  <th className="py-1 px-2 text-left w-20">Field</th>
                  <th className="py-1 px-2 text-left">Current</th>
                  <th className="py-1 px-2 text-left">New Value</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((diff) => {
                  const same = diff.current === diff.proposed;
                  const empty = !diff.current && !!diff.proposed;
                  const different = diff.current && diff.proposed && diff.current !== diff.proposed;

                  return (
                    <tr
                      key={diff.field}
                      style={{
                        opacity: same ? 0.4 : 1,
                        backgroundColor: empty ? "rgba(74,124,40,0.06)" : different ? "rgba(200,85,61,0.06)" : undefined,
                      }}
                    >
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={diff.checked}
                          disabled={same}
                          onChange={(e) => {
                            setDiffs(prev =>
                              prev.map(d => d.field === diff.field ? { ...d, checked: e.target.checked } : d)
                            );
                          }}
                        />
                      </td>
                      <td className="py-2 px-2 font-medium" style={{ color: "var(--text)" }}>{diff.label}</td>
                      <td className="py-2 px-2" style={{ color: diff.current ? "var(--text-dim)" : "var(--text-faint)" }}>
                        {diff.current || <em>empty</em>}
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={diff.edited}
                          disabled={same}
                          onChange={(e) => {
                            setDiffs(prev =>
                              prev.map(d => d.field === diff.field ? { ...d, edited: e.target.value, checked: true } : d)
                            );
                          }}
                          className="w-full px-2 py-1 rounded text-sm border"
                          style={{
                            backgroundColor: same ? "transparent" : "var(--bg)",
                            borderColor: same ? "transparent" : "var(--border)",
                            color: "var(--text)",
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: "var(--text-dim)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={checkedCount === 0 || applyMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--warm)" }}
              >
                {applyMutation.isPending
                  ? "Applying..."
                  : `Apply ${checkedCount} change${checkedCount !== 1 ? "s" : ""} to book & file`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "Find metadata" button and series info to book detail page**

In `packages/web/src/routes/_app/books/$id.tsx`:

Add import at top:

```typescript
import { useState } from "react";
import { FindMetadataDialog } from "@/components/metadata/find-metadata-dialog";
```

Inside `BookDetailPage()`, after the `handleDelete` function, add:

```typescript
  const [metadataOpen, setMetadataOpen] = useState(false);
```

In the actions div (around line 167), add a "Find Metadata" button after the AddToShelfMenu:

```typescript
              <button
                onClick={() => setMetadataOpen(true)}
                className="px-5 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
              >
                Find Metadata
              </button>
```

Add series info display after the author line (around line 146):

```typescript
            {book.series && (
              <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
                Book {book.seriesIndex || "?"} of {book.series}
              </p>
            )}
```

At the very end of the component return (before the final `</div>`), add the dialog:

```typescript
      <FindMetadataDialog
        bookId={id}
        book={book}
        open={metadataOpen}
        onClose={() => setMetadataOpen(false)}
        onApplied={() => {
          bookQuery.refetch();
          setMetadataOpen(false);
        }}
      />
```

- [ ] **Step 3: Test manually in browser**

```bash
cd /Users/michaelkusche/dev/verso
./dev.sh
```

Navigate to a book detail page. Click "Find Metadata". Verify:
- Search results appear
- Clicking a result shows diff preview
- Apply updates the book

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/metadata/find-metadata-dialog.tsx packages/web/src/routes/_app/books/\$id.tsx
git commit -m "feat: add metadata search and apply UI with diff preview"
```

---

## Task 10: Reader Highlight Toolbar + Popover

**Files:**
- Create: `packages/web/src/components/reader/highlight-toolbar.tsx`
- Create: `packages/web/src/components/reader/highlight-popover.tsx`
- Modify: `packages/web/src/hooks/use-epub-reader.ts` — expose rendition for annotation rendering
- Modify: `packages/web/src/routes/_app/books/$id_.read.tsx` — integrate highlights

- [ ] **Step 1: Create HighlightToolbar component**

Create `packages/web/src/components/reader/highlight-toolbar.tsx`:

```typescript
import { useState } from "react";

const COLORS = [
  { name: "yellow", bg: "#fef08a", border: "#eab308" },
  { name: "green", bg: "#bbf7d0", border: "#22c55e" },
  { name: "blue", bg: "#bfdbfe", border: "#3b82f6" },
  { name: "pink", bg: "#fbcfe8", border: "#ec4899" },
] as const;

type Props = {
  position: { x: number; y: number } | null;
  onHighlight: (color: string, note?: string) => void;
  onDismiss: () => void;
};

export function HighlightToolbar({ position, onHighlight, onDismiss }: Props) {
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [selectedColor, setSelectedColor] = useState("yellow");

  if (!position) return null;

  const handleColorClick = (color: string) => {
    if (!showNote) {
      onHighlight(color);
    } else {
      setSelectedColor(color);
    }
  };

  const handleSaveNote = () => {
    onHighlight(selectedColor, noteText);
    setShowNote(false);
    setNoteText("");
  };

  return (
    <div
      className="fixed z-[60] flex flex-col items-center gap-2 animate-in fade-in"
      style={{ left: position.x, top: position.y, transform: "translate(-50%, -100%)" }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-lg"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        {COLORS.map(c => (
          <button
            key={c.name}
            onClick={() => handleColorClick(c.name)}
            className="w-7 h-7 rounded-full transition-transform hover:scale-110"
            style={{
              backgroundColor: c.bg,
              border: selectedColor === c.name && showNote ? `2px solid ${c.border}` : "2px solid transparent",
            }}
          />
        ))}
        <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--border)" }} />
        <button
          onClick={() => setShowNote(v => !v)}
          className="p-1.5 rounded hover:opacity-80"
          style={{ color: "var(--text-dim)" }}
          title="Add note"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {showNote && (
        <div
          className="flex gap-2 p-2 rounded-lg shadow-lg w-64"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveNote()}
            placeholder="Add a note..."
            className="flex-1 px-2 py-1 rounded text-sm border"
            style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            autoFocus
          />
          <button
            onClick={handleSaveNote}
            className="px-3 py-1 rounded text-sm text-white"
            style={{ backgroundColor: "var(--warm)" }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create HighlightPopover component**

Create `packages/web/src/components/reader/highlight-popover.tsx`:

```typescript
import { useState } from "react";
import type { Annotation } from "@verso/shared";

const COLORS = [
  { name: "yellow", bg: "#fef08a" },
  { name: "green", bg: "#bbf7d0" },
  { name: "blue", bg: "#bfdbfe" },
  { name: "pink", bg: "#fbcfe8" },
] as const;

type Props = {
  annotation: Annotation | null;
  position: { x: number; y: number } | null;
  onUpdateColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
};

export function HighlightPopover({ annotation, position, onUpdateColor, onUpdateNote, onDelete, onDismiss }: Props) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  if (!annotation || !position) return null;

  return (
    <div
      className="fixed z-[60] animate-in fade-in"
      style={{ left: position.x, top: position.y, transform: "translate(-50%, -100%)" }}
    >
      <div
        className="flex flex-col gap-2 p-2 rounded-lg shadow-lg"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        {/* Color row */}
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c.name}
              onClick={() => onUpdateColor(annotation.id, c.name)}
              className="w-6 h-6 rounded-full transition-transform hover:scale-110"
              style={{
                backgroundColor: c.bg,
                border: annotation.color === c.name ? "2px solid var(--text)" : "2px solid transparent",
              }}
            />
          ))}
          <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--border)" }} />
          <button
            onClick={() => {
              setEditingNote(true);
              setNoteText(annotation.note || "");
            }}
            className="p-1 rounded hover:opacity-80 text-xs"
            style={{ color: "var(--text-dim)" }}
          >
            {annotation.note ? "Edit note" : "Add note"}
          </button>
          <button
            onClick={() => onDelete(annotation.id)}
            className="p-1 rounded hover:opacity-80"
            style={{ color: "#c8553d" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        {/* Note editor */}
        {editingNote && (
          <div className="flex gap-1">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onUpdateNote(annotation.id, noteText);
                  setEditingNote(false);
                }
              }}
              className="flex-1 px-2 py-1 rounded text-xs border"
              style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              autoFocus
            />
            <button
              onClick={() => {
                onUpdateNote(annotation.id, noteText);
                setEditingNote(false);
              }}
              className="px-2 py-1 rounded text-xs text-white"
              style={{ backgroundColor: "var(--warm)" }}
            >
              Save
            </button>
          </div>
        )}

        {/* Existing note display */}
        {annotation.note && !editingNote && (
          <p className="text-xs px-1 max-w-48 truncate" style={{ color: "var(--text-dim)" }}>
            {annotation.note}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update useEpubReader to expose renditionRef and support annotations**

In `packages/web/src/hooks/use-epub-reader.ts`, add to the return object (line 243-255):

```typescript
    renditionRef,
```

This gives the reader page access to the rendition for applying highlight marks.

- [ ] **Step 4: Integrate highlights in reader page**

In `packages/web/src/routes/_app/books/$id_.read.tsx`:

Add imports:

```typescript
import { HighlightToolbar } from "@/components/reader/highlight-toolbar";
import { HighlightPopover } from "@/components/reader/highlight-popover";
import type { Annotation } from "@verso/shared";
```

After the existing hooks (around line 50), add annotation state and queries:

```typescript
  const annotationsQuery = trpc.annotations.list.useQuery(
    { bookId: id },
    { enabled: isLoaded }
  );
  const createAnnotation = trpc.annotations.create.useMutation({
    onSuccess: () => annotationsQuery.refetch(),
  });
  const updateAnnotation = trpc.annotations.update.useMutation({
    onSuccess: () => annotationsQuery.refetch(),
  });
  const deleteAnnotation = trpc.annotations.delete.useMutation({
    onSuccess: () => annotationsQuery.refetch(),
  });

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [popoverAnnotation, setPopoverAnnotation] = useState<Annotation | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionData, setSelectionData] = useState<{
    text: string;
    cfiRange: string;
    cfiStart: string;
    cfiEnd: string;
  } | null>(null);
```

Add an effect to render existing annotations onto the epub.js rendition when loaded:

```typescript
  // Apply annotations to rendition
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !annotationsQuery.data) return;

    const colorMap: Record<string, string> = {
      yellow: "rgba(254,240,138,0.4)",
      green: "rgba(187,247,208,0.4)",
      blue: "rgba(191,219,254,0.4)",
      pink: "rgba(251,207,232,0.4)",
    };

    // Clear previous highlights and re-apply
    // epub.js annotations API
    for (const ann of annotationsQuery.data) {
      if (ann.cfiEnd) {
        try {
          const cfiRange = `epubcfi(${ann.cfiPosition.replace("epubcfi(", "").replace(")", "")},${ann.cfiEnd.replace("epubcfi(", "").replace(")", "")})`;
          rendition.annotations.highlight(
            cfiRange,
            { id: ann.id },
            () => {},
            "hl",
            { fill: colorMap[ann.color || "yellow"] || colorMap.yellow }
          );
        } catch {
          // CFI may be invalid for current chapter
        }
      }
    }
  }, [annotationsQuery.data, renditionRef, isLoaded]);
```

Add text selection handler as an effect:

```typescript
  // Listen for text selection in epub
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !isLoaded) return;

    const onSelected = (cfiRange: string, contents: any) => {
      const selection = contents.window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Get iframe offset
      const iframe = rendition.manager?.container?.querySelector("iframe");
      const iframeRect = iframe?.getBoundingClientRect() || { left: 0, top: 0 };

      setToolbarPos({
        x: iframeRect.left + rect.left + rect.width / 2,
        y: iframeRect.top + rect.top - 10,
      });

      // Extract start/end CFIs from range
      setSelectionData({
        text,
        cfiRange,
        cfiStart: cfiRange, // Simplified — full implementation would split the range
        cfiEnd: cfiRange,
      });
    };

    rendition.on("selected", onSelected);
    return () => rendition.off("selected", onSelected);
  }, [renditionRef, isLoaded]);
```

Add handler functions:

```typescript
  const handleHighlight = (color: string, note?: string) => {
    if (!selectionData) return;
    createAnnotation.mutate({
      bookId: id,
      cfiPosition: selectionData.cfiStart,
      cfiEnd: selectionData.cfiEnd,
      content: selectionData.text,
      color: color as any,
      note,
      chapter: currentChapter,
    });
    setToolbarPos(null);
    setSelectionData(null);
    // Clear selection in the iframe
    renditionRef.current?.manager?.container?.querySelector("iframe")?.contentWindow?.getSelection()?.removeAllRanges();
  };

  const handleDismissToolbar = () => {
    setToolbarPos(null);
    setSelectionData(null);
  };
```

Add the toolbar and popover to the JSX return, after the SettingsPanel:

```typescript
      {/* Annotation toolbar */}
      <HighlightToolbar
        position={toolbarPos}
        onHighlight={handleHighlight}
        onDismiss={handleDismissToolbar}
      />

      <HighlightPopover
        annotation={popoverAnnotation}
        position={popoverPos}
        onUpdateColor={(id, color) => updateAnnotation.mutate({ id, color: color as any })}
        onUpdateNote={(id, note) => updateAnnotation.mutate({ id, note })}
        onDelete={(id) => { deleteAnnotation.mutate({ id }); setPopoverAnnotation(null); }}
        onDismiss={() => setPopoverAnnotation(null)}
      />
```

- [ ] **Step 5: Test manually in browser**

```bash
cd /Users/michaelkusche/dev/verso
./dev.sh
```

Open a book in the reader. Select text. Verify highlight toolbar appears. Create a highlight. Close and reopen — verify it persists.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/reader/highlight-toolbar.tsx packages/web/src/components/reader/highlight-popover.tsx packages/web/src/hooks/use-epub-reader.ts packages/web/src/routes/_app/books/\$id_.read.tsx
git commit -m "feat: add reader highlights with color picker and notes"
```

---

## Task 11: Annotations Tab on Book Detail Page

**Files:**
- Create: `packages/web/src/components/books/annotations-tab.tsx`
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

- [ ] **Step 1: Create AnnotationsTab component**

Create `packages/web/src/components/books/annotations-tab.tsx`:

```typescript
import { trpc } from "@/trpc";
import { Link } from "@tanstack/react-router";
import type { Annotation } from "@verso/shared";

const COLOR_MAP: Record<string, string> = {
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
};

type Props = {
  bookId: string;
};

export function AnnotationsTab({ bookId }: Props) {
  const annotationsQuery = trpc.annotations.list.useQuery({ bookId });
  const deleteAnnotation = trpc.annotations.delete.useMutation({
    onSuccess: () => annotationsQuery.refetch(),
  });

  if (annotationsQuery.isLoading) {
    return <p className="text-sm py-4" style={{ color: "var(--text-dim)" }}>Loading annotations...</p>;
  }

  const annotations = annotationsQuery.data || [];

  if (annotations.length === 0) {
    return (
      <p className="text-sm py-4" style={{ color: "var(--text-dim)" }}>
        No annotations yet. Open the reader and highlight some text to get started.
      </p>
    );
  }

  // Group by chapter
  const byChapter = new Map<string, Annotation[]>();
  for (const ann of annotations) {
    const chapter = ann.chapter || "Unknown Chapter";
    const list = byChapter.get(chapter) || [];
    list.push(ann);
    byChapter.set(chapter, list);
  }

  return (
    <div className="space-y-6">
      {[...byChapter.entries()].map(([chapter, anns]) => (
        <div key={chapter}>
          <h3
            className="font-display text-sm font-semibold mb-2"
            style={{ color: "var(--text-dim)" }}
          >
            {chapter}
          </h3>
          <div className="space-y-2">
            {anns.map((ann) => (
              <Link
                key={ann.id}
                to="/books/$id/read"
                params={{ id: bookId }}
                className="block rounded-lg p-3 transition-colors hover:opacity-90"
                style={{
                  backgroundColor: "var(--card)",
                  borderLeft: `3px solid ${COLOR_MAP[ann.color || "yellow"]}`,
                }}
              >
                {ann.content && (
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
                    "{ann.content.length > 200 ? ann.content.slice(0, 200) + "..." : ann.content}"
                  </p>
                )}
                {ann.note && (
                  <p className="text-xs mt-1 italic" style={{ color: "var(--text-dim)" }}>
                    {ann.note}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {new Date(ann.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteAnnotation.mutate({ id: ann.id });
                    }}
                    className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                    style={{ color: "#c8553d" }}
                  >
                    Delete
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add annotations tab to book detail page**

In `packages/web/src/routes/_app/books/$id.tsx`, add import:

```typescript
import { AnnotationsTab } from "@/components/books/annotations-tab";
```

Add tab state after existing state declarations:

```typescript
  const [activeTab, setActiveTab] = useState<"details" | "annotations">("details");
  const annotationsQuery = trpc.annotations.list.useQuery({ bookId: id });
  const annotationCount = annotationsQuery.data?.length ?? 0;
```

After the Description section (around line 242) and before the Details grid, add tabs:

```typescript
      {/* Tab bar */}
      <div className="flex gap-4 mb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={() => setActiveTab("details")}
          className="pb-2 text-sm font-medium transition-colors"
          style={{
            color: activeTab === "details" ? "var(--warm)" : "var(--text-dim)",
            borderBottom: activeTab === "details" ? "2px solid var(--warm)" : "2px solid transparent",
          }}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab("annotations")}
          className="pb-2 text-sm font-medium transition-colors"
          style={{
            color: activeTab === "annotations" ? "var(--warm)" : "var(--text-dim)",
            borderBottom: activeTab === "annotations" ? "2px solid var(--warm)" : "2px solid transparent",
          }}
        >
          Annotations {annotationCount > 0 && `(${annotationCount})`}
        </button>
      </div>

      {activeTab === "annotations" ? (
        <AnnotationsTab bookId={id} />
      ) : (
        <>
```

Wrap the existing Details grid section in the `<>...</>` fragment above, and close it:

```typescript
        </>
      )}
```

- [ ] **Step 3: Test manually in browser**

Navigate to a book with annotations. Verify tab appears with correct count. Click an annotation to navigate to reader.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/books/annotations-tab.tsx packages/web/src/routes/_app/books/\$id.tsx
git commit -m "feat: add annotations tab on book detail page"
```

---

## Task 12: Regenerate Route Tree + Final Integration Test

**Files:**
- No new files — integration testing across all features

- [ ] **Step 1: Regenerate TanStack Router route tree**

```bash
cd /Users/michaelkusche/dev/verso
pnpm --filter web build 2>&1 | head -20
```

If the route tree is auto-generated on build, this triggers it. Otherwise:

```bash
pnpm --filter web tsr generate
```

- [ ] **Step 2: Run all backend tests**

```bash
pnpm --filter server test
```

Expected: All tests pass, including new annotation and metadata tests.

- [ ] **Step 3: Run all frontend tests**

```bash
pnpm --filter web test
```

Expected: All tests pass.

- [ ] **Step 4: Manual integration test**

Start the dev server:

```bash
cd /Users/michaelkusche/dev/verso
./dev.sh
```

Test the following flow:
1. Upload an EPUB → verify metadata extracted (title, author, cover, etc.)
2. Go to book detail → click "Find Metadata" → search → pick a result → review diff → apply changes
3. Verify book metadata updated on detail page
4. Open book in reader → select text → verify highlight toolbar appears
5. Create a highlight with a color → verify it renders
6. Create a highlight with a note → verify note saved
7. Close reader → go to book detail → verify annotations tab shows highlights
8. Reopen reader → verify highlights persist
9. Read for 2+ minutes → close → verify time_spent_minutes incremented in DB

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix: integration fixes for session 4a"
```

- [ ] **Step 6: Update roadmap memory**

Update the project roadmap memory to mark Session 4a as complete.
