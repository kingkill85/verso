# Session 2: "Read a Book" — Design Spec

## Goal

The core reading experience. A user can open an EPUB, read it in a full-screen reader with customizable settings, come back later and pick up exactly where they left off. The library page shows what they're currently reading.

**Result:** Open a book, read it, come back later and pick up where you left off.

## Scope

### In scope
- EPUB reader page with epub.js (paginated + scrolling modes)
- Reader settings panel (font family, size, line height, theme, margins)
- Reading progress sync via tRPC (CFI position + percentage, debounced saves)
- Resume reading from last position
- TOC navigation
- "Continue Reading" row on library page (auto-populated from progress)
- Book detail page updates (reading CTA button, progress card)

### Out of scope (later sessions)
- Reading time tracking (Session 4 — needs visibility/inactivity detection)
- Annotations: highlights, bookmarks, notes (Session 4)
- Reading stats (Session 4)
- `markFinished` / `resetProgress` UI (Session 3/4 — auto-detection at >=98% is sufficient for now)
- PDF reader (view-only via native browser, not epub.js)

## Architecture

### Approach: Thin Ref Wrapper

epub.js is an imperative DOM library. We wrap it with a single `useEpubReader` hook that owns the `Book` and `Rendition` objects via `useRef`, exposes imperative methods and reactive state. No context provider — the reader page is flat enough that props work.

### Component Tree

```
ReaderPage (/_app/books/$id/read.tsx)
├── useEpubReader(bookId)
│   Returns: { containerRef, nextPage, prevPage, goTo,
│     currentCfi, percentage, toc, isLoaded,
│     settings, updateSettings }
├── useProgressSync(bookId, percentage, cfi)
│   Debounced tRPC mutation (30s interval + on page turn)
│
├── EpubViewer          — container div, ref from hook
├── ReaderTopBar        — book title, close button (→ book detail)
├── ReaderBottomBar     — progress bar, page/percentage indicator
├── TapZones            — invisible left/center/right tap areas
├── TOCPanel            — slide-in from left, chapter list
└── SettingsPanel       — slide-in from right, font/theme/spacing
```

### Data Flow

**On mount:**
1. Fetch book metadata via `trpc.books.byId`
2. Fetch saved progress via `trpc.progress.get`
3. Load EPUB from `GET /api/books/:id/file`
4. epub.js renders into container div
5. If saved CFI exists → `rendition.display(cfi)`
6. Extract TOC from `book.navigation.toc`

**During reading:**
7. Page turn → epub.js fires `relocated` event
8. Hook updates `currentCfi` + `percentage` state
9. `useProgressSync` debounces → `trpc.progress.sync`

**Settings change:**
10. User adjusts font/theme → hook calls `rendition.themes.override()`
11. Settings persisted to `localStorage` (per-device, not DB)

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Reader settings → localStorage | Font size, theme, margins are device-specific preferences. No need to sync across devices. |
| Reading progress → server via tRPC | Position must sync across devices — that's the point. Debounced to avoid API hammering. |
| Full-screen route, not modal | `/_app/books/$id/read` is a real route with its own layout that hides the app shell. Back button → book detail. |
| Controls auto-hide after 3s | Top + bottom bars fade out. Tap center to toggle. 0.3s fade transition. Panels (TOC, settings) closed explicitly. |
| Reader theme ≠ app theme | Reader has its own light/dark/sepia that controls epub.js content independently from app dark/light mode. |

## Reader UI

### Layout

Full-screen page. Sidebar and topbar are hidden.

- **Top bar** (48px): Book title (serif, subtle), close button (✕ → book detail), TOC button (☰), settings button (⚙). Semi-transparent background with backdrop blur.
- **Content area**: epub.js renders here. Max-width ~600px centered for comfortable reading.
- **Bottom bar** (40px): Thin progress bar (3px, warm accent), percentage indicator. Same semi-transparent treatment.
- **Tap zones**: Invisible overlays — left 33% = prev page, center 33% = toggle controls, right 33% = next page.

### TOC Panel

Slides in from the left over content. Shows chapter list from `book.navigation.toc`. Active chapter highlighted with warm accent background. Click chapter → `rendition.display(href)` → close panel.

### Settings Panel

Slides in from the right over content. Controls:

- **Font size**: Range slider, 12–28px
- **Font family**: Serif (default) / Sans-serif / Dyslexic-friendly (3 toggle buttons)
- **Line spacing**: Compact / Normal (default) / Relaxed (3 toggle buttons)
- **Margins**: Narrow / Normal (default) / Wide (3 toggle buttons)
- **Theme**: Light / Dark / Sepia (3 toggle buttons with color preview)
- **View mode**: Paginated (default) / Scrolling (toggle)

All settings persisted to `localStorage` under key `verso-reader-settings`.

### Navigation

- **Tap zones**: Left/center/right as described above
- **Swipe**: Left/right for page turns (touch devices)
- **Keyboard**: ← → arrow keys, Space = next page, Escape = close reader
- **Close**: ✕ button or Escape returns to `/books/$id` (book detail, not library)

## Backend

### Progress Router (`progress.ts`)

Two procedures for Session 2:

**`progress.get`** — query
- Input: `{ bookId: string }`
- Output: `ReadingProgress | null`
- Returns the `reading_progress` row for current user + book, or null

**`progress.sync`** — mutation
- Input: `{ bookId: string, percentage: number, cfiPosition?: string, currentPage?: number }`
- Upserts `reading_progress` row (unique on `user_id + book_id`)
- Auto-sets `started_at` to now on first call (when no existing row)
- Auto-sets `finished_at` to now when `percentage >= 98`
- Updates `last_read_at` to now on every call
- Returns updated `ReadingProgress`

### File Streaming

The existing `GET /api/books/:id/file` endpoint already streams the EPUB file. epub.js will fetch from this URL with the auth token in the header.

## Frontend Updates

### Book Detail Page

- **Reading CTA**: The primary pill button in the hero section. Shows "Start Reading" if no progress, "Continue Reading (23%)" if in progress, "Read Again" if finished. Links to `/_app/books/$id/read`.
- **Progress card**: Below the hero, when book is in progress. Shows progress bar + percentage + "X pages remaining" (if page count known).

### Library Page

- **"Continue Reading" row**: Horizontal scrolling row of mini cards, shown above the book grid only when there are books with active progress. Each card: mini cover (52×76px), title (1-line clamp), progress bar, percentage. Click → `/books/$id/read` (direct to reader). Data from `trpc.books.currentlyReading`.

## New Files

### Server
- `packages/server/src/trpc/routers/progress.ts` — progress router

### Web
- `packages/web/src/routes/_app/books/$id/read.tsx` — reader page route
- `packages/web/src/components/reader/EpubViewer.tsx` — epub.js container
- `packages/web/src/components/reader/ReaderTopBar.tsx` — top controls
- `packages/web/src/components/reader/ReaderBottomBar.tsx` — bottom progress
- `packages/web/src/components/reader/TapZones.tsx` — navigation zones
- `packages/web/src/components/reader/TOCPanel.tsx` — table of contents
- `packages/web/src/components/reader/SettingsPanel.tsx` — reader settings
- `packages/web/src/hooks/useEpubReader.ts` — epub.js integration hook
- `packages/web/src/hooks/useProgressSync.ts` — debounced progress sync
- `packages/web/src/components/books/ContinueReadingRow.tsx` — library row

### Modified Files
- `packages/server/src/trpc/router.ts` — add progress router
- `packages/web/src/routes/_app/books/$id.tsx` — add reading CTA + progress card
- `packages/web/src/routes/_app/index.tsx` — add Continue Reading row
