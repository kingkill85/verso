# Detail Page Consistency — Design Spec

**Date:** 2026-04-01
**Scope:** Standardize layout, typography, actions, and states across book, author, and shelf detail pages.

---

## 1. Shared Detail Page Structure

Every detail page follows this template:

```
max-w-4xl mx-auto animate-in fade-in
├── BackButton
├── Hero Card (rounded-xl, p-4 md:p-6, mb-5, var(--card) bg)
│   ├── Flex row: [Image/Icon left] [Info flex-1 min-w-0]
│   │   Info column:
│   │     ├── Flex row: [Title + subtitle] ←→ [Icon actions top-right]
│   │     ├── Meta line / tags
│   │     └── Primary actions row (mt-4, flex wrap gap-2)
├── Sections below hero
│   ├── Section heading (font-display text-sm font-semibold, var(--text))
│   └── Section content
└── ...more sections
```

---

## 2. Typography Standards

| Element | Classes | Color |
|---------|---------|-------|
| Page title (h1) | `font-display text-lg md:text-2xl font-bold leading-tight` | `var(--text)` |
| Subtitle (author, count) | `font-display text-sm md:text-base` | `var(--text-dim)` |
| Meta line (series, dates) | `text-xs` | `var(--text-faint)` |
| Section heading | `font-display text-sm font-semibold mb-2` | `var(--text)` |
| Body text (description, bio) | `font-display italic leading-relaxed text-sm` | `var(--text-dim)` |
| Tag chips | `px-2 py-0.5 rounded-full text-[11px] font-medium` | `var(--text-dim)` on `var(--bg)` |

---

## 3. Icon Actions (Top-Right of Hero)

Secondary actions float to the top-right corner of the hero card, alongside the title.

**Button style:** `p-2.5 rounded-full border` with Lucide icons at 16px.

**Colors:**
- Neutral actions: `var(--text-dim)` text, `var(--border)` border
- Accent actions (e.g. Refresh Metadata): `var(--warm)` text
- Destructive actions (e.g. Delete): `#ef4444` text

**Layout:** `display: flex; gap: 4px; flex-shrink: 0;` — sits in a `justify-between` row with the title/subtitle block.

On mobile, the icons stay in the same top-right position. They wrap naturally if there are many.

---

## 4. Book Detail Page

**Hero card contents:**
- **Left:** BookCover component (lg on mobile via `block md:hidden`, xl on desktop via `hidden md:block`)
- **Right (info column):**
  - Row 1: Title + subtitle (left) ←→ Icon actions (right)
    - Icon actions: Download, Kindle (if configured), Edit (admin), Mark Finished (green, if not finished), Reset Progress (if has progress), Delete (admin, red)
  - Genre chips + meta tags
  - Primary actions row (mt-4): Read button (warm pill), Add to Shelf button

**Sections below hero:**
- Description (`font-display text-sm font-semibold` heading, `font-display italic` text)
- Tab bar: Details | Annotations | Bookmarks
- Tab content in cards

---

## 5. Author Detail Page

**Hero card contents:**
- **Left:** Author photo in `rounded-xl` container (w-20 h-20 mobile, w-32 h-32 desktop). Initials fallback with `hashColor()` background.
- **Right (info column):**
  - Row 1: Name + book count + birth/death date (left) ←→ Icon actions (right, admin only)
    - Icon actions: Edit (Pencil), Refresh Metadata (RotateCcw, warm color)
  - Bio preview (mt-3, line-clamp-3, `font-display italic text-sm`) or "No bio" italic text
  - No primary action buttons

**Sections below hero:**
- Biography section: full bio text without line-clamp (only shown if bio exists)
- Books section heading + book grid

---

## 6. Shelf Detail Page

**Hero card contents:**
- **Left:** Shelf icon/emoji (text-2xl, `var(--text-dim)`)
- **Right (info column):**
  - Row 1: Shelf name + smart badge (left) ←→ Icon actions (right)
    - Icon actions: Edit (Pencil) for any editable/smart shelf, Delete (Trash2, red) for non-default user-created shelves only
  - Book count subtitle
  - Shelf description if present (italic, `var(--text-dim)`)
  - No primary action buttons

**Content below hero:**
- Book grid directly (no section heading needed — the shelf IS the book list)

---

## 7. Edit Pages (No Changes)

Edit pages keep their current structure:
- Header row: BackButton (left) ←→ Save button (right)
- Form fields in `rounded-xl p-5 var(--card)` card sections
- Section labels: `text-xs font-medium uppercase tracking-wider mb-4 var(--text-faint)`

---

## 8. Loading & Error States (Standardized)

**Loading:**
```jsx
<div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}>
  <p className="text-sm">{t("common.loading")}</p>
</div>
```

**Not found / Error:**
```jsx
<div className="flex flex-col items-center justify-center py-20 text-center">
  <p className="font-display text-lg" style={{ color: "var(--text)" }}>{t("book.notFound" /* or authors.notFound, shelf.notFound */)}</p>
  <BackButton className="mt-2" />
</div>
```

---

## 9. Files to Modify

| File | Changes |
|------|---------|
| `packages/web/src/routes/_app/books/$id.tsx` | Move icon actions to top-right of hero, remove separate mobile/desktop action rows |
| `packages/web/src/routes/_app/authors/$id.tsx` | Match hero card pattern, icon actions top-right, rounded-xl photo |
| `packages/web/src/routes/_app/shelves/$id.tsx` | Add hero card, replace overflow menu with icon actions top-right, add `max-w-4xl mx-auto animate-in fade-in` wrapper |
