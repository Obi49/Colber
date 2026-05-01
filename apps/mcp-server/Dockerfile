# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Colber — @colber/mcp (official MCP server)
# Multi-stage build:
#   1. `deps`    — install pnpm + workspace deps with cache mount.
#   2. `build`   — compile TypeScript across the workspace, prune dev deps.
#   3. `runtime` — minimal Alpine image, non-root user, only prod artifacts.
#
# Default CMD runs the HTTP transport on port 14080 — Docker is the right
# packaging for the "shared remote MCP" deployment model. For local clients
# (Claude Desktop), prefer `npx -y @colber/mcp` over Docker.
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
COPY packages/core-config/package.json ./packages/core-config/
COPY packages/core-logger/package.json ./packages/core-logger/
COPY apps/sdk-typescript/package.json ./apps/sdk-typescript/
COPY apps/mcp-server/package.json ./apps/mcp-server/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- 2) build ----------
FROM deps AS build
WORKDIR /repo
COPY . .
RUN pnpm --filter @colber/mcp... build

# Prune dev dependencies for the runtime image.
RUN pnpm --filter @colber/mcp deploy --prod /tmp/deploy

# ---------- 3) runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

# Non-root user
RUN addgroup -S colber && adduser -S colber -G colber

COPY --from=build --chown=colber:colber /tmp/deploy/dist ./dist
COPY --from=build --chown=colber:colber /tmp/deploy/node_modules ./node_modules
COPY --from=build --chown=colber:colber /tmp/deploy/package.json ./package.json

USER colber

ENV NODE_ENV=production \
    COLBER_MCP_TRANSPORT=http \
    COLBER_MCP_HTTP_HOST=0.0.0.0 \
    COLBER_MCP_HTTP_PORT=14080 \
    COLBER_LOG_LEVEL=info

EXPOSE 14080

CMD ["node", "dist/server.js", "--transport=http"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${COLBER_MCP_HTTP_PORT}/healthz || exit 1
