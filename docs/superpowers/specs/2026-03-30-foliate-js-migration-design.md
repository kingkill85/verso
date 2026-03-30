# foliate-js Reader Migration — Design Spec

## Overview

Replace epub.js with foliate-js as the EPUB reader engine. Fix cross-device position sync by using percentage as the universal bridge between KOReader and the web reader, with CFI as the internal source of truth for the web.

## Why

epub.js has 517 open issues, broken `cfiFromPercentage`, unreliable pagination, and sporadic maintenance. foliate-js has cleaner architecture, solid CFI support, Range-based position tracking, SVG annotation overlays, and percentage-based navigation via `goToFraction()`.

---

## Section 1: Reader Engine Swap

Replace epub.js with foliate-js in the web reader. The main change is rewriting `use-epub-reader.ts`.

### API Mapping

| Feature | epub.js | foliate-js |
|---------|---------|-----------|
| Load book | `ePub(arrayBuffer)` | `new EPUB({ book })` + `view.open(book)` |
| Render | `book.renderTo(container, opts)` | `<foliate-view>` Web Component |
| Navigate to CFI | `rendition.display(cfi)` | `view.goTo(cfi)` |
| Navigate to start | `rendition.display()` | `view.init({ showTextStart: true })` |
| Navigate to percentage | broken `cfiFromPercentage` | `view.goToFraction(pct)` |
| Next/prev page | `rendition.next()/prev()` | `view.next()/prev()` |
| Current position | `rendition.on("relocated")` | `view.addEventListener("relocate")` — returns `{ cfi, fraction, tocItem }` |
| TOC | `book.loaded.navigation` | `book.toc` |
| Add highlight | `rendition.annotations.highlight(cfi, data, id, cls, styles)` | `view.addAnnotation(cfi, style)` |
| Remove highlight | `rendition.annotations.remove(cfi, "highlight")` | `view.removeAnnotation(cfi)` |
| Text selection | `rendition.on("selected", (cfiRange, contents))` | Selection event on view, `CFI.fromRange(range)` |
| Highlight clicked | `rendition.on("markClicked")` | Annotation click event on view |
| Theming | `rendition.themes.override(prop, value)` | CSS custom properties / stylesheet injection |
| Content injection | `rendition.hooks.content.register()` | View stylesheet API |
| Pagination/scroll | `flow: "paginated" \| "scrolled"` option | Renderer option |
| Location generation | `book.locations.generate(1024)` | Built-in section progress (automatic) |
| Cleanup | `rendition.destroy()`, `book.destroy()` | `view.close()` |

### Web Component Integration in React

foliate-js uses `<foliate-view>` custom element. In React, use a ref:

```tsx
const viewRef = useRef<HTMLElement>(null);

useEffect(() => {
  const view = viewRef.current;
  // configure view, add event listeners
  return () => view.close();
}, []);

return <foliate-view ref={viewRef} />;
```

### Dependency

foliate-js is not on npm. Vendor it into the project:
- Copy the needed modules into `packages/web/src/lib/foliate/`
- Import directly: `import { EPUB } from '@/lib/foliate/epub.js'`

Only include the modules we use: `epub.js`, `epubcfi.js`, `paginator.js`, `overlayer.js`, `view.js`, and their dependencies.

---

## Section 2: Position Sync Logic

CFI is the internal source of truth for the web reader. Percentage is the universal bridge for cross-device sync.

### readingProgress table

No schema changes. Already has `cfiPosition` (text, nullable) and `percentage` (real).

### Web reader syncs → server

The web reader computes both from foliate-js's `relocate` event:
- `cfi` from `event.detail.cfi`
- `percentage` from `event.detail.fraction` (overall book progress, 0-1, multiply by 100)

Sends both via `progress.sync({ bookId, cfiPosition, percentage })`.

### kosync pushes → server

KOReader sends percentage (0-1). Server:
1. Stores `percentage * 100`
2. Sets `cfiPosition = null`
3. Updates `lastReadAt`

The null CFI signals that the position came from KOReader and the web reader needs to recalculate.

### Web reader opens book

1. Fetch `readingProgress` — has `cfiPosition` and `percentage`
2. If `cfiPosition` exists → `view.goTo(cfi)` — exact position
3. If `cfiPosition` is null and `percentage > 0` → `view.goToFraction(percentage / 100)` — approximate
4. After navigation, the first `relocate` event gives a real CFI
5. Save CFI + percentage back via `progress.sync`

### kosync pulls (KOReader asks for position)

Returns `percentage / 100` — already works, no changes needed.

---

## Section 3: Highlights & Annotations

### Adding highlights

User selects text → foliate-js provides a selection event with a Range → convert to CFI via `CFI.fromRange(range)` → save to server with CFI, text content, color, chapter.

### Rendering highlights

On book load, fetch all annotations for the book → for each, call `view.addAnnotation(cfi, { color })`. foliate-js renders them as SVG overlays.

### Highlight interaction

Click on highlight → event with annotation data → show popover for edit/delete. Position popover using event coordinates.

### Bookmarks

Same as before — stored as annotations with `type: "bookmark"`, keyed by CFI at current position.

### No backend changes

Annotation schema stays the same. CFI is the position format for both epub.js and foliate-js.

---

## Section 4: Theming & Settings

### Settings stored

Same as current — `localStorage` key `verso-reader-settings`:
- `fontSize`: number (px)
- `fontFamily`: "serif" | "sans-serif" | "dyslexic"
- `lineSpacing`: "compact" | "normal" | "relaxed"
- `margins`: "narrow" | "normal" | "wide"
- `theme`: "light" | "dark" | "sepia"
- `flow`: "paginated" | "scrolled"

### Application

foliate-js applies styles via its view API or injected stylesheets:
- Font, size, line height, margins → injected CSS stylesheet
- Theme colors → CSS custom properties on the view element
- Paginated/scrolled → renderer configuration
- OpenDyslexic → `@font-face` in injected stylesheet (same CDN URLs)

### Flow mode switching

Changing between paginated and scrolled requires reconfiguring the renderer. foliate-js may handle this more cleanly than epub.js (which required full rendition destruction/recreation).

---

## Section 5: Files Changed

| Action | File | What changes |
|--------|------|-------------|
| Create | `packages/web/src/lib/foliate/` | Vendored foliate-js modules |
| Rewrite | `packages/web/src/hooks/use-epub-reader.ts` → `use-reader.ts` | Full rewrite to foliate-js API |
| Modify | `packages/web/src/routes/_app/books/$id_.read.tsx` | Update hook import, add percentage fallback logic |
| Modify | `packages/web/src/components/reader/tap-zones.tsx` | Adapt to foliate-js click events |
| Modify | `packages/web/src/components/reader/reader-sidebar.tsx` | Adapt TOC/bookmark/annotation navigation |
| Modify | `packages/web/src/components/reader/highlight-toolbar.tsx` | Adapt selection → CFI conversion |
| Modify | `packages/web/src/components/reader/highlight-popover.tsx` | Adapt highlight click event |
| Modify | `packages/web/src/components/reader/settings-panel.tsx` | Adapt theme/style application |
| Modify | `packages/web/src/components/reader/reader-bottom-bar.tsx` | Percentage from foliate-js event |
| Modify | `packages/web/src/hooks/use-progress-sync.ts` | No changes expected (just receives cfi + pct) |
| Modify | `packages/web/src/hooks/use-reading-timer.ts` | No changes expected |
| Modify | `packages/server/src/routes/kosync.ts` | Clear cfiPosition when percentage updated |
| Remove | `epubjs` npm dependency | |

### No backend schema changes. No migration needed.

---

## Section 6: kosync Server Change

One change in `packages/server/src/routes/kosync.ts` — when kosync updates progress for a matched book, clear the CFI:

```typescript
// In the existing readingProgress update:
await db.update(readingProgress).set({
  percentage: percentage * 100,
  cfiPosition: null,  // ADD THIS — signals web reader to use percentage
  lastReadAt: now,
  deviceId: device_id,
  finishedAt: existing.finishedAt ?? finishedAt,
}).where(eq(readingProgress.id, existing.id));
```

Same for the insert path — `cfiPosition` is already null by default.

---

## Implementation Order

1. Vendor foliate-js modules into project
2. Rewrite `use-reader.ts` hook (core reader lifecycle)
3. Update reader page + tap zones (navigation)
4. Update highlights (add/remove/click)
5. Update theming and settings
6. Update sidebar (TOC, bookmarks, annotations navigation)
7. Add percentage fallback navigation (kosync resume)
8. Update kosync route to clear CFI
9. Remove epub.js dependency
10. Test all features end-to-end
