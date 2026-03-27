# Shared Library, Role Enforcement & Personal Home Page

## Summary

Transform Verso from a per-user library into a shared library with role-based access control. Add admin user management, remove self-registration, and introduce a personal home page for each user's reading activity.

## 1. Shared Library

- Remove all `addedBy` filters from book queries (~15 locations across books router, shelves router, annotations, metadata, stream, covers routes)
- `addedBy` column stays on the schema for tracking who uploaded — not used for visibility filtering
- Every authenticated user sees every book in the library
- Library page moves to `/library` — a clean book grid with search and filters, no personal reading sections
- Upload, edit, delete, import, export are admin-gated (see section 2)

### Files affected

- `packages/server/src/trpc/routers/books.ts` — remove `addedBy` from list, byId, update, delete, recentlyAdded, currentlyReading, search queries
- `packages/server/src/trpc/routers/shelves.ts` — remove `addedBy` from smart shelf queries (recently added, generic filter)
- `packages/server/src/trpc/routers/annotations.ts` — remove `addedBy` ownership check (book exists is enough)
- `packages/server/src/trpc/routers/metadata.ts` — remove `addedBy` from book lookups
- `packages/server/src/routes/stream.ts` — remove `addedBy` from file access check
- `packages/server/src/routes/covers.ts` — remove `addedBy` from cover access check
- `packages/web/src/routes/_app/index.tsx` — move to `/library` route, strip personal sections (Continue Reading)

## 2. Role Enforcement

Two roles: `admin` and `user` (already in schema, `adminProcedure` already exists but unused).

### Admin-only operations

**tRPC (use `adminProcedure`):**
- Book edit (`books.update`)
- Book delete (`books.delete`)
- Metadata refresh (`metadata.search`, `metadata.apply`)

**Fastify routes (check `role === "admin"` in route handler):**
- Book upload (`POST /api/upload`)
- Library import (`POST /api/import/*`)
- Library export (`GET /api/export/library`)

### Client-side gating

- Hide Upload, Import, Export links from sidebar when user is not admin
- Hide Edit and Delete from book detail overflow menu when user is not admin
- `useAuth()` hook already exposes `user.role` — use this for conditional rendering

### Registration removal

- Delete `/register` route (`packages/web/src/routes/_auth/register.tsx`)
- Remove any links to register from the login page
- Server `register` endpoint already blocks after first user (implemented earlier this session)

## 3. User Management (Admin)

### New server routes (all `adminProcedure`)

- `admin.listUsers` — returns all users (id, email, displayName, role, createdAt, lastLoginAt)
- `admin.createUser` — creates user with displayName, email, password, role; seeds default shelves
- `admin.updateUserRole` — changes role for a user (cannot change own role)
- `admin.deleteUser` — deletes user and cascading data (cannot delete yourself)

### New admin pages

- `/admin/users` — table of all users with role badges, actions column
- Create user form (inline or modal): display name, email, password, role picker
- Role toggle: click to switch admin/user with confirm dialog
- Delete user: confirm dialog ("Delete user X? All their reading data will be lost.")

### Sidebar changes

- New "Admin" section visible only to admins, containing:
  - Users
  - Upload
  - Import
  - Export

## 4. Personal Home Page

### Route: `/home` (default landing after login)

Displays the current user's reading activity:

- **Continue Reading** — books with active progress (started, not finished), ordered by last read. Shows cover, title, author, progress percentage.
- **Recently Added** — latest books added to the shared library (not user-specific, just a convenience view). Last 10-20 books.
- **Your Shelves** — cards/links for each of the user's shelves with book counts.
- **Recently Finished** — last few books the user marked as done, ordered by finishedAt.

### Navigation restructure

Sidebar order:
1. Home (personal dashboard)
2. Library (shared book browser)
3. User's default shelves (Currently Reading, Want to Read, Favorites, Recently Added, Finished)
4. User's custom shelves
5. Admin section (admin only): Users, Upload, Import, Export
6. Footer: user avatar/name link to `/account`, logout button

### Route changes

| Before | After |
|--------|-------|
| `/` (library + personal) | `/home` (personal dashboard) |
| — | `/library` (shared book browser) |
| `/register` | removed |
| — | `/admin/users` (new) |

Default redirect after login: `/home`.

## 5. Export changes

Export currently exports books filtered by `addedBy`. With a shared library:
- Export includes ALL books in the library (admin-only operation)
- No change needed to export format, just remove the user filter

## Non-goals

- Personal/private book libraries (future feature)
- User groups or shared shelves between users
- Granular permissions beyond admin/user
- Multiple libraries
