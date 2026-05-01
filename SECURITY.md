# Security Policy

Colber takes the security of its platform seriously. This document explains how to report a finding and what to expect in return.

## Supported versions

Colber is in active development (v1.0). Until v1.0 is officially tagged, only the `main` branch is supported. Once stable releases are tagged, the policy will be updated to list supported version ranges.

| Version                | Supported                         |
| ---------------------- | --------------------------------- |
| `main`                 | ✅                                |
| Future tagged releases | tracked separately when published |

## Reporting a finding

**Please do not file a public issue for security findings.**

Use one of the following private channels:

1. **Preferred — GitHub Private Vulnerability Reporting**
   Go to <https://github.com/Obi49/Colber/security/advisories/new> (visible once enabled by maintainers).
2. **Email** — `dof1502.mwm27@gmail.com` with subject `[Colber Security] <short summary>`.

When reporting, please include:

- A clear description of the issue.
- Affected component(s) (e.g. `apps/reputation`, `packages/core-crypto`, the deployed VM β stack, etc.).
- A minimal reproduction (commands, payloads, or a script).
- The impact you believe it has (data exposure, integrity, availability, signature forgery, escrow accounting, etc.).
- Your name or handle for credit (or "anonymous" if preferred).

You do not need a CVSS score — the maintainer will compute one if applicable.

## What to expect

| Step              | Target SLA                                     |
| ----------------- | ---------------------------------------------- |
| Acknowledgement   | within **3 business days**                     |
| Initial triage    | within **7 business days**                     |
| Fix or mitigation | depends on severity — see table below          |
| Public disclosure | coordinated with reporter, typically after fix |

Severity targets (best-effort, pre-GA):

| Severity | Definition                                                          | Target fix window |
| -------- | ------------------------------------------------------------------- | ----------------- |
| Critical | Authentication bypass, signature forgery, fund loss in escrow flows | 7 days            |
| High     | Privilege escalation, data leak across operators, replay weakness   | 30 days           |
| Medium   | Hardening gaps with limited exploitability                          | 90 days           |
| Low      | Defense-in-depth and informational findings                         | next release      |

## Scope

In scope:

- All code in this repository (`apps/*`, `packages/*`, `tooling/*`, `colber-stack/*`).
- All Docker images published under the `colber/*` namespace.
- All published packages (`@colber/*` on npm, `colber` on PyPI when shipped).
- The deployed staging VM β (IP shared privately) when explicitly authorized.

Out of scope:

- Third-party dependencies (please report upstream — feel free to mention us).
- Social engineering or physical attacks against contributors.
- Findings that require root or filesystem access on a victim's machine.
- DoS via resource exhaustion on rate-limited endpoints (already a known constraint).
- Issues in the historical specification document `docs/AgentStack_Cahier_des_charges.docx` (informational, not deployed).

## Recognition

Researchers who follow this policy and report a valid finding will be:

- Credited in the release notes (unless they prefer anonymity).
- Listed in `SECURITY-HALL-OF-FAME.md` when that file is created.
- Considered for paid bug bounty rewards once the public bounty program launches (planned for step 9 / GA — Immunefi for smart contracts when on-chain ships, HackerOne for the rest).

## Cryptographic primitives

The platform relies on:

- **Ed25519** signatures (`@noble/ed25519`).
- **JCS RFC 8785** canonicalization for signed payloads.
- **AES-256-GCM** for opt-in memory encryption.
- **DID method `did:key`** (W3C, Ed25519 multibase `z6Mk…`).
- **EIP-712** signatures (planned for step 7b, on-chain insurance).

If you find a misuse of these primitives (key reuse, missing canonicalization, predictable randomness, IV reuse, etc.), please report it under this policy.

## Public PGP key

A maintainer PGP key for encrypted email reports will be published in this file once generated. In the meantime, please use GitHub's encrypted advisory channel for sensitive details.

---

Thank you for helping make Colber safer.
