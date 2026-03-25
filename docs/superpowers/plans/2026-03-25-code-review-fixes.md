# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 20 code review issues (security, auth consolidation, frontend resilience, code quality) identified in the full-app review.

**Architecture:** Surgical fixes grouped into 8 tasks by dependency order. Server security and consolidation first (tasks 1-5), then frontend fixes (tasks 6-8). Each task produces a working, testable app.

**Tech Stack:** Fastify 5, tRPC v11, Drizzle ORM, better-sqlite3, jose (JWT), React 19, TanStack Router/Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-code-review-fixes-design.md`

---

### Task 1: Path Traversal Protection in StorageService (#1, #9)

**Files:**
- Modify: `packages/server/src/services/storage.ts`
- Create: `packages/server/src/__tests__/storage-security.test.ts`

- [ ] **Step 1: Write failing test for path traversal rejection**

```ts
// packages/server/src/__tests__/storage-security.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StorageService } from "../services/storage.js";
import type { Config } from "../config.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("StorageService security", () => {
  let storage: StorageService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "verso-test-"));
    storage = new StorageService({ STORAGE_PATH: tempDir } as Config);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("rejects path traversal via ../", async () => {
    await expect(storage.put("../../etc/passwd", Buffer.from("x"))).rejects.toThrow(
      "Path traversal detected"
    );
  });

  it("rejects path traversal via get", async () => {
    await expect(storage.get("../../../etc/hosts")).rejects.toThrow(
      "Path traversal detected"
    );
  });

  it("allows normal nested paths", async () => {
    await storage.put("books/abc/book.epub", Buffer.from("test"));
    const data = await storage.get("books/abc/book.epub");
    expect(data.toString()).toBe("test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/storage-security.test.ts`
Expected: FAIL — no path traversal check exists yet

- [ ] **Step 3: Implement `resolvePath` and `removeDir` in StorageService**

In `packages/server/src/services/storage.ts`:
- Add `resolve` to the `path` import (alongside existing `join`, `dirname`)
- Add `rm` to the `fs/promises` import
- Add private `resolvePath` method:

```ts
private resolvePath(relativePath: string): string {
  const fullPath = resolve(this.basePath, relativePath);
  if (!fullPath.startsWith(resolve(this.basePath))) {
    throw new Error("Path traversal detected");
  }
  return fullPath;
}
```

- Replace `join(this.basePath, relativePath)` with `this.resolvePath(relativePath)` in ALL public methods: `put`, `get`, `stream`, `delete`, `exists`, `size`, `fullPath`
- Add `removeDir` method:

```ts
async removeDir(relativePath: string): Promise<void> {
  const fullPath = this.resolvePath(relativePath);
  try {
    await rm(fullPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/storage-security.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `cd packages/server && npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/storage.ts packages/server/src/__tests__/storage-security.test.ts
git commit -m "fix: add path traversal protection and removeDir to StorageService"
```

---

### Task 2: JWT Service Extraction & Auth Consolidation (#10, #11, #13)

**Files:**
- Create: `packages/server/src/services/jwt.ts`
- Modify: `packages/server/src/middleware/auth.ts`
- Modify: `packages/server/src/trpc/index.ts`
- Modify: `packages/server/src/routes/upload.ts`
- Modify: `packages/server/src/routes/stream.ts`
- Modify: `packages/server/src/routes/covers.ts`
- Modify: `packages/server/src/__tests__/jwt.test.ts`

- [ ] **Step 1: Create `services/jwt.ts` with `verifyAccessToken` and `signAccessToken`**

```ts
// packages/server/src/services/jwt.ts
import { SignJWT, jwtVerify } from "jose";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";

export async function verifyAccessToken(
  token: string,
  config: Config
): Promise<TokenPayload> {
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

- [ ] **Step 2: Update `middleware/auth.ts` — use shared JWT, add Fastify type augmentation**

Replace the entire file content:

```ts
import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../services/jwt.js";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";

declare module "fastify" {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export function createAuthHook(config: Config) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing authorization header" });
    }
    const token = authHeader.slice(7);
    try {
      req.user = await verifyAccessToken(token, config);
    } catch {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
  };
}
```

- [ ] **Step 3: Update `trpc/index.ts` — use shared JWT, remove dead code**

Replace the file. Key changes:
- Import `verifyAccessToken` from `../services/jwt.js`
- Re-export `signAccessToken` from `../services/jwt.js`
- Remove the inline `signAccessToken` and `signRefreshToken` function definitions
- Remove `SignJWT` from jose import (only `jwtVerify` was used in context, but now neither is needed — remove jose import entirely)
- Replace inline JWT verification in `createContextFactory` with `verifyAccessToken` call

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { verifyAccessToken } from "../services/jwt.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";
import type { TokenPayload } from "@verso/shared";

export { signAccessToken } from "../services/jwt.js";

export type AppContext = {
  db: AppDatabase;
  config: Config;
  storage: StorageService;
  user: TokenPayload | null;
};

export function createContextFactory(db: AppDatabase, config: Config, storage: StorageService) {
  return async ({ req }: CreateFastifyContextOptions): Promise<AppContext> => {
    let user: TokenPayload | null = null;
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        user = await verifyAccessToken(token, config);
      } catch {
        // Invalid token — user stays null
      }
    }

    return { db, config, storage, user };
  };
}

const t = initTRPC.context<AppContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});
```

- [ ] **Step 4: Update route files — remove `(req as any).user` casts**

In `packages/server/src/routes/upload.ts` line 25, replace:
```ts
const user = (req as any).user as TokenPayload;
```
with:
```ts
const user = req.user!;
```
Also remove the `TokenPayload` import from `@verso/shared` (no longer needed directly).

In `packages/server/src/routes/stream.ts` line 19, replace:
```ts
const user = (req as any).user as TokenPayload;
```
with:
```ts
const user = req.user!;
```
Also remove `TokenPayload` from the `@verso/shared` import.

In `packages/server/src/routes/covers.ts` line 13, replace:
```ts
const user = (req as any).user as TokenPayload;
```
with:
```ts
const user = req.user!;
```
Also remove `TokenPayload` from the `@verso/shared` import.

- [ ] **Step 5: Update `jwt.test.ts` — fix imports, remove dead tests**

Replace the entire file:

```ts
import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { signAccessToken } from "../services/jwt.js";
import type { Config } from "../config.js";

const TEST_CONFIG = {
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long-for-testing",
  JWT_ACCESS_EXPIRES: "15m",
  JWT_REFRESH_EXPIRES: "7d",
} as Config;

const TEST_PAYLOAD = {
  sub: "user-123",
  email: "test@example.com",
  role: "admin",
  sessionId: "session-456",
};

describe("JWT helpers", () => {
  describe("signAccessToken", () => {
    it("signs a valid access token", async () => {
      const token = await signAccessToken(TEST_PAYLOAD, TEST_CONFIG);
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("token contains correct payload fields", async () => {
      const token = await signAccessToken(TEST_PAYLOAD, TEST_CONFIG);
      const secret = new TextEncoder().encode(TEST_CONFIG.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      expect(payload.sub).toBe("user-123");
      expect(payload.email).toBe("test@example.com");
      expect(payload.role).toBe("admin");
      expect(payload.type).toBe("access");
      expect(payload.sessionId).toBe("session-456");
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });
  });
});
```

- [ ] **Step 6: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass (jwt.test.ts now has 2 tests instead of 4)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/jwt.ts packages/server/src/middleware/auth.ts packages/server/src/trpc/index.ts packages/server/src/routes/upload.ts packages/server/src/routes/stream.ts packages/server/src/routes/covers.ts packages/server/src/__tests__/jwt.test.ts
git commit -m "refactor: extract JWT service, add Fastify type augmentation, remove dead signRefreshToken"
```

---

### Task 3: Rate Limiting, CORS, Upload Safety, Refresh Diagnostics (#2, #4, #5, #6)

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/routes/upload.ts`
- Modify: `packages/server/src/trpc/routers/auth.ts`

- [ ] **Step 1: Install `@fastify/rate-limit`**

Run: `cd packages/server && pnpm add @fastify/rate-limit`

- [ ] **Step 2: Update `config.ts` — change CORS default**

In `packages/server/src/config.ts` line 15, change:
```ts
CORS_ORIGIN: z.string().default("*"),
```
to:
```ts
CORS_ORIGIN: z.string().default("http://localhost:5173"),
```

- [ ] **Step 3: Update `app.ts` — add rate limiting and CORS warning**

Add import at top:
```ts
import rateLimit from "@fastify/rate-limit";
```

After the `const storage = ...` line and before the `cors` registration, add:
```ts
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
```

After the `cors` registration, add:
```ts
if (config.CORS_ORIGIN === "*" && config.NODE_ENV === "production") {
  app.log.warn("CORS_ORIGIN is set to '*' in production — consider restricting to your domain");
}
```

- [ ] **Step 4: Update `upload.ts` — replace manual size check with truncated check**

In `packages/server/src/routes/upload.ts`, replace lines 32-35:
```ts
const buffer = await data.toBuffer();

if (buffer.length > config.MAX_UPLOAD_SIZE) {
  return reply.status(413).send({ error: "File exceeds maximum upload size" });
}
```
with:
```ts
const buffer = await data.toBuffer();

if (data.file.truncated) {
  return reply.status(413).send({ error: "File exceeds maximum upload size" });
}
```

- [ ] **Step 5: Update `auth.ts` — add warn log on missing refresh token**

In `packages/server/src/trpc/routers/auth.ts`, in the `refresh` procedure, after the `if (!session)` check (around line 178), add a log before throwing. Since we don't have a logger in tRPC context, use `console.warn`:

Replace:
```ts
if (!session) {
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Invalid refresh token",
  });
}
```
with:
```ts
if (!session) {
  console.warn("[auth] Refresh token not found — possible token theft attempt");
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Invalid refresh token",
  });
}
```

- [ ] **Step 6: Run full test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/server/package.json packages/server/src/app.ts packages/server/src/config.ts packages/server/src/routes/upload.ts packages/server/src/trpc/routers/auth.ts pnpm-lock.yaml
git commit -m "fix: add rate limiting, restrict CORS default, upload truncation check, refresh diagnostics"
```

---

### Task 4: Books Router Fixes — LIKE Escaping, Timestamp Helper, Dir Cleanup (#7, #8, #9, #22)

**Files:**
- Modify: `packages/server/src/trpc/routers/books.ts`
- Modify: `packages/server/src/__tests__/books.test.ts`

- [ ] **Step 1: Write failing test for LIKE wildcard escaping**

Add to `packages/server/src/__tests__/books.test.ts`, inside the `list` describe block:

```ts
it("search with % wildcard does not match everything", async () => {
  await insertBook({ title: "Alpha" });
  await insertBook({ title: "Beta" });

  const result = await authedCaller.books.list({ search: "%" });
  // "%" should be escaped — literal search for "%", not a wildcard matching all
  expect(result.books).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/books.test.ts`
Expected: FAIL — `%` matches both books because it's unescaped

- [ ] **Step 3: Update `books.ts` — add escapeLike, timestamp helper, dir cleanup**

In `packages/server/src/trpc/routers/books.ts`:

Add at top of file (after imports):
```ts
const timestamp = () => ({ updatedAt: new Date().toISOString() });

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}
```

Replace the search condition (line 13):
```ts
conditions.push(sql`(${books.title} LIKE ${"%" + search + "%"} OR ${books.author} LIKE ${"%" + search + "%"})`);
```
with:
```ts
const term = "%" + escapeLike(search) + "%";
conditions.push(sql`(${books.title} LIKE ${term} ESCAPE '\\' OR ${books.author} LIKE ${term} ESCAPE '\\')`);
```

Replace the author filter (line 16):
```ts
if (author) conditions.push(like(books.author, `%${author}%`));
```
with:
```ts
if (author) conditions.push(sql`${books.author} LIKE ${"%" + escapeLike(author) + "%"} ESCAPE '\\'`);
```

Remove `like` from the drizzle-orm import since it's no longer used.

In the `update` mutation, replace the manual `updatedAt`:
```ts
const updateData: Record<string, any> = { ...fields, updatedAt: new Date().toISOString(), metadataLocked: true };
```
with:
```ts
const updateData: Record<string, any> = { ...fields, ...timestamp(), metadataLocked: true };
```

In the `delete` mutation, after the two `storage.delete` calls (lines 64-65), add:
```ts
await ctx.storage.removeDir(`books/${input.id}`);
```

- [ ] **Step 4: Remove dead test code in books.test.ts**

In `packages/server/src/__tests__/books.test.ts`, in the `delete` describe block, remove line 144:
```ts
await ctx.db.insert(books).values; // no-op, just need the book in DB
```

- [ ] **Step 5: Run test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass including the new wildcard test

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/trpc/routers/books.ts packages/server/src/__tests__/books.test.ts
git commit -m "fix: escape LIKE wildcards, add timestamp helper, clean up book directories on delete"
```

---

### Task 5: Frontend — Error Boundary & QueryClient Config (#21, #23)

**Files:**
- Create: `packages/web/src/components/error-boundary.tsx`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Create `error-boundary.tsx`**

```tsx
// packages/web/src/components/error-boundary.tsx
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-screen gap-4"
          style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
        >
          <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            An unexpected error occurred.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--warm)" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Update `main.tsx` — add ErrorBoundary wrapper and QueryClient config**

Replace the `QueryClient` instantiation:
```ts
const queryClient = new QueryClient();
```
with:
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

Add import at top:
```ts
import { ErrorBoundary } from "./components/error-boundary";
```

Wrap the render tree — replace:
```tsx
<StrictMode>
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
```
with:
```tsx
<StrictMode>
  <ErrorBoundary>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
```

And close the tag — replace:
```tsx
    </trpc.Provider>
  </StrictMode>
```
with:
```tsx
    </trpc.Provider>
  </ErrorBoundary>
</StrictMode>
```

- [ ] **Step 3: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/error-boundary.tsx packages/web/src/main.tsx
git commit -m "feat: add error boundary and configure QueryClient defaults"
```

---

### Task 6: Frontend — Automatic Token Refresh (#12)

**Files:**
- Modify: `packages/web/src/lib/auth.ts`
- Modify: `packages/web/src/trpc.ts`

- [ ] **Step 1: Add `refreshTokens()` to `lib/auth.ts`**

Append to end of `packages/web/src/lib/auth.ts`:

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
    if (!res.ok) {
      clearTokens();
      return false;
    }
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

- [ ] **Step 2: Add retry-on-401 link to `trpc.ts`**

Replace the entire `packages/web/src/trpc.ts`:

```ts
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/client";
import type { AppRouter } from "@verso/server";
import { getAccessToken, refreshTokens } from "./lib/auth.js";

export const trpc = createTRPCReact<AppRouter>();

function retryLink(): TRPCLink<AppRouter> {
  return (runtime) => {
    return (opts) => {
      return observable((observer) => {
        let attempted = false;
        const execute = () => {
          const subscription = runtime(opts).subscribe({
            next(value) {
              observer.next(value);
            },
            error(err) {
              if (
                !attempted &&
                err instanceof TRPCClientError &&
                err.data?.httpStatus === 401
              ) {
                attempted = true;
                refreshTokens().then((ok) => {
                  if (ok) {
                    execute();
                  } else {
                    observer.error(err);
                  }
                });
              } else {
                observer.error(err);
              }
            },
            complete() {
              observer.complete();
            },
          });
          return subscription;
        };
        return execute();
      });
    };
  };
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      retryLink(),
      httpBatchLink({
        url: "/trpc",
        async headers() {
          const token = getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/auth.ts packages/web/src/trpc.ts
git commit -m "feat: add automatic token refresh with 401 retry link"
```

---

### Task 7: Frontend — Theme Fix, Remove Dead Constants (#19, #20)

**Files:**
- Modify: `packages/web/src/hooks/use-theme.ts`
- Delete: `packages/web/src/lib/constants.ts`

- [ ] **Step 1: Rewrite `use-theme.ts` with proper system theme tracking**

Replace the entire `packages/web/src/hooks/use-theme.ts`:

```ts
import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("verso-theme") as Theme | null;
    return stored || "dark";
  });

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("verso-theme", t);
    setThemeState(t);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
```

- [ ] **Step 2: Delete `constants.ts`**

Run: `rm packages/web/src/lib/constants.ts`

Verify no file imports it:
Run: `grep -r "constants" packages/web/src/ --include="*.ts" --include="*.tsx"`
Expected: No results (or only unrelated matches)

- [ ] **Step 3: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git rm packages/web/src/lib/constants.ts
git add packages/web/src/hooks/use-theme.ts
git commit -m "fix: theme system re-render on OS change, remove unused COVER_PALETTES"
```

---

### Task 8: Frontend — Deduplicate Auth Forms (#17)

**Files:**
- Create: `packages/web/src/components/auth-form.tsx`
- Modify: `packages/web/src/routes/_auth/setup.tsx`
- Modify: `packages/web/src/routes/_auth/register.tsx`

- [ ] **Step 1: Create shared `AuthForm` component**

```tsx
// packages/web/src/components/auth-form.tsx
import { useState } from "react";

type AuthFormProps = {
  title: string;
  subtitle: string;
  buttonLabel: string;
  pendingLabel: string;
  onSubmit: (data: { email: string; password: string; displayName: string }) => void;
  isPending: boolean;
  error: string;
  footer?: React.ReactNode;
};

export function AuthForm({
  title,
  subtitle,
  buttonLabel,
  pendingLabel,
  onSubmit,
  isPending,
  error,
  footer,
}: AuthFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ email, password, displayName });
  };

  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-8">
        <h1
          className="font-display text-3xl font-bold mb-2"
          style={{ color: "var(--warm)" }}
        >
          {title}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          {subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="text-sm p-3 rounded-lg"
            style={{
              backgroundColor: "rgba(220,38,38,0.1)",
              color: "#ef4444",
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-dim)" }}
          >
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-dim)" }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-dim)" }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
          <p
            className="text-xs mt-1"
            style={{ color: "var(--text-faint)" }}
          >
            At least 8 characters
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {isPending ? pendingLabel : buttonLabel}
        </button>
      </form>

      {footer}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `setup.tsx` using `AuthForm`**

Replace the entire `packages/web/src/routes/_auth/setup.tsx`:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
});

function SetupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      login(data);
      navigate({ to: "/" });
    },
    onError: (err) => setError(err.message),
  });

  return (
    <AuthForm
      title="Welcome to Verso"
      subtitle="Create your admin account to get started"
      buttonLabel="Get Started"
      pendingLabel="Setting up..."
      onSubmit={(data) => {
        setError("");
        registerMutation.mutate(data);
      }}
      isPending={registerMutation.isPending}
      error={error}
    />
  );
}
```

- [ ] **Step 3: Rewrite `register.tsx` using `AuthForm`**

Replace the entire `packages/web/src/routes/_auth/register.tsx`:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/_auth/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      login(data);
      navigate({ to: "/" });
    },
    onError: (err) => setError(err.message),
  });

  return (
    <AuthForm
      title="Verso"
      subtitle="Create your account"
      buttonLabel="Create Account"
      pendingLabel="Creating account..."
      onSubmit={(data) => {
        setError("");
        registerMutation.mutate(data);
      }}
      isPending={registerMutation.isPending}
      error={error}
      footer={
        <p
          className="text-center text-sm mt-6"
          style={{ color: "var(--text-dim)" }}
        >
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--warm)" }}>
            Sign in
          </Link>
        </p>
      }
    />
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/auth-form.tsx packages/web/src/routes/_auth/setup.tsx packages/web/src/routes/_auth/register.tsx
git commit -m "refactor: deduplicate setup and register forms into shared AuthForm component"
```
