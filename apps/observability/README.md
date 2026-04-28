# `@praxis/observability`

> Distributed logging + tracing for agent-to-agent (A2A) interactions on the
> Praxis platform. The fourth Praxis service after `agent-identity`,
> `reputation`, and `memory`.

Implements the four observability operations specified in the cahier des
charges §2.3 — `log`, `trace`, `query`, `alert` — over three transports
(REST, gRPC, MCP). Telemetry (logs + spans) lives in **ClickHouse**; alert
rule configuration lives in **Postgres**. Embeddings are not used by this
service.

See [`ARCHITECTURE_BREAKDOWN.md` §3.3](../../ARCHITECTURE_BREAKDOWN.md) and
[`PLAN_DE_DEVELOPPEMENT.md` Lot 2.1, Sprints 9 → 11](../../PLAN_DE_DEVELOPPEMENT.md).

---

## Scope of this implementation (Sprints 9 → 11)

In scope:

- `observability.log` / `POST /v1/observability/logs` — batched log ingestion.
- `observability.trace` / `POST /v1/observability/traces` — batched span ingestion.
- `observability.query` / `POST /v1/observability/query` — structured search
  with field filters + time range.
- `observability.alert` / `POST,GET,PATCH,DELETE /v1/observability/alerts*`
  — declarative alert rule CRUD.

Out of scope (future sprints):

- Alert evaluation engine (sprint 12).
- ML anomaly detection (sprint 12).
- Hot/warm/cold tiering with S3 Glacier (sprint 12).
- OTel exporter (Datadog, Honeycomb, …) (sprint 13).

---

## Run locally

Prereqs:

- Node 22+, pnpm 9+.
- The `praxis-stack` Docker stack running with Postgres (15432) and
  ClickHouse (18123 HTTP, 19000 native):

  ```sh
  cd ../../praxis-stack && docker compose up -d postgres clickhouse
  ```

- Create the `praxis_observability` database in Postgres:

  ```sh
  docker exec -i praxis-postgres psql -U praxis -d praxis -c \
    "CREATE DATABASE praxis_observability OWNER praxis;"
  ```

```sh
# from the repo root
pnpm install
pnpm --filter @praxis/observability build

# create a local .env from the example (DEV creds only)
cp apps/observability/.env.example apps/observability/.env

# apply migrations against the running Postgres (alert_rules table)
pnpm --filter @praxis/observability db:migrate

# start in watch mode — bootstraps ClickHouse tables on first request
pnpm --filter @praxis/observability dev
```

The service exposes:

| Surface    | Address (default)               |
| ---------- | ------------------------------- |
| REST       | `http://localhost:4031`         |
| gRPC       | `localhost:4032`                |
| /healthz   | `http://localhost:4031/healthz` |
| /readyz    | `http://localhost:4031/readyz`  |
| /metrics   | `http://localhost:4031/metrics` |

---

## Storage layout

### ClickHouse — `praxis_logs` and `praxis_spans`

Bootstrapped at app startup via `CREATE TABLE IF NOT EXISTS`. Both tables
use the `MergeTree` engine, partitioned by day, ordered by
`(timestamp, traceId, spanId)`, with a TTL of 30 days (configurable via
`OBSERVABILITY_LOG_TTL_DAYS` / `OBSERVABILITY_SPAN_TTL_DAYS`).

Attributes and resource maps are stored as **parallel arrays**:

```
attributes_keys   Array(String)
attributes_values Array(String)
attributes_types  Array(String)   -- "string" | "number" | "boolean"
resource_keys     Array(String)
resource_values   Array(String)
```

This was chosen over the experimental `JSON` type for portability across
ClickHouse versions and zero-config compatibility with the
`clickhouse/clickhouse-server:24.10-alpine` image used in the test stack.

### Postgres — `alert_rules`

Standard drizzle-orm schema in `src/db/schema.ts`. Migrations in
`drizzle/0000_init.sql`. The condition DSL is stored as JSONB; see
`src/domain/alert-types.ts` for the validated shape.

---

## Tests

```sh
pnpm --filter @praxis/observability test           # unit + integration (in-memory fakes)
pnpm --filter @praxis/observability test:coverage  # with v8 coverage
PRAXIS_LIVE_TESTS=1 pnpm --filter @praxis/observability test  # opt-in live containers
```

The default test suite uses an in-memory `TelemetryRepository` fake and an
in-memory `AlertRepository` fake — no real ClickHouse or Postgres required.

---

## Deviations from spec

- **Attributes encoding** — used the parallel-arrays representation rather
  than the experimental ClickHouse `JSON` type because the latter is still
  marked experimental in 24.x and would require enabling
  `allow_experimental_object_type=1` server-side. The parallel-arrays shape
  is documented in the README and is what the query builder expects.
