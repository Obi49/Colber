# `@praxis/agent-identity`

> Bootstrap identity service for the Praxis platform. The only Praxis service
> that does **not** itself require signed inbound calls — every other service
> resolves and verifies agent DIDs through this one.

Implements W3C `did:key` (Ed25519) registration, resolution, and signature
verification. Exposes the same domain on three transports: REST, gRPC, MCP.

See [`ARCHITECTURE_BREAKDOWN.md` §3.6.1](../../ARCHITECTURE_BREAKDOWN.md) and
[`PLAN_DE_DEVELOPPEMENT.md` Lot 1.1, Sprint 1](../../PLAN_DE_DEVELOPPEMENT.md).

---

## Run locally

Prereqs:

- Node 22+, pnpm 9+
- The `praxis-stack` Docker stack running (Postgres on port `15432`):
  ```sh
  cd ../../praxis-stack && docker compose up -d postgres
  ```

```sh
# from the repo root
pnpm install
pnpm --filter @praxis/agent-identity build

# create a local .env from the example (DEV creds only)
cp apps/agent-identity/.env.example apps/agent-identity/.env

# apply migrations against the running Postgres
pnpm --filter @praxis/agent-identity db:migrate

# start in watch mode
pnpm --filter @praxis/agent-identity dev
```

The service exposes:

| Surface     | Address (default)               |
| ----------- | ------------------------------- |
| REST        | `http://localhost:4001`         |
| gRPC        | `localhost:4002` (insecure dev) |
| `/metrics`  | `http://localhost:4001/metrics` |
| `/healthz`  | `http://localhost:4001/healthz` |
| `/readyz`   | `http://localhost:4001/readyz`  |

## REST endpoints

All responses follow the `{ ok: true, data } | { ok: false, error }` envelope
defined in `@praxis/core-types`.

### `POST /v1/identity/register`

Register a new agent identity from an Ed25519 public key. The DID is derived
deterministically from the key (W3C did:key spec).

```jsonc
// request
{
  "publicKey": "<base64 of 32 raw Ed25519 bytes>",
  "ownerOperatorId": "op_abc123"
}

// 201 Created
{
  "ok": true,
  "data": {
    "did": "did:key:z6Mk…",
    "agentId": "01876f7d-...",
    "registeredAt": "2026-04-28T12:00:00.000Z"
  }
}
```

Errors: `400 INVALID_PUBLIC_KEY`, `400 VALIDATION_FAILED`, `409 DID_ALREADY_REGISTERED`.

### `GET /v1/identity/:did`

Resolve a URL-encoded DID to its agent record.

```jsonc
{
  "ok": true,
  "data": {
    "did": "did:key:z6Mk…",
    "agentId": "…",
    "publicKey": "<base64>",
    "signatureScheme": "Ed25519",
    "ownerOperatorId": "op_abc123",
    "registeredAt": "…",
    "revokedAt": null
  }
}
```

Errors: `404 DID_NOT_FOUND`.

### `POST /v1/identity/verify`

Verify a signature against the public key bound to a DID.

```jsonc
// request
{
  "did": "did:key:z6Mk…",
  "message": "<base64 message bytes>",
  "signature": "<base64 64-byte Ed25519 signature>"
}

// 200 OK
{ "ok": true, "data": { "valid": true } }

// 200 OK with reason on failure
{ "ok": true, "data": { "valid": false, "reason": "signature_mismatch" } }
```

Errors: `404 DID_NOT_FOUND`, `410 DID_REVOKED`, `400 VALIDATION_FAILED`.

## MCP tools

Three tools registered under the `identity.` namespace. Schemas are Zod-defined
in `src/mcp/tools.ts` and round-trip via the in-process `McpToolRegistry`.

| Tool                | Version | Purpose                                                        |
| ------------------- | ------- | -------------------------------------------------------------- |
| `identity.register` | `1.0.0` | Register an Ed25519 public key, return the derived `did:key`.  |
| `identity.resolve`  | `1.0.0` | Resolve a DID to its agent record.                             |
| `identity.verify`   | `1.0.0` | Verify a signature against the public key bound to a DID.      |

The registry is built at startup; an MCP transport (stdio/SSE) will be wired
in a follow-up sprint when the upstream `@modelcontextprotocol/sdk` surface
stabilises.

## gRPC

Proto contract: [`proto/identity.proto`](./proto/identity.proto).
Service: `praxis.identity.v1.IdentityService` with `Register`, `Resolve`,
`Verify` RPCs. Inter-service usage only — never exposed to the public edge.

## DID method extensibility

For MVP we ship `did:key` only. The signature provider abstraction
(`@praxis/core-crypto`'s `SignatureProvider`) and the `DID_METHODS` list in
`@praxis/core-types` are designed so that:

- `did:web` resolution can be added by implementing a method-aware resolver
  in front of `IdentityService.resolve` (HTTP fetch + JSON-LD parse).
- `did:ethr` becomes a new `Secp256k1Provider` registered next to the existing
  `Ed25519Provider`. `getSignatureProvider('Secp256k1')` already throws an
  intentional `not implemented yet` until the provider lands.

## Tests

```sh
pnpm --filter @praxis/agent-identity test          # unit + integration (fastify.inject)
pnpm --filter @praxis/agent-identity test:coverage # with v8 coverage, ≥ 80% target
```

Integration tests do **not** require a running Postgres — they use an
in-memory repository fake from `test/fakes/`. A real-DB E2E test suite is
planned for Sprint 2.

## Observability

- Logs: pino JSON, `service=agent-identity` on every line. Set
  `PRETTY_LOGS=true` for human-readable dev output.
- Metrics: `fastify-metrics` exposes Prometheus-format counters (request count,
  histograms by route + status code) on `/metrics`.
- Tracing: planned via OpenTelemetry in Sprint 2 (`OBSERVABILITY` module).

## Build container

```sh
# from the repo root
docker build -f apps/agent-identity/Dockerfile -t praxis/agent-identity:dev .
```
