# Architecture

## System Overview

Verso is a monorepo containing three packages: a Fastify backend (`server`), a React frontend (`web`), and shared types/schemas (`shared`). The backend exposes a tRPC API for the frontend and additional Fastify routes for binary operations (file uploads, ebook streaming, cover images) and OPDS XML feeds.

```
┌─────────────────────────────────────────────────┐
│                   Client                         │
│  React + tRPC Client + React Query + epub.js     │
└──────────────────┬──────────────────────────────┘
                   │
          ┌────────┴────────┐
          │   Fastify HTTP   │
          │     Server       │
          ├──────────────────┤
          │  tRPC Router     │  ← JSON API (typed)
          │  ├── auth        │
          │  ├── books       │
          │  ├── shelves     │
          │  ├── progress    │
          │  └── metadata    │
          ├──────────────────┤
          │  Fastify Routes  │  ← Binary / XML
          │  ├── POST /upload│
          │  ├── GET /stream │
          │  ├── GET /covers │
          │  └── GET /opds/* │
          ├──────────────────┤
          │  Services        │
          │  ├── epub-parser │
          │  ├── pdf-parser  │
          │  ├── metadata    │
          │  ├── storage     │
          │  └── cover-ext.  │
          ├──────────────────┤
          │  Drizzle ORM     │
          │  SQLite / PG     │
          └──────────────────┘
                   │
          ┌────────┴────────┐
          │  File Storage    │
          │  Local / S3      │
          └─────────────────┘
```

## Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Fastify 5
- **API**: tRPC v11 with Fastify adapter (`@trpc/server/adapters/fastify`)
- **Validation**: Zod (native tRPC integration)
- **ORM**: Drizzle ORM with `drizzle-kit` for migrations
- **Database**: SQLite via `better-sqlite3` (default) or PostgreSQL via `pg`
- **Auth**: JWT (`jose` library), OIDC (`openid-client`)
- **File parsing**: `epub2` for EPUB metadata, `pdf-parse` for PDF
- **Metadata**: Google Books API, Open Library API
- **OPDS**: Hand-built Atom XML via template literals

### Frontend
- **Framework**: React 19, TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State**: tRPC + React Query (TanStack Query v5) — no additional state library needed
- **Reader**: epub.js for EPUB rendering
- **Routing**: TanStack Router or React Router v7

### Shared
- **Drizzle schema** — imported by server for DB, inferred types used by frontend
- **Zod schemas** — shared input validation between client and server
- **tRPC AppRouter type** — exported for frontend type inference

### Monorepo
- **Package manager**: pnpm 9+ with workspaces
- **Structure**: `packages/server`, `packages/web`, `packages/shared`
- **TypeScript**: Shared `tsconfig.base.json`, per-package configs extend it

## Project Structure

```
verso/
├── README.md
├── package.json                 # Workspace root scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json           # Shared TypeScript config
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile
├── .env.example
│
├── packages/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts              # Entry point — starts Fastify
│   │       ├── app.ts                # Fastify app factory
│   │       ├── config.ts             # Env parsing with Zod
│   │       │
│   │       ├── db/
│   │       │   ├── client.ts         # DB connection (SQLite or PG based on config)
│   │       │   ├── migrate.ts        # Run migrations
│   │       │   └── seed.ts           # Optional dev seed data
│   │       │
│   │       ├── trpc/
│   │       │   ├── index.ts          # initTRPC, context factory, middleware
│   │       │   ├── router.ts         # Merged appRouter
│   │       │   └── routers/
│   │       │       ├── auth.ts       # register, login, refresh, me, oidc
│   │       │       ├── books.ts      # list, byId, update, delete, search
│   │       │       ├── shelves.ts    # CRUD + addBook, removeBook
│   │       │       ├── progress.ts   # get, sync, stats
│   │       │       └── metadata.ts   # search external, apply to book
│   │       │
│   │       ├── routes/
│   │       │   ├── upload.ts         # POST /api/upload — multipart book upload
│   │       │   ├── stream.ts         # GET /api/books/:id/file — stream ebook
│   │       │   ├── covers.ts         # GET /api/covers/:id — serve cover image
│   │       │   ├── opds.ts           # GET /opds/* — OPDS catalog feeds
│   │       │   └── oidc-callback.ts  # GET /auth/callback — OIDC redirect
│   │       │
│   │       ├── services/
│   │       │   ├── epub-parser.ts    # Extract metadata + cover from EPUB
│   │       │   ├── pdf-parser.ts     # Extract metadata from PDF
│   │       │   ├── metadata-fetcher.ts  # Google Books + Open Library client
│   │       │   ├── cover-extractor.ts   # Extract/resize cover images
│   │       │   ├── storage.ts        # Abstraction over local FS / S3
│   │       │   └── opds-builder.ts   # Build OPDS Atom XML feeds
│   │       │
│   │       └── middleware/
│   │           ├── auth.ts           # JWT verification middleware
│   │           └── rate-limit.ts     # Rate limiting for auth endpoints
│   │
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── trpc.ts               # tRPC client + React Query provider
│   │       │
│   │       ├── pages/
│   │       │   ├── Library.tsx        # Main grid view
│   │       │   ├── BookDetail.tsx     # Full book page
│   │       │   ├── Reader.tsx         # EPUB reader
│   │       │   ├── Shelf.tsx          # Single shelf view
│   │       │   ├── Search.tsx         # Search results
│   │       │   ├── Stats.tsx          # Reading statistics
│   │       │   ├── Settings.tsx       # User settings, app passwords
│   │       │   ├── Login.tsx          # Auth page
│   │       │   └── Setup.tsx          # First-run admin creation
│   │       │
│   │       ├── components/
│   │       │   ├── layout/
│   │       │   │   ├── Sidebar.tsx
│   │       │   │   ├── TopBar.tsx
│   │       │   │   └── AppShell.tsx
│   │       │   ├── books/
│   │       │   │   ├── BookCover.tsx
│   │       │   │   ├── BookCard.tsx
│   │       │   │   ├── BookGrid.tsx
│   │       │   │   └── ReadingProgress.tsx
│   │       │   ├── reader/
│   │       │   │   ├── EpubViewer.tsx
│   │       │   │   ├── ReaderControls.tsx
│   │       │   │   ├── TableOfContents.tsx
│   │       │   │   └── AnnotationPanel.tsx
│   │       │   └── ui/               # shadcn/ui components
│   │       │
│   │       ├── hooks/
│   │       │   ├── useTheme.ts
│   │       │   ├── useAuth.ts
│   │       │   └── useReadingProgress.ts
│   │       │
│   │       └── lib/
│   │           ├── utils.ts
│   │           └── constants.ts
│   │
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts              # Re-exports
│           ├── schema.ts             # Drizzle DB schema
│           ├── validators.ts         # Zod input/output schemas
│           └── types.ts              # Derived TypeScript types
│
└── data/                             # Runtime data (gitignored)
    ├── db.sqlite
    ├── books/
    └── covers/
```

## Data Flow

### Book Upload Flow
```
User drops file → POST /api/upload (multipart)
  → Validate file type (epub/pdf/mobi)
  → Generate UUID, store file: data/books/{uuid}/book.{ext}
  → Parse file metadata (epub-parser or pdf-parser)
  → Extract embedded cover → data/covers/{uuid}.jpg
  → Insert book record into DB with extracted metadata
  → Background: search Google Books / Open Library by ISBN or title
  → If confident match, merge enriched metadata
  → If ambiguous, flag for user review
  → Return book record to client
```

### Reading Progress Sync
```
Reader reports position → trpc.progress.sync.mutate()
  → Debounced on client (every 30s or on page turn)
  → Upsert reading_progress record
  → Update last_read_at timestamp
  → If percentage >= 98%, mark as finished (finished_at)
  → Client uses optimistic updates via React Query
```

### OIDC Authentication Flow
```
User clicks "Sign in with SSO"
  → trpc.auth.getOIDCAuthUrl.query()
  → Returns authorization URL with state + nonce
  → User redirected to Authentik
  → Authenticates, consents
  → Redirected to GET /auth/callback?code=xxx&state=yyy
  → Server exchanges code for tokens
  → Validates ID token (signature, issuer, audience, nonce)
  → Extracts sub, email, name from claims
  → Find or create local user linked to OIDC sub
  → Issue Verso JWT (access + refresh)
  → Redirect to frontend with tokens in httpOnly cookies
```

## Key Design Decisions

### tRPC over REST
End-to-end type safety eliminates an entire class of bugs. No API documentation to maintain — the types ARE the documentation. React Query integration gives us caching, optimistic updates, and background refetching for free.

### Drizzle over Prisma
Drizzle has true SQLite support (Prisma's is limited), generates SQL that's easier to debug, and the schema-as-code approach means the schema lives in the shared package and is importable by both server and client for type inference.

### SQLite as Default
Zero configuration, single file, easy to backup (just copy the file), and fast enough for a personal library with tens of thousands of books. PostgreSQL is available for users who need concurrent multi-instance access or are already running Postgres.

### Sessions via JWT (not cookies)
JWTs allow the same auth mechanism to work for the web UI, OPDS clients, and potential future mobile apps. The access token is short-lived (15min), the refresh token is stored in the DB and can be revoked.

### File Storage Abstraction
The storage service provides a consistent interface (`put`, `get`, `stream`, `delete`) regardless of whether files are on local disk or S3-compatible storage. This is configured via environment variables and doesn't affect any application logic.
