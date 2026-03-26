# Unified Reader Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone TOC panel with a unified sidebar (Contents / Bookmarks / Annotations tabs), add a bookmark toggle to the top bar, add a Bookmarks tab to the book detail page, and fix the highlight-not-removed-on-delete bug.

**Architecture:** Bookmarks reuse the existing `annotations` table with `type: "bookmark"`. New tRPC procedures filter by type. The sidebar is a single new component replacing `toc-panel.tsx`. The reader page wires bookmark state through the existing annotation query infrastructure.

**Tech Stack:** React, tRPC, Drizzle ORM, epub.js, TanStack Router, Zod

---

### Task 1: Add Bookmark Validators

**Files:**
- Modify: `packages/shared/src/annotation-validators.ts`

- [ ] **Step 1: Add bookmark validators**

Add these validators to the bottom of `packages/shared/src/annotation-validators.ts`:

```typescript
export const bookmarkCreateInput = z.object({
  bookId: z.string().uuid(),
  cfiPosition: z.string(),
  chapter: z.string().max(255).optional(),
  percentage: z.number().min(0).max(100).optional(),
});

export const bookmarkListInput = z.object({
  bookId: z.string().uuid(),
});
```

Also update `annotationCreateInput` to accept `"bookmark"` as a type:

Change line 9 from:
```typescript
  type: z.literal("highlight").default("highlight"),
```
to:
```typescript
  type: z.enum(["highlight", "bookmark"]).default("highlight"),
```

- [ ] **Step 2: Verify shared package builds**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/annotation-validators.ts
git commit -m "feat: add bookmark validators to shared package"
```

---

### Task 2: Add Bookmark Server Procedures

**Files:**
- Modify: `packages/server/src/trpc/routers/annotations.ts`

- [ ] **Step 1: Add imports for new validators**

In `packages/server/src/trpc/routers/annotations.ts`, update the import from `@verso/shared` to include the new validators:

```typescript
import {
  annotations,
  books,
  annotationListInput,
  annotationCreateInput,
  annotationUpdateInput,
  annotationDeleteInput,
  bookmarkListInput,
  bookmarkCreateInput,
} from "@verso/shared";
```

- [ ] **Step 2: Add listBookmarks procedure**

Add after the `delete` procedure, inside the `router({})` call:

```typescript
  listBookmarks: protectedProcedure.input(bookmarkListInput).query(async ({ ctx, input }) => {
    return ctx.db
      .select()
      .from(annotations)
      .where(
        and(
          eq(annotations.bookId, input.bookId),
          eq(annotations.userId, ctx.user.sub),
          eq(annotations.type, "bookmark"),
        ),
      )
      .orderBy(asc(annotations.cfiPosition));
  }),
```

- [ ] **Step 3: Add createBookmark procedure**

Add after `listBookmarks`:

```typescript
  createBookmark: protectedProcedure.input(bookmarkCreateInput).mutation(async ({ ctx, input }) => {
    const book = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, input.bookId), eq(books.addedBy, ctx.user.sub)),
    });
    if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    const [created] = await ctx.db
      .insert(annotations)
      .values({
        userId: ctx.user.sub,
        bookId: input.bookId,
        type: "bookmark",
        cfiPosition: input.cfiPosition,
        chapter: input.chapter,
        content: input.percentage != null ? String(Math.round(input.percentage)) : undefined,
      })
      .returning();
    return created;
  }),

  deleteBookmark: protectedProcedure.input(annotationDeleteInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.annotations.findFirst({
      where: and(
        eq(annotations.id, input.id),
        eq(annotations.userId, ctx.user.sub),
        eq(annotations.type, "bookmark"),
      ),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });

    await ctx.db.delete(annotations).where(eq(annotations.id, input.id));
    return { success: true };
  }),
```

Note: We store the percentage in the `content` field (as a string) since bookmarks don't use `content` for text. This avoids schema changes.

- [ ] **Step 4: Also filter highlights-only in the existing `list` procedure**

Update the existing `list` procedure to only return highlights (so bookmark records don't appear in the annotations list):

Change the `.where()` clause from:
```typescript
      .where(
        and(eq(annotations.bookId, input.bookId), eq(annotations.userId, ctx.user.sub)),
      )
```
to:
```typescript
      .where(
        and(
          eq(annotations.bookId, input.bookId),
          eq(annotations.userId, ctx.user.sub),
          eq(annotations.type, "highlight"),
        ),
      )
```

- [ ] **Step 5: Verify server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/trpc/routers/annotations.ts
git commit -m "feat: add bookmark CRUD procedures to annotations router"
```

---

### Task 3: Create ReaderSidebar Component

**Files:**
- Create: `packages/web/src/components/reader/reader-sidebar.tsx`
- Delete: `packages/web/src/components/reader/toc-panel.tsx` (in Task 5)

- [ ] **Step 1: Create the unified sidebar component**

Create `packages/web/src/components/reader/reader-sidebar.tsx`:

```tsx
import { useState } from "react";
import type { NavItem } from "epubjs";
import type { Annotation } from "@verso/shared";
import { BookCover } from "@/components/books/book-cover";

type ReaderSidebarProps = {
  open: boolean;
  onClose: () => void;
  // Book info for header
  book: { id: string; title: string; author: string; coverPath?: string | null; updatedAt?: string | null } | null;
  // Contents tab
  toc: NavItem[];
  currentChapter: string;
  onNavigate: (href: string) => void;
  // Bookmarks tab
  bookmarks: Annotation[];
  onDeleteBookmark: (id: string) => void;
  onBookmarkNavigate: (cfi: string) => void;
  // Annotations tab
  annotations: Annotation[];
  onDeleteAnnotation: (id: string) => void;
  onAnnotationNavigate: (cfi: string) => void;
};

type Tab = "contents" | "bookmarks" | "annotations";

const COLOR_MAP: Record<string, string> = {
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ReaderSidebar({
  open,
  onClose,
  book,
  toc,
  currentChapter,
  onNavigate,
  bookmarks,
  onDeleteBookmark,
  onBookmarkNavigate,
  annotations,
  onDeleteAnnotation,
  onAnnotationNavigate,
}: ReaderSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("contents");

  const tabs: { key: Tab; label: string }[] = [
    { key: "contents", label: "Contents" },
    { key: "bookmarks", label: "Bookmarks" },
    { key: "annotations", label: "Annotations" },
  ];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}
      <div
        className="fixed inset-y-0 left-0 w-80 z-50 flex flex-col transition-transform duration-300"
        style={{
          backgroundColor: "var(--sidebar-bg)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        {/* Book header */}
        {book && (
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <BookCover
              bookId={book.id}
              title={book.title}
              author={book.author}
              coverPath={book.coverPath}
              updatedAt={book.updatedAt}
              size="sm"
            />
            <div className="min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text)" }}
              >
                {book.title}
              </p>
              <p
                className="text-xs truncate"
                style={{ color: "var(--text-dim)" }}
              >
                {book.author}
              </p>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 text-xs font-medium transition-colors"
              style={{
                color: activeTab === tab.key ? "var(--warm)" : "var(--text-faint)",
                borderBottom: activeTab === tab.key ? "2px solid var(--warm)" : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "contents" && (
            <ContentsTab
              toc={toc}
              currentChapter={currentChapter}
              onNavigate={onNavigate}
              onClose={onClose}
            />
          )}
          {activeTab === "bookmarks" && (
            <BookmarksTab
              bookmarks={bookmarks}
              onDelete={onDeleteBookmark}
              onNavigate={onBookmarkNavigate}
              onClose={onClose}
            />
          )}
          {activeTab === "annotations" && (
            <AnnotationsTab
              annotations={annotations}
              onDelete={onDeleteAnnotation}
              onNavigate={onAnnotationNavigate}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}

function ContentsTab({
  toc,
  currentChapter,
  onNavigate,
  onClose,
}: {
  toc: NavItem[];
  currentChapter: string;
  onNavigate: (href: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="p-2">
      {toc.map((item) => {
        const isActive = item.label.trim() === currentChapter;
        return (
          <button
            key={item.id}
            onClick={() => { onNavigate(item.href); onClose(); }}
            className="w-full text-left px-3 py-2 rounded-md text-[13px] transition-colors hover:opacity-80"
            style={{
              backgroundColor: isActive ? "var(--warm-glow)" : "transparent",
              color: isActive ? "var(--warm)" : "var(--text-dim)",
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {item.label.trim()}
          </button>
        );
      })}
    </div>
  );
}

function BookmarksTab({
  bookmarks,
  onDelete,
  onNavigate,
  onClose,
}: {
  bookmarks: Annotation[];
  onDelete: (id: string) => void;
  onNavigate: (cfi: string) => void;
  onClose: () => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>No bookmarks yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
          Use the 🔖 button in the top bar to bookmark a page
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          className="flex items-center justify-between px-4 py-3 hover:opacity-80 transition-opacity cursor-pointer"
          style={{ borderBottom: "1px solid var(--border)" }}
          onClick={() => { onNavigate(bm.cfiPosition); onClose(); }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] truncate" style={{ color: "var(--text)" }}>
              {bm.chapter ?? "Unknown Chapter"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
              {bm.content ? `${bm.content}%` : ""}{bm.content && " · "}{formatDate(bm.createdAt)}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(bm.id); }}
            className="shrink-0 ml-3 text-sm hover:opacity-80"
            style={{ color: "var(--text-faint)" }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function AnnotationsTab({
  annotations,
  onDelete,
  onNavigate,
  onClose,
}: {
  annotations: Annotation[];
  onDelete: (id: string) => void;
  onNavigate: (cfi: string) => void;
  onClose: () => void;
}) {
  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>No annotations yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
          Select text in the reader to create a highlight
        </p>
      </div>
    );
  }

  // Group by chapter
  const grouped = new Map<string, Annotation[]>();
  for (const ann of annotations) {
    const chapter = ann.chapter ?? "Unknown Chapter";
    if (!grouped.has(chapter)) grouped.set(chapter, []);
    grouped.get(chapter)!.push(ann);
  }

  return (
    <div className="py-1">
      {Array.from(grouped.entries()).map(([chapter, items]) => (
        <div key={chapter}>
          <p
            className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            {chapter}
          </p>
          {items.map((ann) => {
            const borderColor = COLOR_MAP[ann.color ?? "yellow"] ?? COLOR_MAP.yellow;
            const text = ann.content ?? "";
            const truncated = text.length > 120 ? text.slice(0, 120) + "…" : text;

            return (
              <div
                key={ann.id}
                className="flex items-start gap-2 mx-3 my-1 px-3 py-2 rounded cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderLeft: `3px solid ${borderColor}` }}
                onClick={() => { onNavigate(ann.cfiPosition); onClose(); }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>
                    "{truncated}"
                  </p>
                  {ann.note && (
                    <p className="text-[11px] italic mt-1" style={{ color: "var(--text-dim)" }}>
                      {ann.note}
                    </p>
                  )}
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                    {formatDate(ann.createdAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
                  className="shrink-0 text-sm hover:opacity-80 pt-0.5"
                  style={{ color: "var(--text-faint)" }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep reader-sidebar || echo "OK"`
Expected: OK (or pre-existing errors only)

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reader/reader-sidebar.tsx
git commit -m "feat: create unified reader sidebar component with 3 tabs"
```

---

### Task 4: Add Bookmark Button to Top Bar

**Files:**
- Modify: `packages/web/src/components/reader/reader-top-bar.tsx`

- [ ] **Step 1: Update props and add bookmark button**

Replace the entire file `packages/web/src/components/reader/reader-top-bar.tsx` with:

```tsx
type ReaderTopBarProps = {
  title: string;
  visible: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onToggleBookmark: () => void;
  isBookmarked: boolean;
};

export function ReaderTopBar({
  title,
  visible,
  onClose,
  onToggleSidebar,
  onToggleSettings,
  onToggleBookmark,
  isBookmarked,
}: ReaderTopBarProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-30 transition-opacity duration-300"
      style={{
        backgroundColor: "rgba(18,17,15,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(46,42,36,0.5)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Table of Contents"
        >
          ☰
        </button>
        <span
          className="font-display text-sm truncate max-w-[200px] md:max-w-[400px]"
          style={{ color: "var(--text)" }}
        >
          {title}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <button
          onClick={onToggleBookmark}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: isBookmarked ? "var(--warm)" : "var(--text-dim)" }}
          title={isBookmarked ? "Remove bookmark" : "Bookmark this page"}
        >
          {isBookmarked ? "🔖" : "🔖"}
        </button>
        <button
          onClick={onToggleSettings}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Settings"
        >
          ⚙
        </button>
        <button
          onClick={onClose}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

Key changes: renamed `onToggleToc` → `onToggleSidebar`, added `onToggleBookmark` + `isBookmarked` props, bookmark icon uses `var(--warm)` when active.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/reader/reader-top-bar.tsx
git commit -m "feat: add bookmark toggle button to reader top bar"
```

---

### Task 5: Wire Sidebar and Bookmarks into Reader Page

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id_.read.tsx`
- Delete: `packages/web/src/components/reader/toc-panel.tsx`

- [ ] **Step 1: Update imports**

In `packages/web/src/routes/_app/books/$id_.read.tsx`, replace the TOCPanel import:

```typescript
// Remove this:
import { TOCPanel } from "@/components/reader/toc-panel";
// Add this:
import { ReaderSidebar } from "@/components/reader/reader-sidebar";
```

- [ ] **Step 2: Rename state and add bookmark queries**

Replace `tocOpen` state with `sidebarOpen`:

```typescript
const [sidebarOpen, setSidebarOpen] = useState(false);
```

Add bookmark queries after the existing annotation queries:

```typescript
  const bookmarksQuery = trpc.annotations.listBookmarks.useQuery({ bookId: id }, { enabled: isLoaded });
  const createBookmark = trpc.annotations.createBookmark.useMutation({
    onSuccess: () => bookmarksQuery.refetch(),
  });
  const deleteBookmark = trpc.annotations.deleteBookmark.useMutation({
    onSuccess: () => bookmarksQuery.refetch(),
  });
```

Add a computed `isBookmarked` value and toggle handler:

```typescript
  const isBookmarked = bookmarksQuery.data?.some((bm) => bm.cfiPosition === currentCfi) ?? false;

  const handleToggleBookmark = useCallback(() => {
    if (!currentCfi) return;
    const existing = bookmarksQuery.data?.find((bm) => bm.cfiPosition === currentCfi);
    if (existing) {
      deleteBookmark.mutate({ id: existing.id });
    } else {
      createBookmark.mutate({
        bookId: id,
        cfiPosition: currentCfi,
        chapter: currentChapter,
        percentage,
      });
    }
  }, [currentCfi, bookmarksQuery.data, id, currentChapter, percentage]);
```

- [ ] **Step 3: Update ReaderTopBar props**

Replace the ReaderTopBar JSX:

```tsx
      <ReaderTopBar
        title={bookQuery.data?.title ?? ""}
        visible={controlsVisible}
        onClose={handleClose}
        onToggleSidebar={() => { setSidebarOpen((v) => !v); setControlsVisible(true); }}
        onToggleSettings={() => { setSettingsOpen((v) => !v); setControlsVisible(true); }}
        onToggleBookmark={handleToggleBookmark}
        isBookmarked={isBookmarked}
      />
```

- [ ] **Step 4: Replace TOCPanel with ReaderSidebar**

Replace the `<TOCPanel ... />` JSX with:

```tsx
      <ReaderSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        book={bookQuery.data ? {
          id: bookQuery.data.id,
          title: bookQuery.data.title,
          author: bookQuery.data.author,
          coverPath: bookQuery.data.coverPath,
          updatedAt: bookQuery.data.updatedAt,
        } : null}
        toc={toc}
        currentChapter={currentChapter}
        onNavigate={(href) => { goTo(href); syncNow(); }}
        bookmarks={bookmarksQuery.data ?? []}
        onDeleteBookmark={(bmId) => deleteBookmark.mutate({ id: bmId })}
        onBookmarkNavigate={(cfi) => { goTo(cfi); syncNow(); }}
        annotations={annotationsQuery.data ?? []}
        onDeleteAnnotation={(annId) => {
          const ann = annotationsQuery.data?.find((a) => a.id === annId);
          if (ann) {
            try { renditionRef.current?.annotations.remove(ann.cfiPosition, "highlight"); } catch {}
            addedHighlightsRef.current.delete(ann.cfiPosition);
          }
          deleteAnnotation.mutate({ id: annId });
        }}
        onAnnotationNavigate={(cfi) => { goTo(cfi); syncNow(); }}
      />
```

Note: the `onDeleteAnnotation` handler also removes the highlight from the epub.js rendition — this fixes the highlight-not-removed-on-delete bug.

- [ ] **Step 5: Update any remaining `tocOpen` references**

Search for remaining `tocOpen` references in the file and replace with `sidebarOpen`:
- In the auto-hide controls effect: `if (!controlsVisible || tocOpen || settingsOpen)` → `if (!controlsVisible || sidebarOpen || settingsOpen)`
- Any other occurrences

- [ ] **Step 6: Fix the highlight popover delete handler too**

Find the existing `onDelete` prop on `<HighlightPopover>` and update it to also remove the highlight from the rendition:

```tsx
        onDelete={(aid) => {
          const ann = annotationsQuery.data?.find((a) => a.id === aid);
          if (ann) {
            try { renditionRef.current?.annotations.remove(ann.cfiPosition, "highlight"); } catch {}
            addedHighlightsRef.current.delete(ann.cfiPosition);
          }
          deleteAnnotation.mutate({ id: aid });
          setPopoverAnnotation(null);
        }}
```

- [ ] **Step 7: Delete toc-panel.tsx**

```bash
rm packages/web/src/components/reader/toc-panel.tsx
```

- [ ] **Step 8: Verify it compiles**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -v "reader-components.test\|TS2339.*manager" | head -20`
Expected: No new errors

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: wire unified sidebar into reader, add bookmark toggle, fix highlight delete"
```

---

### Task 6: Add Bookmarks Tab to Book Detail Page

**Files:**
- Create: `packages/web/src/components/books/bookmarks-tab.tsx`
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

- [ ] **Step 1: Create BookmarksTab component**

Create `packages/web/src/components/books/bookmarks-tab.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface BookmarksTabProps {
  bookId: string;
}

export function BookmarksTab({ bookId }: BookmarksTabProps) {
  const bookmarksQuery = trpc.annotations.listBookmarks.useQuery({ bookId });
  const utils = trpc.useUtils();
  const deleteBookmark = trpc.annotations.deleteBookmark.useMutation({
    onSuccess: () => utils.annotations.listBookmarks.invalidate({ bookId }),
  });

  if (bookmarksQuery.isLoading) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>
        Loading bookmarks...
      </p>
    );
  }

  const bookmarks = bookmarksQuery.data ?? [];

  if (bookmarks.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>
        No bookmarks yet. Open the reader and tap the 🔖 button to bookmark a page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          className="rounded-xl p-4 flex items-center justify-between"
          style={{ backgroundColor: "var(--card)" }}
        >
          <Link
            to="/books/$id/read"
            params={{ id: bookId }}
            search={{ cfi: bm.cfiPosition }}
            className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <p className="text-sm" style={{ color: "var(--text)" }}>
              {bm.chapter ?? "Unknown Chapter"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
              {bm.content ? `${bm.content}%` : ""}{bm.content && " · "}{formatDate(bm.createdAt)}
            </p>
          </Link>
          <button
            onClick={() => deleteBookmark.mutate({ id: bm.id })}
            disabled={deleteBookmark.isPending}
            className="shrink-0 ml-4 px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
            style={{ color: "#ef4444" }}
            aria-label="Delete bookmark"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add Bookmarks tab to book detail page**

In `packages/web/src/routes/_app/books/$id.tsx`:

Add import:
```typescript
import { BookmarksTab } from "@/components/books/bookmarks-tab";
```

Update the tab state type:
```typescript
const [activeTab, setActiveTab] = useState<"details" | "annotations" | "bookmarks">("details");
```

Add bookmark query for the count:
```typescript
const bookmarksQuery = trpc.annotations.listBookmarks.useQuery({ bookId: id });
```

Add the third tab button after the "Annotations" button in the tab bar JSX:

```tsx
        <button
          onClick={() => setActiveTab("bookmarks")}
          className="pb-2 text-sm font-medium transition-colors"
          style={{
            color: activeTab === "bookmarks" ? "var(--warm)" : "var(--text-dim)",
            borderBottom: activeTab === "bookmarks" ? "2px solid var(--warm)" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Bookmarks ({bookmarksQuery.data?.length ?? 0})
        </button>
```

Update the tab content rendering at the bottom. Replace:
```tsx
      {activeTab === "details" ? (
        ...details JSX...
      ) : (
        <AnnotationsTab bookId={id} />
      )}
```

With:
```tsx
      {activeTab === "details" ? (
        ...details JSX...
      ) : activeTab === "annotations" ? (
        <AnnotationsTab bookId={id} />
      ) : (
        <BookmarksTab bookId={id} />
      )}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/web && npx tsc --noEmit 2>&1 | grep -v "reader-components.test\|TS2339.*manager" | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/books/bookmarks-tab.tsx packages/web/src/routes/_app/books/\$id.tsx
git commit -m "feat: add bookmarks tab to book detail page"
```

---

### Task 7: Browser Test

**Files:** None (manual verification)

- [ ] **Step 1: Start dev servers if not running**

```bash
cd packages/server && npm run dev &
cd packages/web && npm run dev &
```

- [ ] **Step 2: Test in browser using Playwright**

Open the app, navigate to a book, open the reader. Verify:

1. ☰ opens the unified sidebar with book header and 3 tabs
2. Contents tab works (same as before)
3. Tap 🔖 in top bar → creates a bookmark → icon turns warm color
4. Open sidebar → Bookmarks tab shows the bookmark with chapter + percentage
5. Click bookmark entry → navigates to that position
6. Click ✕ on bookmark → deletes it
7. Create a highlight → open sidebar → Annotations tab shows it grouped by chapter
8. Click ✕ on annotation in sidebar → deletes it AND removes highlight from page
9. Delete annotation via highlight popover → highlight disappears immediately (bug fix)
10. Book detail page → Bookmarks tab shows bookmarks, click navigates to reader

- [ ] **Step 3: Commit any fixes needed**
