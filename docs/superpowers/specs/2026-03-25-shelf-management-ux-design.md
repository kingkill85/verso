# Shelf Management UX — Design Spec

## Overview

Fix four UX gaps in shelf management: edit/delete shelves, remove books from shelves, show shelf membership in AddToShelfMenu, and toggle book membership.

## Changes

### Backend: new `shelves.forBook` procedure

- Input: `{ bookId: string }`
- Returns: `string[]` — shelf IDs containing this book
- Query: `SELECT shelf_id FROM shelf_books WHERE book_id = ? AND shelf_id IN (user's shelves)`
- Used by AddToShelfMenu to show current membership

### Shelf detail page: edit/delete/remove

- **Header actions** (non-default, non-smart shelves only): "..." menu with Edit and Delete
  - Edit: opens ShelfDialog in edit mode (existing `editShelf` prop)
  - Delete: confirm dialog → `shelves.delete` → navigate to `/`
- **Book remove button** (manual shelves only): small "x" overlay on each book card
  - Calls `shelves.removeBook({ shelfId, bookId })`
  - Invalidates `shelves.byId` query
  - Not shown on smart shelves or default smart shelves (auto-populated)

### AddToShelfMenu: toggle with checkmarks

- Fetch `shelves.forBook({ bookId })` to get current membership set
- Display checkmark (✓) next to shelves the book is already in
- Click toggles: in shelf → `removeBook`, not in shelf → `addBook`
- Invalidate `shelves.forBook`, `shelves.list`, and `shelves.byId` on mutation success

### No changes to

Sidebar, search page, validators, schema, migration.

## Testing

### Backend
- `forBook` returns correct shelf IDs for a book in multiple shelves
- `forBook` returns empty array for book in no shelves
- `forBook` respects user isolation

### Frontend (manual verification)
- Edit button opens dialog with current shelf data pre-filled
- Delete button removes shelf and redirects
- "x" on book card removes book from manual shelf
- AddToShelfMenu shows checkmarks for current membership
- Clicking checked shelf removes book, clicking unchecked adds it
