# XPointer ↔ CFI Position Conversion — Design Spec

## Problem

KOReader and the Verso web reader use different position formats:
- **KOReader**: XPointer strings like `/body/DocFragment[14]/body/div/p[3]/text().45`
- **Web reader**: EPUB CFI like `epubcfi(/6/28!/4/2/6/1:45)`

Currently, when KOReader pushes progress via kosync, we store the percentage but discard the XPointer `progress` string. When KOReader pulls, it gets back `"0"` or a percentage it can't navigate with. Cross-device sync is broken.

## Solution

Port Grimmory/Booklore's `CfiConvertor` (Java) to TypeScript. Convert between formats on every sync, store both.

---

## Section 1: Schema Change

Add one column to `readingProgress`:

```sql
kosync_progress TEXT  -- KOReader's XPointer position string
```

No migration needed — SQLite `ALTER TABLE ADD COLUMN` with nullable default.

Both `cfiPosition` and `kosyncProgress` are stored independently. When either device syncs, we convert and populate both.

---

## Section 2: CfiConverter Service

New file: `packages/server/src/services/cfi-converter.ts`

Port of Grimmory's `CfiConvertor.java` (~300 lines). Uses:
- `linkedom` — lightweight DOM parser for Node.js (parses spine HTML)
- `epub2` — already in the project, extracts spine content from EPUB files

### API

```typescript
// Static — determines which spine entry to load from either format
extractSpineIndex(cfiOrXPointer: string): number

// Instance — takes parsed DOM + spine index
class CfiConverter {
  constructor(document: Document, spineIndex: number)
  xPointerToCfi(xpointer: string): string
  cfiToXPointer(cfi: string): string
}

// Convenience wrapper — opens EPUB, extracts spine HTML, runs conversion
convertPosition(
  epubFilePath: string,
  position: string,
  from: "cfi" | "xpointer"
): Promise<string>
```

### Conversion Algorithm (from Grimmory reference)

**XPointer → CFI:**
1. Parse XPointer: extract DocFragment index (spine) and element path
2. Resolve element path against the DOM (KOReader uses global element indexing)
3. Walk up from element to body, counting sibling indices
4. Convert each step: `siblingIndex * 2` = CFI step number
5. Handle text offsets: append `/1:offset` to CFI
6. Wrap with spine prefix: `epubcfi(/6/{(spineIndex+1)*2}!/4/...)`

**CFI → XPointer:**
1. Parse CFI: extract spine step and content path
2. Walk down the DOM using CFI steps: `childIndex = (step / 2) - 1`
3. Walk up from resolved element to body, building tag path with sibling indices
4. Handle text offsets: collect text nodes, find target node and offset
5. Wrap with DocFragment prefix: `/body/DocFragment[{spineIndex+1}]/body/...`

### Inline Elements

Skip inline elements (span, em, strong, i, b, u, small, mark, sup, sub) when building XPointer paths from text offsets — walk up to the nearest significant (block) element.

---

## Section 3: Sync Flow Changes

### kosync PUT (KOReader pushes)

1. Receive `progress` (XPointer) + `percentage`
2. Store `kosyncProgress = progress`, `percentage = percentage * 100`
3. Try: `convertPosition(epubPath, progress, "xpointer")` → store result in `cfiPosition`
4. If conversion fails: log warning, leave `cfiPosition` unchanged

### Web reader progress.sync (tRPC)

1. Receive `cfiPosition` + `percentage`
2. Store `cfiPosition`, `percentage`
3. Try: `convertPosition(epubPath, cfiPosition, "cfi")` → store result in `kosyncProgress`
4. If conversion fails: log warning, leave `kosyncProgress` unchanged

### kosync GET (KOReader pulls)

1. Return `progress: kosyncProgress || String(percentage / 100)`
2. Return `percentage: percentage / 100`
3. Fallback to percentage string if no XPointer stored (KOReader will get approximate position)

### Web reader progress.get (tRPC)

No changes — already returns `cfiPosition` and `percentage`.

---

## Section 4: Error Handling

- **Conversion failure**: Log warning, store the format we received, don't touch the other field
- **No EPUB file** (PDF books): Skip conversion entirely, store what we got
- **First sync from either device**: The other field is null until that device syncs — fine
- **Both devices sync rapidly**: Last write wins (same as current)
- **Malformed XPointer/CFI**: Converter catches and logs, no crash, no data loss

---

## Section 5: Files Changed

| Action | File | What |
|--------|------|------|
| Create | `packages/server/src/services/cfi-converter.ts` | CfiConverter class + convertPosition wrapper |
| Modify | `packages/shared/src/schema.ts` | Add `kosyncProgress` column to `readingProgress` |
| Modify | `packages/server/src/routes/kosync.ts` | PUT: store XPointer + convert to CFI. GET: return stored XPointer |
| Modify | `packages/server/src/trpc/routers/progress.ts` | sync: convert CFI → XPointer on save |
| Add dep | `packages/server/package.json` | `linkedom` for DOM parsing |
| Create | `packages/server/src/__tests__/cfi-converter.test.ts` | Unit tests for converter |

---

## Section 6: Dependencies

- `linkedom` — lightweight DOM parser (~50KB), no browser APIs, fast. Alternative to jsdom (heavy) or cheerio (no standard DOM API).
- `epub2` — already in project, used to extract spine HTML from EPUB files.
