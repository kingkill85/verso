# Deployment

Verso is designed to run as a single Docker container for simplicity, with optional PostgreSQL for advanced setups.

## Docker

### Single Container (Recommended)

The default deployment bundles the Fastify server, React frontend (served as static files), and SQLite into a single container.

```bash
docker run -d \
  --name verso \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e JWT_SECRET=your-random-secret-here \
  verso/verso:latest
```

Open `http://localhost:3000` and complete the setup wizard.

### Docker Compose (with PostgreSQL)

```yaml
version: '3.8'

services:
  verso:
    image: verso/verso:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data/books:/app/data/books
      - ./data/covers:/app/data/covers
    environment:
      - DB_DRIVER=postgres
      - DATABASE_URL=postgresql://verso:secret@db:5432/verso
      - JWT_SECRET=change-me-to-a-random-string
      - STORAGE_DRIVER=local
      - STORAGE_PATH=/app/data
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=verso
      - POSTGRES_USER=verso
      - POSTGRES_PASSWORD=secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U verso"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

### Docker Compose (with OIDC / Authentik)

```yaml
version: '3.8'

services:
  verso:
    image: verso/verso:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - JWT_SECRET=change-me
      - AUTH_MODE=both
      - OIDC_ISSUER=https://auth.example.com/application/o/verso/
      - OIDC_CLIENT_ID=verso
      - OIDC_CLIENT_SECRET=your-client-secret
      - OIDC_REDIRECT_URI=https://books.example.com/auth/callback
      - OIDC_AUTO_REGISTER=true
      - OIDC_DEFAULT_ROLE=user
    restart: unless-stopped
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/ packages/

# Build shared first, then server and web in parallel
RUN pnpm --filter shared build
RUN pnpm --filter server build & pnpm --filter web build & wait

# Production image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/web/dist packages/web/dist

# Server serves web/dist as static files
ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_PATH=/app/data

VOLUME /app/data
EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret for signing JWTs. Must be random, at least 32 chars. | `openssl rand -hex 32` |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_DRIVER` | `sqlite` | Database driver: `sqlite` or `postgres` |
| `DATABASE_URL` | `file:./data/db.sqlite` | SQLite file path or PostgreSQL connection string |

### Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_DRIVER` | `local` | Storage backend: `local` or `s3` |
| `STORAGE_PATH` | `./data` | Local storage root directory |
| `S3_ENDPOINT` | — | S3-compatible endpoint URL |
| `S3_BUCKET` | — | S3 bucket name |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ACCESS_KEY` | — | S3 access key |
| `S3_SECRET_KEY` | — | S3 secret key |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_MODE` | `both` | Auth mode: `local`, `oidc`, or `both` |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor |

### OIDC

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ISSUER` | — | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | — | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | — | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | — | Callback URL (must match provider config) |
| `OIDC_SCOPES` | `openid profile email` | OIDC scopes to request |
| `OIDC_AUTO_REGISTER` | `true` | Auto-create users on first OIDC login |
| `OIDC_DEFAULT_ROLE` | `user` | Role for auto-registered users |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | `info` | Log level: trace, debug, info, warn, error |
| `MAX_UPLOAD_SIZE` | `104857600` | Max upload size in bytes (default 100MB) |
| `CORS_ORIGIN` | `*` | Allowed CORS origin (set to your domain in production) |

## Reverse Proxy

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name books.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for future live updates)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Caddy

```
books.example.com {
    reverse_proxy localhost:3000
}
```

### Traefik (Docker labels)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.verso.rule=Host(`books.example.com`)"
  - "traefik.http.routers.verso.tls.certresolver=letsencrypt"
  - "traefik.http.services.verso.loadbalancer.server.port=3000"
```

## Backup

### SQLite
```bash
# Stop the container or use SQLite's backup API
cp ./data/db.sqlite ./backups/db-$(date +%Y%m%d).sqlite
```

### PostgreSQL
```bash
docker exec verso-db pg_dump -U verso verso > backup.sql
```

### Book Files
```bash
# Entire data directory
tar czf verso-backup-$(date +%Y%m%d).tar.gz ./data/
```

### Automated Backup Script
```bash
#!/bin/bash
BACKUP_DIR=/backups/verso
DATE=$(date +%Y%m%d-%H%M)

mkdir -p $BACKUP_DIR

# Database
cp ./data/db.sqlite $BACKUP_DIR/db-$DATE.sqlite

# Books and covers
rsync -a ./data/books/ $BACKUP_DIR/books/
rsync -a ./data/covers/ $BACKUP_DIR/covers/

# Cleanup: keep last 7 daily backups
find $BACKUP_DIR -name "db-*.sqlite" -mtime +7 -delete
```

## SQLite to PostgreSQL Migration

For users who start with SQLite and later want to switch to PostgreSQL:

1. Export data: `pnpm --filter server migrate:export` (dumps all tables to JSON)
2. Update `.env`: set `DB_DRIVER=postgres` and `DATABASE_URL`
3. Run migrations: `pnpm --filter server drizzle-kit migrate`
4. Import data: `pnpm --filter server migrate:import` (loads JSON into PostgreSQL)
5. Verify and remove old SQLite file

## Health Check

```
GET /health

Response: 200
{
  "status": "ok",
  "version": "1.0.0",
  "database": "connected",
  "storage": "accessible"
}
```

Used by Docker health checks and monitoring:
```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Resource Requirements

### Minimum (Raspberry Pi 4)
- CPU: 1 core
- RAM: 512MB
- Storage: Depends on library size (1000 EPUBs ≈ 2GB)

### Recommended (VPS / NAS)
- CPU: 2 cores
- RAM: 1GB
- Storage: 10GB+ for a substantial library

SQLite is single-writer, so very high concurrent usage (10+ users actively uploading simultaneously) may benefit from PostgreSQL. For typical homelab use (1–5 users), SQLite is more than sufficient.
