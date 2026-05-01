# `@colber/insurance`

> Agentic delivery insurance broker — pricing engine, simulated escrow,
> claims workflow, global exposure cap. **v1 MVP is simulation-only**:
> there is no on-chain integration in this service. The on-chain version
> (Solidity + viem + Base Sepolia) is a separate P3 ticket — see
> [`ROADMAP.md` étape 7b](../../docs/ROADMAP.md).

The fifth Colber service after `agent-identity`, `reputation`, `memory`,
`observability`, and `negotiation`.

See [`ARCHITECTURE_BREAKDOWN.md` §3.5](../../docs/ARCHITECTURE_BREAKDOWN.md) and
[`ROADMAP.md` étape 7](../../docs/ROADMAP.md).

---

## Scope of this implementation

In scope (v1 MVP):

- `insurance.quote` — `POST /v1/insurance/quote` — premium quote without commitment.
- `insurance.subscribe` — `POST /v1/insurance/subscribe` — create policy + lock simulated escrow.
- `insurance.claim` — `POST /v1/insurance/claims` — file a claim against a policy.
- `insurance.status` — `GET /v1/insurance/policies/:id` — full state of a policy.
- `GET /v1/insurance/policies?subscriberDid=...` — paginated list.
- `POST /v1/insurance/admin/escrow/:holdingId/transition` — forced transition (gated by `INSURANCE_ADMIN_ENABLED=false`; 403 when off).
- `/healthz`, `/readyz`, `/metrics`.
- Pricing engine — risk multiplier from reputation score, premium = `amount * baseRate * multiplier`.
- Simulated escrow lifecycle — `locked → released | claimed | refunded` (no skipping).
- Global exposure cap — `INSURANCE_MAX_GLOBAL_EXPOSURE_USDC` is a soft circuit-breaker.

Out of scope (deferred to P3 / étape 7b — on-chain insurance):

- Solidity escrow / claim contracts.
- viem / Foundry / Base Sepolia / any chain RPC.
- Trail of Bits / OpenZeppelin audit, Safe multisig.
- Claim arbitrator with external oracles + auto-decide rules.
- Reinsurer adapter, dynamic circuit-breaker.
- AWS KMS / dedicated signer.

The TODO comments in `src/domain/escrow.ts` and `src/domain/insurance-service.ts`
flag the call-sites where the on-chain version will plug in.

---

## Reputation dependency — `/readyz` is degraded-tolerant

The pricing engine queries `reputation` via `${REPUTATION_URL}/v1/reputation/score/:did`
with an in-memory cache (TTL `INSURANCE_REPUTATION_CACHE_TTL_SECONDS`,
default 60s). When the upstream is unreachable, the engine logs at warn
and falls back to score=500 (neutral, multiplier 1.0).

`/readyz` reflects this: the database MUST be reachable (otherwise 503),
but a missing reputation upstream is reported as `reputation: 'degraded'`
with a 200 status. This avoids a crash-loop on the insurance service when
reputation is rolling out, while still surfacing the degradation in the
response body and in logs.

---

## Run locally

Prereqs:

- Node 22+, pnpm 9+.
- Postgres 16 reachable (the `colber-stack` runs it on `15432`).
- The reputation service reachable at `REPUTATION_URL` (or accept the
  fallback score=500).
- Create the `colber_insurance` database:

  ```sh
  docker exec -i colber-postgres psql -U colber -d colber -c \
    "CREATE DATABASE colber_insurance OWNER colber;"
  ```

```sh
pnpm install
pnpm --filter @colber/insurance build

cp apps/insurance/.env.example apps/insurance/.env

pnpm --filter @colber/insurance db:migrate
pnpm --filter @colber/insurance dev
```

| Surface  | Address (default)               |
| -------- | ------------------------------- |
| REST     | `http://localhost:4051`         |
| gRPC     | `localhost:4052`                |
| /healthz | `http://localhost:4051/healthz` |
| /readyz  | `http://localhost:4051/readyz`  |
| /metrics | `http://localhost:4051/metrics` |

---

## Storage layout

### Postgres — `policies` + `escrow_holdings` + `escrow_events` + `claims`

- `policies` — one row per subscribed policy. `idempotency_key` is UNIQUE
  globally, which makes `subscribe` idempotent.
- `escrow_holdings` — one row per policy. The lifecycle (`locked →
released | claimed | refunded`) is a strict state machine. Skipping
  states is rejected.
- `escrow_events` — append-only log of every transition. Useful for audit
  and the future on-chain version (replay).
- `claims` — one row per filed claim. `(policy_id, idempotency_key)` is
  UNIQUE, which makes claim filing idempotent.

### Exposure cap

`INSURANCE_MAX_GLOBAL_EXPOSURE_USDC` (default 100_000) is a hard rejection
threshold checked inside the same transaction as the policy insert
(`SELECT COALESCE(SUM(amount_usdc), 0) FROM escrow_holdings WHERE
status='locked'`). It is intentionally NOT `FOR UPDATE`: a simultaneous
insert that pushes the total slightly past the cap is acceptable in v1
(the cap is a soft circuit-breaker). For strict enforcement, switch to a
Postgres advisory lock.

---

## Tests

```sh
pnpm --filter @colber/insurance test           # unit + integration (in-memory fakes)
pnpm --filter @colber/insurance test:coverage  # with v8 coverage
COLBER_LIVE_TESTS=1 pnpm --filter @colber/insurance test  # opt-in live containers
```

The default test suite uses in-memory `PolicyStore` + `ReputationClient`
fakes — no Postgres or HTTP upstream required.
