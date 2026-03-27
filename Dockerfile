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

# Stage 3: Runtime
FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

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

RUN addgroup -g 1000 verso && adduser -u 1000 -G verso -s /bin/sh -D verso
RUN mkdir -p /data/files && chown -R verso:verso /data

ENV NODE_ENV=production
ENV STORAGE_PATH=/data/files
ENV DATABASE_URL=file:/data/db.sqlite

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER verso
CMD ["node", "packages/server/dist/index.js"]
