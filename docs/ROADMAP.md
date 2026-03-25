# Verso Implementation Roadmap

Build in vertical slices — each session produces a runnable, testable application.

## Session 1: "Upload a book and see it" ✅ COMPLETE

Foundation + first end-to-end feature. Go from zero to a working app.

- ✅ Monorepo scaffolding (pnpm workspaces, tsconfig, shared package)
- ✅ Drizzle ORM schema + SQLite migrations
- ✅ Fastify server with config, env loading
- ✅ Local auth: register, login, JWT access/refresh tokens, auth middleware
- ✅ Book upload endpoint (multipart) + EPUB/PDF parsing + local file storage
- ✅ Book CRUD via tRPC (list, get, delete)
- ✅ React app shell: TanStack Router, layout with sidebar, Tailwind + shadcn/ui
- ✅ Design system foundations: typography (Libre Baskerville + Outfit), color tokens, dark/light mode
- ✅ Library grid page with generated book covers (gradient palettes)
- ✅ Book detail page
- ✅ Login/register/setup pages
- ✅ Dedicated upload page with drop zone and file list
- ✅ Unit tests: 46 tests, 86% coverage on testable code
- ✅ Dev script (dev.sh) with --reset flag

**Result:** Sign up, upload books, browse your library, view book details.

## Session 2: "Read a book" ✅ COMPLETE

The core reading experience.

- ✅ EPUB reader page with epub.js (paginated + scrolling modes)
- ✅ Reader settings panel (font family, size, line height, theme, margins, view mode)
- ✅ Reading progress sync via tRPC (CFI position + percentage, debounced 30s saves)
- ✅ Resume reading from last position
- ✅ TOC navigation (slide-in panel from left)
- ✅ "Continue Reading" row on library page (auto-populated from progress)
- ✅ Book detail page: working "Start Reading" / "Continue Reading" / "Read Again" CTA + progress card
- ✅ Full-screen reader with auto-hiding controls, keyboard nav, tap zones, hover reveal
- ✅ Token refresh fix: expired access tokens now properly trigger the 401 → refresh → retry flow
- ✅ Unit tests: 77 total (58 backend + 19 frontend reader component tests)
- ✅ Frontend test infrastructure: vitest + jsdom + testing-library

**Result:** Open a book, read it, come back later and pick up where you left off.

## Session 3: "Organize and find books"

Library management features.

- Manual shelves: create, rename, delete, add/remove books
- Smart shelves with JSON filter rules (by author, tag, format, read status, etc.)
- Default shelves: Currently Reading, Want to Read, Favorites, Recently Added
- Shelf pages + sidebar shelf list
- Full-text search with SQLite FTS5 (weighted: title > author > description)
- Search results page with filters

**Result:** Organize books into shelves, find any book instantly.

## Session 4: "Polish and enrich"

Depth features that make the app feel complete.

- Metadata enrichment: Google Books + Open Library APIs with confidence scoring
- Metadata review/apply UI
- Reader annotations: highlights, bookmarks, notes
- Annotations list on book detail page
- Reading stats: time spent, pages read, streaks, genre distribution
- Import: from files (bulk upload), Calibre library, OPDS feeds, URLs
- Export: library backup as ZIP

**Result:** Rich metadata, annotations while reading, reading stats dashboard.

## Session 5: "Share and deploy"

External access and production readiness.

- OPDS catalog: root feed, acquisition feeds, search, navigation
- API key / app password auth for OPDS (HTTP Basic)
- OIDC integration (PKCE flow) with Authentik/Keycloak/etc.
- Multi-stage Dockerfile (Node 20 Alpine)
- docker-compose.yml (SQLite) + docker-compose.postgres.yml
- Health check endpoint (GET /health)
- Reverse proxy examples (Nginx, Caddy, Traefik)
- Backup scripts (SQLite copy, pg_dump)
- Rate limiting on auth endpoints

**Result:** Production-deployable, accessible via OPDS readers, SSO-enabled.

## Notes

- Each session is its own spec → plan → implementation cycle
- Sessions build on each other sequentially — don't skip ahead
- The specs in `docs/` (ARCHITECTURE.md, API.md, DATABASE.md, AUTH.md, DESIGN.md, FEATURES.md, DEPLOYMENT.md) are the source of truth for all implementation details
- Session 1 is the largest but most critical — it establishes all patterns the rest build on
