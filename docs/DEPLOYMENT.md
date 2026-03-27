# Deployment

Verso is designed to run as a single Docker container for simplicity, with optional PostgreSQL for advanced setups.

---

## Quick Start (Docker)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/verso.git
cd verso
```

### 2. Create your environment file

```bash
cp .env.example .env
```

At minimum, set a strong `JWT_SECRET`:

```bash
# Generate a secure secret
openssl rand -hex 32
```

Edit `.env`:

```env
JWT_SECRET=paste-your-generated-secret-here
```

### 3. Start with Docker Compose

```bash
docker compose up -d
```

Open `http://localhost:3000` and complete the setup wizard.

The default compose file uses **SQLite** and stores all data under `./data` on the host.

---

## PostgreSQL Setup

Use the provided override file to swap in PostgreSQL:

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

The override file adds a `db` service (Postgres 16-alpine) and wires `DATABASE_URL` automatically. Change the default database password in `docker-compose.postgres.yml` (or via your `.env`) before exposing the host to a network:

```env
POSTGRES_PASSWORD=change-me-in-production
DATABASE_URL=postgresql://verso:change-me-in-production@db:5432/verso
DB_DRIVER=postgres
```

Data is persisted in a named Docker volume (`pgdata`). To connect an existing external PostgreSQL instance, set `DB_DRIVER` and `DATABASE_URL` directly in `.env` and omit the override file.

---

## Environment Variables

### Required

| Variable | Description | Example |
|---|---|---|
| `JWT_SECRET` | Secret for signing JWTs. Must be random, minimum 32 characters. | `openssl rand -hex 32` |

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server binds to |
| `HOST` | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | `info` | Log verbosity: `trace`, `debug`, `info`, `warn`, `error` |
| `MAX_UPLOAD_SIZE` | `104857600` | Maximum upload size in bytes (default 100 MB) |
| `CORS_ORIGIN` | `*` | Allowed CORS origin — set to your exact domain in production |

### Database

| Variable | Default | Description |
|---|---|---|
| `DB_DRIVER` | `sqlite` | Database backend: `sqlite` or `postgres` |
| `DATABASE_URL` | `file:./data/db.sqlite` | SQLite file path or PostgreSQL connection string |

### Storage

| Variable | Default | Description |
|---|---|---|
| `STORAGE_DRIVER` | `local` | Storage backend: `local` or `s3` |
| `STORAGE_PATH` | `./data` | Root directory for local storage |
| `S3_ENDPOINT` | — | S3-compatible endpoint URL (e.g. MinIO) |
| `S3_BUCKET` | — | S3 bucket name |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ACCESS_KEY` | — | S3 access key |
| `S3_SECRET_KEY` | — | S3 secret key |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `AUTH_MODE` | `both` | Auth strategy: `local`, `oidc`, or `both` |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor (increase for slower, more secure hashing) |

### OIDC (Optional)

| Variable | Default | Description |
|---|---|---|
| `OIDC_ISSUER` | — | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | — | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | — | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | — | Callback URL — must match provider configuration |
| `OIDC_SCOPES` | `openid profile email` | OIDC scopes to request |
| `OIDC_AUTO_REGISTER` | `true` | Auto-create users on first OIDC login |
| `OIDC_DEFAULT_ROLE` | `user` | Role assigned to auto-registered users |

---

## Reverse Proxy

Set `CORS_ORIGIN` to your public domain when running behind a proxy.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name books.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Allow large EPUB uploads
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name books.example.com;
    return 301 https://$host$request_uri;
}
```

### Caddy

Caddy handles HTTPS automatically via Let's Encrypt:

```
books.example.com {
    reverse_proxy localhost:3000
}
```

### Traefik (Docker labels)

Add these labels to the `verso` service in your compose file:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.verso.rule=Host(`books.example.com`)"
  - "traefik.http.routers.verso.entrypoints=websecure"
  - "traefik.http.routers.verso.tls.certresolver=letsencrypt"
  - "traefik.http.services.verso.loadbalancer.server.port=3000"
```

---

## Backup & Restore

### SQLite — Backup

Use SQLite's built-in online backup API to take a consistent snapshot while the container is running:

```bash
# Safe online backup (no need to stop the container)
docker compose exec verso sqlite3 /app/data/db.sqlite ".backup '/app/data/db.backup.sqlite'"

# Copy the snapshot to the host
cp ./data/db.backup.sqlite ./backups/db-$(date +%Y%m%d-%H%M).sqlite
```

### SQLite — Restore

```bash
docker compose stop verso
cp ./backups/db-20240101-0000.sqlite ./data/db.sqlite
docker compose start verso
```

### PostgreSQL — Backup

```bash
# Dump to a file on the host
docker compose exec db pg_dump -U verso verso > ./backups/verso-$(date +%Y%m%d-%H%M).sql
```

### PostgreSQL — Restore

```bash
docker compose stop verso
docker compose exec -T db psql -U verso verso < ./backups/verso-20240101-0000.sql
docker compose start verso
```

### File Volume Backup

Books and covers live in the mounted data directory. Back them up independently of the database:

```bash
# Archive the entire data directory
tar czf verso-files-$(date +%Y%m%d-%H%M).tar.gz ./data/books/ ./data/covers/

# Or rsync to a remote host
rsync -av ./data/books/ backup-host:/backups/verso/books/
rsync -av ./data/covers/ backup-host:/backups/verso/covers/
```

### Automated Backup Script

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR=/backups/verso
DATE=$(date +%Y%m%d-%H%M)

mkdir -p "$BACKUP_DIR"

# SQLite online backup
docker compose -f /opt/verso/docker-compose.yml exec verso \
  sqlite3 /app/data/db.sqlite ".backup '/app/data/db.backup.sqlite'"
cp /opt/verso/data/db.backup.sqlite "$BACKUP_DIR/db-$DATE.sqlite"

# File assets
rsync -a /opt/verso/data/books/  "$BACKUP_DIR/books/"
rsync -a /opt/verso/data/covers/ "$BACKUP_DIR/covers/"

# Retain last 7 daily database snapshots
find "$BACKUP_DIR" -name "db-*.sqlite" -mtime +7 -delete

echo "Backup complete: $BACKUP_DIR/db-$DATE.sqlite"
```

---

## OPDS Setup Guide

Verso exposes an OPDS 1.2 catalog that any OPDS-compatible reader app can consume.

### Step 1 — Create an App Password

OPDS clients authenticate with an **app password** (not your main account password). In the Verso web UI:

1. Go to **Settings → App Passwords**.
2. Click **New App Password**.
3. Give it a name (e.g. "KOReader on Kobo") and select the **opds** scope.
4. Copy the generated password — it is shown only once.

### Step 2 — Feed URL

The root catalog URL is:

```
https://your-domain.com/opds/catalog
```

Use your Verso username and the app password when the client asks for credentials.

### Available Feeds

| Feed | URL |
|---|---|
| Root catalog | `/opds/catalog` |
| All books | `/opds/all` |
| Recently added | `/opds/recent` |
| Browse by author | `/opds/authors` |
| Browse by genre | `/opds/genres` |
| Browse by shelf | `/opds/shelves` |
| Search | `/opds/search?q=query` |

### KOReader

1. Open the **Search** menu → **OPDS Catalog**.
2. Tap **+** to add a new catalog.
3. Enter:
   - **Name**: Verso
   - **URL**: `https://your-domain.com/opds/catalog`
   - **Username**: your Verso username
   - **Password**: the app password you created
4. Tap **Save** and browse your library.

### Moon+ Reader

1. Open **Library** → **Net Library** → **OPDS**.
2. Tap **+** → **Add OPDS**.
3. Enter the catalog URL, username, and app password.
4. Tap **OK** — your Verso library appears under Net Library.

### Librera Reader

1. Open **Preferences** → **OPDS Catalogs**.
2. Tap **+** → **Add Catalog**.
3. Fill in the URL, username, and password.
4. Tap **Save** and navigate to the catalog.

---

## Security Notes

- **JWT_SECRET** — Generate a random secret with `openssl rand -hex 32`. Rotating the secret invalidates all active sessions; users will need to log in again.
- **CORS_ORIGIN** — In production, set this to your exact public origin (e.g. `https://books.example.com`) rather than `*`. A wildcard allows any browser origin to make authenticated requests.
- **HTTPS** — Always serve Verso behind a TLS-terminating reverse proxy in production. OPDS credentials and session tokens travel in HTTP headers.
- **App passwords per device** — Issue a separate app password for each OPDS client or integration. This lets you revoke access for a single device without disrupting others.
- **Rate limiting** — The server applies rate limiting to authentication endpoints. For additional protection, configure rate limiting at the reverse proxy layer (e.g. Nginx `limit_req`, Traefik middleware).
- **Container isolation** — The Docker image runs as a non-root user. Avoid mounting sensitive host paths into the container.

---

## SQLite to PostgreSQL Migration

For users who start with SQLite and later want to switch to PostgreSQL:

1. Export data: `pnpm --filter server migrate:export` (dumps all tables to JSON)
2. Update `.env`: set `DB_DRIVER=postgres` and `DATABASE_URL`
3. Run migrations: `pnpm --filter server drizzle-kit migrate`
4. Import data: `pnpm --filter server migrate:import` (loads JSON into PostgreSQL)
5. Verify and remove the old SQLite file

---

## Health Check

```
GET /health

200 OK
{
  "status": "ok",
  "version": "1.0.0",
  "database": "connected",
  "storage": "accessible"
}
```

Used by Docker health checks and external monitoring:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

---

## Resource Requirements

### Minimum (Raspberry Pi 4)

- CPU: 1 core
- RAM: 512 MB
- Storage: depends on library size (1,000 EPUBs ≈ 2 GB)

### Recommended (VPS / NAS)

- CPU: 2 cores
- RAM: 1 GB
- Storage: 10 GB+ for a substantial library

SQLite is single-writer, so very high concurrent usage (10+ users actively uploading simultaneously) may benefit from PostgreSQL. For typical homelab use (1–5 users), SQLite is more than sufficient.
