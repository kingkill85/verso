# Detail Page Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the hero layout across book, author, and shelf detail pages so all three use the same "icon actions top-right" pattern with consistent typography and spacing.

**Architecture:** Each detail page gets the same hero card structure: image/icon left, info column right with title/subtitle, icon action buttons floated to top-right via `justify-between`. Primary actions (Read, Add to Shelf) sit below metadata. Shelf page gets wrapped in `max-w-4xl mx-auto` and gains a hero card. No backend changes.

**Tech Stack:** React, TanStack Router, Tailwind CSS, Lucide icons

---

## File Structure

### Modified files
| File | Changes |
|------|---------|
| `packages/web/src/routes/_app/books/$id.tsx` | Move icon actions to top-right row alongside title, remove error state inline back button |
| `packages/web/src/routes/_app/authors/$id.tsx` | Move icon actions to top-right as icon buttons, remove separate mobile/desktop action rows, add bio preview in hero |
| `packages/web/src/routes/_app/shelves/$id.tsx` | Wrap in `max-w-4xl mx-auto`, add hero card, replace overflow menu with icon buttons top-right, use Lucide icons |

---

## Task 1: Book Detail — Icon Actions Top-Right

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

The book page already has the hero card and icon buttons. The only change: move `BookActionButtons` from the actions row (alongside Read/Shelf) to a top-right position alongside the title.

- [ ] **Step 1: Restructure the info column to use justify-between for title row**

In `packages/web/src/routes/_app/books/$id.tsx`, replace the info column inside the hero card (the `<div className="flex-1 min-w-0">` block) with a structure that puts icon actions top-right:

```tsx
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h1
                  className="font-display text-lg md:text-2xl font-bold leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {book.title}
                </h1>
                <p
                  className="font-display italic text-sm md:text-base mt-0.5"
                  style={{ color: "var(--text-dim)" }}
                >
                  {/* ...existing author links JSX unchanged... */}
                </p>
                {book.series && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                    Book {book.seriesIndex || "?"} of {book.series}
                  </p>
                )}
              </div>
              {/* Icon actions — top right */}
              <div className="flex gap-1 shrink-0">
                <BookActionButtons
                  bookId={id}
                  bookTitle={book.title}
                  fileFormat={book.fileFormat}
                  hasProgress={!!progressQuery.data && progressQuery.data.percentage > 0}
                  isFinished={!!progressQuery.data?.finishedAt}
                  onDelete={handleDelete}
                  isDeleting={deleteMutation.isPending}
                  isAdmin={user?.role === "admin"}
                />
              </div>
            </div>

            {/* Genres */}
            {genreChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {/* ...existing genre chips JSX unchanged... */}
              </div>
            )}
            {/* Meta tags */}
            {metaTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {/* ...existing meta tags JSX unchanged... */}
              </div>
            )}

            {/* Primary actions only */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {(book.fileFormat === "epub" || book.fileFormat === "pdf") && (
                <Link
                  to="/books/$id/read"
                  params={{ id }}
                  search={{ cfi: undefined }}
                  className="inline-flex items-center px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: "var(--warm)" }}
                >
                  {/* ...existing read button text logic unchanged... */}
                </Link>
              )}
              <AddToShelfMenu bookId={id} />
            </div>
          </div>
```

Key changes:
- Wrap title block + icon actions in `flex justify-between items-start gap-2`
- Move `BookActionButtons` from the actions row to the top-right div
- Remove `BookActionButtons` from the primary actions row (leave only Read + AddToShelf)

- [ ] **Step 2: Fix the error state to use BackButton**

Replace the error state's inline back button:
```tsx
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>{t("book.notFound")}</p>
        <BackButton className="mt-2" />
      </div>
    );
```

- [ ] **Step 3: Build and verify**

Run:
```bash
pnpm build
```

Expected: Builds without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/_app/books/\$id.tsx
git commit -m "refactor(books): move icon actions to top-right of hero card"
```

---

## Task 2: Author Detail — Icon Actions Top-Right

**Files:**
- Modify: `packages/web/src/routes/_app/authors/$id.tsx`

Replace the current pill-style admin buttons (Edit, Refresh Metadata) with icon buttons floated top-right. Remove the separate mobile/desktop action rows. Add a bio preview (line-clamp-3) inside the hero, keep full bio section below.

- [ ] **Step 1: Add Lucide icon imports**

Add to imports:
```tsx
import { Pencil, RotateCcw } from "lucide-react";
```

- [ ] **Step 2: Restructure the hero card info column**

Replace the entire info column inside the hero card with:

```tsx
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h1
                  className="font-display text-lg md:text-2xl font-bold leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {author.name}
                </h1>
                <p
                  className="font-display text-sm md:text-base mt-0.5"
                  style={{ color: "var(--text-dim)" }}
                >
                  {t("authors.books", { count: author.books.length })}
                </p>
                {formatDate(author.birthDate, i18n.language) && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                    {formatDate(author.deathDate, i18n.language)
                      ? t("authors.lifespan", { birth: formatDate(author.birthDate, i18n.language), death: formatDate(author.deathDate, i18n.language) })
                      : t("authors.born", { date: formatDate(author.birthDate, i18n.language) })
                    }
                  </p>
                )}
              </div>
              {/* Icon actions — top right (admin only) */}
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Link
                    to="/authors/$id/edit"
                    params={{ id }}
                    title={t("authors.edit")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                  >
                    <Pencil size={16} />
                  </Link>
                  <button
                    onClick={() => refreshMutation.mutate({ id })}
                    disabled={refreshMutation.isPending}
                    title={t("authors.refreshMetadata")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80 disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--warm)" }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Bio preview */}
            {bio ? (
              <p
                className="font-display italic leading-relaxed text-sm mt-3 line-clamp-3"
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
```

- [ ] **Step 3: Remove the separate mobile admin actions section**

Delete the entire "Mobile admin actions" block that sits between the hero card and the biography section:

```tsx
      {/* Mobile admin actions — below hero card */}
      {isAdmin && (
        <div className="flex md:hidden flex-wrap items-center gap-2 mb-4">
          ...
        </div>
      )}
```

- [ ] **Step 4: Update biography section — show full text without clamp**

The biography section below the hero should show the full bio (no line-clamp):

```tsx
      {/* Biography section — full text */}
      {bio && (
        <>
          <h2
            className="font-display text-sm font-semibold mb-2"
            style={{ color: "var(--text)" }}
          >
            {t("authors.editBio")}
          </h2>
          <p
            className="font-display italic leading-relaxed text-sm mb-5"
            style={{ color: "var(--text-dim)" }}
          >
            {bio}
          </p>
        </>
      )}
```

This is unchanged from current — it already shows the full bio without clamp.

- [ ] **Step 5: Build and verify**

Run:
```bash
pnpm build
```

Expected: Builds without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/routes/_app/authors/\$id.tsx
git commit -m "refactor(authors): move admin actions to icon buttons top-right of hero"
```

---

## Task 3: Shelf Detail — Add Hero Card + Icon Actions

**Files:**
- Modify: `packages/web/src/routes/_app/shelves/$id.tsx`

The shelf page currently has no hero card and uses an overflow `...` menu. Wrap it in `max-w-4xl mx-auto`, add a hero card with shelf icon left, and replace the overflow menu with icon buttons (Edit, Delete) top-right.

- [ ] **Step 1: Update imports**

Replace the `MoreHorizontalIcon` import with Lucide icons:

```tsx
import { Pencil, Trash2 } from "lucide-react";
import { renderShelfIcon, translateShelfName } from "@/components/icons";
```

Remove `MoreHorizontalIcon` and `XIcon` from the icons import (keep `XIcon` only if `RemovableBookGrid` still uses it — check: yes it does).

Updated import line:
```tsx
import { XIcon, renderShelfIcon, translateShelfName } from "@/components/icons";
import { Pencil, Trash2 } from "lucide-react";
```

- [ ] **Step 2: Update the error state to use BackButton**

Replace:
```tsx
        <button onClick={() => window.history.back()} className="text-sm mt-2" style={{ color: "var(--warm)" }}>{t("common.back")}</button>
```
With:
```tsx
        <BackButton className="mt-2" />
```

- [ ] **Step 3: Rewrite the main return JSX**

Replace everything from `return (` to the `ConfirmDialog` with:

```tsx
  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <BackButton />

      {/* Hero card */}
      <div
        className="rounded-xl p-4 md:p-6 mb-5"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="flex gap-4 md:gap-6">
          {/* Shelf icon */}
          <div className="shrink-0 flex items-start pt-1">
            <span className="text-3xl" style={{ color: "var(--text-dim)" }}>
              {renderShelfIcon(shelf.emoji, shelf.name, 32)}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h1
                  className="font-display text-lg md:text-2xl font-bold leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {translateShelfName(shelf.name, t)}
                </h1>
                <p
                  className="font-display text-sm md:text-base mt-0.5"
                  style={{ color: "var(--text-dim)" }}
                >
                  {t("shelf.book", { count: books.length })}
                </p>
              </div>
              {/* Icon actions — top right */}
              <div className="flex gap-1 shrink-0">
                {shelf.isSmart && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] italic font-medium self-center mr-1"
                    style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}
                  >
                    {t("shelf.smartShelf")}
                  </span>
                )}
                {(canEdit || canEditSmart) && (
                  <Link
                    to="/shelves/$id/edit"
                    params={{ id }}
                    title={t("book.edit")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                  >
                    <Pencil size={16} />
                  </Link>
                )}
                {canEdit && (
                  <button
                    onClick={handleDelete}
                    title={t("book.delete")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--border)", color: "#ef4444" }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {shelf.description && (
              <p
                className="font-display italic text-sm mt-2"
                style={{ color: "var(--text-faint)" }}
              >
                {shelf.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="mb-6 max-w-md">
          <input
            type="text"
            placeholder={t("shelf.filterBooks")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>
      )}

      {canManageBooks ? (
        <RemovableBookGrid
          books={filteredBooks}
          onRemove={(bookId) => removeBookMutation.mutate({ shelfId: id, bookId })}
          isRemoving={removeBookMutation.isPending}
        />
      ) : (
        <BookGrid books={filteredBooks} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("confirm.deleteShelf")}
        message={t("confirm.deleteShelfMsg", { name: shelf.name })}
        confirmLabel={t("confirm.delete")}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMutation.mutate({ id });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
```

- [ ] **Step 4: Remove the `menuOpen` state**

Delete the `const [menuOpen, setMenuOpen] = useState(false);` line since the overflow menu is gone.

- [ ] **Step 5: Build and verify**

Run:
```bash
pnpm build
```

Expected: Builds without errors.

- [ ] **Step 6: Browser test**

Start dev server:
```bash
pnpm dev
```

Verify all three detail pages:
1. **Book detail** — icon actions (download, edit, delete, etc.) in top-right corner of hero, Read + Shelf buttons below metadata
2. **Author detail** — Edit + Refresh icons in top-right corner of hero (admin only), bio preview in hero, full bio below
3. **Shelf detail** — hero card with icon + name, Edit + Delete icons top-right, smart badge, book grid below
4. All three pages have `max-w-4xl mx-auto animate-in fade-in` wrapper
5. All three pages have consistent BackButton + loading/error states
6. Mobile: icon actions stay in top-right, no separate mobile action row

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/routes/_app/shelves/\$id.tsx
git commit -m "refactor(shelves): add hero card with icon actions, match book/author pattern"
```
