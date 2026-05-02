# `@colber/site` — colber.dev landing

Public landing page for the [Colber](https://github.com/Obi49/Colber) platform. Static Next.js 15 export served by `nginx:alpine`. EN default + FR (`/fr`) localized variants.

This package is the deliverable for **Wave 1.4** of the Colber roadmap.

## Stack

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Framework | Next.js 15 (App Router) + React 19                           |
| Output    | `output: 'export'` — fully static `out/` directory           |
| Styling   | Tailwind CSS v4 (mirrors `apps/operator-console`)            |
| Fonts     | Inter + JetBrains Mono via `next/font/google`                |
| MDX       | `@next/mdx` enabled (no MDX pages yet — reserved for /docs)  |
| Diagrams  | `mermaid` v11, dynamically imported on the architecture page |
| Tests     | Vitest 2 + React Testing Library 16 (jsdom)                  |
| Hosting   | Docker `nginx:alpine` (`colber-stack/`) → port `14060` on β  |

Aligned strictly with `apps/operator-console/` for `tsconfig`, `eslint`, `tailwind`, `postcss` so monorepo-wide commands stay consistent.

## Local development

```bash
# from the repo root
pnpm install
pnpm --filter @colber/site dev
# → http://localhost:3001
```

The `prebuild` script copies `docs/diagrams/colber-*.md` into `public/diagrams/` so the architecture component can fetch them at runtime. It runs automatically on `next build`; trigger it manually with:

```bash
pnpm --filter @colber/site exec node scripts/copy-diagrams.mjs
```

## Build

```bash
pnpm --filter @colber/site build
# → apps/site/out/
```

The output directory is everything nginx needs. No Node runtime is shipped.

## Tests

```bash
pnpm --filter @colber/site test       # 3 unit suites: Quickstart / i18n / modules
pnpm --filter @colber/site typecheck
pnpm --filter @colber/site lint
```

## Docker

The `Dockerfile` is multi-stage:

1. `builder` — installs pnpm + workspace deps, runs `next build`, produces `out/`.
2. `nginx` — copies `out/` into `nginx:alpine` and ships a custom `nginx.conf` (gzip, cache headers, `try_files` fallback).

Build context = repo root. The `colber-stack/docker-compose.services.yml` entry handles the rest:

```bash
# from the repo root
docker compose \
  -f colber-stack/docker-compose.yml \
  -f colber-stack/docker-compose.services.yml \
  up -d colber-site
# → http://localhost:14060
```

Healthcheck: `wget -q -O- http://localhost/` every 30 s.

## Deployment

### β VM (current)

1. SSH into the β VM, pull the latest commit.
2. `docker compose ... up -d --build colber-site` (same command as local).
3. The compose file pins port `14060` on the host. Traefik (or a manual nginx vhost) terminates TLS and proxies `colber.dev` to that port — outside the scope of this package.

See [`docs/DEPLOY.md`](../../docs/DEPLOY.md) for the full β-VM runbook.

### Future: VPS IONOS

No application changes required. Migrating to a VPS only needs:

- DNS A-record `colber.dev` → VPS public IP.
- Same Docker compose, same image.
- TLS via Caddy / Traefik / Certbot at the host level.

## Environment variables

All build-time variables must be prefixed with `NEXT_PUBLIC_` (no Node runtime — anything not inlined at build time is unreadable):

| Variable                      | Default                           |
| ----------------------------- | --------------------------------- |
| `NEXT_PUBLIC_REPO_URL`        | `https://github.com/Obi49/Colber` |
| `NEXT_PUBLIC_SITE_URL`        | `https://colber.dev`              |
| `NEXT_PUBLIC_DISCUSSIONS_URL` | `${REPO_URL}/discussions`         |
| `NEXT_PUBLIC_CONTACT_EMAIL`   | `dof1502.mwm27@gmail.com`         |

Cf. `.env.example`.

## Out of scope (intentional)

- `/docs/*` — Wave 2.
- `/blog/*` — Wave 3.3.
- Interactive playground.
- Authentication.
- Status page.
- Analytics (Plausible / GA / etc.).

## Layout

```
apps/site/
├── content/                  # Source-of-truth data (modules, quickstart snippets)
├── public/                   # Static assets (favicon, OG image, robots, sitemap)
├── scripts/copy-diagrams.mjs # Prebuild step: docs/diagrams/*.md → public/diagrams/*.md
├── src/
│   ├── app/                  # App Router (EN root + /fr + /manifesto + /fr/manifesto)
│   ├── components/           # Hero, Modules, Quickstart, Architecture, …
│   └── lib/                  # i18n, seo, version, utils
├── test/unit/                # Vitest + RTL smoke tests (3)
├── Dockerfile                # nginx-alpine multi-stage
├── nginx.conf                # gzip + cache + try_files
└── ...                       # next/postcss/tailwind/eslint configs
```
