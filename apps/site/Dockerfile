# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Colber — landing site (Next.js 15 static export → nginx-alpine)
# Multi-stage build:
#   1. `builder` — install pnpm + workspace deps, build the static `out/`.
#   2. `nginx`   — copy `out/` into nginx:alpine + ship custom nginx.conf.
#
# Build context = repo root (cf. colber-stack/docker-compose.services.yml).
# ---------------------------------------------------------------------------
ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=9.12.3

# ---------- 1) builder ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Workspace manifests first to maximise layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tooling/ ./tooling/
COPY apps/site/package.json ./apps/site/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @colber/site...

# Source + diagrams (the prebuild script copies docs/diagrams/colber-*.md
# into apps/site/public/diagrams/ before `next build` runs).
COPY apps/site ./apps/site
COPY docs/diagrams ./docs/diagrams

RUN pnpm --filter @colber/site build

# ---------- 2) nginx ----------
FROM nginx:alpine AS nginx

# wget for healthcheck (busybox provides a minimal version on alpine).
RUN apk add --no-cache wget

COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/site/out /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
