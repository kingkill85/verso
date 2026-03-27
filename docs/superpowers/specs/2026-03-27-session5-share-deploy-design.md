# Session 5: Share and Deploy — Design Spec

## Overview

Final session of the Verso roadmap. Makes the app production-deployable and accessible via OPDS catalog readers. Builds on existing infrastructure: app passwords (Session 4b), OPDS client (Session 4b), OIDC auth (Session 4a), rate limiting plugin.

## Scope

### In scope
1. **OPDS catalog server** — serve user libraries as OPDS feeds for external readers
2. **Docker packaging** — multi-stage Dockerfile, SQLite + PostgreSQL compose files
3. **Health check endpoint** — `GET /health` for monitoring and container orchestration
4. **Deployment documentation** — reverse proxy examples, backup commands, OPDS setup guide

### Out of scope
- Backup scripts (covered by documentation + existing library export/restore UI)
- OIDC integration (already complete)
- Rate limiting setup (already wired via `@fastify/rate-limit`)
- App passwords (already complete with `opds` and `api` scopes)

---

## 1. OPDS Catalog Server

### Architecture

Follows the existing pattern: `opds-client.ts` handles inbound OPDS feeds, new `opds-server.ts` handles outbound feeds. Fastify routes call the service layer, which builds structured feed objects serialized to Atom XML.

### Authentication

- HTTP Basic auth: `Authorization: Basic base64(email:app_password)`
- Resolved via existing app password middleware, requires `opds` scope
- Each user sees only their own library — the authenticated user IS the scope
- No per-user URL prefix needed; identity comes from the credential

### Routes

All routes under `/opds/*`:

| Route | Type | Description |
|-------|------|-------------|
| `GET /opds/catalog` | Navigation | Root feed with links to all sections |
| `GET /opds/all` | Acquisition | All books for this user |
| `GET /opds/recent` | Acquisition | Recently added books |
| `GET /opds/authors` | Navigation | List of authors with book counts |
| `GET /opds/authors/:name` | Acquisition | Books by a specific author |
| `GET /opds/genres` | Navigation | List of genres with book counts |
| `GET /opds/genres/:genre` | Acquisition | Books in a specific genre |
| `GET /opds/shelves` | Navigation | User's shelves |
| `GET /opds/shelves/:id` | Acquisition | Books on a specific shelf |
| `GET /opds/search?q=` | Acquisition | Search results within user's library |
| `GET /opds/search-descriptor` | OpenSearch | OpenSearch description document |

### Service Layer (`services/opds-server.ts`)

Functions that build OPDS feed objects:

- `buildRootFeed(userId)` — navigation feed linking to all sections
- `buildAllBooks(userId, page)` — paginated acquisition feed of all books
- `buildRecentBooks(userId, page)` — recently added, paginated
- `buildAuthorsList(userId)` — navigation entries per author with count
- `buildAuthorBooks(userId, author, page)` — books filtered by author
- `buildGenresList(userId)` — navigation entries per genre with count
- `buildGenreBooks(userId, genre, page)` — books filtered by genre
- `buildShelvesList(userId)` — navigation entries per shelf
- `buildShelfBooks(userId, shelfId, page)` — books on a shelf
- `buildSearchResults(userId, query, page)` — FTS5 search results

Each function returns a structured feed object. A shared `serializeFeed()` function converts to Atom XML via `fast-xml-parser`.

### Feed Format

**Navigation feeds** (root, authors list, genres list, shelves list):
```xml
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:verso:user:{userId}:root</id>
  <title>Verso Library</title>
  <updated>{timestamp}</updated>
  <link rel="self" href="/opds/catalog" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="/opds/catalog" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="/opds/search-descriptor" type="application/opensearchdescription+xml"/>
  <entry>
    <title>All Books</title>
    <id>urn:verso:user:{userId}:all</id>
    <link rel="subsection" href="/opds/all" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">{count} books</content>
  </entry>
  <!-- more entries -->
</feed>
```

**Acquisition feeds** (all books, search results, etc.):
```xml
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:dc="http://purl.org/dc/terms/">
  <id>urn:verso:user:{userId}:all</id>
  <title>All Books</title>
  <updated>{timestamp}</updated>
  <link rel="self" href="/opds/all?page=1"/>
  <link rel="next" href="/opds/all?page=2" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="/opds/catalog" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <entry>
    <title>Book Title</title>
    <author><name>Author Name</name></author>
    <id>urn:verso:book:{bookId}</id>
    <updated>{updatedAt}</updated>
    <summary>Book description...</summary>
    <dc:language>en</dc:language>
    <dc:publisher>Publisher</dc:publisher>
    <link rel="http://opds-spec.org/acquisition" href="/api/books/{bookId}/file" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/image" href="/api/covers/{bookId}" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="/api/covers/{bookId}?w=100" type="image/jpeg"/>
  </entry>
</feed>
```

### Pagination

- 50 entries per page
- `?page=N` query parameter (1-indexed)
- `rel="next"` link included when more pages exist
- `rel="previous"` link when page > 1

### Book Download Auth

Acquisition links point to existing `/api/books/:id/file`. This endpoint currently uses JWT bearer auth. For OPDS readers, the existing app password Basic auth middleware must also be accepted on this endpoint (and `/api/covers/:id`), so readers can download books with the same credentials used to browse the catalog.

### OpenSearch Descriptor

`GET /opds/search-descriptor` returns:
```xml
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Verso</ShortName>
  <Description>Search your Verso library</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
       template="/opds/search?q={searchTerms}"/>
</OpenSearchDescription>
```

### Content Types

- Feeds: `application/atom+xml;profile=opds-catalog;kind=navigation` or `kind=acquisition`
- OpenSearch: `application/opensearchdescription+xml`
- Downloads: `application/epub+zip` or `application/pdf`

---

## 2. Docker Packaging

### Dockerfile (multi-stage)

**Stage 1 — deps:**
- Base: `node:20-alpine`
- Install pnpm globally
- Copy package.json, pnpm-lock.yaml, pnpm-workspace.yaml, all packages/*/package.json
- Run `pnpm install --frozen-lockfile`

**Stage 2 — build:**
- Copy full source
- Run `pnpm build` (builds shared, server, web)

**Stage 3 — runtime:**
- Base: `node:20-alpine`
- Install production-only deps: pnpm, sharp native binaries
- Copy built output from stage 2
- Create non-root user `verso` (uid 1000)
- Create `/data` directory owned by `verso`
- `EXPOSE 3000`
- `HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1`
- `USER verso`
- `CMD ["node", "packages/server/dist/index.js"]`

### docker-compose.yml (SQLite)

```yaml
services:
  verso:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - DATABASE_URL=file:/data/db.sqlite
      - STORAGE_PATH=/data/files
    restart: unless-stopped
```

### docker-compose.postgres.yml (PostgreSQL override)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=verso
      - POSTGRES_USER=verso
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U verso"]
      interval: 5s
      timeout: 3s
      retries: 5

  verso:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - DB_DRIVER=postgres
      - DATABASE_URL=postgresql://verso:${POSTGRES_PASSWORD}@postgres:5432/verso
      - STORAGE_PATH=/data/files
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
```

Usage: `docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d`

### .dockerignore

```
node_modules
.git
data/
.env
docs/
*.md
.vscode
```

---

## 3. Health Check Endpoint

**Route:** `GET /health` (unauthenticated)

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 12345,
  "database": "connected"
}
```

**Logic:**
- Runs a simple DB query (`SELECT 1`) to verify connectivity
- Returns 200 if DB responds, 503 if not
- Version read from package.json
- Uptime from `process.uptime()`
- No auth required — standard for health checks behind a reverse proxy

---

## 4. Deployment Documentation

Update existing `docs/DEPLOYMENT.md` with:

### Quick Start
- `docker compose up -d` with minimal env
- First user to register becomes admin

### PostgreSQL Setup
- Using the override compose file
- Connection string format

### Reverse Proxy Snippets

**Nginx:**
- `proxy_pass http://localhost:3000`
- Headers: `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`
- `client_max_body_size 100m` (matches MAX_UPLOAD_SIZE)

**Caddy:**
- `reverse_proxy localhost:3000`
- Automatic HTTPS

**Traefik:**
- Docker labels for service discovery
- TLS via Let's Encrypt

### Backup Commands
- SQLite: `sqlite3 /data/db.sqlite ".backup /backups/verso.db"`
- PostgreSQL: `docker compose exec postgres pg_dump -U verso verso > backup.sql`
- Files: `tar czf files-backup.tar.gz ./data/files/`
- Restore procedures for each

### OPDS Setup Guide
- Creating an app password with `opds` scope (via UI)
- Feed URL: `https://your-domain.com/opds/catalog`
- KOReader configuration steps
- Moon+ Reader configuration steps

### Security Notes
- Set `CORS_ORIGIN` to your domain
- Always use HTTPS in production
- Rotate `JWT_SECRET` periodically
- App passwords: use separate passwords per device, revoke when needed

---

## Testing Strategy

### OPDS Server
- Unit tests for each service function (buildRootFeed, buildAllBooks, etc.)
- Verify XML output parses correctly back through existing `opds-client.ts` parser
- Test pagination (empty, single page, multi-page)
- Test auth: valid app password, wrong scope, no auth, expired password
- Test user isolation: user A cannot see user B's books

### Docker
- Build test: `docker build .` succeeds
- Compose test: services start and health check passes
- Manual verification with an OPDS reader

### Health Check
- Returns 200 with valid DB
- Returns 503 when DB is unreachable
