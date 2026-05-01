---
name: Bug report
about: Report something that is not behaving as documented
title: '[bug] '
labels: ['bug', 'triage']
assignees: []
---

## Summary

<!-- A clear, one-sentence description of what is wrong. -->

## Affected component

- [ ] `apps/agent-identity`
- [ ] `apps/reputation`
- [ ] `apps/memory`
- [ ] `apps/observability`
- [ ] `apps/negotiation`
- [ ] `apps/insurance`
- [ ] `packages/core-*` (specify which)
- [ ] Docker stack (`colber-stack/`)
- [ ] SDK (`@colber/sdk` or Python `colber`)
- [ ] Documentation
- [ ] Other: \***\*\_\_\*\***

## Steps to reproduce

1.
2.
3.

Minimal command or curl example:

```bash
# paste here
```

## Expected behavior

<!-- What did you expect to happen? -->

## Actual behavior

<!-- What actually happened? Include logs, error messages, response bodies. Redact any secrets. -->

```text
# logs / output here
```

## Environment

- Node version: <!-- node -v -->
- pnpm version: <!-- pnpm -v -->
- OS: <!-- e.g. macOS 14.5, Ubuntu 22.04, Windows 11 + WSL2 -->
- Docker version (if relevant): <!-- docker -v -->
- Colber commit: <!-- git rev-parse HEAD -->
- Running locally / on a deployed VM: <!-- which -->

## Additional context

<!-- Anything else useful: was it working before? when did it start? any recent changes? -->

## Have you searched existing issues?

- [ ] Yes, this has not been reported yet.

> ⚠️ **Security findings should NOT be filed here.** See [SECURITY.md](../../SECURITY.md) for the private disclosure process.
