# `@praxis/reputation`

> Agentic reputation oracle for the Praxis platform. Other Praxis modules
> (INSURANCE, NEGOTIATION) and third-party clients query this service to
> learn how trustworthy a given agent is.

Implements the four reputation operations specified in the cahier des charges
§2.2 — `score`, `history`, `verify`, `feedback` — over three transports
(REST, gRPC, MCP). Reputation events live in **Neo4j** (graph of agents,
transactions, RATED edges); signed score snapshots, feedback idempotency
records, and Merkle anchor stubs live in **Postgres**; signed score envelopes
are cached in **Redis**.

See [`ARCHITECTURE_BREAKDOWN.md` §3.1](../../ARCHITECTURE_BREAKDOWN.md) and
[`PLAN_DE_DEVELOPPEMENT.md` Lot 1.2, Sprints 3 → 6](../../PLAN_DE_DEVELOPPEMENT.md).

---

## Run locally

Prereqs:

- Node 22+, pnpm 9+
- The `praxis-stack` Docker stack running with Postgres (15432), Redis (16379)
  and Neo4j (17687):
  ```sh
  cd ../../praxis-stack && docker compose up -d postgres redis neo4j
  ```

```sh
# from the repo root
pnpm install
pnpm --filter @praxis/reputation build

# create a local .env from the example (DEV creds only)
cp apps/reputation/.env.example apps/reputation/.env

# apply migrations against the running Postgres
pnpm --filter @praxis/reputation db:migrate

# start in watch mode
pnpm --filter @praxis/reputation dev
```

The service exposes:

| Surface    | Address (default)               |
| ---------- | ------------------------------- |
| REST       | `http://localhost:4011`         |
| gRPC       | `localhost:4012` (insecure dev) |
| `/metrics` | `http://localhost:4011/metrics` |
| `/healthz` | `http://localhost:4011/healthz` |
| `/readyz`  | `http://localhost:4011/readyz`  |

`/readyz` checks Postgres + Neo4j + Redis. Any one failing returns 503 with
a per-dependency status block.

---

## Configuration

| Variable                                | Default                   | Purpose                                                               |
| --------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `HTTP_PORT`                             | `4011`                    | REST + metrics + health port                                          |
| `GRPC_PORT`                             | `4012`                    | gRPC port (insecure in dev)                                           |
| `DATABASE_URL`                          | —                         | Postgres URL                                                          |
| `NEO4J_BOLT_URL`                        | `bolt://localhost:17687`  | Neo4j bolt URL                                                        |
| `NEO4J_USERNAME`                        | `neo4j`                   |                                                                       |
| `NEO4J_PASSWORD`                        | `praxis_dev`              |                                                                       |
| `NEO4J_DATABASE`                        | `neo4j`                   |                                                                       |
| `REDIS_URL`                             | `redis://localhost:16379` |                                                                       |
| `REPUTATION_SCORE_TX_DELTA`             | `10`                      | Points awarded per successful transaction                             |
| `REPUTATION_SCORE_NEG_FEEDBACK_PENALTY` | `40`                      | Penalty per negative feedback (rating ≤ 2)                            |
| `REPUTATION_SCORE_DECAY_DAYS`           | `90`                      | Half-life cutoff in days                                              |
| `REPUTATION_SCORE_CACHE_TTL_SECONDS`    | `60`                      | Redis cache TTL on signed envelopes                                   |
| `REPUTATION_PLATFORM_PRIVATE_KEY`       | —                         | Base64 ed25519 private key (32 bytes)                                 |
| `REPUTATION_PLATFORM_PUBLIC_KEY`        | derived                   | Base64 ed25519 public key (32 bytes); derived from private if missing |
| `LOG_LEVEL`                             | `info`                    | `fatal` … `trace`                                                     |
| `PRETTY_LOGS`                           | `false`                   | Pretty-print logs in dev                                              |

In production the platform key MUST come from a secret store (Vault / AWS
Secrets Manager). The `.env.example` ships a deterministic placeholder for
local convenience — it is documented as a fixture, never a default.

---

## Scoring math (v1)

Single-dimensional, intentionally simple. Source of truth lives in
[`src/domain/scoring/v1.ts`](./src/domain/scoring/v1.ts).

```
score = clamp(BASE + Σ tx − Σ neg, 0, 1000)

  BASE = 500                            (fresh agent baseline)
  tx   = +cfg.txDelta                   for each completed, non-negatively-rated transaction
  neg  = +cfg.negFeedbackPenalty        for each feedback with rating ≤ 2
```

**Decay**: any contribution older than `cfg.decayDays` (default 90) is
halved. Binary, not continuous — explicitly chosen for testability and ease
of reasoning. v2 will introduce continuous exponential decay and
multi-dimensional sub-scores (delivery / quality / communication).

**Caching**: scores are recomputed lazily on read and cached in Redis with
TTL `cfg.cacheTtlSeconds` (default 60s) under the key
`reputation:score:v1.0:<did>`. The cache key embeds the score version so a
v2 rollout invalidates every v1 cache entry without a flush.

---

## REST endpoints

All responses follow the `{ ok: true, data } | { ok: false, error }` envelope
defined in `@praxis/core-types`.

### `GET /v1/reputation/score/:agentDid`

Returns the agent's current signed score envelope. Cache-first; if the cache
is cold, recomputes from the graph and caches the result.

```jsonc
// 200 OK
{
  "ok": true,
  "data": {
    "did": "did:key:z6Mk…",
    "score": 642,
    "scoreVersion": "v1.0",
    "computedAt": "2026-04-27T00:00:00.000Z",
    "attestation": "<base64 ed25519 signature>",
  },
}
```

The signature covers the JCS canonical form of
`{ did, score, scoreVersion, computedAt }` — verifiers MUST canonicalize
before checking.

### `GET /v1/reputation/history/:agentDid`

Cursor-based pagination over the agent's transactions and feedbacks (both
received and issued). Pass `?limit=50` (default) and `?cursor=…` (the
`nextCursor` from the previous page).

```jsonc
{
  "ok": true,
  "data": {
    "did": "did:key:z6Mk…",
    "transactions": [
      {
        "txId": "…",
        "counterpartyDid": "…",
        "role": "buyer",
        "amount": "12.50",
        "currency": "USDC",
        "status": "completed",
        "completedAt": "…",
      },
    ],
    "feedbacksReceived": [
      { "feedbackId": "…", "fromDid": "…", "txId": "…", "rating": 5, "signedAt": "…" },
    ],
    "feedbacksIssued": [],
    "nextCursor": "2026-04-25T12:00:00.000Z",
  },
}
```

### `POST /v1/reputation/verify`

Cryptographic-only verification — does not touch the DB.

```jsonc
// request
{
  "score": {
    "did": "did:key:z6Mk…",
    "score": 642,
    "scoreVersion": "v1.0",
    "computedAt": "2026-04-27T00:00:00.000Z"
  },
  "attestation": "<base64 ed25519 signature>"
}

// 200 OK
{ "ok": true, "data": { "valid": true } }

// 200 OK with reason on failure
{ "ok": true, "data": { "valid": false, "reason": "signature_mismatch" } }
```

### `POST /v1/reputation/feedback`

Submit a signed feedback after a transaction. Validates:

1. The body satisfies the schema (Zod).
2. `fromDid` resolves to an Ed25519 public key (via did:key in-line, or via
   the shared `agents` table for non-did:key DIDs — see "DID resolution"
   below).
3. The Ed25519 signature over the JCS canonical form of
   `{ feedbackId, fromDid, toDid, txId, rating, dimensions, signedAt }`
   matches that key.
4. **Idempotency**: same `feedbackId` returns the original record (200).
5. **Anti-spam**: at most one feedback per `(fromDid, toDid, txId)` triple.

```jsonc
// request
{
  "feedbackId": "<uuid v4>",
  "fromDid": "did:key:z6Mk…",
  "toDid": "did:key:z6Mk…",
  "txId": "tx-12345",
  "rating": 5,
  "dimensions": { "delivery": 5, "quality": 5, "communication": 4 },
  "comment": "Great agent.",
  "signedAt": "2026-04-27T00:00:00.000Z",
  "signature": "<base64 ed25519 signature>"
}

// 201 Created on first acceptance
// 200 OK on idempotent replay
{ "ok": true, "data": { "accepted": true, "idempotent": false, "feedbackId": "…" } }
```

Errors:

- `400 VALIDATION_FAILED` — schema or rating-range violation.
- `400 INVALID_SIGNATURE` — signature does not match `fromDid` over the
  canonical payload.
- `404 DID_NOT_FOUND` — `fromDid` could not be resolved.
- `409 CONFLICT` — duplicate `(fromDid, toDid, txId)` triple, or the same
  `feedbackId` was submitted with a different payload.
- `410 DID_REVOKED` — `fromDid` is revoked in the agents registry.

---

## MCP tools

Four tools registered under the `reputation.` namespace. Schemas are
Zod-defined in `src/mcp/tools.ts` and round-trip via the in-process
`McpToolRegistry`.

| Tool                  | Version | Purpose                                  |
| --------------------- | ------- | ---------------------------------------- |
| `reputation.score`    | `1.0.0` | Return the agent's signed score envelope |
| `reputation.history`  | `1.0.0` | Cursor-paginated history                 |
| `reputation.verify`   | `1.0.0` | Verify a signed attestation              |
| `reputation.feedback` | `1.0.0` | Submit a signed feedback                 |

---

## gRPC

Proto contract: [`proto/reputation.proto`](./proto/reputation.proto).
Service: `praxis.reputation.v1.ReputationService` with `Score`, `History`,
`Verify`, `Feedback` RPCs. Inter-service usage only — never exposed to the
public edge.

---

## Domain model

### Postgres

| Table             | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `score_snapshots` | Append-only audit log of every signed envelope we hand out                |
| `feedback_log`    | Idempotency + anti-spam record (`feedbackId` PK; `(from, to, tx)` unique) |
| `merkle_anchors`  | Future on-chain anchoring (placeholder, populated by a worker)            |

### Neo4j

```
(:Agent { did, registeredAt })
  -[:PARTICIPATED_IN { role, txId, amount, currency, completedAt }]->
(:Transaction { txId, status, completedAt, hasNegativeFeedback })

(:Agent)-[:RATED { feedbackId, txId, rating, dimensions, comment, signedAt, signature }]->(:Agent)
```

Constraints:

- `agent_did_unique` — one `Agent` per DID.
- `tx_id_unique` — one `Transaction` per `txId`.

The `hasNegativeFeedback` flag on `Transaction` is a denormalised cache: the
v1 scorer needs it to filter out non-negatively-rated transactions, and
maintaining it on the RATED edge write avoids a graph scan on every score
read.

---

## DID resolution

To verify a feedback's signature we need the issuer's public key.

1. `did:key:z6Mk…` — decoded directly from the DID string via
   `@praxis/core-crypto`. No DB lookup. This is the common case in MVP.
2. Anything else (`did:web`, `did:ethr`) — read from the `agents` table that
   the agent-identity service writes to. We share the Postgres database in
   dev and rely on column stability (`did`, `public_key`, `signature_scheme`,
   `revoked_at`) as a contract.
3. Future work: replace the direct table read with a typed gRPC call into
   the agent-identity service so reputation no longer needs to know the
   table layout.

The composite resolver lives in `src/domain/identity-resolver.ts` and is
fronted by an `IdentityResolver` interface so unit tests can stub it.

---

## Tests

```sh
pnpm --filter @praxis/reputation test          # unit + integration (in-memory fakes)
pnpm --filter @praxis/reputation test:coverage # with v8 coverage, ≥ 80% target on domain/
```

Integration tests do **not** require running services — they use in-memory
fakes from `test/fakes/`. The live integration suite under `test/live/` is
gated behind `PRAXIS_LIVE_TESTS=1` and intentionally not wired in CI.
Filling it in requires `pnpm --filter @praxis/reputation add -D testcontainers
@testcontainers/postgresql @testcontainers/neo4j` first.

---

## Observability

- Logs: pino JSON, `service=reputation` on every line. Set `PRETTY_LOGS=true`
  for human-readable dev output.
- Metrics: `fastify-metrics` exposes Prometheus counters/histograms on
  `/metrics`.
- Tracing: planned via OpenTelemetry once the OBSERVABILITY module lands.

---

## Build container

```sh
# from the repo root
docker build -f apps/reputation/Dockerfile -t praxis/reputation:dev .
```
