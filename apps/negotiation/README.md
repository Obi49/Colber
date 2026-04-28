# `@praxis/negotiation`

> A2A negotiation broker — event-sourced negotiations with two strategies
> (ascending-auction, multi-criteria), Ed25519-signed proposals over JCS
> (RFC 8785), and multi-party signature settlement.

The fifth Praxis service after `agent-identity`, `reputation`, `memory`,
and `observability`.

See [`ARCHITECTURE_BREAKDOWN.md` §3.4](../../ARCHITECTURE_BREAKDOWN.md) and
[`ROADMAP.md` étape 8](../../ROADMAP.md).

---

## Scope of this implementation

In scope:

- `negotiation.start` — `POST /v1/negotiation` — create with terms.
- `negotiation.propose` — `POST /v1/negotiation/:id/propose` — submit a bid.
- `negotiation.counter` — `POST /v1/negotiation/:id/counter` — counter-bid.
- `negotiation.settle` — `POST /v1/negotiation/:id/settle` — multi-party signature settlement.
- `GET /v1/negotiation/:id` — current projection.
- `GET /v1/negotiation/:id/history` — paginated event log.
- `/healthz`, `/readyz`, `/metrics`.
- Two strategies: `ascending-auction`, `multi-criteria`.
- Ed25519 + JCS signature verification (mirroring `apps/reputation`).

Out of scope (deferred):

- On-chain anchoring (EIP-712 + Base Sepolia) — P3, see `domain/contract-signer.ts`.
- LLM mediation — v2.
- Reputation / insurance bridges — v2.

---

## Run locally

Prereqs:

- Node 22+, pnpm 9+.
- Postgres 16 reachable (the `praxis-stack` runs it on `15432`).
- Create the `praxis_negotiation` database:

  ```sh
  docker exec -i praxis-postgres psql -U praxis -d praxis -c \
    "CREATE DATABASE praxis_negotiation OWNER praxis;"
  ```

```sh
pnpm install
pnpm --filter @praxis/negotiation build

cp apps/negotiation/.env.example apps/negotiation/.env

pnpm --filter @praxis/negotiation db:migrate
pnpm --filter @praxis/negotiation dev
```

| Surface  | Address (default)               |
| -------- | ------------------------------- |
| REST     | `http://localhost:4041`         |
| gRPC     | `localhost:4042`                |
| /healthz | `http://localhost:4041/healthz` |
| /readyz  | `http://localhost:4041/readyz`  |
| /metrics | `http://localhost:4041/metrics` |

---

## Storage layout

### Postgres — `negotiation_events` + `negotiation_state`

- `negotiation_events` is the append-only event log. Source of truth.
- `negotiation_state` is the materialised projection — one row per
  negotiation, updated atomically with each event in the same transaction.

Idempotency: writes are deduplicated on `(negotiation_id, event_type,
idempotency_key)`. Replays return the previously-stored event +
projection without writing a new row.

### Snapshots / cold archive

Out of scope for v1.

---

## Tests

```sh
pnpm --filter @praxis/negotiation test           # unit + integration (in-memory fakes)
pnpm --filter @praxis/negotiation test:coverage  # with v8 coverage
PRAXIS_LIVE_TESTS=1 pnpm --filter @praxis/negotiation test  # opt-in live containers
```

The default test suite uses an in-memory `EventStore` fake — no Postgres
required.
