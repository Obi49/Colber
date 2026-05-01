# Contributing to Colber

Thanks for considering a contribution to **Colber**, the infrastructure platform for the agent economy. This document covers how to report issues, propose changes, and get a pull request merged.

> 🇫🇷 Une version française de ce document est en cours de rédaction. En attendant, n'hésitez pas à ouvrir une issue ou un PR en français — les mainteneurs sont francophones.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Report unacceptable behavior to the maintainer (see [README.md](README.md)).

---

## How to contribute

### Reporting a bug

1. Search [existing issues](https://github.com/Obi49/Colber/issues) first — your bug may already be tracked.
2. If not, open a new issue using the **Bug report** template. Include:
   - A minimal reproduction (smallest possible code or curl example).
   - Expected behavior vs. actual behavior.
   - Environment: Node version (`node -v`), pnpm version, OS, Docker version if relevant, which Colber service.
   - Logs (use `````` blocks, redact secrets).
3. If the bug is a security issue, **do not file a public issue** — see [SECURITY.md](SECURITY.md).

### Proposing a feature

1. Search [Discussions](https://github.com/Obi49/Colber/discussions) for prior art.
2. Open a new Discussion under "Ideas" describing:
   - The problem you're trying to solve (not the solution you have in mind).
   - Who benefits and how.
   - Whether this fits one of the 5 modules (REPUTATION, MEMORY, OBSERVABILITY, NEGOTIATION, INSURANCE) or is cross-cutting.
3. Once a maintainer reacts positively, open an issue using the **Feature request** template, then a PR.

### Submitting a pull request

1. **Fork** the repo and create a feature branch from `main` (e.g. `feat/colber-reputation-anti-sybil`).
2. **Conventional Commits** are mandatory. Examples:
   - `feat(reputation): add Louvain community detection for anti-Sybil scoring`
   - `fix(observability): handle ISO timestamps with timezone offset in ClickHouse insert`
   - `docs(readme): clarify Apache-2.0 licensing scope for insurance module`
   - `chore(deps): bump @noble/ed25519 from 2.3.0 to 2.4.0`
3. **Tests required** for any code change. We do not merge code without tests.
4. **Signed off** with `Signed-off-by: Your Name <email>` (use `git commit -s`) — implies you accept the [Developer Certificate of Origin](https://developercertificate.org/).
5. Run the full validation suite locally before opening the PR:
   ```bash
   pnpm install
   pnpm typecheck   # must be 16/16 green
   pnpm test        # must keep all tests green (currently ~349 passing + 4 skipped)
   pnpm lint        # must be 0 errors, 0 warnings
   pnpm build       # must be 11/11 green
   ```
6. Open the PR using the **Pull request** template. Link the issue it closes (`Closes #123`).
7. Pre-commit hooks (`husky` + `lint-staged`) must pass. **Do not bypass them** — `--no-verify` is forbidden in this project.

### What we accept (and don't)

✅ Welcome:

- Bug fixes with regression tests.
- Performance improvements with before/after measurements.
- New tests for under-covered code paths.
- Documentation improvements and translations.
- New features that fit the [roadmap](docs/ROADMAP.md) and have been pre-discussed.
- Plugins and SDKs in additional ecosystems (e.g. Go, Java, Ruby clients).

🛑 Not accepted without prior discussion:

- New modules that change the platform's surface area.
- Breaking API changes without a migration path and deprecation window.
- Style-only refactors that don't improve readability or correctness.
- Dependency bumps that lock us into a specific cloud provider.

---

## Repository structure

See [README.md → Structure du repo](README.md#📁-structure-du-repo) and [docs/ARCHITECTURE_BREAKDOWN.md](docs/ARCHITECTURE_BREAKDOWN.md) for the C4 view. Key entry points:

- `apps/<module>/` — five modules + `agent-identity`. Each has its own `README.md` with module-specific contribution notes.
- `packages/core-*` — shared primitives (types, crypto, config, logger, MCP server). Changes here ripple — small focused PRs preferred.
- `tooling/` — centralized configs (TS, ESLint). Coordinate before changing.
- `colber-stack/` — Docker compose for local + VM β.
- `docs/` — design docs, roadmap, status. Update `STATUS.md` and `ROADMAP.md` after merging substantial changes.

---

## Development environment

Prerequisites:

- Node.js 22+ (pinned via `.nvmrc`)
- pnpm 9.12+ (`corepack enable && corepack prepare pnpm@9.12.3 --activate`)
- Docker 27+ for the local stack
- Python 3.11+ for the E2E smoke tests

Quick loop:

```bash
git clone https://github.com/Obi49/Colber.git
cd Colber
pnpm install
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

Local stack (datastores + services):

```bash
cd colber-stack
docker compose -f docker-compose.yml -f docker-compose.services.yml up -d
```

Smoke test against a deployed VM:

```bash
COLBER_VM=<ip> python .tools/e2e_smoke.py
```

---

## Licensing of contributions

By contributing to Colber, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE). If you introduce code from another source, that source must be Apache-2.0-compatible (MIT, BSD, ISC, Unlicense, Apache-2.0 itself). You must preserve the original copyright notice in `NOTICE` if required.

If a future module transitions to a separate commercial license (currently planned for `apps/insurance/` on-chain variant and `apps/reputation/` v2 anti-Sybil), the maintainers will publish a CLA before the transition. Existing Apache-2.0 contributions remain Apache-2.0 in perpetuity.

---

## Getting help

- **Quick questions** → [GitHub Discussions](https://github.com/Obi49/Colber/discussions) "Q&A" category.
- **Real-time chat** → planned, not yet open. Discord/Matrix link will land in this file when ready.
- **Security disclosures** → see [SECURITY.md](SECURITY.md).
- **Maintainer contact** → see the author section of [README.md](README.md).

Welcome aboard.
