# Replace Dialogs with Dedicated Edit Pages

## Goal

Remove all modal dialogs from the app and replace them with dedicated pages. Every edit action gets a URL, consistent navigation, and proper layout space.

## What Changes

### Dialogs to Remove

| Dialog | Replacement |
|--------|------------|
| `BookEditDialog` | `/books/:id/edit` page |
| `FindMetadataDialog` | Integrated section within `/books/:id/edit` |
| `ShelfDialog` | `/shelves/new` and `/shelves/:id/edit` pages |

### New Route Files

```
packages/web/src/routes/_app/books/$id_.edit.tsx   — Book edit page (matches $id_.read.tsx convention)
packages/web/src/routes/_app/shelves/new.tsx        — Shelf create page
packages/web/src/routes/_app/shelves/$id_.edit.tsx  — Shelf edit page
```

### Files to Delete

```
packages/web/src/components/books/book-edit-dialog.tsx
packages/web/src/components/metadata/find-metadata-dialog.tsx
packages/web/src/components/shelves/shelf-dialog.tsx
```

### Files to Modify

```
packages/web/src/routes/_app/books/$id.tsx       — Remove dialog state, change Edit/Find Metadata buttons to Link
packages/web/src/routes/_app/shelves/$id.tsx      — Remove dialog state, change Edit menu item to Link
packages/web/src/components/layout/sidebar.tsx    — Change "+" button to Link to /shelves/new
```

---

## Book Edit Page (`/books/:id/edit`)

### Route

`/_app/books/$id/edit` — nested under the app layout, uses `$id` param to load book data.

### Data

- `trpc.books.byId` query to load current book
- `trpc.books.update` mutation to save
- `trpc.metadata.search` query for the find metadata section

### Layout

Two-column on desktop (`md+`), single-column stacked on mobile.

**Left column (sticky on desktop):**
- Book cover preview (`BookCover` component, size `xl`)
- Cover updates in real-time if metadata applies a new cover URL

**Right column — form sections:**

#### Header
- "Back to [Book Title]" link (left)
- "Save" button (right, disabled until form is dirty)
- Page title: "Edit Book"

#### Section 1: Basic Info
- Title — text input, required
- Author — text input, required
- Description — textarea, 4 rows

#### Section 2: Classification
- Genre — text input
- Language — text input
- Series + Series # — two inputs side by side on one row

#### Section 3: Publication
- Publisher — text input
- Year + ISBN — two inputs side by side on one row
- Page Count — number input

#### Section 4: Find Metadata (collapsible)
- Default state: collapsed, just a header "Find Metadata" with expand chevron
- Expanded state:
  - Search bar + Search button (pre-filled with `title author`)
  - Results list (same as current dialog step 1)
  - When a result is selected: diff/review UI replaces results (same checkbox flow as current dialog step 2)
  - "Apply Selected" button fills form fields above without saving. "Back to results" button to re-select.
  - Cover checkbox: if checked and applied, stores the cover URL to be sent with the save request.

### Behavior

- Form state: single React state object manages all fields. Metadata "Apply Selected" writes into this same state, marking fields dirty.
- Dirty tracking: compare current form values to loaded values
- "Save" sends only changed fields to `trpc.books.update` (same logic as current dialog)
- On success: invalidate `books.byId` and `books.list`, navigate back to `/books/:id`
- Unsaved changes: `beforeunload` for browser navigation + TanStack Router `useBlocker` for in-app navigation
- Cover URL from metadata: stored in form state, sent as `coverUrl` field in the update mutation

### Error States

- `trpc.books.byId` fails or book not found: show "Book not found" with back link (same pattern as detail page)
- `trpc.books.update` fails: show inline error message below Save button, keep form state intact for retry

### Styling

- Same CSS variable theming as rest of app
- Section cards: `rounded-xl` with `var(--card)` background, subtle section labels in `var(--text-faint)`
- Inputs: same style as current dialogs — `rounded-lg border`, `var(--card)` bg, `var(--border)` border
- Save button: `var(--warm)` background, white text, same as current

---

## Shelf Edit Page (`/shelves/new` and `/shelves/:id/edit`)

### Routes

- `/shelves/new` — create mode, blank form
- `/shelves/:id/edit` — edit mode, loads existing shelf

Both render the same component. The `new.tsx` route passes no shelf data; the `$id_.edit.tsx` route loads via `trpc.shelves.byId`.

### Data

- `trpc.shelves.byId` query (edit mode only)
- `trpc.shelves.create` mutation (create mode)
- `trpc.shelves.update` mutation (edit mode)

### Layout

Single column, centered, `max-w-lg` (~500px). Simple form.

#### Header
- "Back to [Shelf Name]" (edit) or "Back to library" (new)
- "Create" or "Save" button on the right
- Page title: "New Shelf" or "Edit Shelf"

#### Fields
1. Emoji input (small, ~w-14) + Name input (flex-1) — side by side
2. Description — text input, optional
3. Smart shelf toggle — checkbox, only shown on create (not edit). Once a shelf is smart, it stays smart.
4. If smart (create or edit): filter builder with presets, pre-populated with existing filter in edit mode (reuse existing `FilterBuilder` component)

### Behavior

- Create mode: submit calls `trpc.shelves.create`, on success navigate to `/shelves/:newId`
- Edit mode: submit calls `trpc.shelves.update`, on success navigate back to `/shelves/:id`
- Invalidate `shelves.list` on success (both modes)
- Invalidate `shelves.byId` on edit success

### Error States

- `trpc.shelves.byId` fails (edit mode): show "Shelf not found" with back link
- `trpc.shelves.create` / `trpc.shelves.update` fails: show inline error, keep form state

### Styling

Same as book edit page — card background, same input styles, consistent button styles.

---

## Navigation Changes

### Book Detail Page (`$id.tsx`)

Current "Edit" button (`onClick={() => setEditOpen(true)}`) becomes:
```tsx
<Link to="/books/$id/edit" params={{ id }}>Edit</Link>
```

Current "Find Metadata" button becomes:
```tsx
<Link to="/books/$id/edit" params={{ id }}>Edit & Metadata</Link>
```

Or keep both buttons, with "Find Metadata" linking to the same edit page but with a query param to auto-expand the metadata section: `/books/:id/edit?metadata=1`.

Remove: `editOpen` state, `metadataOpen` state, `BookEditDialog` render, `FindMetadataDialog` render.

### Shelf Detail Page (`shelves/$id.tsx`)

Current edit menu item (`onClick={() => setEditOpen(true)}`) becomes navigation:
```tsx
navigate({ to: "/shelves/$id/edit", params: { id } })
```

Remove: `editOpen` state, `ShelfDialog` portal render.

### Sidebar

Current "+" button (`onClick={() => setShelfDialogOpen(true)}`) becomes:
```tsx
<Link to="/shelves/new">+</Link>
```

Remove: `shelfDialogOpen` state, `ShelfDialog` portal render.

---

## What Stays the Same

- All TRPC mutations and their server-side logic — unchanged
- `AddToShelfMenu` dropdown — this is a small contextual menu, not a full dialog. Keep as-is.
- Delete confirmation — `window.confirm()` is fine, not a dialog to replace.
- `BookCover`, `FilterBuilder` components — reused in the new pages.
- `SourceBadge` — currently a local function inside `find-metadata-dialog.tsx`. Extract to `components/metadata/source-badge.tsx` before deleting the dialog.
- `dialog.tsx` UI primitive — nothing imports it, but keep it (zero cost, standard shadcn primitive).
