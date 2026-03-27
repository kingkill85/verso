# Shared Library, Role Enforcement & Personal Home Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Verso from per-user isolated libraries into a shared library with admin/user roles, admin user management, and a personal home page.

**Architecture:** Remove `addedBy` ownership filters from all book queries so every user sees every book. Gate mutating operations (upload, edit, delete, import, export) behind admin role checks. Add admin user management routes. Split the current home page into a personal dashboard (`/home`) and a shared library browser (`/library`).

**Tech Stack:** tRPC, Drizzle ORM, TanStack Router, React, Fastify

**Spec:** `docs/superpowers/specs/2026-03-27-shared-library-roles-design.md`

---

### Task 1: Remove `addedBy` filters from book queries (shared library)

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts`
- Modify: `packages/server/src/trpc/routers/shelves.ts`
- Modify: `packages/server/src/trpc/routers/annotations.ts`
- Modify: `packages/server/src/trpc/routers/metadata.ts`
- Modify: `packages/server/src/routes/stream.ts`
- Modify: `packages/server/src/routes/covers.ts`

- [ ] **Step 1: Update books router — remove `addedBy` from list query**

In `packages/server/src/trpc/routers/books.ts`, the `list` procedure builds conditions starting with `eq(books.addedBy, ctx.user.sub)`. Remove this filter so all authenticated users see all books.

Find the line:
```ts
const conditions = [eq(books.addedBy, ctx.user.sub)];
```
Replace with:
```ts
const conditions: SQL[] = [];
```
Add the missing import `SQL` from drizzle-orm if needed.

- [ ] **Step 2: Update books router — remove `addedBy` from byId, update, delete**

In the same file, find every query that includes `eq(books.addedBy, ctx.user.sub)` in a `where` clause and remove that condition. These are in:
- `byId` — change `where: and(eq(books.id, input.id), eq(books.addedBy, ctx.user.sub))` to `where: eq(books.id, input.id)`
- `update` — same pattern
- `delete` — same pattern
- `recentlyAdded` — remove the `addedBy` filter from the `where` clause

- [ ] **Step 3: Update books router — remove `addedBy` from search**

In the `search` procedure, the raw SQL query includes an `addedBy` filter. Remove the `AND b.added_by = ?` clause and remove the corresponding parameter from the query.

- [ ] **Step 4: Update shelves router — remove `addedBy` from smart shelf queries**

In `packages/server/src/trpc/routers/shelves.ts`, find the `_recentlyAdded` smart shelf query and the generic filter query. Both have `eq(books.addedBy, ctx.user.sub)` in their `where` clauses. Remove these conditions.

- [ ] **Step 5: Update annotations router — remove book ownership check**

In `packages/server/src/trpc/routers/annotations.ts`, the `create` and `createBookmark` procedures check `eq(books.addedBy, ctx.user.sub)` when looking up the book. Change these to just check the book exists: `where: eq(books.id, input.bookId)`.

- [ ] **Step 6: Update metadata router — remove `addedBy` from book lookups**

In `packages/server/src/trpc/routers/metadata.ts`, the `search` and `apply` procedures check book ownership. Remove the `addedBy` condition from both `where` clauses.

- [ ] **Step 7: Update stream route — remove `addedBy` from file access**

In `packages/server/src/routes/stream.ts`, the book lookup includes `eq(books.addedBy, user.sub)`. Change to just `eq(books.id, id)`.

- [ ] **Step 8: Update covers route — remove `addedBy` from cover access**

In `packages/server/src/routes/covers.ts`, there are two places checking `eq(books.addedBy, user.sub)`. Remove this condition from both, keeping just the `eq(books.id, bookId)` check.

- [ ] **Step 9: Update export route — remove user filter**

In `packages/server/src/routes/export.ts` or the library-export service, the export query filters by user. Remove the `addedBy` filter so export includes all books.

- [ ] **Step 10: Verify by running existing tests**

Run: `pnpm test:server`
Fix any failures caused by the ownership filter removal.

- [ ] **Step 11: Commit**

```
git add -A && git commit -m "feat: make library shared — remove addedBy ownership filters"
```

---

### Task 2: Role enforcement — admin-gate mutating operations

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts`
- Modify: `packages/server/src/trpc/routers/metadata.ts`
- Modify: `packages/server/src/middleware/auth.ts`
- Modify: `packages/server/src/routes/upload.ts`
- Modify: `packages/server/src/routes/import.ts`
- Modify: `packages/server/src/routes/export.ts`

- [ ] **Step 1: Switch book mutations to adminProcedure**

In `packages/server/src/trpc/routers/books.ts`, change `update` and `delete` from `protectedProcedure` to `adminProcedure`. Import `adminProcedure` from `../index.js`.

- [ ] **Step 2: Switch metadata mutations to adminProcedure**

In `packages/server/src/trpc/routers/metadata.ts`, change `search` and `apply` from `protectedProcedure` to `adminProcedure`.

- [ ] **Step 3: Add admin auth hook for Fastify routes**

In `packages/server/src/middleware/auth.ts`, add a new exported function:

```ts
export function createAdminAuthHook(config: Config) {
  const authHook = createAuthHook(config);
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authHook(req, reply);
    if (reply.sent) return;
    if (req.user?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
  };
}
```

- [ ] **Step 4: Use admin hook on upload route**

In `packages/server/src/routes/upload.ts`, change `createAuthHook(config)` to `createAdminAuthHook(config)` and update the import.

- [ ] **Step 5: Use admin hook on import routes**

In `packages/server/src/routes/import.ts`, change to `createAdminAuthHook(config)` for all import endpoints.

- [ ] **Step 6: Use admin hook on export route**

In `packages/server/src/routes/export.ts`, change to `createAdminAuthHook(config)`.

- [ ] **Step 7: Run tests and fix failures**

Run: `pnpm test:server`
Update any test helpers that need admin role in their auth context.

- [ ] **Step 8: Commit**

```
git add -A && git commit -m "feat: enforce admin role on book mutations, upload, import, export"
```

---

### Task 3: Remove self-registration

**Files:**
- Delete: `packages/web/src/routes/_auth/register.tsx`
- Modify: `packages/web/src/routes/_auth/login.tsx`

- [ ] **Step 1: Delete the register page**

Delete `packages/web/src/routes/_auth/register.tsx`.

- [ ] **Step 2: Remove register link from login page**

In `packages/web/src/routes/_auth/login.tsx`, find and remove the footer content that links to `/register`. This is likely a `<Link to="/register">` or similar at the bottom of the login form.

- [ ] **Step 3: Verify login page renders without errors**

Start the dev server and navigate to `/login` in the browser. Confirm no broken links or errors.

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "feat: remove self-registration — admin creates users"
```

---

### Task 4: Admin user management — server

**Files:**
- Create: `packages/server/src/trpc/routers/admin.ts`
- Modify: `packages/server/src/trpc/router.ts`
- Create: `packages/shared/src/admin-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create admin input validators**

Create `packages/shared/src/admin-validators.ts`:

```ts
import { z } from "zod";

export const adminCreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  role: z.enum(["admin", "user"]),
});

export const adminUpdateRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user"]),
});

export const adminDeleteUserInput = z.object({
  userId: z.string().uuid(),
});
```

- [ ] **Step 2: Export validators from shared package**

In `packages/shared/src/index.ts`, add:
```ts
export * from "./admin-validators.js";
```

- [ ] **Step 3: Create admin router**

Create `packages/server/src/trpc/routers/admin.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { hash } from "bcrypt";
import { users, sessions } from "@verso/shared";
import {
  adminCreateUserInput,
  adminUpdateRoleInput,
  adminDeleteUserInput,
} from "@verso/shared";
import { router, adminProcedure } from "../index.js";
import { seedDefaultShelves } from "./seed-shelves.js";

const BCRYPT_ROUNDS = 12;

function toSafeUser(user: typeof users.$inferSelect) {
  const { passwordHash, oidcProvider, oidcSubject, ...safe } = user;
  return safe;
}

export const adminRouter = router({
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const allUsers = await ctx.db
      .select()
      .from(users)
      .orderBy(users.createdAt);
    return allUsers.map(toSafeUser);
  }),

  createUser: adminProcedure
    .input(adminCreateUserInput)
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hash(input.password, BCRYPT_ROUNDS);

      let newUser: typeof users.$inferSelect;
      try {
        const [inserted] = await ctx.db
          .insert(users)
          .values({
            email: input.email,
            displayName: input.displayName,
            passwordHash,
            role: input.role,
          })
          .returning();
        newUser = inserted;
        await seedDefaultShelves(ctx.db, newUser.id);
      } catch (err: any) {
        if (
          err.message?.includes("UNIQUE constraint failed") ||
          err.code === "SQLITE_CONSTRAINT_UNIQUE"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already in use",
          });
        }
        throw err;
      }

      return toSafeUser(newUser);
    }),

  updateRole: adminProcedure
    .input(adminUpdateRoleInput)
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.sub) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change your own role",
        });
      }

      const user = ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .get();

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [updated] = await ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId))
        .returning();

      return toSafeUser(updated);
    }),

  deleteUser: adminProcedure
    .input(adminDeleteUserInput)
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.sub) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete your own account",
        });
      }

      const user = ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .get();

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Delete sessions first, then user (cascades handle rest)
      await ctx.db.delete(sessions).where(eq(sessions.userId, input.userId));
      await ctx.db.delete(users).where(eq(users.id, input.userId));

      return { success: true };
    }),
});
```

- [ ] **Step 4: Register admin router**

In `packages/server/src/trpc/router.ts`, add:
```ts
import { adminRouter } from "./routers/admin.js";
```
And add to the router object:
```ts
admin: adminRouter,
```

- [ ] **Step 5: Run tests**

Run: `pnpm test:server`

- [ ] **Step 6: Commit**

```
git add -A && git commit -m "feat: add admin user management routes (list, create, update role, delete)"
```

---

### Task 5: Admin users page — frontend

**Files:**
- Create: `packages/web/src/routes/_app/admin/users.tsx`

- [ ] **Step 1: Create the admin users page**

Create `packages/web/src/routes/_app/admin/users.tsx` with:
- List all users in a table (display name, email, role badge, created date)
- "Add User" button that shows a create form (display name, email, password, role picker)
- Role toggle button per user (with confirm dialog)
- Delete button per user (with confirm dialog, disabled for self)
- Redirect non-admin users to `/home`
- Use `trpc.admin.*` mutations with proper invalidation

The page should use the same styling patterns as the rest of the app (CSS variables, rounded corners, warm accent color).

- [ ] **Step 2: Browser-test the page**

Navigate to `/admin/users`, verify:
- User list renders
- Can create a user
- Can toggle role
- Cannot delete self

- [ ] **Step 3: Commit**

```
git add -A && git commit -m "feat: add admin user management page"
```

---

### Task 6: Client-side role gating

**Files:**
- Modify: `packages/web/src/components/layout/sidebar.tsx`
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

- [ ] **Step 1: Gate sidebar admin section by role**

In `packages/web/src/components/layout/sidebar.tsx`, wrap the Actions/Admin section items (Stats, Upload, Import, Export) and add the Users link. Only show Upload, Import, Export, Users when `user?.role === "admin"`. Stats stays visible to everyone.

Replace the current "Actions" section with:
```tsx
<div className="px-3 mb-2 mt-6 text-[10px] font-medium uppercase tracking-[1.5px]" style={{ color: "var(--text-faint)" }}>
  Actions
</div>
<SidebarItem to="/stats" label="Stats" emoji="📊" active={isActive("/stats")} onClick={onClose} />
{user?.role === "admin" && (
  <>
    <SidebarItem to="/upload" label="Upload" emoji="📤" active={isActive("/upload")} onClick={onClose} />
    <SidebarItem to="/import" label="Import" emoji="📥" active={isActive("/import")} onClick={onClose} />
    <SidebarItem to="/admin/users" label="Users" emoji="👥" active={isActive("/admin/users")} onClick={onClose} />
  </>
)}
```

Move Export Library button inside the admin check too.

- [ ] **Step 2: Gate book detail edit/delete by role**

In `packages/web/src/routes/_app/books/$id.tsx`, get user role from `useAuth()` and pass it to `OverflowMenu`. Only show Edit, Delete, and metadata-related options when admin. Keep Download visible to all users.

- [ ] **Step 3: Browser-test with admin and consider user view**

Verify admin sees all options, then check what the page looks like conceptually for a regular user (no edit/delete/upload visible).

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "feat: hide admin-only UI elements for regular users"
```

---

### Task 7: Restructure routes — personal home + library

**Files:**
- Modify: `packages/web/src/routes/_app/index.tsx` → becomes redirect to `/home`
- Create: `packages/web/src/routes/_app/home.tsx`
- Create: `packages/web/src/routes/_app/library.tsx`
- Modify: `packages/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create personal home page**

Create `packages/web/src/routes/_app/home.tsx`:
- **Continue Reading** section — reuse `ContinueReadingRow` component
- **Recently Added** section — use `trpc.books.list` with sort "recent", limit 10, display as horizontal scrollable row
- **Your Shelves** section — use `trpc.shelves.list` to show shelf cards with emoji, name, and book count
- **Recently Finished** section — use `trpc.progress` or a new query to show last 5 finished books

- [ ] **Step 2: Create library page**

Create `packages/web/src/routes/_app/library.tsx`:
- Clean book grid with search and filters (move from current index.tsx)
- Title: "Library" with book count
- No personal sections (no Continue Reading)
- Shows ALL books in the shared library

- [ ] **Step 3: Update index route to redirect**

Modify `packages/web/src/routes/_app/index.tsx` to redirect to `/home`:
```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  beforeLoad: () => {
    throw redirect({ to: "/home" });
  },
});
```

- [ ] **Step 4: Update sidebar navigation**

In `packages/web/src/components/layout/sidebar.tsx`, restructure the nav:
1. Home link (`/home`)
2. Library link (`/library`)
3. Default shelves
4. Custom shelves
5. Actions section (Stats for all, admin items for admins)
6. Footer (user avatar, logout)

- [ ] **Step 5: Update auth redirect**

In `packages/web/src/routes/_auth.tsx` and `packages/web/src/routes/_auth/setup.tsx`, change the success redirect from `/` to `/home`.

Also update `packages/web/src/routes/_app.tsx` if it redirects to `/`.

- [ ] **Step 6: Browser-test the full flow**

Verify:
- Login redirects to `/home`
- `/home` shows personal reading sections
- `/library` shows all books
- Sidebar links work correctly
- Mobile layout works

- [ ] **Step 7: Commit**

```
git add -A && git commit -m "feat: add personal home page, split library into /home and /library"
```

---

### Task 8: Final cleanup and full test

**Files:**
- Various test files

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Fix any failures.

- [ ] **Step 2: Browser-test complete flow**

Test as admin:
1. Login → lands on `/home`
2. `/home` shows Continue Reading, Recently Added, Shelves, Recently Finished
3. `/library` shows all books
4. Can upload, edit, delete books
5. `/admin/users` — can create user, toggle roles, delete users

Test as regular user (create one via admin panel):
1. Login → lands on `/home`
2. Can browse library, read books
3. Cannot see upload/import/export/users in sidebar
4. Cannot see edit/delete on book detail
5. Has own shelves and reading progress

- [ ] **Step 3: Commit any fixes**

```
git add -A && git commit -m "fix: address test failures and cleanup"
```
