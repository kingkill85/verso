# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .
RUN pnpm run build

# Stage 3: Runtime (Debian-slim for Calibre compatibility)
FROM node:20-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install Calibre CLI tools + runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      calibre \
      gosu \
      python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/server/drizzle ./packages/server/drizzle
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/packages/web/package.json ./packages/web/
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --prod

RUN groupadd -g 1001 verso && useradd -u 1001 -g verso -s /bin/sh -m verso

ENV NODE_ENV=production
ENV STORAGE_PATH=/data/files
ENV DATABASE_URL=file:/data/db.sqlite

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "packages/server/dist/index.js"]
