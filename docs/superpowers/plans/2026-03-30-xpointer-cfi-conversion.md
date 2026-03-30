# XPointer ↔ CFI Position Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable seamless reading position sync between KOReader (XPointer format) and the Verso web reader (EPUB CFI format) by converting between formats on every sync.

**Architecture:** Port Grimmory's CfiConvertor Java class to TypeScript. Add a `kosyncProgress` column to store the KOReader XPointer string. On kosync PUT, convert XPointer→CFI. On web reader progress.sync, convert CFI→XPointer. Each format is stored independently; conversion failures leave the other field unchanged.

**Tech Stack:** TypeScript, linkedom (DOM parser), epub2 (EPUB spine extraction), Drizzle ORM, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/server/src/services/cfi-converter.ts` | CfiConverter class: XPointer↔CFI conversion using parsed DOM |
| Create | `packages/server/src/services/epub-position.ts` | Convenience wrapper: opens EPUB, extracts spine HTML, runs CfiConverter |
| Create | `packages/server/src/__tests__/cfi-converter.test.ts` | Unit tests for CfiConverter |
| Modify | `packages/shared/src/schema.ts` | Add `kosyncProgress` column to `readingProgress` |
| Modify | `packages/server/src/routes/kosync.ts` | PUT: store XPointer + convert→CFI. GET: return stored XPointer |
| Modify | `packages/server/src/trpc/routers/progress.ts` | sync: convert CFI→XPointer on save |
| Modify | `packages/server/src/app.ts` | Pass `storage` to `registerKosyncRoutes` |

---

## Task 1: Add `linkedom` Dependency

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Install linkedom**

```bash
cd packages/server && pnpm add linkedom
```

- [ ] **Step 2: Verify it installed**

```bash
cd packages/server && node -e "const { parseHTML } = require('linkedom'); const { document } = parseHTML('<html><body><p>test</p></body></html>'); console.log(document.body.textContent)"
```

Expected output: `test`

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit -m "chore: add linkedom dependency for DOM parsing"
```

---

## Task 2: Add `kosyncProgress` Column to Schema

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Add the column**

In `packages/shared/src/schema.ts`, add `kosyncProgress` to the `readingProgress` table definition, after `cfiPosition`:

```typescript
  cfiPosition: text("cfi_position"),
  kosyncProgress: text("kosync_progress"),
```

- [ ] **Step 2: Build shared package**

```bash
cd packages/shared && pnpm build
```

Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schema.ts
git commit -m "feat: add kosyncProgress column to readingProgress"
```

---

## Task 3: Create CfiConverter Class

This is the core conversion logic, ported from Grimmory's Java implementation.

**Files:**
- Create: `packages/server/src/services/cfi-converter.ts`

- [ ] **Step 1: Create the converter**

Create `packages/server/src/services/cfi-converter.ts`:

```typescript
const CFI_PATTERN = /^epubcfi\((.+)\)$/;
const CFI_SPINE_PATTERN = /^\/6\/(\d+)!(.*)$/;
const CFI_PATH_STEP_PATTERN = /\/(\d+)(?:\[(.*?)\])?(?::(\d+))?/g;
const XPOINTER_DOC_FRAGMENT_PATTERN = /^\/body\/DocFragment\[(\d+)\]\/body(.*)$/;
const XPOINTER_TEXT_OFFSET_PATTERN = /\/text\(\)\.(\d+)$/;
const XPOINTER_SEGMENT_WITH_INDEX_PATTERN = /^(\w+)\[(\d+)\]$/;
const XPOINTER_SEGMENT_WITHOUT_INDEX_PATTERN = /^(\w+)$/;

const INLINE_ELEMENTS = new Set([
  "span", "em", "strong", "i", "b", "u", "small", "mark", "sup", "sub",
]);

type CfiStep = { index: number; assertion: string | null };

/**
 * Extracts spine index from either a CFI or XPointer string.
 */
export function extractSpineIndex(cfiOrXPointer: string): number {
  if (cfiOrXPointer.startsWith("epubcfi(")) {
    const cfiMatch = cfiOrXPointer.match(CFI_PATTERN);
    if (!cfiMatch) throw new Error(`Invalid CFI format: ${cfiOrXPointer}`);
    const spineMatch = cfiMatch[1].match(CFI_SPINE_PATTERN);
    if (!spineMatch) throw new Error(`Cannot extract spine index from CFI: ${cfiOrXPointer}`);
    return (parseInt(spineMatch[1]) - 2) / 2;
  }
  if (cfiOrXPointer.startsWith("/body/DocFragment[")) {
    const match = cfiOrXPointer.match(/DocFragment\[(\d+)\]/);
    if (!match) throw new Error(`Cannot extract spine index from XPointer: ${cfiOrXPointer}`);
    return parseInt(match[1]) - 1;
  }
  throw new Error(`Unsupported format: ${cfiOrXPointer}`);
}

export class CfiConverter {
  private doc: Document;
  private spineIndex: number;

  constructor(document: Document, spineIndex: number) {
    this.doc = document;
    this.spineIndex = spineIndex;
  }

  /** Convert KOReader XPointer to EPUB CFI */
  xPointerToCfi(xpointer: string): string {
    const { element, textOffset } = this.parseXPointer(xpointer);
    let cfiPath = this.buildCfiPathFromElement(element);
    if (textOffset != null) {
      cfiPath += `/1:${textOffset}`;
    }
    return this.buildFullCfi(cfiPath);
  }

  /** Convert EPUB CFI to KOReader XPointer */
  cfiToXPointer(cfi: string): string {
    const cfiMatch = cfi.match(CFI_PATTERN);
    if (!cfiMatch) throw new Error(`Invalid CFI format: ${cfi}`);
    const spineMatch = cfiMatch[1].match(CFI_SPINE_PATTERN);
    if (!spineMatch) throw new Error(`Cannot parse CFI spine step: ${cfi}`);

    const spineStep = parseInt(spineMatch[1]);
    const cfiSpineIndex = (spineStep - 2) / 2;
    if (cfiSpineIndex !== this.spineIndex) {
      throw new Error(`CFI spine index ${cfiSpineIndex} does not match converter spine index ${this.spineIndex}`);
    }

    const contentPath = spineMatch[2];
    const { steps, textOffset } = this.parseCfiPath(contentPath);
    const element = this.resolveElementFromCfiSteps(steps);
    if (!element) throw new Error(`Element not found for CFI: ${cfi}`);

    if (textOffset != null) {
      return this.handleTextOffset(element, textOffset);
    }
    return this.buildXPointerPath(element);
  }

  // ─── XPointer → CFI helpers ───

  private parseXPointer(xpointer: string): { element: Element; textOffset: number | null } {
    let textOffset: number | null = null;
    let elementPath = xpointer;

    const textMatch = xpointer.match(XPOINTER_TEXT_OFFSET_PATTERN);
    if (textMatch) {
      textOffset = parseInt(textMatch[1]);
      elementPath = xpointer.replace(XPOINTER_TEXT_OFFSET_PATTERN, "");
    }

    const element = this.resolveXPointerPath(elementPath);
    return { element, textOffset };
  }

  private resolveXPointerPath(path: string): Element {
    const pathMatch = path.match(XPOINTER_DOC_FRAGMENT_PATTERN);
    if (!pathMatch) throw new Error(`Invalid XPointer format: ${path}`);

    const elementPath = pathMatch[2];
    const body = this.doc.body;
    if (!body) throw new Error("Document has no body element");
    if (!elementPath || elementPath === "") return body;

    const segments = elementPath.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    // KOReader uses global element indexing for the last indexed segment
    const withIndex = lastSegment.match(XPOINTER_SEGMENT_WITH_INDEX_PATTERN);
    if (withIndex) {
      const tagName = withIndex[1];
      const index = parseInt(withIndex[2]) - 1;
      const allElements = body.getElementsByTagName(tagName);
      if (index < allElements.length) {
        return allElements[index] as Element;
      }
      throw new Error(`Element index ${index} out of bounds for tag ${tagName} (found ${allElements.length})`);
    }

    // Non-indexed: hierarchical traversal
    let current: Element = body;
    for (const segment of segments) {
      const segWith = segment.match(XPOINTER_SEGMENT_WITH_INDEX_PATTERN);
      const segWithout = segment.match(XPOINTER_SEGMENT_WITHOUT_INDEX_PATTERN);

      let tagName: string;
      let index: number;

      if (segWith) {
        tagName = segWith[1];
        index = parseInt(segWith[2]) - 1;
      } else if (segWithout) {
        tagName = segWithout[1];
        index = 0;
      } else {
        throw new Error(`Invalid XPointer segment: ${segment}`);
      }

      const matching = Array.from(current.children).filter(
        (c) => c.tagName.toLowerCase() === tagName.toLowerCase()
      );
      if (index >= matching.length) {
        throw new Error(`Element index ${index} out of bounds for tag ${tagName} (found ${matching.length})`);
      }
      current = matching[index] as Element;
    }
    return current;
  }

  private buildCfiPathFromElement(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.tagName.toLowerCase() !== "body") {
      const parent = current.parentElement;
      if (!parent) break;

      let siblingIndex = 0;
      for (const sibling of Array.from(parent.children)) {
        siblingIndex++;
        if (sibling === current) break;
      }

      parts.unshift(`/${siblingIndex * 2}`);
      current = parent;
    }

    parts.unshift("/4");
    return parts.join("");
  }

  private buildFullCfi(contentPath: string): string {
    const spineStep = (this.spineIndex + 1) * 2;
    return `epubcfi(/6/${spineStep}!${contentPath})`;
  }

  // ─── CFI → XPointer helpers ───

  private parseCfiPath(contentPath: string): { steps: CfiStep[]; textOffset: number | null } {
    const steps: CfiStep[] = [];
    let textOffset: number | null = null;

    const regex = new RegExp(CFI_PATH_STEP_PATTERN.source, "g");
    let match;
    while ((match = regex.exec(contentPath)) !== null) {
      const stepIndex = parseInt(match[1]);
      const assertion = match[2] || null;
      if (match[3] != null) {
        textOffset = parseInt(match[3]);
      }
      steps.push({ index: stepIndex, assertion });
    }

    return { steps, textOffset };
  }

  private resolveElementFromCfiSteps(steps: CfiStep[]): Element | null {
    let current: Element | null = this.doc.body;
    if (!current) return null;

    for (const step of steps) {
      const childIndex = (step.index / 2) - 1;
      const children = current.children;
      if (childIndex < 0 || childIndex >= children.length) {
        return current;
      }
      current = children[childIndex] as Element;
    }

    return current;
  }

  private buildXPointerPath(targetElement: Element): string {
    const parts: string[] = [];
    let current: Element | null = targetElement;
    const root = this.doc.body?.parentElement ?? null;

    while (current && current !== root) {
      const parent = current.parentElement;
      if (!parent) break;

      const tagName = current.tagName.toLowerCase();
      let siblingIndex = 0;
      let totalSameTag = 0;

      for (const sibling of Array.from(parent.children)) {
        if (sibling.tagName.toLowerCase() === tagName) {
          if (sibling === current) siblingIndex = totalSameTag;
          totalSameTag++;
        }
      }

      parts.unshift(totalSameTag === 1 ? tagName : `${tagName}[${siblingIndex + 1}]`);
      current = parent;
    }

    // Remove leading "body" if present — we add it in the prefix
    if (parts.length > 0 && parts[0].startsWith("body")) {
      parts.shift();
    }

    let xpointer = `/body/DocFragment[${this.spineIndex + 1}]/body`;
    if (parts.length > 0) {
      xpointer += "/" + parts.join("/");
    }
    return xpointer;
  }

  private handleTextOffset(element: Element, cfiOffset: number): string {
    const textNodes = this.collectTextNodes(element);
    let totalChars = 0;
    let targetNode: Node | null = null;
    let offsetInNode = 0;

    for (const node of textNodes) {
      const nodeLength = (node.textContent ?? "").length;
      if (totalChars + nodeLength >= cfiOffset) {
        targetNode = node;
        offsetInNode = cfiOffset - totalChars;
        break;
      }
      totalChars += nodeLength;
    }

    if (!targetNode) {
      return this.buildXPointerPath(element);
    }

    // Walk up to nearest significant (block) element
    let textParent = targetNode.parentElement;
    while (textParent && INLINE_ELEMENTS.has(textParent.tagName.toLowerCase())) {
      textParent = textParent.parentElement;
    }
    if (!textParent) textParent = element;

    return this.buildXPointerPath(textParent) + `/text().${offsetInNode}`;
  }

  private collectTextNodes(element: Element): Node[] {
    const nodes: Node[] = [];
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 /* TEXT_NODE */ && (child.textContent ?? "").length > 0) {
          nodes.push(child);
        } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
          walk(child);
        }
      }
    };
    walk(element);
    return nodes;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/services/cfi-converter.ts
git commit -m "feat: add CfiConverter class for XPointer↔CFI conversion"
```

---

## Task 4: Create epub-position.ts Wrapper

**Files:**
- Create: `packages/server/src/services/epub-position.ts`

- [ ] **Step 1: Create the wrapper**

Create `packages/server/src/services/epub-position.ts`:

```typescript
import { EPub } from "epub2";
import { parseHTML } from "linkedom";
import { CfiConverter, extractSpineIndex } from "./cfi-converter.js";

function openEpub(filePath: string): Promise<EPub> {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    epub.on("end", () => resolve(epub));
    epub.on("error", reject);
    epub.parse();
  });
}

function getChapterRaw(epub: EPub, chapterId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapterRaw(chapterId, (err, text) => {
      if (err) reject(err);
      else resolve(text ?? "");
    });
  });
}

/**
 * Convert between KOReader XPointer and EPUB CFI formats.
 * Opens the EPUB, extracts the relevant spine HTML, parses it, runs conversion.
 *
 * @param epubFilePath - Full path to the EPUB file on disk
 * @param position - The position string to convert (either XPointer or CFI)
 * @param from - The format of the input position
 * @returns The converted position string in the other format
 */
export async function convertPosition(
  epubFilePath: string,
  position: string,
  from: "cfi" | "xpointer",
): Promise<string> {
  const spineIndex = extractSpineIndex(position);
  const epub = await openEpub(epubFilePath);

  // Get spine chapter ID at the given index
  const spineItem = epub.flow[spineIndex];
  if (!spineItem?.id) {
    throw new Error(`No spine item at index ${spineIndex}`);
  }

  const html = await getChapterRaw(epub, spineItem.id);
  const { document } = parseHTML(html);
  const converter = new CfiConverter(document, spineIndex);

  if (from === "xpointer") {
    return converter.xPointerToCfi(position);
  } else {
    return converter.cfiToXPointer(position);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/services/epub-position.ts
git commit -m "feat: add convertPosition wrapper for EPUB position conversion"
```

---

## Task 5: Unit Tests for CfiConverter

**Files:**
- Create: `packages/server/src/__tests__/cfi-converter.test.ts`

- [ ] **Step 1: Create tests**

Create `packages/server/src/__tests__/cfi-converter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseHTML } from "linkedom";
import { CfiConverter, extractSpineIndex } from "../services/cfi-converter.js";

const SAMPLE_HTML = `
<html>
<body>
  <div>
    <h1>Chapter Title</h1>
    <p>First paragraph with <em>emphasized</em> text.</p>
    <p>Second paragraph.</p>
    <p>Third paragraph with <strong>bold</strong> and <em>italic</em> words.</p>
  </div>
  <div>
    <p>Another section first paragraph.</p>
    <p>Another section second paragraph.</p>
  </div>
</body>
</html>
`;

function makeConverter(spineIndex = 5) {
  const { document } = parseHTML(SAMPLE_HTML);
  return new CfiConverter(document, spineIndex);
}

describe("extractSpineIndex", () => {
  it("extracts from CFI", () => {
    expect(extractSpineIndex("epubcfi(/6/12!/4/2/4)")).toBe(5);
  });

  it("extracts from XPointer", () => {
    expect(extractSpineIndex("/body/DocFragment[6]/body/div/p[2]")).toBe(5);
  });

  it("throws for invalid format", () => {
    expect(() => extractSpineIndex("garbage")).toThrow("Unsupported format");
  });
});

describe("CfiConverter", () => {
  describe("xPointerToCfi", () => {
    it("converts simple element path", () => {
      const converter = makeConverter(5);
      const cfi = converter.xPointerToCfi("/body/DocFragment[6]/body/div/h1");
      expect(cfi).toMatch(/^epubcfi\(\/6\/12!\/4\/2\/2\)$/);
    });

    it("converts element with text offset", () => {
      const converter = makeConverter(5);
      const cfi = converter.xPointerToCfi("/body/DocFragment[6]/body/div/p[1]/text().5");
      expect(cfi).toContain("/1:5");
      expect(cfi).toMatch(/^epubcfi\(/);
    });
  });

  describe("cfiToXPointer", () => {
    it("converts simple CFI to XPointer", () => {
      const converter = makeConverter(5);
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/2)");
      expect(xp).toContain("/body/DocFragment[6]/body");
      expect(xp).toContain("h1");
    });

    it("converts CFI with text offset", () => {
      const converter = makeConverter(5);
      const xp = converter.cfiToXPointer("epubcfi(/6/12!/4/2/4/1:5)");
      expect(xp).toContain("/body/DocFragment[6]/body");
      expect(xp).toContain("text().5");
    });

    it("throws for mismatched spine index", () => {
      const converter = makeConverter(5);
      expect(() => converter.cfiToXPointer("epubcfi(/6/4!/4/2)")).toThrow("does not match");
    });
  });

  describe("round-trip", () => {
    it("XPointer → CFI → XPointer preserves element path", () => {
      const converter = makeConverter(5);
      const original = "/body/DocFragment[6]/body/div/h1";
      const cfi = converter.xPointerToCfi(original);
      const roundTripped = converter.cfiToXPointer(cfi);
      expect(roundTripped).toBe(original);
    });

    it("CFI → XPointer → CFI preserves path", () => {
      const converter = makeConverter(5);
      const original = "epubcfi(/6/12!/4/2/2)";
      const xp = converter.cfiToXPointer(original);
      const roundTripped = converter.xPointerToCfi(xp);
      expect(roundTripped).toBe(original);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/server && npx vitest run src/__tests__/cfi-converter.test.ts
```

Expected: All tests pass. If any fail, fix the converter logic — the test expectations are derived from the Grimmory reference implementation.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/cfi-converter.test.ts
git commit -m "test: add unit tests for CfiConverter"
```

---

## Task 6: Pass `storage` to kosync Routes

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/kosync.ts`

- [ ] **Step 1: Update app.ts to pass storage**

In `packages/server/src/app.ts`, change:

```typescript
  registerKosyncRoutes(app, db, config);
```

to:

```typescript
  registerKosyncRoutes(app, db, storage, config);
```

- [ ] **Step 2: Update kosync.ts function signature**

In `packages/server/src/routes/kosync.ts`, change:

```typescript
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function registerKosyncRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  config: Config,
) {
```

to:

```typescript
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";

export function registerKosyncRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config,
) {
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
```

Expected: Builds successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/routes/kosync.ts
git commit -m "refactor: pass storage to kosync routes for EPUB file access"
```

---

## Task 7: Update kosync PUT to Convert XPointer → CFI

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`

- [ ] **Step 1: Add imports**

At the top of `packages/server/src/routes/kosync.ts`, add:

```typescript
import { convertPosition } from "../services/epub-position.js";
```

- [ ] **Step 2: Update the matched book PUT logic**

Replace the matched book block (the `if (matchedBook)` section) with:

```typescript
    if (matchedBook) {
      const existing = await db
        .select()
        .from(readingProgress)
        .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, matchedBook.id)))
        .get();

      const finishedAt = percentage >= 0.98 ? now : null;

      // Try to convert KOReader XPointer → CFI
      let convertedCfi: string | undefined;
      const book = await db.select({ filePath: books.filePath, fileFormat: books.fileFormat }).from(books).where(eq(books.id, matchedBook.id)).get();
      if (book?.fileFormat === "epub" && book.filePath) {
        try {
          convertedCfi = await convertPosition(storage.fullPath(book.filePath), progress, "xpointer");
        } catch (e) {
          app.log.warn({ err: e, bookId: matchedBook.id }, "kosync: XPointer→CFI conversion failed");
        }
      }

      if (existing) {
        await db.update(readingProgress).set({
          percentage: percentage * 100,
          kosyncProgress: progress,
          ...(convertedCfi ? { cfiPosition: convertedCfi } : {}),
          lastReadAt: now,
          deviceId: device_id,
          finishedAt: existing.finishedAt ?? finishedAt,
        }).where(eq(readingProgress.id, existing.id));
      } else {
        await db.insert(readingProgress).values({
          userId, bookId: matchedBook.id,
          percentage: percentage * 100,
          kosyncProgress: progress,
          cfiPosition: convertedCfi ?? null,
          startedAt: now, lastReadAt: now,
          deviceId: device_id, finishedAt,
        });
      }
    }
```

- [ ] **Step 3: Update the GET response**

In the GET handler, change:

```typescript
            progress: `${progress.percentage / 100}`,
```

to:

```typescript
            progress: progress.kosyncProgress || `${progress.percentage / 100}`,
```

- [ ] **Step 4: Run kosync tests**

```bash
cd packages/server && npx vitest run src/__tests__/kosync.test.ts
```

Expected: All existing tests pass (the new `kosyncProgress` column is nullable, so existing test data is unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/kosync.ts
git commit -m "feat: kosync PUT converts XPointer→CFI, GET returns stored XPointer"
```

---

## Task 8: Update Web Reader Progress Sync to Convert CFI → XPointer

**Files:**
- Modify: `packages/server/src/trpc/routers/progress.ts`

- [ ] **Step 1: Add imports**

At the top of `packages/server/src/trpc/routers/progress.ts`, add:

```typescript
import { books } from "@verso/shared";
import { eq } from "drizzle-orm";
import { convertPosition } from "../../services/epub-position.js";
```

Note: `eq` is already imported. Only add `books` and `convertPosition`.

- [ ] **Step 2: Add conversion in the sync mutation**

In the `sync` mutation, after determining the update/insert data but before writing to the DB, add the conversion.

In the `if (existing)` update block, change:

```typescript
      const [updated] = await ctx.db
        .update(readingProgress)
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          currentPage: input.currentPage ?? existing.currentPage,
          timeSpentMinutes: (existing.timeSpentMinutes ?? 0) + (input.timeSpentMinutes ?? 0),
          lastReadAt: now,
          finishedAt: existing.finishedAt ?? finishedAt,
        })
        .where(eq(readingProgress.id, existing.id))
        .returning();
      return updated;
```

to:

```typescript
      // Try to convert CFI → XPointer for KOReader
      let convertedXPointer: string | undefined;
      if (input.cfiPosition) {
        const book = await ctx.db.select({ filePath: books.filePath, fileFormat: books.fileFormat }).from(books).where(eq(books.id, input.bookId)).get();
        if (book?.fileFormat === "epub" && book.filePath) {
          try {
            convertedXPointer = await convertPosition(ctx.storage.fullPath(book.filePath), input.cfiPosition, "cfi");
          } catch { /* conversion failed — leave kosyncProgress unchanged */ }
        }
      }

      const [updated] = await ctx.db
        .update(readingProgress)
        .set({
          percentage: input.percentage,
          cfiPosition: input.cfiPosition ?? existing.cfiPosition,
          ...(convertedXPointer ? { kosyncProgress: convertedXPointer } : {}),
          currentPage: input.currentPage ?? existing.currentPage,
          timeSpentMinutes: (existing.timeSpentMinutes ?? 0) + (input.timeSpentMinutes ?? 0),
          lastReadAt: now,
          finishedAt: existing.finishedAt ?? finishedAt,
        })
        .where(eq(readingProgress.id, existing.id))
        .returning();
      return updated;
```

Do the same for the insert block — change:

```typescript
    const [created] = await ctx.db
      .insert(readingProgress)
      .values({
        userId: ctx.user.sub,
        bookId: input.bookId,
        percentage: input.percentage,
        cfiPosition: input.cfiPosition,
        currentPage: input.currentPage,
        timeSpentMinutes: input.timeSpentMinutes ?? 0,
        startedAt: now,
        lastReadAt: now,
        finishedAt,
      })
      .returning();
    return created;
```

to:

```typescript
    // Try to convert CFI → XPointer for KOReader
    let convertedXPointer: string | undefined;
    if (input.cfiPosition) {
      const book = await ctx.db.select({ filePath: books.filePath, fileFormat: books.fileFormat }).from(books).where(eq(books.id, input.bookId)).get();
      if (book?.fileFormat === "epub" && book.filePath) {
        try {
          convertedXPointer = await convertPosition(ctx.storage.fullPath(book.filePath), input.cfiPosition, "cfi");
        } catch { /* conversion failed */ }
      }
    }

    const [created] = await ctx.db
      .insert(readingProgress)
      .values({
        userId: ctx.user.sub,
        bookId: input.bookId,
        percentage: input.percentage,
        cfiPosition: input.cfiPosition,
        kosyncProgress: convertedXPointer ?? null,
        currentPage: input.currentPage,
        timeSpentMinutes: input.timeSpentMinutes ?? 0,
        startedAt: now,
        lastReadAt: now,
        finishedAt,
      })
      .returning();
    return created;
```

- [ ] **Step 3: Build and run all tests**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
cd packages/server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/progress.ts
git commit -m "feat: web reader progress sync converts CFI→XPointer for KOReader"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Build everything**

```bash
cd /Users/michaelkusche/dev/verso && pnpm build
```

Expected: No errors.

- [ ] **Step 2: Run all server tests**

```bash
cd packages/server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Manual test checklist**

1. Start dev server
2. Open a book in the web reader, read a few pages, close
3. Check the database: `readingProgress` should have both `cfiPosition` and `kosyncProgress` populated
4. Simulate a KOReader kosync PUT (or use actual KOReader): push XPointer + percentage
5. Check database: `kosyncProgress` has the XPointer, `cfiPosition` has a converted CFI
6. Open the book in the web reader: should navigate to the correct position (via CFI)
7. Read further in the web reader, close
8. Simulate a KOReader kosync GET: should return the converted XPointer in the `progress` field
9. In KOReader: pull progress, verify it navigates to the correct position
