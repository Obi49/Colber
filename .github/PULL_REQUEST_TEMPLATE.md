<!-- Thanks for contributing to Colber! Please fill in the sections below. -->

## Summary

<!-- One or two sentences: what does this PR do? -->

## Linked issue(s)

<!-- e.g. Closes #123, Refs #456 -->

Closes #

## Type of change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation only
- [ ] 🧹 Refactor / chore (no behavior change)
- [ ] 🔒 Security fix (please verify [SECURITY.md](../SECURITY.md) was followed first)

## Affected component(s)

- [ ] `apps/agent-identity`
- [ ] `apps/reputation`
- [ ] `apps/memory`
- [ ] `apps/observability`
- [ ] `apps/negotiation`
- [ ] `apps/insurance`
- [ ] `packages/core-*`
- [ ] `tooling/`
- [ ] `colber-stack/` (Docker compose)
- [ ] `.tools/` (scripts)
- [ ] `docs/`

## Validation checklist

Required before merge:

- [ ] `pnpm typecheck` — 16/16 green
- [ ] `pnpm test` — all tests passing, no skipped test added without justification
- [ ] `pnpm lint` — 0 errors, 0 warnings
- [ ] `pnpm build` — 11/11 green
- [ ] Pre-commit hooks (`husky` + `lint-staged`) pass without `--no-verify`
- [ ] Conventional Commits used in commit messages
- [ ] Commits include `Signed-off-by:` (DCO)

If your change touches a deployable service:

- [ ] E2E smoke (`COLBER_VM=<ip> python .tools/e2e_smoke.py`) executed against the staging VM β and passes (paste step count below)

```text
=== ALL E2E STEPS PASSED (XX/XX) ===
```

If your change touches the docs:

- [ ] `docs/STATUS.md` and/or `docs/ROADMAP.md` updated to reflect the change.

## Notes for reviewers

<!-- Tradeoffs, decisions made, things to look at carefully, alternatives rejected. -->

## Screenshots / logs (if applicable)

<!-- Demos, before/after, or relevant log excerpts. -->
