# Unified Reader Sidebar

## Summary

Replace the current standalone TOC panel with a unified left-sliding sidebar containing three tabs: **Contents**, **Bookmarks**, and **Annotations**. Add a bookmark toggle button to the reader top bar. Add a Bookmarks tab to the book detail page.

## Motivation

The reader currently has a TOC-only panel (☰) and annotations are only viewable on the book detail page. There's no bookmark functionality. Users need a single place to navigate content, manage bookmarks, and browse annotations — all without leaving the reader.

## Architecture

### Approach: Replace TOC Panel In-Place

- Delete `toc-panel.tsx`, create `reader-sidebar.tsx` with 3 tabs
- Same left slide-in pattern (fixed, w-80, translateX animation, backdrop overlay)
- Same state management: `sidebarOpen` replaces `tocOpen`
- Settings panel stays independent on the right
- ☰ button opens the unified sidebar

### Bookmarks Data Model

Reuse the existing `annotations` table with `type: "bookmark"`. No new DB table needed.

A bookmark record:
- `type`: `"bookmark"` (vs `"highlight"` for annotations)
- `bookId`: the book
- `userId`: the user
- `cfiPosition`: the current CFI when bookmarked
- `chapter`: chapter name at time of bookmarking
- `content`: null (bookmarks have no text content)
- `note`: null
- `color`: null

### Server Changes

- New tRPC procedures under `annotations` router (or a new `bookmarks` convenience router):
  - `annotations.listBookmarks` — query where `type = "bookmark"` for a given bookId
  - `annotations.createBookmark` — insert with `type: "bookmark"`, `cfiPosition`, `chapter`
  - `annotations.deleteBookmark` — delete by id
- Add corresponding Zod validators in shared package

## Components

### 1. ReaderSidebar (`reader-sidebar.tsx`)

Replaces `toc-panel.tsx`. Left slide-in panel, w-80.

**Structure:**
- **Book header** — cover thumbnail (48×68), title (truncated), author
- **Tab bar** — Contents | Bookmarks | Annotations, active tab has accent underline
- **Tab content** — scrollable area below tabs

**Contents tab:**
- Same as current TOC panel behavior
- List of NavItems, active chapter highlighted (warm-glow bg, left border)
- Click navigates and closes sidebar

**Bookmarks tab:**
- List of bookmarks: chapter name, percentage, date
- Each entry has ✕ delete button
- Click navigates to that CFI position in the reader

**Annotations tab:**
- Grouped by chapter (uppercase chapter headers)
- Each entry: colored left border, quoted text (truncated), note if present (italic), date
- Each entry has ✕ delete button
- Click navigates to that CFI position in the reader

### 2. Reader Top Bar — Bookmark Button

Add a 🔖 icon between ⚙ and ✕ in the right group.

**Behavior:**
- Tap to toggle bookmark for the current page
- Visual state: dimmed when not bookmarked, filled/highlighted when current page is bookmarked
- Creates/deletes a bookmark annotation for the current CFI position

### 3. Book Detail Page — Bookmarks Tab

Add a third tab alongside "Details" and "Annotations" on the book detail page.

**BookmarksTab component** (`bookmarks-tab.tsx`):
- Lists all bookmarks for the book
- Each entry: chapter name, percentage, date, delete button
- Click navigates to reader at that bookmark's CFI (using `?cfi=` search param, already implemented)
- Empty state: "No bookmarks yet"

## Bug Fix: Highlight Not Removed on Delete

When deleting an annotation via the highlight popover in the reader, the highlight visual persists until page refresh. The delete handler must also call `rendition.annotations.remove(cfiRange, "highlight")` after the mutation succeeds.

## Files Changed

| File | Action |
|------|--------|
| `components/reader/toc-panel.tsx` | Delete |
| `components/reader/reader-sidebar.tsx` | Create — unified sidebar with 3 tabs |
| `components/reader/reader-top-bar.tsx` | Modify — add bookmark toggle button |
| `routes/_app/books/$id_.read.tsx` | Modify — replace TOCPanel with ReaderSidebar, add bookmark state/mutations, wire sidebar props |
| `routes/_app/books/$id.tsx` | Modify — add Bookmarks tab |
| `components/books/bookmarks-tab.tsx` | Create — bookmarks list for book detail page |
| `server/src/trpc/routers/annotations.ts` | Modify — add listBookmarks, createBookmark, deleteBookmark procedures |
| `shared/src/annotation-validators.ts` | Modify — add bookmark validators |
| Highlight delete handler in reader | Fix — remove highlight from rendition on delete |

## Out of Scope

- Bookmark notes (bookmarks are position-only for now)
- Bookmark export
- Annotation editing from the sidebar (editing stays in the highlight popover)
- Search within annotations/bookmarks
