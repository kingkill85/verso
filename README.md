# Verso

A self-hosted ebook management application. Browse, organize, and read your ebook collection through a beautiful web interface. Think "Spotify for books" — warm, literary, and personal.

## Overview

Verso lets you upload your ebook library, organize books into custom shelves, read directly in the browser, and sync your reading progress across devices. It supports OIDC single sign-on for homelab integration and exposes an OPDS catalog so external reader apps can browse and download books.

## Key Features

- **Library management** — Upload EPUBs, PDFs, and MOBIs with automatic metadata extraction
- **Custom shelves** — Organize books into personal collections, plus smart shelves with auto-filters
- **Built-in reader** — EPUB reader with bookmarks, highlights, annotations, and reading theme support
- **Reading progress** — Track pages read, reading streaks, and per-book progress synced across devices
- **Metadata enrichment** — Auto-fetch covers, descriptions, and details from Google Books and Open Library
- **Multi-user** — Each user gets their own library, shelves, and reading progress
- **OIDC authentication** — Integrate with Authentik, Keycloak, or any OIDC provider
- **OPDS catalog** — Browse and download books from KOReader, Moon+ Reader, Calibre, and other apps
- **Dark mode** — Full dark/light theme support
- **Self-hosted** — SQLite by default, single Docker container, runs on a Raspberry Pi

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System architecture, tech stack, project structure |
| [Database Schema](docs/DATABASE.md) | Full Drizzle ORM schema with all tables and relations |
| [API Specification](docs/API.md) | tRPC router definitions, Fastify routes, OPDS feeds |
| [Authentication](docs/AUTH.md) | JWT, local auth, OIDC flow, app passwords |
| [Design System](docs/DESIGN.md) | UI design language, typography, color system, components |
| [Features](docs/FEATURES.md) | Detailed feature specifications and user flows |
| [Deployment](docs/DEPLOYMENT.md) | Docker, environment variables, reverse proxy, migration |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui |
| API Layer | tRPC (end-to-end type safety) |
| Backend | Fastify, TypeScript |
| Database | Drizzle ORM — SQLite (default) or PostgreSQL |
| Auth | JWT + OIDC (openid-client) |
| Reader | epub.js |
| Monorepo | pnpm workspaces |
| Deployment | Docker, docker-compose |

## Quick Start

```bash
docker run -d \
  --name verso \
  -p 3000:3000 \
  -v ./data:/app/data \
  verso/verso:latest
```

Open `http://localhost:3000` and create your admin account.

## Development

```bash
git clone https://github.com/your-user/verso.git
cd verso
pnpm install
pnpm dev
```

## License

MIT
