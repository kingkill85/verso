# foliate-js Reader Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace epub.js with foliate-js as the EPUB reader engine, with percentage-based position sync for KOReader compatibility.

**Architecture:** Vendor foliate-js modules into `packages/web/src/lib/foliate/`. Rewrite `use-epub-reader.ts` → `use-reader.ts` to use foliate-js's `<foliate-view>` Web Component. Update all reader components to use foliate-js events. Add percentage fallback navigation for kosync-synced positions.

**Tech Stack:** foliate-js (vendored), React 18, TypeScript, tRPC

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/web/src/lib/foliate/` | Vendored foliate-js modules (view.js, epub.js, epubcfi.js, paginator.js, overlayer.js, etc.) |
| Create | `packages/web/src/hooks/use-reader.ts` | New reader hook using foliate-js |
| Delete | `packages/web/src/hooks/use-epub-reader.ts` | Old epub.js hook |
| Modify | `packages/web/src/routes/_app/books/$id_.read.tsx` | Update to new hook + percentage fallback |
| Modify | `packages/web/src/components/reader/tap-zones.tsx` | Remove epub.js rendition dependency |
| Modify | `packages/web/src/components/reader/reader-sidebar.tsx` | Remove epubjs NavItem type |
| Modify | `packages/web/src/components/reader/settings-panel.tsx` | Update import path for ReaderSettings type |
| Modify | `packages/web/src/components/reader/highlight-toolbar.tsx` | No epub.js deps (already clean) |
| Modify | `packages/web/src/components/reader/highlight-popover.tsx` | No epub.js deps (already clean) |
| Modify | `packages/web/src/components/reader/reader-bottom-bar.tsx` | No changes needed |
| Modify | `packages/web/src/components/reader/reader-top-bar.tsx` | No changes needed |
| Modify | `packages/web/src/hooks/use-progress-sync.ts` | No changes needed |
| Modify | `packages/web/src/hooks/use-reading-timer.ts` | No changes needed |
| Modify | `packages/server/src/routes/kosync.ts` | Clear cfiPosition on percentage update |
| Remove | `epubjs` from package.json | |

---

## Task 1: Vendor foliate-js

**Files:**
- Create: `packages/web/src/lib/foliate/` directory with modules

- [ ] **Step 1: Clone foliate-js and copy needed modules**

```bash
cd /tmp
git clone https://github.com/johnfactotum/foliate-js.git
mkdir -p /Users/michaelkusche/dev/verso/packages/web/src/lib/foliate
```

Copy these files from the foliate-js repo into `packages/web/src/lib/foliate/`:
- `view.js`
- `epub.js`
- `epubcfi.js`
- `paginator.js`
- `overlayer.js`
- `fixed-layout.js`
- `progress.js`
- `search.js`
- `toc-progress.js`
- `page-progress.js`

Also copy any other `.js` files that these import from (check import statements). Common dependencies:
- `comic-book.js`, `fb2.js`, `mobi.js` — format handlers (we only need epub.js but view.js imports makeBook which auto-detects)
- `vendor/` — any vendored dependencies (zip.js, fflate, etc.)
- `css.js` — CSS processing utilities

Copy the entire repo content (all `.js` files) to be safe — we can prune later.

```bash
cp -r /tmp/foliate-js/*.js /Users/michaelkusche/dev/verso/packages/web/src/lib/foliate/
cp -r /tmp/foliate-js/vendor /Users/michaelkusche/dev/verso/packages/web/src/lib/foliate/vendor
rm -rf /tmp/foliate-js
```

- [ ] **Step 2: Verify imports resolve**

Create a quick test file `packages/web/src/lib/foliate/test-import.ts`:
```typescript
// @ts-nocheck
import { makeBook } from './view.js';
import { Overlayer } from './overlayer.js';
import * as CFI from './epubcfi.js';
console.log('foliate-js imports OK', makeBook, Overlayer, CFI);
```

Run: `cd packages/web && npx tsc --noEmit src/lib/foliate/test-import.ts 2>&1 || echo "Expected TS errors for JS files - check for import resolution only"`

Delete the test file after verifying.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/foliate/
git commit -m "feat: vendor foliate-js modules"
```

---

## Task 2: Create use-reader.ts Hook (Core)

This is the main rewrite. Replace `use-epub-reader.ts` with a new hook that uses foliate-js.

**Files:**
- Create: `packages/web/src/hooks/use-reader.ts`

- [ ] **Step 1: Create the new hook**

Create `packages/web/src/hooks/use-reader.ts`:

```typescript
import { useRef, useState, useEffect, useCallback } from "react";
import { getAccessToken } from "@/lib/auth";

export type ReaderSettings = {
  fontSize: number;
  fontFamily: "serif" | "sans-serif" | "dyslexic";
  lineSpacing: "compact" | "normal" | "relaxed";
  margins: "narrow" | "normal" | "wide";
  theme: "light" | "dark" | "sepia";
  flow: "paginated" | "scrolled";
};

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  fontFamily: "serif",
  lineSpacing: "normal",
  margins: "normal",
  theme: "dark",
  flow: "paginated",
};

const SETTINGS_KEY = "verso-reader-settings";

function loadSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const FONT_MAP: Record<ReaderSettings["fontFamily"], string> = {
  serif: "'Libre Baskerville', Georgia, serif",
  "sans-serif": "'Outfit', -apple-system, sans-serif",
  dyslexic: "'OpenDyslexic', sans-serif",
};

const LINE_HEIGHT_MAP: Record<ReaderSettings["lineSpacing"], string> = {
  compact: "1.4",
  normal: "1.7",
  relaxed: "2.0",
};

const MARGIN_MAP: Record<ReaderSettings["margins"], string> = {
  narrow: "20px",
  normal: "60px",
  wide: "120px",
};

const THEME_MAP: Record<ReaderSettings["theme"], { color: string; background: string }> = {
  light: { color: "#2a2520", background: "#f6f1ea" },
  dark: { color: "#e8e2d8", background: "#12110f" },
  sepia: { color: "#5b4636", background: "#f4ecd8" },
};

export type TocItem = {
  label: string;
  href: string;
  subitems?: TocItem[];
};

type UseReaderOptions = {
  bookId: string;
  initialCfi?: string | null;
  initialPercentage?: number | null;
  enabled?: boolean;
};

function buildStylesheet(s: ReaderSettings): string {
  const theme = THEME_MAP[s.theme];
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    @font-face {
      font-family: "OpenDyslexic";
      src: url("https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff") format("woff");
      font-weight: 400; font-style: normal; font-display: swap;
    }
    @font-face {
      font-family: "OpenDyslexic";
      src: url("https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Bold.woff") format("woff");
      font-weight: 700; font-style: normal; font-display: swap;
    }
    @font-face {
      font-family: "OpenDyslexic";
      src: url("https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Italic.woff") format("woff");
      font-weight: 400; font-style: italic; font-display: swap;
    }
    html, body {
      color: ${theme.color} !important;
      background: ${theme.background} !important;
      font-family: ${FONT_MAP[s.fontFamily]} !important;
      font-size: ${s.fontSize}px !important;
      line-height: ${LINE_HEIGHT_MAP[s.lineSpacing]} !important;
    }
  `;
}

export function useReader({ bookId, initialCfi, initialPercentage, enabled = true }: UseReaderOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [currentCfi, setCurrentCfi] = useState<string | null>(initialCfi ?? null);
  const [percentage, setPercentage] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentChapter, setCurrentChapter] = useState("");
  const [settings, setSettingsState] = useState<ReaderSettings>(loadSettings);

  const currentCfiRef = useRef<string | null>(initialCfi ?? null);
  useEffect(() => {
    currentCfiRef.current = currentCfi;
  }, [currentCfi]);

  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    let cancelled = false;
    const container = containerRef.current;

    async function init() {
      // Dynamic import to avoid SSR issues with Web Components
      const { makeBook } = await import("@/lib/foliate/view.js");
      const { Overlayer } = await import("@/lib/foliate/overlayer.js");

      // Fetch book file
      const token = getAccessToken();
      const response = await fetch(`/api/books/${bookId}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok || cancelled) return;
      const blob = await response.blob();
      if (cancelled) return;

      // Create view element
      const view = document.createElement("foliate-view") as any;
      container.appendChild(view);
      viewRef.current = view;

      // Open book
      const book = await makeBook(blob);
      await view.open(book);
      if (cancelled) return;

      // Set TOC
      if (book.toc) {
        setToc(book.toc);
      }

      // Apply settings
      const s = loadSettings();
      view.renderer.setAttribute("flow", s.flow === "scrolled" ? "scrolled" : "paginated");
      view.renderer.setAttribute("margin", MARGIN_MAP[s.margins]);
      view.renderer.setStyles(buildStylesheet(s));

      // Handle relocate events
      view.addEventListener("relocate", (e: any) => {
        if (cancelled) return;
        const { cfi, fraction, tocItem } = e.detail;
        if (cfi) {
          setCurrentCfi(cfi);
          currentCfiRef.current = cfi;
        }
        setPercentage(Math.round((fraction ?? 0) * 100));
        if (tocItem?.label) {
          setCurrentChapter(tocItem.label.trim());
        }
      });

      // Handle annotation drawing
      view.addEventListener("draw-annotation", (e: any) => {
        const { draw, annotation } = e.detail;
        const color = annotation?.color || "yellow";
        const colorMap: Record<string, string> = {
          yellow: "rgba(250,204,21,0.4)",
          green: "rgba(34,197,94,0.4)",
          blue: "rgba(59,130,246,0.35)",
          pink: "rgba(236,72,153,0.35)",
        };
        draw(Overlayer.highlight, { color: colorMap[color] || colorMap.yellow });
      });

      // Navigate to initial position
      if (initialCfi) {
        await view.init({ lastLocation: initialCfi });
      } else if (initialPercentage && initialPercentage > 0) {
        // kosync-synced position — use percentage
        await view.goToFraction(initialPercentage / 100);
      } else {
        await view.init({ showTextStart: true });
      }

      if (!cancelled) setIsLoaded(true);
    }

    init();

    return () => {
      cancelled = true;
      if (viewRef.current) {
        viewRef.current.close?.();
        viewRef.current.remove();
        viewRef.current = null;
      }
      container.innerHTML = "";
    };
  }, [bookId, initialCfi, initialPercentage, enabled]);

  const nextPage = useCallback(() => {
    viewRef.current?.next();
  }, []);

  const prevPage = useCallback(() => {
    viewRef.current?.prev();
  }, []);

  const goTo = useCallback((target: string) => {
    viewRef.current?.goTo(target);
  }, []);

  const addAnnotation = useCallback((cfi: string, color?: string) => {
    viewRef.current?.addAnnotation({ value: cfi, color: color || "yellow" });
  }, []);

  const removeAnnotation = useCallback((cfi: string) => {
    viewRef.current?.deleteAnnotation({ value: cfi });
  }, []);

  const updateSettings = useCallback((partial: Partial<ReaderSettings>) => {
    setSettingsVersion((v) => v + 1);
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);

      const view = viewRef.current;
      if (view?.renderer) {
        view.renderer.setStyles(buildStylesheet(next));
        view.renderer.setAttribute("margin", MARGIN_MAP[next.margins]);

        if (partial.flow && partial.flow !== prev.flow) {
          view.renderer.setAttribute("flow", next.flow === "scrolled" ? "scrolled" : "paginated");
        }
      }

      return next;
    });
  }, []);

  return {
    containerRef,
    viewRef,
    isLoaded,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    addAnnotation,
    removeAnnotation,
    updateSettings,
    settingsVersion,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/hooks/use-reader.ts
git commit -m "feat: create use-reader hook with foliate-js"
```

---

## Task 3: Update Reader Page to Use New Hook

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id_.read.tsx`

- [ ] **Step 1: Update imports and hook usage**

In `$id_.read.tsx`:

Replace:
```typescript
import { useEpubReader } from "@/hooks/use-epub-reader";
```
with:
```typescript
import { useReader } from "@/hooks/use-reader";
```

Replace the hook call:
```typescript
  const initialCfi = searchCfi ?? progressQuery.data?.cfiPosition ?? null;
  const dataReady = bookQuery.isSuccess && progressQuery.isSuccess;

  const {
    containerRef,
    renditionRef,
    ...
  } = useEpubReader({
    bookId: id,
    initialCfi: dataReady ? initialCfi : undefined,
    enabled: dataReady,
  });
```

with:
```typescript
  const initialCfi = searchCfi ?? progressQuery.data?.cfiPosition ?? null;
  const initialPercentage = (!initialCfi && progressQuery.data?.percentage) ? progressQuery.data.percentage : null;
  const dataReady = bookQuery.isSuccess && progressQuery.isSuccess;

  const {
    containerRef,
    viewRef,
    isLoaded,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    addAnnotation,
    removeAnnotation,
    updateSettings,
    settingsVersion,
  } = useReader({
    bookId: id,
    initialCfi: dataReady ? initialCfi : undefined,
    initialPercentage: dataReady ? initialPercentage : undefined,
    enabled: dataReady,
  });
```

- [ ] **Step 2: Update highlight management**

Replace all `renditionRef.current?.annotations.highlight(...)` calls with `addAnnotation(cfi, color)`.

Replace all `renditionRef.current?.annotations.remove(...)` calls with `removeAnnotation(cfi)`.

In the highlight effect that applies existing annotations on load/settings change, replace:
```typescript
renditionRef.current?.annotations.highlight(...)
```
with:
```typescript
addAnnotation(ann.cfiPosition, ann.color)
```

- [ ] **Step 3: Update text selection handling**

The epub.js `rendition.on("selected")` event needs to be replaced with foliate-js's selection handling. Add a `load` event listener in the reader page that sets up selection handling per section:

In the reader page, add an effect after `isLoaded`:
```typescript
  // Text selection for highlighting
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isLoaded) return;

    const handleLoad = ({ detail: { doc } }: any) => {
      doc.addEventListener("pointerup", () => {
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setToolbarPos(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Get iframe position
        const contents = view.renderer.getContents();
        if (!contents?.length) return;
        const iframe = contents[0].doc?.defaultView?.frameElement;
        const iframeRect = iframe?.getBoundingClientRect();

        const x = (iframeRect?.left ?? 0) + rect.left + rect.width / 2;
        const y = (iframeRect?.top ?? 0) + rect.top - 10;

        setToolbarPos({ x, y });
        pendingSelectionRef.current = { range, doc };
      });
    };

    view.addEventListener("load", handleLoad);
    return () => view.removeEventListener("load", handleLoad);
  }, [viewRef, isLoaded]);
```

Update `handleHighlight` to use foliate-js CFI:
```typescript
  const handleHighlight = async (color: string, note?: string) => {
    if (!pendingSelectionRef.current) return;
    const { range, doc } = pendingSelectionRef.current;
    const { fromRange } = await import("@/lib/foliate/epubcfi.js");
    const cfi = fromRange(range);
    if (!cfi) return;

    const text = range.toString();
    addAnnotation(cfi, color);

    createAnnotation.mutate({
      bookId: id,
      cfiPosition: cfi,
      content: text.slice(0, 500),
      color,
      note,
      chapter: currentChapter,
    });

    doc.getSelection()?.removeAllRanges();
    setToolbarPos(null);
    pendingSelectionRef.current = null;
  };
```

- [ ] **Step 4: Update annotation click handling**

Add `show-annotation` listener:
```typescript
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isLoaded) return;

    const handleShowAnnotation = ({ detail }: any) => {
      const { value, range } = detail;
      const ann = annotationsQuery.data?.find((a) => a.cfiPosition === value);
      if (!ann) return;

      const rect = range.getBoundingClientRect();
      const contents = view.renderer.getContents();
      const iframe = contents?.[0]?.doc?.defaultView?.frameElement;
      const iframeRect = iframe?.getBoundingClientRect();

      setPopoverAnnotation(ann);
      setPopoverPos({
        x: (iframeRect?.left ?? 0) + rect.left + rect.width / 2,
        y: (iframeRect?.top ?? 0) + rect.top - 10,
      });
    };

    view.addEventListener("show-annotation", handleShowAnnotation);
    return () => view.removeEventListener("show-annotation", handleShowAnnotation);
  }, [viewRef, isLoaded, annotationsQuery.data]);
```

- [ ] **Step 5: Update delete handlers**

Replace:
```typescript
try { if (ann.cfiPosition) renditionRef.current?.annotations.remove(ann.cfiPosition, "highlight"); } catch {}
if (ann.cfiPosition) addedHighlightsRef.current.delete(ann.cfiPosition);
```
with:
```typescript
if (ann.cfiPosition) removeAnnotation(ann.cfiPosition);
```

Remove the `addedHighlightsRef` entirely — foliate-js manages overlay state internally.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/routes/_app/books/\$id_.read.tsx
git commit -m "feat: reader page uses foliate-js hook"
```

---

## Task 4: Update Tap Zones

**Files:**
- Modify: `packages/web/src/components/reader/tap-zones.tsx`

- [ ] **Step 1: Rewrite tap zones to use foliate-js view**

The tap zones need to listen for clicks on the foliate-js view's iframe content. Instead of `rendition.on("click")`, we listen for click events on loaded documents.

```typescript
import { useEffect, useRef } from "react";

type TapZonesProps = {
  viewRef: React.RefObject<any>;
  isLoaded: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCenter: () => void;
};

export function TapZones({ viewRef, isLoaded, onPrev, onNext, onCenter }: TapZonesProps) {
  const callbacksRef = useRef({ onPrev, onNext, onCenter });
  callbacksRef.current = { onPrev, onNext, onCenter };

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isLoaded) return;

    const handleLoad = ({ detail: { doc } }: any) => {
      doc.addEventListener("click", (e: MouseEvent) => {
        const sel = doc.getSelection?.();
        if (sel && sel.toString().trim().length > 0) return;

        const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
        const iframeRect = iframe?.getBoundingClientRect();
        const absoluteX = (iframeRect?.left ?? 0) + e.clientX;
        const pageWidth = window.innerWidth;
        const relX = absoluteX / pageWidth;

        if (relX < 0.25) {
          callbacksRef.current.onPrev();
        } else if (relX > 0.75) {
          callbacksRef.current.onNext();
        } else {
          callbacksRef.current.onCenter();
        }
      });
    };

    view.addEventListener("load", handleLoad);
    return () => view.removeEventListener("load", handleLoad);
  }, [viewRef, isLoaded]);

  return null;
}
```

- [ ] **Step 2: Update TapZones usage in reader page**

In `$id_.read.tsx`, change:
```tsx
<TapZones renditionRef={renditionRef} ... />
```
to:
```tsx
<TapZones viewRef={viewRef} ... />
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reader/tap-zones.tsx packages/web/src/routes/_app/books/\$id_.read.tsx
git commit -m "feat: tap zones use foliate-js load events"
```

---

## Task 5: Update Reader Sidebar

**Files:**
- Modify: `packages/web/src/components/reader/reader-sidebar.tsx`

- [ ] **Step 1: Replace epubjs NavItem type**

Replace:
```typescript
import type { NavItem } from "epubjs";
```

with the `TocItem` type from the new hook:
```typescript
import type { TocItem } from "@/hooks/use-reader";
```

Replace all `NavItem` references with `TocItem` in the component props and body. The shape is the same (`label`, `href`, `subitems`).

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/reader/reader-sidebar.tsx
git commit -m "feat: reader sidebar uses TocItem from use-reader"
```

---

## Task 6: Update Settings Panel

**Files:**
- Modify: `packages/web/src/components/reader/settings-panel.tsx`

- [ ] **Step 1: Update import**

Replace:
```typescript
import type { ReaderSettings } from "@/hooks/use-epub-reader";
```
with:
```typescript
import type { ReaderSettings } from "@/hooks/use-reader";
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/reader/settings-panel.tsx
git commit -m "feat: settings panel imports from use-reader"
```

---

## Task 7: kosync — Clear CFI on Percentage Update

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`

- [ ] **Step 1: Add cfiPosition: null to kosync progress updates**

In `packages/server/src/routes/kosync.ts`, in the PUT /syncs/progress handler, update the readingProgress set call:

```typescript
      if (existing) {
        await db.update(readingProgress).set({
          percentage: percentage * 100,
          cfiPosition: null,  // Clear CFI — web reader will recalculate from percentage
          lastReadAt: now,
          deviceId: device_id,
          finishedAt: existing.finishedAt ?? finishedAt,
        }).where(eq(readingProgress.id, existing.id));
      } else {
        await db.insert(readingProgress).values({
          userId, bookId: matchedBook.id,
          percentage: percentage * 100,
          cfiPosition: null,  // No CFI from kosync
          startedAt: now, lastReadAt: now,
          deviceId: device_id, finishedAt,
        });
      }
```

- [ ] **Step 2: Run server tests**

Run: `cd packages/server && npx vitest run src/__tests__/kosync.test.ts`
Expected: PASS (cfiPosition was already null in most test scenarios).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/kosync.ts
git commit -m "feat: kosync clears cfiPosition when updating percentage"
```

---

## Task 8: Remove epub.js + Delete Old Hook

**Files:**
- Delete: `packages/web/src/hooks/use-epub-reader.ts`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Delete old hook**

```bash
rm packages/web/src/hooks/use-epub-reader.ts
```

- [ ] **Step 2: Remove epubjs dependency**

```bash
cd packages/web && pnpm remove epubjs
```

- [ ] **Step 3: Verify no remaining epub.js imports**

```bash
grep -r "epubjs\|epub\.js\|from \"epubjs\"" packages/web/src/ --include="*.ts" --include="*.tsx" -l
```

Expected: No results. If any remain, fix them.

- [ ] **Step 4: Build web package**

Run: `cd packages/web && pnpm build`
Expected: Builds successfully.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove epub.js dependency, delete old hook"
```

---

## Task 9: Remove Debug Logging from kosync

**Files:**
- Modify: `packages/server/src/routes/kosync.ts`

- [ ] **Step 1: Remove debug log lines**

Remove these lines from the kosync PUT handler:
```typescript
app.log.info({ document, progress, percentage, device, device_id, userId }, "kosync: PUT /syncs/progress");
app.log.info({ document, matchedBookId: matchedBook?.id ?? "NO MATCH" }, "kosync: book lookup by md5Hash");
const allBooks = await db.select({ id: books.id, title: books.title, md5Hash: books.md5Hash }).from(books).all();
app.log.info({ books: allBooks }, "kosync: all books in DB");
app.log.info({ existingId: existing.id, oldPct: existing.percentage, newPct: percentage * 100 }, "kosync: updating existing readingProgress");
app.log.info({ bookId: matchedBook.id, pct: percentage * 100 }, "kosync: creating new readingProgress");
app.log.info({ document }, "kosync: no book match, storing to kosyncProgress");
```

- [ ] **Step 2: Run server tests**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/kosync.ts
git commit -m "chore: remove debug logging from kosync"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Build everything**

```bash
cd /Users/michaelkusche/dev/verso
pnpm build
```

Expected: No errors.

- [ ] **Step 2: Run all server tests**

```bash
cd packages/server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Verify no epub.js references remain**

```bash
grep -r "epubjs\|epub\.js\|from \"epubjs\"\|use-epub-reader" packages/ --include="*.ts" --include="*.tsx" -l
```

Expected: No results (except possibly in docs/plans which is fine).

- [ ] **Step 4: Manual browser test checklist**

Start dev server and test each feature:

1. Open a book — should load and display
2. Page navigation — tap left/right zones, arrow keys
3. Settings — change font, size, theme, flow mode
4. Progress — close and reopen, should resume at correct position
5. Highlights — select text, pick color, highlight appears
6. Highlight popover — click highlight, edit note, change color, delete
7. Bookmarks — add/remove bookmark via top bar
8. Sidebar — TOC navigation, bookmarks list, annotations list
9. kosync sync — sync from KOReader, open in web reader, should navigate to approximate position
10. Web → KOReader — read in web, sync, verify KOReader gets updated percentage

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end verification fixes"
```

(Skip if no fixes needed.)
