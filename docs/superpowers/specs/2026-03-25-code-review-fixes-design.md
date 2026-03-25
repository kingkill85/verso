# Code Review Fixes — Design Spec

**Date:** 2026-03-25
**Scope:** 21 issues from full-app code review (excludes #15 PostgreSQL driver and #16 S3 storage — both intentional placeholders)
**Approach:** Fix + consolidate — fix each issue while consolidating overlapping concerns into clean shared solutions

---

## Section 1: Security Hardening

### #1 — Path traversal in StorageService

**File:** `packages/server/src/services/storage.ts`

Add a private `resolvePath(relativePath: string): string` method that joins `basePath` with the relative path, then asserts the resolved path starts with `basePath`. All public methods (`put`, `get`, `stream`, `delete`, `exists`, `size`, `fullPath`) call through `resolvePath`. Throws an error on traversal attempt.

```ts
private resolvePath(relativePath: string): string {
  const fullPath = resolve(this.basePath, relativePath);
  if (!fullPath.startsWith(resolve(this.basePath))) {
    throw new Error("Path traversal detected");
  }
  return fullPath;
}
```

Uses `resolve` (not `join`) to normalize `..` segments before comparison.

### #2 — Rate limiting on auth endpoints

**Files:** `packages/server/src/app.ts`, `package.json`

Add `@fastify/rate-limit` dependency. Register globally with a reasonable default (100 req/min per IP). Since all tRPC procedures share a single Fastify route (`/trpc`), per-procedure rate limiting via Fastify route config is not feasible. Instead, apply a single global rate limit that protects all endpoints equally. This is sufficient for Session 1 — a more granular tRPC middleware-based approach can be added later if needed.

```ts
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
```

### #5 — CORS wildcard default

**File:** `packages/server/src/config.ts`, `packages/server/src/app.ts`

Change the default `CORS_ORIGIN` from `"*"` to `"http://localhost:5173"`. Add a warning log in `app.ts` if `CORS_ORIGIN === "*"` and `NODE_ENV === "production"`:

```ts
if (config.CORS_ORIGIN === "*" && config.NODE_ENV === "production") {
  app.log.warn("CORS_ORIGIN is set to '*' in production — consider restricting to your domain");
}
```

### #6 — Upload size check after full buffering

**File:** `packages/server/src/routes/upload.ts`

After `data.toBuffer()`, check the `data.file.truncated` property. Here `data` is the `MultipartFile` returned by `req.file()`, and `data.file` is its underlying Busboy `ReadableStream` — `@fastify/multipart` sets `truncated = true` on this stream when it exceeds `limits.fileSize`. If truncated, return 413 immediately. Remove the redundant manual `buffer.length > config.MAX_UPLOAD_SIZE` check.

Note: `toBuffer()` still fully buffers the file up to `limits.fileSize` — it does not prevent buffering, but it does prevent processing an incomplete file as if it were valid. True streaming size checks would be a larger change deferred to a future session.

### #4 — Refresh token race condition diagnostics

**File:** `packages/server/src/trpc/routers/auth.ts`

Keep existing behavior (correct — rotation detects replay). Improve error messages:
- "Invalid refresh token" stays for token-not-found (possible theft)
- "Refresh token expired" stays for expired tokens
- Add a log line at `warn` level when a refresh token is not found, to help detect token theft attempts

### #3 — CSRF (informational, no change)

Bearer tokens from `localStorage` are not auto-sent by browsers. CSRF is not applicable to this auth model. No code change needed.

---

## Section 2: Auth Consolidation

### #10 — Shared JWT verification + #11 — Fastify type augmentation + #13 — Remove dead `signRefreshToken`

**New file:** `packages/server/src/services/jwt.ts`

Extract JWT operations into a dedicated service:

```ts
// packages/server/src/services/jwt.ts
import { SignJWT, jwtVerify } from "jose";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";

export async function verifyAccessToken(token: string, config: Config): Promise<TokenPayload> {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  if (payload.type !== "access") {
    throw new Error("Invalid token type");
  }
  return payload as unknown as TokenPayload;
}

export async function signAccessToken(
  payload: Omit<TokenPayload, "type">,
  config: Config
): Promise<string> {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  return new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(config.JWT_ACCESS_EXPIRES)
    .setIssuedAt()
    .sign(secret);
}
```

**Updated file:** `packages/server/src/middleware/auth.ts`

- Import `verifyAccessToken` from `services/jwt.ts`
- Replace inline JWT logic with a call to `verifyAccessToken`
- Add Fastify type augmentation:

```ts
declare module "fastify" {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}
```

- Set `req.user` instead of `(req as any).user`

**Updated file:** `packages/server/src/trpc/index.ts`

- Import `verifyAccessToken`, `signAccessToken` from `services/jwt.ts`
- Replace inline JWT logic in context factory with `verifyAccessToken`
- Remove `signAccessToken` and `signRefreshToken` function definitions (moved / dead)
- Re-export `signAccessToken` from `services/jwt.ts` for use by `auth.ts` router

**Updated file:** `packages/server/src/__tests__/jwt.test.ts`

- Update import path from `../trpc/index.js` to `../services/jwt.js`
- Remove `signRefreshToken` import and all tests that reference it (the `signRefreshToken` describe block and the `token differentiation` describe block)
- Keep only the `signAccessToken` tests

**Updated files:** `packages/server/src/routes/upload.ts`, `stream.ts`, `covers.ts`

- Remove all `(req as any).user as TokenPayload` casts
- Use `req.user!` (non-null assertion safe because `preHandler` auth hook guarantees it)

---

## Section 3: Frontend Resilience

### #12 — Automatic token refresh

**Updated file:** `packages/web/src/lib/auth.ts`

Add `refreshTokens()` function:

```ts
export async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch("/trpc/auth.refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { refreshToken } }),
    });
    if (!res.ok) { clearTokens(); return false; }
    const data = await res.json();
    const result = data.result?.data?.json;
    if (result?.accessToken && result?.refreshToken) {
      setTokens(result.accessToken, result.refreshToken);
      return true;
    }
    clearTokens();
    return false;
  } catch {
    clearTokens();
    return false;
  }
}
```

**Updated file:** `packages/web/src/trpc.ts`

Add a custom tRPC link before `httpBatchLink` that intercepts 401 responses. On 401:
1. Attempt `refreshTokens()`
2. If successful, retry the original request with the new token
3. If failed, clear tokens — the `use-auth` hook will detect the missing token and redirect

### #19 — Theme system re-render fix

**Updated file:** `packages/web/src/hooks/use-theme.ts`

Track `systemTheme` as its own piece of state so React re-renders when the OS preference changes:

```ts
const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);

useEffect(() => {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => setSystemTheme(mq.matches ? "dark" : "light");
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}, []);

const resolvedTheme = theme === "system" ? systemTheme : theme;
```

This properly tracks system theme changes as state, triggering re-renders.

### #20 — Remove unused COVER_PALETTES

**Updated file:** `packages/web/src/lib/constants.ts`

Delete `COVER_PALETTES` and `getCoverPalette`. If the file is then empty, delete it entirely. `BookCover` has its own independent palette.

### #21 — Error boundary

**New file:** `packages/web/src/components/error-boundary.tsx`

Minimal React class component error boundary:

```tsx
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
          <h1>Something went wrong</h1>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Updated file:** `packages/web/src/main.tsx`

Wrap `<trpc.Provider>` with `<ErrorBoundary>`.

### #23 — QueryClient configuration

**Updated file:** `packages/web/src/main.tsx`

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: any) => {
        if (error?.data?.httpStatus === 401) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
```

---

## Section 4: Code Quality & Correctness

### #7 — updatedAt helper

**Updated file:** `packages/server/src/trpc/routers/books.ts`

Add a small inline helper at the top of the file:

```ts
const timestamp = () => ({ updatedAt: new Date().toISOString() });
```

Spread `...timestamp()` into every `.set()` call on the books table. Currently only `update` does this — this makes it a named pattern.

### #8 — LIKE wildcard escaping

**Updated file:** `packages/server/src/trpc/routers/books.ts`

Add escape utility:

```ts
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}
```

Apply to both search filter paths. The raw `sql` template (used for `search`) can include `ESCAPE '\\'` directly. The Drizzle `like()` helper (used for `author` on line 16) does not support an ESCAPE clause, so replace it with a raw `sql` template as well:

```ts
// Before (no escaping, uses Drizzle helper):
if (author) conditions.push(like(books.author, `%${author}%`));

// After (escaped, raw SQL):
if (author) conditions.push(sql`${books.author} LIKE ${"%" + escapeLike(author) + "%"} ESCAPE '\\'`);
```

### #9 — Orphan directory cleanup on delete

**Updated file:** `packages/server/src/services/storage.ts`

Add `removeDir(relativePath: string): Promise<void>` method that calls `fs.rm(path, { recursive: true })` on the resolved path (validated by `resolvePath`).

**Updated file:** `packages/server/src/trpc/routers/books.ts`

In the `delete` mutation, after deleting files, call `storage.removeDir(\`books/${input.id}\`)`.

### #17 — Deduplicate setup/register forms

**New file:** `packages/web/src/components/auth-form.tsx`

Shared form component accepting props:

```ts
type AuthFormProps = {
  title: string;
  subtitle: string;
  buttonLabel: string;
  pendingLabel: string;
  showDisplayName: boolean;
  showLoginLink?: boolean;
  onSubmit: (data: { email: string; password: string; displayName?: string }) => void;
  isPending: boolean;
  error: string;
};
```

**Updated files:** `packages/web/src/routes/_auth/setup.tsx`, `_auth/register.tsx`

Replace inline forms with `<AuthForm>` using appropriate props. `login.tsx` stays separate (different field set).

### #18 — Load custom fonts (ALREADY DONE)

Fonts are already loaded in `packages/web/index.html` (lines 7-12). No change needed. Removed from scope.

### #22 — Remove dead test code

**Updated file:** `packages/server/src/__tests__/books.test.ts`

Remove the no-op line `await ctx.db.insert(books).values;` (line 144).

---

## Files Changed Summary

### New files (3)
- `packages/server/src/services/jwt.ts` — shared JWT verify/sign
- `packages/web/src/components/error-boundary.tsx` — React error boundary
- `packages/web/src/components/auth-form.tsx` — shared auth form

### Modified files (18)
- `packages/server/package.json` — add `@fastify/rate-limit`
- `packages/server/src/app.ts` — rate limiting, CORS warning
- `packages/server/src/config.ts` — CORS default change
- `packages/server/src/middleware/auth.ts` — use shared JWT, type augmentation
- `packages/server/src/services/storage.ts` — path traversal protection, `removeDir`
- `packages/server/src/routes/upload.ts` — truncated check, remove `as any`
- `packages/server/src/routes/stream.ts` — remove `as any`
- `packages/server/src/routes/covers.ts` — remove `as any`
- `packages/server/src/trpc/index.ts` — use shared JWT, remove dead code
- `packages/server/src/trpc/routers/auth.ts` — improved error messages
- `packages/server/src/trpc/routers/books.ts` — LIKE escaping, timestamp helper, dir cleanup
- `packages/server/src/__tests__/books.test.ts` — remove dead code
- `packages/server/src/__tests__/jwt.test.ts` — update imports, remove signRefreshToken tests
- `packages/web/src/main.tsx` — error boundary, QueryClient config
- `packages/web/src/trpc.ts` — token refresh link
- `packages/web/src/lib/auth.ts` — `refreshTokens()` function
- `packages/web/src/hooks/use-theme.ts` — system theme re-render fix
- `packages/web/src/routes/_auth/setup.tsx` — use AuthForm
- `packages/web/src/routes/_auth/register.tsx` — use AuthForm

### Deleted files (1)
- `packages/web/src/lib/constants.ts` — unused COVER_PALETTES (no remaining exports)
