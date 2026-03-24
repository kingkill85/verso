# Session 1: "Upload a Book and See It" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of Verso — from zero to a working app where users can register, upload EPUB/PDF books, and browse their library with generated covers.

**Architecture:** pnpm monorepo with three packages (shared, server, web). Fastify 5 backend with tRPC v11 for typed API, Drizzle ORM with SQLite. React 19 frontend with Vite, Tailwind CSS 4, shadcn/ui, TanStack Router. JWT auth with access/refresh tokens.

**Tech Stack:** Node.js 20+, pnpm 9+, TypeScript 5, Fastify 5, tRPC v11, Drizzle ORM, better-sqlite3, Zod, jose (JWT), bcrypt, epub2, pdf-parse, React 19, Vite, Tailwind CSS 4, shadcn/ui, TanStack Router, TanStack Query v5

---

## File Structure

```
verso/
├── package.json                          # Root: workspace scripts, devDependencies
├── tsconfig.base.json                    # Shared TS config
├── pnpm-workspace.yaml                  # Already exists
├── .env.example                          # Already exists
├── .env                                  # Local dev (gitignored)
│
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # Re-exports
│   │       ├── schema.ts                 # Drizzle DB schema (all tables)
│   │       ├── validators.ts             # Zod input/output schemas
│   │       └── types.ts                  # Derived TypeScript types
│   │
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts             # Drizzle Kit config
│   │   └── src/
│   │       ├── index.ts                  # Entry: starts Fastify
│   │       ├── app.ts                    # Fastify app factory
│   │       ├── config.ts                 # Env parsing with Zod
│   │       ├── db/
│   │       │   ├── client.ts             # DB connection
│   │       │   └── migrate.ts            # Run migrations at startup
│   │       ├── trpc/
│   │       │   ├── index.ts              # initTRPC, context, middleware
│   │       │   ├── router.ts             # Merged appRouter + type export
│   │       │   └── routers/
│   │       │       ├── auth.ts           # register, login, refresh, me, logout
│   │       │       └── books.ts          # list, byId, update, delete
│   │       ├── routes/
│   │       │   ├── upload.ts             # POST /api/upload
│   │       │   ├── stream.ts            # GET /api/books/:id/file
│   │       │   └── covers.ts            # GET /api/covers/:bookId
│   │       ├── services/
│   │       │   ├── epub-parser.ts        # Extract metadata + cover from EPUB
│   │       │   ├── pdf-parser.ts         # Extract metadata from PDF
│   │       │   └── storage.ts            # Local file storage abstraction
│   │       └── middleware/
│   │           └── auth.ts               # JWT verification for Fastify routes
│   │
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── postcss.config.js
│       ├── components.json               # shadcn/ui config
│       └── src/
│           ├── main.tsx                  # React entry + providers
│           ├── app.tsx                   # TanStack Router root
│           ├── trpc.ts                   # tRPC client + React Query setup
│           ├── styles/
│           │   └── globals.css           # Tailwind directives + CSS custom properties
│           ├── lib/
│           │   ├── utils.ts              # cn() helper + misc
│           │   ├── constants.ts          # Cover palettes, default values
│           │   └── auth.ts               # Token storage, refresh logic
│           ├── hooks/
│           │   ├── use-auth.ts           # Auth context + hook
│           │   └── use-theme.ts          # Dark/light mode
│           ├── components/
│           │   ├── ui/                   # shadcn/ui components (button, input, card, etc.)
│           │   ├── layout/
│           │   │   ├── app-shell.tsx      # Sidebar + topbar + content wrapper
│           │   │   ├── sidebar.tsx
│           │   │   └── top-bar.tsx
│           │   └── books/
│           │       ├── book-cover.tsx     # Generated gradient cover component
│           │       ├── book-card.tsx      # Cover + title + author for grid
│           │       └── book-grid.tsx      # Auto-fill responsive grid
│           ├── routes/
│           │   ├── __root.tsx            # TanStack Router root layout
│           │   ├── _auth.tsx             # Auth layout (no sidebar)
│           │   ├── _auth.login.tsx
│           │   ├── _auth.register.tsx
│           │   ├── _auth.setup.tsx
│           │   ├── _app.tsx              # App layout (with sidebar, requires auth)
│           │   ├── _app.index.tsx        # Library page (/)
│           │   └── _app.books.$id.tsx    # Book detail page (/books/:id)
│           └── routeTree.gen.ts          # Auto-generated by TanStack Router
```

---

### Task 1: Root Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Modify: `pnpm-workspace.yaml` (already exists, verify)

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "verso",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel -r run dev",
    "dev:server": "pnpm --filter @verso/server dev",
    "dev:web": "pnpm --filter @verso/web dev",
    "build": "pnpm -r run build",
    "build:shared": "pnpm --filter @verso/shared build",
    "build:server": "pnpm --filter @verso/server build",
    "build:web": "pnpm --filter @verso/web build",
    "db:generate": "pnpm --filter @verso/server drizzle-kit generate",
    "db:migrate": "pnpm --filter @verso/server drizzle-kit migrate",
    "db:push": "pnpm --filter @verso/server drizzle-kit push",
    "test": "pnpm -r run test",
    "test:server": "pnpm --filter @verso/server test",
    "lint": "pnpm -r run lint",
    "clean": "pnpm -r run clean"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Verify pnpm-workspace.yaml**

Should already contain:
```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 4: Create .env from .env.example**

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET to a random value
# Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste output as JWT_SECRET value
```

- [ ] **Step 5: Install root dependencies and commit**

```bash
pnpm install
git add package.json tsconfig.base.json pnpm-lock.yaml
git commit -m "feat: root monorepo scaffolding with workspace scripts"
```

---

### Task 2: Shared Package — Schema, Validators, Types

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schema.ts`
- Create: `packages/shared/src/validators.ts`
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@verso/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "drizzle-orm": "^0.39.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/shared/src/schema.ts**

This defines the Drizzle schema for Session 1 tables: users, books, sessions. Other tables (shelves, shelf_books, reading_progress, annotations, api_keys, metadata_cache) will be added in later sessions.

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email", { length: 255 }).notNull().unique(),
  displayName: text("display_name", { length: 100 }).notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role", { length: 20 }).notNull().default("user"),
  passwordHash: text("password_hash"),
  oidcProvider: text("oidc_provider", { length: 255 }),
  oidcSubject: text("oidc_subject", { length: 255 }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  lastLoginAt: text("last_login_at"),
});

export const books = sqliteTable("books", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title", { length: 500 }).notNull(),
  author: text("author", { length: 500 }).notNull(),
  isbn: text("isbn", { length: 20 }),
  publisher: text("publisher", { length: 255 }),
  year: integer("year"),
  language: text("language", { length: 10 }),
  description: text("description"),
  genre: text("genre", { length: 100 }),
  tags: text("tags"), // JSON array
  coverPath: text("cover_path"),
  filePath: text("file_path").notNull(),
  fileFormat: text("file_format", { length: 10 }).notNull(),
  fileSize: integer("file_size").notNull(),
  fileHash: text("file_hash", { length: 64 }),
  pageCount: integer("page_count"),
  addedBy: text("added_by")
    .notNull()
    .references(() => users.id),
  metadataSource: text("metadata_source", { length: 20 }),
  metadataLocked: integer("metadata_locked", { mode: "boolean" }).default(
    false
  ),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  refreshTokenHash: text("refresh_token_hash", { length: 255 }).notNull(),
  deviceInfo: text("device_info", { length: 255 }),
  ipAddress: text("ip_address", { length: 45 }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

- [ ] **Step 4: Create packages/shared/src/validators.ts**

```typescript
import { z } from "zod";

// Auth
export const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
});

export const loginInput = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshInput = z.object({
  refreshToken: z.string(),
});

// Books
export const bookListInput = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  author: z.string().optional(),
  format: z.enum(["epub", "pdf", "mobi"]).optional(),
  sort: z
    .enum(["title", "author", "recent"])
    .optional()
    .default("recent"),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export const bookByIdInput = z.object({
  id: z.string().uuid(),
});

export const bookUpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  author: z.string().min(1).max(500).optional(),
  isbn: z.string().max(20).optional(),
  publisher: z.string().max(255).optional(),
  year: z.number().int().optional(),
  language: z.string().max(10).optional(),
  description: z.string().optional(),
  genre: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
});

export const bookDeleteInput = z.object({
  id: z.string().uuid(),
});

// Profile
export const updateProfileInput = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
});

export const changePasswordInput = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});
```

- [ ] **Step 5: Create packages/shared/src/types.ts**

```typescript
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { users, books, sessions } from "./schema.js";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Book = InferSelectModel<typeof books>;
export type NewBook = InferInsertModel<typeof books>;
export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

// Omit sensitive fields for client
export type SafeUser = Omit<
  User,
  "passwordHash" | "oidcProvider" | "oidcSubject"
>;

export type AuthResponse = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
};

export type TokenPayload = {
  sub: string;
  email: string;
  role: string;
  type: "access" | "refresh";
  sessionId?: string;
};
```

- [ ] **Step 6: Create packages/shared/src/index.ts**

```typescript
export * from "./schema.js";
export * from "./validators.js";
export * from "./types.js";
```

- [ ] **Step 7: Install dependencies and commit**

```bash
pnpm install
git add packages/shared/
git commit -m "feat: shared package with Drizzle schema, Zod validators, and types"
```

---

### Task 3: Server Package — Scaffolding & Config

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/drizzle.config.ts`
- Create: `packages/server/src/config.ts`
- Create: `packages/server/vitest.config.ts`

- [ ] **Step 1: Create packages/server/package.json**

```json
{
  "name": "@verso/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/trpc/router.ts",
  "exports": {
    ".": "./src/trpc/router.ts"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@verso/shared": "workspace:*",
    "@fastify/cors": "^11.0.0",
    "@fastify/multipart": "^9.0.0",
    "@fastify/static": "^8.0.0",
    "@trpc/server": "^11.0.0",
    "bcrypt": "^5.1.1",
    "better-sqlite3": "^11.7.0",
    "drizzle-orm": "^0.39.0",
    "epub2": "^3.0.2",
    "fastify": "^5.2.0",
    "jose": "^6.0.0",
    "pdf-parse": "^1.1.1",
    "sharp": "^0.33.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create packages/server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: Create packages/server/drizzle.config.ts**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../shared/src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:./data/db.sqlite",
  },
});
```

- [ ] **Step 4: Create packages/server/src/config.ts**

```typescript
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  DB_DRIVER: z.enum(["sqlite", "postgres"]).default("sqlite"),
  DATABASE_URL: z.string().default("file:./data/db.sqlite"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_PATH: z.string().default("./data"),
  AUTH_MODE: z.enum(["local", "oidc", "both"]).default("both"),
  MAX_UPLOAD_SIZE: z.coerce.number().default(104857600), // 100MB
  CORS_ORIGIN: z.string().default("*"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten());
    process.exit(1);
  }
  return result.data;
}
```

- [ ] **Step 5: Create packages/server/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 6: Install dependencies and commit**

```bash
pnpm install
git add packages/server/package.json packages/server/tsconfig.json packages/server/drizzle.config.ts packages/server/vitest.config.ts packages/server/src/config.ts
git commit -m "feat: server package scaffolding with config and Drizzle setup"
```

---

### Task 4: Server — Database Client & Migrations

**Files:**
- Create: `packages/server/src/db/client.ts`
- Create: `packages/server/src/db/migrate.ts`

- [ ] **Step 1: Create packages/server/src/db/client.ts**

```typescript
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@verso/shared";
import type { Config } from "../config.js";

export function createDb(config: Config) {
  const dbPath = config.DATABASE_URL.replace("file:", "");
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;
```

- [ ] **Step 2: Create packages/server/src/db/migrate.ts**

```typescript
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { AppDatabase } from "./client.js";

export function runMigrations(db: AppDatabase) {
  migrate(db, { migrationsFolder: "./drizzle" });
}
```

- [ ] **Step 3: Ensure data directory exists, generate initial migration**

```bash
mkdir -p packages/server/data
# Generate migration from schema
cd packages/server && pnpm drizzle-kit generate && cd ../..
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/ packages/server/drizzle/
git commit -m "feat: database client and initial migration"
```

---

### Task 5: Server — tRPC Setup (Context, Middleware, Router Shell)

**Files:**
- Create: `packages/server/src/trpc/index.ts`
- Create: `packages/server/src/trpc/router.ts`

- [ ] **Step 1: Create packages/server/src/trpc/index.ts**

```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { SignJWT, jwtVerify } from "jose";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";
import type { TokenPayload } from "@verso/shared";

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
        const secret = new TextEncoder().encode(config.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        if (payload.type === "access") {
          user = payload as unknown as TokenPayload;
        }
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

// JWT helpers
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

export async function signRefreshToken(
  payload: Omit<TokenPayload, "type">,
  config: Config
): Promise<string> {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  return new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(config.JWT_REFRESH_EXPIRES)
    .setIssuedAt()
    .sign(secret);
}
```

- [ ] **Step 2: Create packages/server/src/trpc/router.ts (shell)**

```typescript
import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";
import { booksRouter } from "./routers/books.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/trpc/
git commit -m "feat: tRPC setup with context, auth middleware, and JWT helpers"
```

---

### Task 6: Server — Auth Router (Register, Login, Refresh, Me, Logout)

**Files:**
- Create: `packages/server/src/trpc/routers/auth.ts`
- Test: `packages/server/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write auth router tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";

describe("auth router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  describe("register", () => {
    it("creates a new user and returns tokens", async () => {
      const result = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
      });

      expect(result.user.email).toBe("test@example.com");
      expect(result.user.displayName).toBe("Test User");
      expect(result.user.role).toBe("admin"); // First user is admin
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it("second user gets user role", async () => {
      await ctx.caller.auth.register({
        email: "admin@example.com",
        password: "password123",
        displayName: "Admin",
      });

      const result = await ctx.caller.auth.register({
        email: "user@example.com",
        password: "password123",
        displayName: "User",
      });

      expect(result.user.role).toBe("user");
    });

    it("rejects duplicate email", async () => {
      await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });

      await expect(
        ctx.caller.auth.register({
          email: "test@example.com",
          password: "password123",
          displayName: "Test 2",
        })
      ).rejects.toThrow();
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });
    });

    it("returns tokens for valid credentials", async () => {
      const result = await ctx.caller.auth.login({
        email: "test@example.com",
        password: "password123",
      });

      expect(result.user.email).toBe("test@example.com");
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it("rejects invalid password", async () => {
      await expect(
        ctx.caller.auth.login({
          email: "test@example.com",
          password: "wrong",
        })
      ).rejects.toThrow();
    });

    it("rejects unknown email", async () => {
      await expect(
        ctx.caller.auth.login({
          email: "nobody@example.com",
          password: "password123",
        })
      ).rejects.toThrow();
    });
  });

  describe("refresh", () => {
    it("issues new token pair and rotates refresh token", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });

      const result = await ctx.caller.auth.refresh({
        refreshToken: reg.refreshToken,
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.refreshToken).not.toBe(reg.refreshToken);
    });
  });

  describe("me", () => {
    it("returns current user when authenticated", async () => {
      const reg = await ctx.caller.auth.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test",
      });

      const authedCaller = ctx.createAuthedCaller(reg.accessToken);
      const user = await authedCaller.auth.me();
      expect(user.email).toBe("test@example.com");
    });
  });
});
```

- [ ] **Step 2: Create test utilities**

Create `packages/server/src/test-utils.ts`:

```typescript
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@verso/shared";
import { appRouter } from "./trpc/router.js";
import { StorageService } from "./services/storage.js";
import type { Config } from "./config.js";
import type { TokenPayload } from "@verso/shared";

const TEST_CONFIG: Config = {
  PORT: 3000,
  HOST: "0.0.0.0",
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long-for-testing",
  JWT_ACCESS_EXPIRES: "15m",
  JWT_REFRESH_EXPIRES: "7d",
  DB_DRIVER: "sqlite",
  DATABASE_URL: ":memory:",
  STORAGE_DRIVER: "local",
  STORAGE_PATH: "./test-data",
  AUTH_MODE: "both",
  MAX_UPLOAD_SIZE: 104857600,
  CORS_ORIGIN: "*",
  NODE_ENV: "test",
};

export async function createTestContext() {
  const sqlite = new BetterSqlite3(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: "./drizzle" });

  const storage = new StorageService(TEST_CONFIG);

  const caller = appRouter.createCaller({
    db,
    config: TEST_CONFIG,
    storage,
    user: null,
  });

  function createAuthedCaller(accessToken: string) {
    // Decode the token to get user info
    const secret = new TextEncoder().encode(TEST_CONFIG.JWT_SECRET);
    // We trust the token since we just created it in tests
    const parts = accessToken.split(".");
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    ) as TokenPayload;

    return appRouter.createCaller({
      db,
      config: TEST_CONFIG,
      storage,
      user: payload,
    });
  }

  return { db, config: TEST_CONFIG, caller, createAuthedCaller };
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @verso/server test
```

Expected: FAIL — auth router doesn't exist yet.

- [ ] **Step 4: Implement auth router**

Create `packages/server/src/trpc/routers/auth.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { hash, compare } from "bcrypt";
import { eq, count } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify } from "jose";
import {
  users,
  sessions,
  registerInput,
  loginInput,
  refreshInput,
  updateProfileInput,
  changePasswordInput,
} from "@verso/shared";
import type { SafeUser, AuthResponse } from "@verso/shared";
import {
  router,
  publicProcedure,
  protectedProcedure,
  signAccessToken,
  signRefreshToken,
} from "../index.js";
import type { AppContext } from "../index.js";

const BCRYPT_ROUNDS = 12;

function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  const { passwordHash, oidcProvider, oidcSubject, ...safe } = user;
  return safe;
}

async function createSession(
  ctx: AppContext,
  userId: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const sessionId = crypto.randomUUID();
  const refreshToken = randomBytes(32).toString("hex");
  const refreshTokenHash = createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  // Calculate expiry from config (e.g., "7d" → 7 days from now)
  const expiresMs = parseDuration(ctx.config.JWT_REFRESH_EXPIRES);
  const expiresAt = new Date(Date.now() + expiresMs).toISOString();

  await ctx.db.insert(sessions).values({
    id: sessionId,
    userId,
    refreshTokenHash,
    deviceInfo,
    ipAddress,
    expiresAt,
  });

  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const accessToken = await signAccessToken(
    { sub: userId, email: user!.email, role: user!.role, sessionId },
    ctx.config
  );

  return { accessToken, refreshToken };
}

function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${dur}`);
  const [, num, unit] = match;
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return parseInt(num) * multipliers[unit];
}

export const authRouter = router({
  register: publicProcedure.input(registerInput).mutation(async ({ ctx, input }) => {
    // Check if email already exists
    const existing = await ctx.db.query.users.findFirst({
      where: eq(users.email, input.email),
    });
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
    }

    // First user becomes admin
    const userCount = await ctx.db.select({ value: count() }).from(users);
    const isFirstUser = userCount[0].value === 0;

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);

    const [user] = await ctx.db
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        role: isFirstUser ? "admin" : "user",
      })
      .returning();

    const { accessToken, refreshToken } = await createSession(ctx, user.id);

    return {
      user: toSafeUser(user),
      accessToken,
      refreshToken,
    } satisfies AuthResponse;
  }),

  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.email, input.email),
    });

    if (!user || !user.passwordHash) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    const valid = await compare(input.password, user.passwordHash);
    if (!valid) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    // Update last login
    await ctx.db
      .update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id));

    const { accessToken, refreshToken } = await createSession(ctx, user.id);

    return {
      user: toSafeUser(user),
      accessToken,
      refreshToken,
    } satisfies AuthResponse;
  }),

  refresh: publicProcedure.input(refreshInput).mutation(async ({ ctx, input }) => {
    const tokenHash = createHash("sha256")
      .update(input.refreshToken)
      .digest("hex");

    const session = await ctx.db.query.sessions.findFirst({
      where: eq(sessions.refreshTokenHash, tokenHash),
    });

    if (!session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid refresh token",
      });
    }

    if (new Date(session.expiresAt) < new Date()) {
      // Clean up expired session
      await ctx.db.delete(sessions).where(eq(sessions.id, session.id));
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Refresh token expired",
      });
    }

    // Delete old session (rotation)
    await ctx.db.delete(sessions).where(eq(sessions.id, session.id));

    // Create new session
    const { accessToken, refreshToken } = await createSession(
      ctx,
      session.userId
    );

    return { accessToken, refreshToken };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.sub),
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return toSafeUser(user);
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.sessionId) {
      await ctx.db
        .delete(sessions)
        .where(eq(sessions.id, ctx.user.sessionId));
    }
    return { success: true };
  }),

  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .update(users)
        .set(input)
        .where(eq(users.id, ctx.user.sub))
        .returning();

      return toSafeUser(user);
    }),

  changePassword: protectedProcedure
    .input(changePasswordInput)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.sub),
      });

      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No password set for this account",
        });
      }

      const valid = await compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      const newHash = await hash(input.newPassword, BCRYPT_ROUNDS);
      await ctx.db
        .update(users)
        .set({ passwordHash: newHash })
        .where(eq(users.id, ctx.user.sub));

      return { success: true };
    }),

  hasUsers: publicProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.select({ value: count() }).from(users);
    return { hasUsers: result[0].value > 0 };
  }),
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @verso/server test
```

Expected: All auth tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/trpc/routers/auth.ts packages/server/src/__tests__/ packages/server/src/test-utils.ts
git commit -m "feat: auth router with register, login, refresh, JWT tokens"
```

---

### Task 7: Server — Storage Service

**Files:**
- Create: `packages/server/src/services/storage.ts`

- [ ] **Step 1: Create storage service**

```typescript
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Readable } from "node:stream";
import type { Config } from "../config.js";

export class StorageService {
  private basePath: string;

  constructor(config: Config) {
    this.basePath = config.STORAGE_PATH;
  }

  async put(relativePath: string, data: Buffer): Promise<void> {
    const fullPath = join(this.basePath, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async get(relativePath: string): Promise<Buffer> {
    const fullPath = join(this.basePath, relativePath);
    return readFile(fullPath);
  }

  stream(relativePath: string): Readable {
    const fullPath = join(this.basePath, relativePath);
    return createReadStream(fullPath);
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = join(this.basePath, relativePath);
    try {
      await unlink(fullPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = join(this.basePath, relativePath);
    return existsSync(fullPath);
  }

  async size(relativePath: string): Promise<number> {
    const fullPath = join(this.basePath, relativePath);
    const s = await stat(fullPath);
    return s.size;
  }

  fullPath(relativePath: string): string {
    return join(this.basePath, relativePath);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/services/storage.ts
git commit -m "feat: local file storage service"
```

---

### Task 8: Server — EPUB & PDF Parsers

**Files:**
- Create: `packages/server/src/services/epub-parser.ts`
- Create: `packages/server/src/services/pdf-parser.ts`

- [ ] **Step 1: Create EPUB parser**

```typescript
import EPub from "epub2";

export type ParsedMetadata = {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  language?: string;
  description?: string;
  genre?: string;
  pageCount?: number;
  coverData?: Buffer;
  coverMimeType?: string;
};

export async function parseEpub(filePath: string): Promise<ParsedMetadata> {
  const epub = await EPub.createAsync(filePath);

  let coverData: Buffer | undefined;
  let coverMimeType: string | undefined;

  // Try to extract cover image
  const coverId = epub.metadata.cover;
  if (coverId && epub.manifest[coverId]) {
    try {
      const [data, mimeType] = await epub.getImageAsync(coverId);
      coverData = Buffer.from(data);
      coverMimeType = mimeType;
    } catch {
      // Cover extraction failed, continue without it
    }
  }

  // Parse publication year from date string
  let year: number | undefined;
  if (epub.metadata.date) {
    const parsed = new Date(epub.metadata.date);
    if (!isNaN(parsed.getTime())) {
      year = parsed.getFullYear();
    }
  }

  // Try to get ISBN from identifiers
  let isbn: string | undefined;
  if (epub.metadata.ISBN) {
    isbn = epub.metadata.ISBN;
  }

  return {
    title: epub.metadata.title || "Untitled",
    author: epub.metadata.creator || "Unknown Author",
    isbn,
    publisher: epub.metadata.publisher || undefined,
    year,
    language: epub.metadata.language || undefined,
    description: epub.metadata.description || undefined,
    genre: epub.metadata.subject || undefined,
    coverData,
    coverMimeType,
  };
}
```

- [ ] **Step 2: Create PDF parser**

```typescript
import pdf from "pdf-parse";
import { readFile } from "node:fs/promises";

import type { ParsedMetadata } from "./epub-parser.js";

export async function parsePdf(filePath: string): Promise<ParsedMetadata> {
  const dataBuffer = await readFile(filePath);
  const data = await pdf(dataBuffer);

  return {
    title: data.info?.Title || "Untitled",
    author: data.info?.Author || "Unknown Author",
    publisher: data.info?.Producer || undefined,
    pageCount: data.numpages || undefined,
    description: undefined,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/epub-parser.ts packages/server/src/services/pdf-parser.ts
git commit -m "feat: EPUB and PDF metadata parsers"
```

---

### Task 9: Server — Upload Route

**Files:**
- Create: `packages/server/src/routes/upload.ts`
- Create: `packages/server/src/middleware/auth.ts`

- [ ] **Step 1: Create Fastify auth middleware**

```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { jwtVerify } from "jose";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";

export function createAuthHook(config: Config) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing authorization header" });
    }

    const token = authHeader.slice(7);
    try {
      const secret = new TextEncoder().encode(config.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      if (payload.type !== "access") {
        return reply.status(401).send({ error: "Invalid token type" });
      }
      (req as any).user = payload as unknown as TokenPayload;
    } catch {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
  };
}
```

- [ ] **Step 2: Create upload route**

```typescript
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { parseEpub } from "../services/epub-parser.js";
import { parsePdf } from "../services/pdf-parser.js";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";
import { createAuthHook } from "../middleware/auth.js";
import sharp from "sharp";

const ALLOWED_FORMATS: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
};

export function registerUploadRoute(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAuthHook(config);

  app.post(
    "/api/upload",
    { preHandler: authHook },
    async (req, reply) => {
      const user = (req as any).user as TokenPayload;
      const data = await req.file();

      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const buffer = await data.toBuffer();

      if (buffer.length > config.MAX_UPLOAD_SIZE) {
        return reply
          .status(413)
          .send({ error: "File exceeds maximum upload size" });
      }

      // Detect format from extension
      const filename = data.filename || "";
      const ext = filename.split(".").pop()?.toLowerCase();

      if (!ext || !["epub", "pdf"].includes(ext)) {
        return reply
          .status(400)
          .send({ error: "Unsupported file format. Use EPUB or PDF." });
      }

      const bookId = crypto.randomUUID();
      const fileHash = createHash("sha256").update(buffer).digest("hex");

      // Store the file
      const filePath = `books/${bookId}/book.${ext}`;
      await storage.put(filePath, buffer);

      // Parse metadata
      const fullFilePath = storage.fullPath(filePath);
      let metadata;
      try {
        if (ext === "epub") {
          metadata = await parseEpub(fullFilePath);
        } else {
          metadata = await parsePdf(fullFilePath);
        }
      } catch (err) {
        metadata = {
          title: filename.replace(/\.[^.]+$/, ""),
          author: "Unknown Author",
        };
      }

      // Extract and save cover
      let coverPath: string | undefined;
      if (metadata.coverData) {
        try {
          const coverBuffer = await sharp(metadata.coverData)
            .resize(600, undefined, { withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          coverPath = `covers/${bookId}.jpg`;
          await storage.put(coverPath, coverBuffer);
        } catch {
          // Cover processing failed, continue without
        }
      }

      // Insert book record
      const [book] = await db
        .insert(books)
        .values({
          id: bookId,
          title: metadata.title,
          author: metadata.author,
          isbn: metadata.isbn,
          publisher: metadata.publisher,
          year: metadata.year,
          language: metadata.language,
          description: metadata.description,
          genre: metadata.genre,
          coverPath: coverPath || null,
          filePath,
          fileFormat: ext,
          fileSize: buffer.length,
          fileHash,
          pageCount: metadata.pageCount,
          addedBy: user.sub,
          metadataSource: "extracted",
        })
        .returning();

      return reply.status(201).send({ book });
    }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/upload.ts packages/server/src/middleware/auth.ts
git commit -m "feat: book upload route with metadata extraction and cover processing"
```

---

### Task 10: Server — Books tRPC Router + Stream/Cover Routes

**Files:**
- Create: `packages/server/src/trpc/routers/books.ts`
- Create: `packages/server/src/routes/stream.ts`
- Create: `packages/server/src/routes/covers.ts`

- [ ] **Step 1: Create books tRPC router**

```typescript
import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, like, sql } from "drizzle-orm";
import {
  books,
  bookListInput,
  bookByIdInput,
  bookUpdateInput,
  bookDeleteInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

export const booksRouter = router({
  list: protectedProcedure.input(bookListInput).query(async ({ ctx, input }) => {
    const { sort, page, limit, search, genre, author, format } = input;
    const offset = (page - 1) * limit;

    const conditions = [eq(books.addedBy, ctx.user.sub)];

    if (search) {
      conditions.push(
        sql`(${books.title} LIKE ${"%" + search + "%"} OR ${books.author} LIKE ${"%" + search + "%"})`
      );
    }
    if (genre) conditions.push(eq(books.genre, genre));
    if (author) conditions.push(like(books.author, `%${author}%`));
    if (format) conditions.push(eq(books.fileFormat, format));

    const where = and(...conditions);

    const orderBy = {
      title: asc(books.title),
      author: asc(books.author),
      recent: desc(books.createdAt),
    }[sort || "recent"];

    const [bookList, countResult] = await Promise.all([
      ctx.db
        .select()
        .from(books)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      ctx.db
        .select({ total: sql<number>`count(*)` })
        .from(books)
        .where(where),
    ]);

    return {
      books: bookList,
      total: countResult[0].total,
      page,
    };
  }),

  byId: protectedProcedure.input(bookByIdInput).query(async ({ ctx, input }) => {
    const book = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, input.id), eq(books.addedBy, ctx.user.sub)),
    });

    if (!book) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
    }

    return book;
  }),

  update: protectedProcedure
    .input(bookUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const { id, tags, ...fields } = input;

      const existing = await ctx.db.query.books.findFirst({
        where: and(eq(books.id, id), eq(books.addedBy, ctx.user.sub)),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      const updateData: Record<string, any> = {
        ...fields,
        updatedAt: new Date().toISOString(),
        metadataLocked: true,
      };

      if (tags !== undefined) {
        updateData.tags = JSON.stringify(tags);
      }

      const [book] = await ctx.db
        .update(books)
        .set(updateData)
        .where(eq(books.id, id))
        .returning();

      return book;
    }),

  delete: protectedProcedure
    .input(bookDeleteInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.books.findFirst({
        where: and(eq(books.id, input.id), eq(books.addedBy, ctx.user.sub)),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      await ctx.db.delete(books).where(eq(books.id, input.id));

      // Clean up files
      await ctx.storage.delete(existing.filePath);
      if (existing.coverPath) {
        await ctx.storage.delete(existing.coverPath);
      }

      return { success: true };
    }),

  recentlyAdded: protectedProcedure
    .input(bookListInput.pick({ limit: true }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(books)
        .where(eq(books.addedBy, ctx.user.sub))
        .orderBy(desc(books.createdAt))
        .limit(input.limit || 20);
    }),
});
```

- [ ] **Step 2: Create file streaming route**

```typescript
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { TokenPayload } from "@verso/shared";
import { createAuthHook } from "../middleware/auth.js";

const MIME_TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
};

export function registerStreamRoute(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAuthHook(config);

  app.get(
    "/api/books/:id/file",
    { preHandler: authHook },
    async (req, reply) => {
      const user = (req as any).user as TokenPayload;
      const { id } = req.params as { id: string };

      const book = await db.query.books.findFirst({
        where: and(eq(books.id, id), eq(books.addedBy, user.sub)),
      });

      if (!book) {
        return reply.status(404).send({ error: "Book not found" });
      }

      const exists = await storage.exists(book.filePath);
      if (!exists) {
        return reply.status(404).send({ error: "Book file not found" });
      }

      const mimeType = MIME_TYPES[book.fileFormat] || "application/octet-stream";
      const stream = storage.stream(book.filePath);

      return reply
        .header("Content-Type", mimeType)
        .header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(book.title)}.${book.fileFormat}"`
        )
        .send(stream);
    }
  );
}
```

- [ ] **Step 3: Create cover serving route**

```typescript
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { books } from "@verso/shared";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import { createAuthHook } from "../middleware/auth.js";
import type { TokenPayload } from "@verso/shared";

export function registerCoversRoute(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAuthHook(config);

  app.get(
    "/api/covers/:bookId",
    { preHandler: authHook },
    async (req, reply) => {
      const user = (req as any).user as TokenPayload;
      const { bookId } = req.params as { bookId: string };

      const book = await db.query.books.findFirst({
        where: and(eq(books.id, bookId), eq(books.addedBy, user.sub)),
      });

      if (!book || !book.coverPath) {
        return reply.status(404).send({ error: "Cover not found" });
      }

      const exists = await storage.exists(book.coverPath);
      if (!exists) {
        return reply.status(404).send({ error: "Cover file not found" });
      }

      const coverData = await storage.get(book.coverPath);

      return reply
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "public, max-age=86400")
        .send(coverData);
    }
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/books.ts packages/server/src/routes/stream.ts packages/server/src/routes/covers.ts
git commit -m "feat: books CRUD router, file streaming, and cover serving"
```

---

### Task 11: Server — App Factory & Entry Point

**Files:**
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Create Fastify app factory**

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./trpc/router.js";
import { createContextFactory } from "./trpc/index.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { StorageService } from "./services/storage.js";
import { registerUploadRoute } from "./routes/upload.js";
import { registerStreamRoute } from "./routes/stream.js";
import { registerCoversRoute } from "./routes/covers.js";
import type { Config } from "./config.js";

export async function buildApp(config: Config) {
  const app = Fastify({ logger: true });

  // Database
  const db = createDb(config);
  runMigrations(db);

  // Storage
  const storage = new StorageService(config);

  // Plugins
  await app.register(cors, { origin: config.CORS_ORIGIN });
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_SIZE },
  });

  // tRPC
  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(db, config, storage),
    },
  });

  // Fastify routes (binary/streaming)
  registerUploadRoute(app, db, storage, config);
  registerStreamRoute(app, db, storage, config);
  registerCoversRoute(app, db, storage, config);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

- [ ] **Step 2: Create entry point**

```typescript
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`Verso server running on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 3: Verify server starts**

```bash
pnpm --filter @verso/server dev
# Expect: server starts, logs "Verso server running on..."
# Stop with Ctrl+C
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/index.ts
git commit -m "feat: Fastify app factory and server entry point"
```

---

### Task 12: Web Package — Scaffolding (Vite, React, Tailwind, shadcn/ui)

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/components.json`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/lib/utils.ts`

- [ ] **Step 1: Create packages/web/package.json**

```json
{
  "name": "@verso/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.64.0",
    "@tanstack/react-router": "^1.95.0",
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-dropzone": "^14.3.5",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@tanstack/router-plugin": "^1.95.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@verso/shared": "workspace:*",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create packages/web/vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/trpc": "http://localhost:3000",
      "/api": "http://localhost:3000",
    },
  },
});
```

- [ ] **Step 3: Create packages/web/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 4: Create packages/web/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verso</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create packages/web/postcss.config.js**

```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create packages/web/components.json (shadcn/ui config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": false
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 7: Create packages/web/src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Create packages/web/src/main.tsx (minimal — just mounts React)**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div>Verso</div>
  </StrictMode>
);
```

- [ ] **Step 9: Install dependencies and verify dev server starts**

```bash
pnpm install
pnpm --filter @verso/web dev
# Expect: Vite dev server starts, shows "Verso" in browser
# Stop with Ctrl+C
```

- [ ] **Step 10: Install shadcn/ui base components**

```bash
cd packages/web
pnpm dlx shadcn@latest add button input card label separator avatar dropdown-menu dialog toast
cd ../..
```

- [ ] **Step 11: Commit**

```bash
git add packages/web/
git commit -m "feat: web package with Vite, React 19, Tailwind, shadcn/ui"
```

---

### Task 13: Web — Design System (CSS Custom Properties, Theme, Typography)

**Files:**
- Create: `packages/web/src/styles/globals.css`
- Create: `packages/web/src/hooks/use-theme.ts`
- Create: `packages/web/src/lib/constants.ts`

- [ ] **Step 1: Create globals.css with design tokens**

```css
@import "tailwindcss";

@layer base {
  :root {
    --font-display: "Libre Baskerville", Georgia, serif;
    --font-ui: "Outfit", -apple-system, sans-serif;

    /* Light mode */
    --bg: #f6f1ea;
    --surface: #ffffff;
    --card: #f0ebe3;
    --border: #e0d8cc;
    --text: #2a2520;
    --text-dim: #8a8078;
    --text-faint: #b0a898;
    --warm: #a06830;
    --warm-hover: #b47838;
    --warm-glow: rgba(160, 104, 48, 0.06);
    --green: #4a8a5a;
    --progress-bg: #e0d8cc;
    --sidebar-bg: #eee8df;
  }

  .dark {
    --bg: #12110f;
    --surface: #1b1915;
    --card: #23201b;
    --border: #2e2a24;
    --text: #e8e2d8;
    --text-dim: #968f82;
    --text-faint: #5c564d;
    --warm: #c08b5c;
    --warm-hover: #d49b6a;
    --warm-glow: rgba(192, 139, 92, 0.08);
    --green: #6ba078;
    --progress-bg: #2e2a24;
    --sidebar-bg: #17150f;
  }

  html {
    font-family: var(--font-ui);
    color: var(--text);
    background-color: var(--bg);
  }

  body {
    margin: 0;
    min-height: 100vh;
  }
}

@layer components {
  .font-display {
    font-family: var(--font-display);
  }

  .font-ui {
    font-family: var(--font-ui);
  }

  .animate-in {
    animation: animate-in 0.4s ease both;
  }

  .fade-in {
    animation-name: fade-in;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: Create theme hook**

```typescript
import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("verso-theme") as Theme | null;
    return stored || "dark"; // Dark mode is default
  });

  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setThemeState("system"); // triggers re-render
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("verso-theme", t);
    setThemeState(t);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
```

- [ ] **Step 3: Create constants (cover palettes)**

```typescript
export const COVER_PALETTES = [
  { bg: ["#2d1b14", "#4a2e20"], accent: "#d4a574", dark: "#1a0f0a" },
  { bg: ["#1a2332", "#2d3d52"], accent: "#8ab4d6", dark: "#0f1520" },
  { bg: ["#2a1f2d", "#463a4a"], accent: "#c4a2d0", dark: "#170f1a" },
  { bg: ["#1f2d1a", "#3a4a32"], accent: "#a2d08a", dark: "#0f1a0a" },
  { bg: ["#2d2a1a", "#4a4532"], accent: "#d0c88a", dark: "#1a170a" },
  { bg: ["#1a2d2a", "#324a46"], accent: "#8ad0c8", dark: "#0a1a17" },
  { bg: ["#2d1a1a", "#4a3232"], accent: "#d08a8a", dark: "#1a0a0a" },
  { bg: ["#1a1a2d", "#32324a"], accent: "#8a8ad0", dark: "#0a0a1a" },
  { bg: ["#2d261a", "#4a3f2e"], accent: "#d0b88a", dark: "#1a150a" },
  { bg: ["#1a2d20", "#324a3a"], accent: "#8ad0a2", dark: "#0a1a10" },
  { bg: ["#2d1a26", "#4a3240"], accent: "#d08ab8", dark: "#1a0a15" },
  { bg: ["#1a262d", "#32404a"], accent: "#8ac0d0", dark: "#0a151a" },
] as const;

export function getCoverPalette(bookId: string) {
  // Simple hash to get consistent palette for a book
  let hash = 0;
  for (let i = 0; i < bookId.length; i++) {
    hash = (hash << 5) - hash + bookId.charCodeAt(i);
    hash |= 0;
  }
  return COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length];
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/styles/ packages/web/src/hooks/use-theme.ts packages/web/src/lib/constants.ts
git commit -m "feat: design system — CSS tokens, dark/light theme, cover palettes"
```

---

### Task 14: Web — tRPC Client & Auth

**Files:**
- Create: `packages/web/src/trpc.ts`
- Create: `packages/web/src/lib/auth.ts`
- Create: `packages/web/src/hooks/use-auth.ts`

- [ ] **Step 1: Create tRPC client**

```typescript
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@verso/server";
import { getAccessToken, refreshTokens } from "./lib/auth.js";

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
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

- [ ] **Step 2: Create auth utilities**

```typescript
const ACCESS_TOKEN_KEY = "verso-access-token";
const REFRESH_TOKEN_KEY = "verso-refresh-token";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

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
    if (result?.accessToken) {
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

- [ ] **Step 3: Create auth hook**

```typescript
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  getAccessToken,
  setTokens,
  clearTokens,
  isTokenExpired,
  refreshTokens,
} from "@/lib/auth";
import type { SafeUser, AuthResponse } from "@verso/shared";

type AuthState = {
  user: SafeUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (response: AuthResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    if (isTokenExpired(token)) {
      refreshTokens().then((ok) => {
        if (!ok) {
          setIsLoading(false);
          return;
        }
        fetchUser();
      });
    } else {
      fetchUser();
    }

    async function fetchUser() {
      try {
        const res = await fetch("/trpc/auth.me", {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.result?.data?.json || null);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  const login = useCallback((response: AuthResponse) => {
    setTokens(response.accessToken, response.refreshToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/trpc.ts packages/web/src/lib/auth.ts packages/web/src/hooks/use-auth.ts
git commit -m "feat: tRPC client, auth token management, and auth context"
```

---

### Task 15: Web — TanStack Router Setup & App Shell

**Files:**
- Create: `packages/web/src/routes/__root.tsx`
- Create: `packages/web/src/routes/_auth.tsx`
- Create: `packages/web/src/routes/_app.tsx`
- Create: `packages/web/src/components/layout/app-shell.tsx`
- Create: `packages/web/src/components/layout/sidebar.tsx`
- Create: `packages/web/src/components/layout/top-bar.tsx`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Update main.tsx with providers and router**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { trpc, createTRPCClient } from "./trpc";
import { AuthProvider } from "./hooks/use-auth";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

const queryClient = new QueryClient();
const trpcClient = createTRPCClient();
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>
);
```

- [ ] **Step 2: Create root route**

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => <Outlet />,
});
```

- [ ] **Step 3: Create auth layout (no sidebar — for login/register)**

```tsx
import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const hasUsersQuery = trpc.auth.hasUsers.useQuery();

  if (isLoading || hasUsersQuery.isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" />;

  // First-run: redirect to setup if no users exist
  if (hasUsersQuery.data && !hasUsersQuery.data.hasUsers) {
    return <Navigate to="/setup" />;
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 4: Create app layout (sidebar + topbar — requires auth)**

```tsx
import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
```

- [ ] **Step 5: Create AppShell component**

```tsx
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      {/* Desktop sidebar */}
      <div className="hidden lg:block w-64 shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 z-50 lg:hidden">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create Sidebar component**

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className="h-screen flex flex-col overflow-y-auto"
      style={{ backgroundColor: "var(--sidebar-bg)" }}
    >
      {/* Brand */}
      <div className="p-6 pb-4">
        <h1
          className="font-display text-xl font-bold"
          style={{ color: "var(--warm)" }}
        >
          Verso
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <div
          className="px-3 mb-2 text-[10px] font-medium uppercase tracking-[1.5px]"
          style={{ color: "var(--text-faint)" }}
        >
          Library
        </div>
        <SidebarItem
          to="/"
          label="All Books"
          emoji="📚"
          active={isActive("/")}
          onClick={onClose}
        />

        {/* Shelves will be added in Session 3 */}
      </nav>

      {/* Footer */}
      <div
        className="p-4 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3 px-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
            style={{
              backgroundColor: "var(--card)",
              color: "var(--text-dim)",
            }}
          >
            {user?.displayName?.[0]?.toUpperCase() || "?"}
          </div>
          <span
            className="text-sm truncate"
            style={{ color: "var(--text-dim)" }}
          >
            {user?.displayName}
          </span>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({
  to,
  label,
  emoji,
  active,
  count,
  onClick,
}: {
  to: string;
  label: string;
  emoji: string;
  active: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg transition-colors"
      style={{
        padding: "10px 22px",
        fontSize: "13.5px",
        color: active ? "var(--warm)" : "var(--text-dim)",
        backgroundColor: active ? "var(--warm-glow)" : "transparent",
        fontWeight: active ? 500 : 400,
      }}
    >
      <span className="w-[22px] text-base">{emoji}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] opacity-60">{count}</span>
      )}
    </Link>
  );
}
```

- [ ] **Step 7: Create TopBar component**

```tsx
import { useTheme } from "@/hooks/use-theme";

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-4 px-6 h-14 border-b"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-2 rounded-lg"
        style={{ color: "var(--text-dim)" }}
      >
        ☰
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <input
          type="text"
          placeholder="Search books..."
          className="w-full rounded-[10px] border px-4 py-2.5 pl-10 text-sm outline-none transition-colors"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
          disabled
        />
      </div>

      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
        style={{ color: "var(--text-dim)" }}
        title="Toggle theme"
      >
        {resolvedTheme === "dark" ? "☀️" : "🌙"}
      </button>
    </header>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/
git commit -m "feat: TanStack Router, app shell with sidebar, topbar, and auth layouts"
```

---

### Task 16: Web — Login & Register Pages

**Files:**
- Create: `packages/web/src/routes/_auth.login.tsx`
- Create: `packages/web/src/routes/_auth.register.tsx`
- Create: `packages/web/src/routes/_auth.setup.tsx`

- [ ] **Step 1: Create login page**

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/_auth/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      login(data);
      navigate({ to: "/" });
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-8">
        <h1
          className="font-display text-3xl font-bold mb-2"
          style={{ color: "var(--warm)" }}
        >
          Verso
        </h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Welcome back to your library
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="text-sm p-3 rounded-lg"
            style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#ef4444" }}
          >
            {error}
          </div>
        )}

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
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {loginMutation.isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p
        className="text-center text-sm mt-6"
        style={{ color: "var(--text-dim)" }}
      >
        Don't have an account?{" "}
        <Link to="/register" style={{ color: "var(--warm)" }}>
          Create one
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create register page**

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/_auth/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      login(data);
      navigate({ to: "/" });
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    registerMutation.mutate({ email, password, displayName });
  };

  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-8">
        <h1
          className="font-display text-3xl font-bold mb-2"
          style={{ color: "var(--warm)" }}
        >
          Verso
        </h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Create your personal library
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="text-sm p-3 rounded-lg"
            style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#ef4444" }}
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
          disabled={registerMutation.isPending}
          className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {registerMutation.isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p
        className="text-center text-sm mt-6"
        style={{ color: "var(--text-dim)" }}
      >
        Already have an account?{" "}
        <Link to="/login" style={{ color: "var(--warm)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create setup page (first-run admin creation)**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
});

function SetupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      login(data);
      navigate({ to: "/" });
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    registerMutation.mutate({ email, password, displayName });
  };

  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-8">
        <h1
          className="font-display text-3xl font-bold mb-2"
          style={{ color: "var(--warm)" }}
        >
          Welcome to Verso
        </h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Create your admin account to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="text-sm p-3 rounded-lg"
            style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#ef4444" }}
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
        </div>

        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {registerMutation.isPending ? "Setting up..." : "Set Up Verso"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/
git commit -m "feat: login, register, and first-run setup pages"
```

---

### Task 17: Web — Book Cover, Book Card, Book Grid Components

**Files:**
- Create: `packages/web/src/components/books/book-cover.tsx`
- Create: `packages/web/src/components/books/book-card.tsx`
- Create: `packages/web/src/components/books/book-grid.tsx`

- [ ] **Step 1: Create BookCover component**

```tsx
import { getCoverPalette } from "@/lib/constants";

type BookCoverProps = {
  bookId: string;
  title: string;
  author: string;
  coverPath?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
};

const SIZES = {
  sm: { width: 52, height: 76 },
  md: { width: 90, height: 132 },
  lg: { width: 120, height: 176 },
  xl: { width: 160, height: 240 },
};

export function BookCover({
  bookId,
  title,
  author,
  coverPath,
  size = "lg",
}: BookCoverProps) {
  const { width, height } = SIZES[size];

  if (coverPath) {
    return (
      <div
        className="relative rounded-sm overflow-hidden shadow-md"
        style={{ width, height }}
      >
        <img
          src={`/api/covers/${bookId}`}
          alt={title}
          className="w-full h-full object-cover"
        />
        {/* Spine shadow */}
        <div
          className="absolute inset-y-0 left-0 w-1.5"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,0.3), transparent)",
          }}
        />
      </div>
    );
  }

  const palette = getCoverPalette(bookId);

  return (
    <div
      className="relative rounded-sm overflow-hidden shadow-md flex flex-col items-center justify-center p-3"
      style={{
        width,
        height,
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]})`,
      }}
    >
      {/* Spine shadow */}
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,0,0.3), transparent)",
        }}
      />

      {/* Top decorative line */}
      <div
        className="absolute top-3 left-3 right-3 h-px"
        style={{ backgroundColor: palette.accent, opacity: 0.25 }}
      />

      {/* Title */}
      <p
        className="font-display text-center font-bold leading-tight"
        style={{
          color: palette.accent,
          fontSize: size === "sm" ? 7 : size === "md" ? 9 : size === "lg" ? 11 : 14,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {title}
      </p>

      {/* Divider */}
      <div
        className="w-5 h-px my-1.5"
        style={{ backgroundColor: palette.accent, opacity: 0.4 }}
      />

      {/* Author */}
      <p
        className="font-ui text-center"
        style={{
          color: palette.accent,
          opacity: 0.6,
          fontSize: size === "sm" ? 6 : size === "md" ? 7 : size === "lg" ? 9 : 11,
          fontWeight: 300,
        }}
      >
        {author}
      </p>

      {/* Bottom decorative line */}
      <div
        className="absolute bottom-3 left-3 right-3 h-px"
        style={{ backgroundColor: palette.accent, opacity: 0.25 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create BookCard component**

```tsx
import { Link } from "@tanstack/react-router";
import { BookCover } from "./book-cover";
import type { Book } from "@verso/shared";

export function BookCard({ book }: { book: Book }) {
  return (
    <Link
      to="/books/$id"
      params={{ id: book.id }}
      className="group block transition-transform duration-250 ease-out hover:-translate-y-1.5"
    >
      <BookCover
        bookId={book.id}
        title={book.title}
        author={book.author}
        coverPath={book.coverPath}
        size="lg"
      />
      <div className="mt-2 px-0.5">
        <p
          className="font-display text-sm font-bold leading-snug"
          style={{
            color: "var(--text)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {book.title}
        </p>
        <p
          className="font-display text-xs italic mt-0.5"
          style={{ color: "var(--text-dim)" }}
        >
          {book.author}
        </p>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Create BookGrid component**

```tsx
import { BookCard } from "./book-card";
import type { Book } from "@verso/shared";

export function BookGrid({ books }: { books: Book[] }) {
  if (books.length === 0) {
    return (
      <div
        className="text-center py-20"
        style={{ color: "var(--text-faint)" }}
      >
        <p className="text-lg mb-2">No books yet</p>
        <p className="text-sm">Upload your first book to get started</p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-[22px]"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))",
      }}
    >
      {books.map((book, i) => (
        <div
          key={book.id}
          className="animate-in fade-in"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <BookCard book={book} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/books/
git commit -m "feat: BookCover, BookCard, and BookGrid components"
```

---

### Task 18: Web — Library Page (with Upload)

**Files:**
- Create: `packages/web/src/routes/_app.index.tsx`

- [ ] **Step 1: Create library page with drag-and-drop upload**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/trpc";
import { BookGrid } from "@/components/books/book-grid";
import { getAccessToken } from "@/lib/auth";

export const Route = createFileRoute("/_app/")({
  component: LibraryPage,
});

function LibraryPage() {
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();

  const booksQuery = trpc.books.list.useQuery({
    sort: "recent",
    limit: 50,
  });

  const onDrop = useCallback(
    async (files: File[]) => {
      setUploading(true);
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          await fetch("/api/upload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${getAccessToken()}`,
            },
            body: formData,
          });
        } catch (err) {
          console.error("Upload failed:", err);
        }
      }
      setUploading(false);
      utils.books.list.invalidate();
    },
    [utils]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/epub+zip": [".epub"],
      "application/pdf": [".pdf"],
    },
    noClick: true,
  });

  return (
    <div {...getRootProps()} className="relative min-h-full">
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="text-center">
            <p
              className="font-display text-2xl font-bold"
              style={{ color: "var(--warm)" }}
            >
              Drop books here
            </p>
            <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
              EPUB and PDF files supported
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="font-display text-[26px] font-bold"
            style={{ color: "var(--text)" }}
          >
            Library
          </h2>
          {booksQuery.data && (
            <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
              {booksQuery.data.total} book{booksQuery.data.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <label
          className="cursor-pointer px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {uploading ? "Uploading..." : "Upload"}
          <input
            type="file"
            className="hidden"
            accept=".epub,.pdf"
            multiple
            onChange={(e) => {
              if (e.target.files) onDrop(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* Book grid */}
      {booksQuery.isLoading ? (
        <div className="text-center py-20" style={{ color: "var(--text-faint)" }}>
          Loading...
        </div>
      ) : (
        <BookGrid books={booksQuery.data?.books || []} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/_app.index.tsx
git commit -m "feat: library page with book grid and drag-and-drop upload"
```

---

### Task 19: Web — Book Detail Page

**Files:**
- Create: `packages/web/src/routes/_app.books.$id.tsx`

- [ ] **Step 1: Create book detail page**

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import { getCoverPalette } from "@/lib/constants";

export const Route = createFileRoute("/_app/books/$id")({
  component: BookDetailPage,
});

function BookDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const bookQuery = trpc.books.byId.useQuery({ id });
  const deleteMutation = trpc.books.delete.useMutation({
    onSuccess: () => {
      utils.books.list.invalidate();
      navigate({ to: "/" });
    },
  });

  if (bookQuery.isLoading) {
    return (
      <div className="text-center py-20" style={{ color: "var(--text-faint)" }}>
        Loading...
      </div>
    );
  }

  if (!bookQuery.data) {
    return (
      <div className="text-center py-20" style={{ color: "var(--text-faint)" }}>
        Book not found
      </div>
    );
  }

  const book = bookQuery.data;
  const palette = getCoverPalette(book.id);

  const tags = [
    book.genre,
    book.year?.toString(),
    book.pageCount ? `${book.pageCount} pages` : null,
    book.fileFormat.toUpperCase(),
  ].filter(Boolean);

  return (
    <div>
      {/* Hero */}
      <div
        className="rounded-xl p-8 mb-8"
        style={{
          background: `linear-gradient(135deg, ${palette.dark}, ${palette.bg[1]})`,
        }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm mb-6 transition-opacity hover:opacity-100"
          style={{ color: palette.accent, opacity: 0.7 }}
        >
          ← Library
        </Link>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          <BookCover
            bookId={book.id}
            title={book.title}
            author={book.author}
            coverPath={book.coverPath}
            size="xl"
          />

          <div className="flex-1 min-w-0">
            <h1
              className="font-display text-[28px] font-bold leading-tight mb-2"
              style={{ color: palette.accent }}
            >
              {book.title}
            </h1>
            <p
              className="font-display text-lg italic mb-4"
              style={{ color: palette.accent, opacity: 0.7 }}
            >
              {book.author}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-6">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-xs border"
                  style={{
                    color: palette.accent,
                    borderColor: `${palette.accent}33`,
                    backgroundColor: `${palette.accent}0f`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: "var(--warm)" }}
                disabled
                title="Reader coming in Session 2"
              >
                Start Reading
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete this book?")) {
                    deleteMutation.mutate({ id: book.id });
                  }
                }}
                className="px-4 py-2.5 rounded-full text-sm border transition-colors"
                style={{
                  color: "var(--text-dim)",
                  borderColor: "var(--border)",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {book.description && (
        <section className="mb-8">
          <h3
            className="font-display text-base font-bold mb-3"
            style={{ color: "var(--text)" }}
          >
            About
          </h3>
          <p
            className="font-display text-sm italic leading-relaxed"
            style={{ color: "var(--text-dim)" }}
          >
            {book.description}
          </p>
        </section>
      )}

      {/* Details grid */}
      <section>
        <h3
          className="font-display text-base font-bold mb-3"
          style={{ color: "var(--text)" }}
        >
          Details
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Publisher", value: book.publisher },
            { label: "Year", value: book.year?.toString() },
            { label: "Language", value: book.language?.toUpperCase() },
            { label: "ISBN", value: book.isbn },
            { label: "Format", value: book.fileFormat.toUpperCase() },
            {
              label: "File Size",
              value: `${(book.fileSize / 1024 / 1024).toFixed(1)} MB`,
            },
            {
              label: "Added",
              value: new Date(book.createdAt).toLocaleDateString(),
            },
          ]
            .filter((d) => d.value)
            .map((d) => (
              <div
                key={d.label}
                className="rounded-lg p-4"
                style={{ backgroundColor: "var(--card)" }}
              >
                <p
                  className="text-[10px] font-medium uppercase tracking-wider mb-1"
                  style={{ color: "var(--text-faint)" }}
                >
                  {d.label}
                </p>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {d.value}
                </p>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/routes/_app.books.\$id.tsx
git commit -m "feat: book detail page with hero, metadata, and actions"
```

---

### Task 20: Integration Test & Final Verification

- [ ] **Step 1: Run server tests**

```bash
pnpm --filter @verso/server test
```

Expected: All tests PASS.

- [ ] **Step 2: Start both dev servers and verify end-to-end**

```bash
# Terminal 1
pnpm dev:server

# Terminal 2
pnpm dev:web
```

Verify in browser at `http://localhost:5173`:
1. Redirected to `/login` (no users yet)
2. Navigate to `/setup` → create admin account
3. Redirected to library → empty state shows
4. Upload an EPUB → book appears in grid with generated cover
5. Click book → detail page shows with hero gradient and metadata
6. Toggle dark/light theme
7. Mobile responsive: sidebar collapses to hamburger menu

- [ ] **Step 3: Final commit with any fixes**

```bash
git add -A
git commit -m "feat: Session 1 complete — upload and browse books with auth"
```

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```
