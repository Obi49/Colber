# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Colber — negotiation
# Multi-stage build:
#   1. `deps`    — install pnpm + workspace deps with cache mount.
#   2. `build`   — compile TypeScript across the workspace, prune dev deps.
#   3. `runtime` — minimal Alpine image, non-root user, only prod artifacts.
# ---------------------------------------------------------------------------
ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=9.12.3

# ---------- 1) deps ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy workspace manifests first to maximise layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tooling/ ./tooling/
COPY packages/core-types/package.json ./packages/core-types/
COPY packages/core-crypto/package.json ./packages/core-crypto/
COPY packages/core-config/package.json ./packages/core-config/
COPY packages/core-logger/package.json ./packages/core-logger/
COPY packages/core-mcp/package.json ./packages/core-mcp/
COPY apps/negotiation/package.json ./apps/negotiation/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- 2) build ----------
FROM deps AS build
WORKDIR /repo
COPY . .
RUN pnpm --filter @colber/negotiation... build

# Prune dev dependencies for the runtime image.
RUN pnpm --filter @colber/negotiation deploy --prod /tmp/deploy

# ---------- 3) runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

# Non-root user
RUN addgroup -S colber && adduser -S colber -G colber

# Drop in the deployed (pruned) bundle.
COPY --from=build --chown=colber:colber /tmp/deploy/dist ./dist
COPY --from=build --chown=colber:colber /tmp/deploy/node_modules ./node_modules
COPY --from=build --chown=colber:colber /tmp/deploy/package.json ./package.json
COPY --from=build --chown=colber:colber /repo/apps/negotiation/proto ./proto
COPY --from=build --chown=colber:colber /repo/apps/negotiation/drizzle ./drizzle

USER colber

ENV NODE_ENV=production \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=4041 \
    GRPC_HOST=0.0.0.0 \
    GRPC_PORT=4042 \
    PRETTY_LOGS=false

EXPOSE 4041 4042

# `dist/db/migrate.js` runs migrations, then `dist/server.js` boots the service.
# Override CMD if your orchestrator runs migrations as a separate Job.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${HTTP_PORT}/healthz || exit 1
