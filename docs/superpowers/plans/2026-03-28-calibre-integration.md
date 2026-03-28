# Calibre CLI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace epub2/pdf-parse with Calibre CLI tools for ebook conversion, metadata extraction, and online metadata search. Add multi-format upload support.

**Architecture:** New `calibre.ts` service wraps three CLI tools (`ebook-convert`, `ebook-meta`, `fetch-ebook-metadata`) via `child_process.execFile`. Upload pipeline converts all ebook formats to clean EPUB (or PDF for documents), extracts metadata and covers via `ebook-meta`. Online metadata search uses `fetch-ebook-metadata` with OPF output parsing, plus existing high-res cover fetching.

**Tech Stack:** Calibre CLI tools, Node.js child_process, Fastify, tRPC

**Spec:** `docs/superpowers/specs/2026-03-28-calibre-integration-design.md`

---

### Task 1: Create Calibre service

**Files:**
- Create: `packages/server/src/services/calibre.ts`
- Modify: `packages/server/src/config.ts`

- [ ] **Step 1: Add CALIBRE_PATH to config**

In `packages/server/src/config.ts`, add to the `envSchema`:

```ts
CALIBRE_PATH: z.string().optional(),
```

This allows setting a custom path to Calibre CLI tools (e.g. `/Applications/calibre.app/Contents/MacOS` on macOS).

- [ ] **Step 2: Create the calibre service**

Create `packages/server/src/services/calibre.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);

type ParsedMetadata = {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  language?: string;
  description?: string;
  genre?: string;
  pageCount?: number;
  tags?: string[];
  series?: string;
  seriesIndex?: number;
};

let calibrePath = "";

/**
 * Resolve the full path to a Calibre CLI tool.
 */
function tool(name: string): string {
  return calibrePath ? path.join(calibrePath, name) : name;
}

/**
 * Verify all required Calibre CLI tools are available.
 * Call once at server startup. Throws if tools are missing.
 */
export async function verifyCalibreInstalled(configPath?: string): Promise<void> {
  if (configPath) calibrePath = configPath;

  const tools = ["ebook-convert", "ebook-meta", "fetch-ebook-metadata"];
  for (const t of tools) {
    try {
      await exec(tool(t), ["--version"]);
    } catch {
      throw new Error(
        `Calibre CLI tool "${t}" not found. Install Calibre (https://calibre-ebook.com) ` +
        `or set CALIBRE_PATH to the directory containing Calibre CLI tools.`
      );
    }
  }
}

/**
 * Convert any ebook format to EPUB. Also cleans malformed EPUBs (epub→epub).
 */
export async function convertToEpub(inputPath: string, outputPath: string): Promise<void> {
  await exec(tool("ebook-convert"), [
    inputPath,
    outputPath,
    "--disable-font-rescaling",
    "--no-default-epub-cover",
  ], { timeout: 120_000 });
}

/**
 * Convert a document format (docx, rtf) to PDF.
 */
export async function convertToPdf(inputPath: string, outputPath: string): Promise<void> {
  await exec(tool("ebook-convert"), [inputPath, outputPath], { timeout: 120_000 });
}

/**
 * Extract metadata from any ebook using ebook-meta.
 * Parses the key-value stdout output.
 */
export async function extractMetadata(filePath: string): Promise<ParsedMetadata> {
  const { stdout } = await exec(tool("ebook-meta"), [filePath], { timeout: 30_000 });

  const get = (key: string): string | undefined => {
    const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, "mi");
    const match = stdout.match(re);
    return match?.[1]?.trim() || undefined;
  };

  const title = get("Title") || "Untitled";
  const author = get("Author(s)") || get("Author") || "Unknown Author";
  const publisher = get("Publisher") || undefined;
  const language = get("Languages") || get("Language") || undefined;
  const description = get("Comments") || get("Description") || undefined;

  // Parse date → year
  const dateStr = get("Published") || get("Date") || "";
  let year: number | undefined;
  const yearMatch = dateStr.match(/\b(\d{4})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  // Parse identifiers for ISBN
  const identifiers = get("Identifiers") || "";
  let isbn: string | undefined;
  const isbnMatch = identifiers.match(/isbn:(\d{10,13})/i);
  if (isbnMatch) isbn = isbnMatch[1];

  // Parse tags
  const tagsStr = get("Tags") || "";
  const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  const genre = tags?.[0] || undefined;

  // Parse series
  const seriesStr = get("Series") || "";
  let series: string | undefined;
  let seriesIndex: number | undefined;
  if (seriesStr && seriesStr !== "None") {
    const seriesMatch = seriesStr.match(/^(.+?)(?:\s*#(\d+(?:\.\d+)?))?$/);
    if (seriesMatch) {
      series = seriesMatch[1].trim();
      if (seriesMatch[2]) seriesIndex = parseFloat(seriesMatch[2]);
    }
  }

  return {
    title,
    author,
    isbn,
    publisher,
    year,
    language,
    description,
    genre,
    tags,
    series,
    seriesIndex,
  };
}

/**
 * Extract cover image from an ebook file.
 * Returns true if cover was extracted, false otherwise.
 */
export async function extractCover(filePath: string, outputPath: string): Promise<boolean> {
  try {
    await exec(tool("ebook-meta"), [filePath, "--get-cover", outputPath], { timeout: 30_000 });
    // Check if the file was actually created
    await access(outputPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Search online metadata sources using fetch-ebook-metadata.
 * Returns parsed results from the OPF XML output.
 */
export async function searchMetadata(query: {
  title?: string;
  author?: string;
  isbn?: string;
}): Promise<ParsedMetadata[]> {
  const args: string[] = [];
  if (query.isbn) {
    args.push("--isbn", query.isbn);
  } else {
    if (query.title) args.push("--title", query.title);
    if (query.author) args.push("--authors", query.author);
  }

  if (args.length === 0) return [];

  try {
    const { stdout } = await exec(tool("fetch-ebook-metadata"), args, { timeout: 60_000 });

    // Parse the human-readable output (multiple result blocks separated by blank lines)
    const results: ParsedMetadata[] = [];
    const blocks = stdout.split(/\n\s*\n/);

    for (const block of blocks) {
      if (!block.trim()) continue;

      const get = (key: string): string | undefined => {
        const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, "mi");
        const match = block.match(re);
        return match?.[1]?.trim() || undefined;
      };

      const title = get("Title");
      if (!title) continue;

      const author = get("Author(s)") || get("Author") || "Unknown Author";
      const publisher = get("Publisher") || undefined;
      const description = get("Comments") || undefined;

      const identifiers = get("Identifiers") || "";
      let isbn: string | undefined;
      const isbnMatch = identifiers.match(/isbn:(\d{10,13})/i);
      if (isbnMatch) isbn = isbnMatch[1];

      const dateStr = get("Published") || "";
      let year: number | undefined;
      const ym = dateStr.match(/\b(\d{4})\b/);
      if (ym) year = parseInt(ym[1], 10);

      const language = get("Languages") || get("Language") || undefined;
      const tagsStr = get("Tags") || "";
      const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

      results.push({
        title,
        author,
        isbn,
        publisher,
        year,
        language,
        description,
        genre: tags?.[0],
        tags,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Download a cover image from online metadata sources.
 * Returns true if a cover was found and saved.
 */
export async function searchCover(
  query: { title?: string; author?: string; isbn?: string },
  outputPath: string,
): Promise<boolean> {
  const args: string[] = [];
  if (query.isbn) {
    args.push("--isbn", query.isbn);
  } else {
    if (query.title) args.push("--title", query.title);
    if (query.author) args.push("--authors", query.author);
  }
  args.push("--cover", outputPath);

  if (args.length <= 2) return false;

  try {
    await exec(tool("fetch-ebook-metadata"), args, { timeout: 60_000 });
    await access(outputPath);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Run `pnpm build:server` to verify TypeScript compiles**

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "feat: add Calibre CLI service wrapper"
```

---

### Task 2: Verify Calibre on server startup

**Files:**
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Add Calibre verification to app startup**

In `packages/server/src/app.ts`, after `runMigrations(db)` and the backfill block, add:

```ts
import { verifyCalibreInstalled } from "./services/calibre.js";
```

And in the `buildApp` function, after the backfill loop:

```ts
  // Verify Calibre CLI tools are available
  try {
    await verifyCalibreInstalled(config.CALIBRE_PATH);
    console.log("Calibre CLI tools verified");
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
```

- [ ] **Step 2: Commit**

```
git add -A && git commit -m "feat: verify Calibre CLI tools on server startup"
```

---

### Task 3: Replace upload pipeline with Calibre

**Files:**
- Modify: `packages/server/src/routes/upload.ts`

- [ ] **Step 1: Rewrite the upload route**

Replace `packages/server/src/routes/upload.ts` with a new version that:
- Accepts: epub, pdf, mobi, azw, azw3, fb2, cbz, cbr, docx, rtf
- Ebook formats (epub, mobi, azw, azw3, fb2, cbz, cbr): convert to EPUB via `ebook-convert`
- Document formats (docx, rtf): convert to PDF via `ebook-convert`
- PDF: keep as-is
- All formats: extract metadata via `ebook-meta`, extract cover via `ebook-meta --get-cover`

Key changes:
- Replace `parseEpub`/`parsePdf` imports with `calibre.ts` imports
- Accept formats: `["epub", "pdf", "mobi", "azw", "azw3", "fb2", "cbz", "cbr", "docx", "rtf"]`
- For epub/mobi/azw/azw3/fb2/cbz/cbr: save temp file → `convertToEpub` → store EPUB → cleanup temp
- For docx/rtf: save temp file → `convertToPdf` → store PDF → cleanup temp
- For pdf: store directly (no conversion)
- After storing: `extractMetadata` + `extractCover` from the stored file
- Cover processing with sharp (resize to 600px wide) stays the same

Use `os.tmpdir()` for temporary conversion files. Clean up with `unlink` in a `finally` block.

- [ ] **Step 2: Update the web upload page to accept new formats**

In `packages/web/src/routes/_app/upload.tsx`, update the accepted file types:

Find the accept object (around line 34-35) and replace with:
```ts
"application/epub+zip": [".epub"],
"application/pdf": [".pdf"],
"application/x-mobipocket-ebook": [".mobi", ".prc"],
"application/vnd.amazon.ebook": [".azw", ".azw3"],
"application/x-fictionbook+xml": [".fb2"],
"application/x-cbz": [".cbz"],
"application/x-cbr": [".cbr"],
"application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
"application/rtf": [".rtf"],
```

Also update the error/help text to list all supported formats.

- [ ] **Step 3: Test by uploading an EPUB and verifying it gets converted (epub→epub cleanup)**

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "feat: multi-format upload with Calibre conversion pipeline"
```

---

### Task 4: Replace OPDS import pipeline with Calibre

**Files:**
- Modify: `packages/server/src/routes/import.ts`

- [ ] **Step 1: Update the OPDS stream import**

In `packages/server/src/routes/import.ts`, the OPDS import downloads books and stores them. Update it to:
- After downloading a book file, determine its format from content type or extension
- If not epub/pdf: convert via `convertToEpub` or `convertToPdf`
- Use `extractMetadata` and `extractCover` from calibre.ts instead of `parseEpub`/`parsePdf`
- Same temp file pattern as upload route

Replace the `parseEpub`/`parsePdf` imports with calibre imports.

- [ ] **Step 2: Update the restore import**

Check if the restore/backup import also uses `parseEpub`/`parsePdf` and update those calls to use calibre.

- [ ] **Step 3: Commit**

```
git add -A && git commit -m "feat: OPDS import uses Calibre for conversion and metadata"
```

---

### Task 5: Replace metadata search with Calibre

**Files:**
- Modify: `packages/server/src/trpc/routers/metadata.ts`
- Modify: `packages/web/src/routes/_app/books/$id_.metadata.tsx` (if cover UI needs changes)

- [ ] **Step 1: Update the metadata search procedure**

In `packages/server/src/trpc/routers/metadata.ts`, the `search` procedure currently calls `searchExternalMetadata` from `metadata-enrichment.ts`. Update it to:

1. Call `searchMetadata` from calibre.ts for the main results
2. Also call the existing `searchExternalMetadata` to get high-res cover URLs
3. Merge: use Calibre's metadata fields, but attach cover URLs from both sources
4. Return results with `calibreCoverAvailable: boolean` and `coverUrl` (our high-res source)

The `ExternalBook` type in shared may need a `calibreCoverUrl` field or similar.

- [ ] **Step 2: Update cover application in applyFields**

When the user applies metadata, they choose which cover to use. The `applyFields` mutation already handles `coverUrl` — just ensure it works with both cover sources.

If Calibre found a cover, download it via `searchCover` from calibre.ts. If the user chose our cover, use the existing `coverUrl` fetch logic.

- [ ] **Step 3: Commit**

```
git add -A && git commit -m "feat: metadata search uses Calibre + high-res cover options"
```

---

### Task 6: Remove epub2 dependency

**Files:**
- Delete: `packages/server/src/services/epub-parser.ts` (only the parsing functions — keep `ParsedMetadata` type or move it)
- Modify: `packages/server/src/services/epub-writer.ts` (still uses epub2 for reading EPUBs during write — check if this can use ebook-meta instead)
- Modify: `package.json` (remove epub2 from dependencies if no longer used)

- [ ] **Step 1: Move ParsedMetadata type**

The `ParsedMetadata` type is defined in `epub-parser.ts` and imported by `pdf-parser.ts` and other files. Move it to `calibre.ts` (it's already defined there) and update imports.

- [ ] **Step 2: Check epub-writer.ts dependency on epub2**

The epub-writer uses `EPub.createAsync` to find cover paths during metadata write-back. Check if this can be replaced with `ebook-meta` output or OPF parsing. If epub2 is still needed for the writer, keep it as a dependency but remove it from the parsing pipeline.

- [ ] **Step 3: Remove pdf-parser.ts if no longer used**

If all metadata extraction goes through calibre.ts, `pdf-parser.ts` is no longer needed. Delete it and remove the `pdf-parse` dependency.

- [ ] **Step 4: Run `pnpm test:server` and fix any broken imports**

- [ ] **Step 5: Commit**

```
git add -A && git commit -m "refactor: remove epub2/pdf-parse from metadata pipeline, use Calibre"
```

---

### Task 7: Update Dockerfile

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Install Calibre in the runtime stage**

In the `Dockerfile`, in the runtime stage (after `FROM node:20-alpine AS runtime`), add Calibre installation.

Since Alpine may not have Calibre in its repos, use the official Linux installer:

```dockerfile
# Install Calibre CLI tools
RUN apk add --no-cache wget xdg-utils python3 && \
    wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh | sh /dev/stdin install_dir=/opt/calibre && \
    apk del wget
ENV PATH="/opt/calibre:$PATH"
```

If the Alpine installer doesn't work (Calibre needs glibc), switch the runtime stage to Debian:

```dockerfile
FROM node:20-slim AS runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends calibre && \
    rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 2: Test Docker build locally**

```
docker build -t verso:calibre-test .
docker run --rm verso:calibre-test ebook-convert --version
```

- [ ] **Step 3: Commit**

```
git add -A && git commit -m "feat: install Calibre CLI tools in Docker image"
```

---

### Task 8: Final testing and cleanup

- [ ] **Step 1: Run full test suite**

```
pnpm test:server
```

Fix any failures. Tests that mock epub2 will need updating.

- [ ] **Step 2: Build check**

```
pnpm build
```

- [ ] **Step 3: Browser test upload with various formats**

Test uploading: epub, pdf, mobi (if Calibre installed locally). Verify:
- Metadata extracted correctly
- Cover extracted
- EPUB cleanup works (epub→epub)
- Error messages for unsupported formats

- [ ] **Step 4: Browser test metadata search**

From a book detail page, search metadata. Verify:
- Results appear from Calibre sources
- Cover options shown
- Applying metadata works

- [ ] **Step 5: Commit any fixes**

```
git add -A && git commit -m "fix: address test failures and cleanup for Calibre integration"
```
