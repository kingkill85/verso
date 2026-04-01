# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Verso is a self-hosted ebook library manager. It's a pnpm monorepo with three packages:

- **`packages/shared`** — Drizzle ORM schema, Zod validators, shared TypeScript types
- **`packages/server`** — Fastify 5 backend with tRPC v11 API
- **`packages/web`** — React 19 SPA with TanStack Router and Vite

## Commands

```bash
# Development
pnpm dev              # Run server + web in parallel
pnpm dev:server       # Server only (Fastify on :3000, uses tsx watch)
pnpm dev:web          # Web only (Vite on :5173, proxies /trpc and /api to :3000)

# Build
pnpm build            # Build all packages (shared must build first)
pnpm build:shared     # Build shared package alone

# Database (Drizzle Kit via server package)
pnpm db:generate      # Generate migration files
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema directly (dev shortcut)

# Testing
pnpm test             # Run all tests (vitest)
pnpm test:server      # Server tests only
cd packages/server && pnpm test:watch          # Watch mode
cd packages/server && pnpm vitest run src/path/to/test.ts  # Single test file
cd packages/web && pnpm vitest run src/path/to/test.ts     # Single web test

# Linting
pnpm lint             # Lint all packages
```

## Architecture

### Data Flow

Web client → tRPC (type-safe RPC over HTTP) → Fastify server → Drizzle ORM → SQLite or PostgreSQL

The tRPC router is defined in `packages/server/src/trpc/` and the web client consumes it via `@trpc/react-query`. The shared package provides the Drizzle schema (`packages/shared/src/schema.ts`) used by both server queries and tRPC input/output types.

### Server Structure (`packages/server/src/`)

- **`trpc/routers/`** — tRPC procedure definitions (auth, books, shelves, progress, annotations, metadata, stats, authors, admin, kindle, app-password)
- **`routes/`** — Fastify HTTP routes for non-tRPC endpoints: file upload (multipart), ebook streaming (range requests), cover serving, OPDS catalog (Atom XML), KOReader sync, import/export
- **`services/`** — Business logic: EPUB parsing (epub2 library), metadata enrichment (Google Books / Open Library), Calibre integration, S3/local storage abstraction, JWT handling
- **`db/`** — Database connection setup, supports SQLite (better-sqlite3) and PostgreSQL (pg) via `DB_DRIVER` env var
- **`config.ts`** — Zod-validated environment variable parser

### Web Structure (`packages/web/src/`)

- **`routes/`** — TanStack Router file-based routing. `_app/` is the authenticated layout, `_auth/` is login/register
- **`components/`** — React components, `ui/` contains shadcn/ui primitives
- **`hooks/`** — Custom hooks including auth context
- **`locales/`** — i18next translation JSON files (en, de, es, fr, it, nl, pt, zh, ja, ko)
- **`lib/trpc.ts`** — tRPC client setup

Path alias: `@/*` maps to `packages/web/src/*`

### Authentication

JWT-based auth with access/refresh token pattern (via `jose` library). Supports local passwords, OIDC SSO, or both (controlled by `AUTH_MODE`). E-readers authenticate via app passwords with KOSync-compatible endpoints.

### Storage

Files stored via pluggable driver (`STORAGE_DRIVER`): local filesystem (default, SHA256-hashed filenames) or S3-compatible object storage.

## Key Conventions

- **EPUB parsing**: Always use the `epub2` library, never hand-roll regex parsing
- **Database**: Schema is in `packages/shared/src/schema.ts`. Drizzle migrations live in `packages/server/drizzle/`
- **Styling**: Tailwind CSS 4 with shadcn/ui (new-york style). Dark/light theme via CSS variables
- **i18n**: All user-facing strings must use i18next. Provide real translations for each locale — never use English placeholders
- **Environment**: Node >=20, pnpm >=9. Server reads `.env` from repo root via `tsx --env-file`
- **Testing**: Vitest with 80% coverage threshold on server. Server uses node environment, web uses jsdom
- **Docker**: Multi-stage build, images pushed to ghcr.io on version tags. Includes Calibre for format conversion
