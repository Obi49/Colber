# `@praxis/memory`

> Persistent external memory with semantic search for AI agents on the Praxis
> platform. Other Praxis modules (NEGOTIATION, INSURANCE) and third-party
> agents call this service to remember facts/events/preferences across
> sessions and discover them again via semantic retrieval.

Implements the four memory operations specified in the cahier des charges
§2.5 — `store`, `retrieve`, `update`, `share` — over three transports
(REST, gRPC, MCP). Vectors live in **Qdrant**; metadata + cleartext + audit
trail live in **Postgres**. Embeddings are generated via a pluggable provider
abstraction (default `nomic-embed-text` over Ollama; deterministic stub for
unit tests).

See [`ARCHITECTURE_BREAKDOWN.md` §3.2](../../ARCHITECTURE_BREAKDOWN.md) and
[`PLAN_DE_DEVELOPPEMENT.md` Lot 1.3, Sprints 4 → 7](../../PLAN_DE_DEVELOPPEMENT.md).

---

## Run locally

Prereqs:

- Node 22+, pnpm 9+
- The `praxis-stack` Docker stack running with Postgres (15432), Qdrant
  (16333) and Ollama (11434):
  ```sh
  cd ../../praxis-stack && docker compose up -d postgres qdrant ollama ollama-init
  ```

```sh
# from the repo root
pnpm install
pnpm --filter @praxis/memory build

# create a local .env from the example (DEV creds only)
cp apps/memory/.env.example apps/memory/.env

# apply migrations against the running Postgres
pnpm --filter @praxis/memory db:migrate

# start in watch mode
pnpm --filter @praxis/memory dev
```

The service exposes:

| Surface    | Address (default)               |
| ---------- | ------------------------------- |
| REST       | `http://localhost:4021`         |
| gRPC       | `localhost:4022` (insecure dev) |
| `/metrics` | `http://localhost:4021/metrics` |
| `/healthz` | `http://localhost:4021/healthz` |
| `/readyz`  | `http://localhost:4021/readyz`  |

`/readyz` checks Postgres + Qdrant + the embedding provider. Any one failing
returns 503 with a per-dependency status block.

---

## Configuration

| Variable                    | Default                  | Purpose                                                  |
| --------------------------- | ------------------------ | -------------------------------------------------------- |
| `HTTP_PORT`                 | `4021`                   | REST + metrics + health port                             |
| `GRPC_PORT`                 | `4022`                   | gRPC port (insecure in dev)                              |
| `DATABASE_URL`              | —                        | Postgres URL                                             |
| `QDRANT_URL`                | `http://localhost:16333` | Qdrant REST endpoint                                     |
| `QDRANT_API_KEY`            | —                        | Optional (Qdrant Cloud)                                  |
| `QDRANT_COLLECTION`         | `praxis_memories`        | Collection name (created on boot)                        |
| `MEMORY_EMBEDDING_PROVIDER` | `ollama`                 | `ollama` or `stub` (deterministic in-memory)             |
| `OLLAMA_URL`                | `http://localhost:11434` |                                                          |
| `OLLAMA_EMBED_MODEL`        | `nomic-embed-text`       | Any Ollama embedding model                               |
| `MEMORY_EMBEDDING_DIM`      | `768`                    | Must match the chosen model                              |
| `MEMORY_ENCRYPTION_KEY`     | —                        | Base64-encoded 32-byte AES-256 key (placeholder for KMS) |
| `MEMORY_MAX_VERSIONS`       | `100`                    | Versions retained per memory                             |
| `LOG_LEVEL`                 | `info`                   | `fatal` … `trace`                                        |
| `PRETTY_LOGS`               | `false`                  | Pretty-print logs in dev                                 |

In production the encryption key MUST come from a per-tenant KMS (Vault /
AWS KMS / cloud HSM). The `.env.example` ships a deterministic placeholder
for local convenience — it is documented as a fixture, never a default.

---

## Data model

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  memories       │       │ memory_versions │       │ memory_shares   │
│  (current row)  │──────▶│ (audit trail)   │       │ (per-grantee)   │
└─────────────────┘       └─────────────────┘       └─────────────────┘
        │ id                                                ▲
        ▼                                                   │
┌─────────────────┐       ┌─────────────────┐
│  Qdrant point   │       │ memory_quotas   │
│  (vector +      │       │ (placeholder)   │
│   minimal ACL)  │       └─────────────────┘
└─────────────────┘
```

**Postgres** is the source of truth for the cleartext text, structured
payload, ACL, and history. **Qdrant** holds only the vector + a minimal
payload (`memoryId`, `ownerDid`, `type`, `visibility`, `sharedWith`,
`operatorId`) so permission filters can run server-side at search time.

---

## Permissions (CDC §2.5)

| Visibility | Who can read                                                       |
| ---------- | ------------------------------------------------------------------ |
| `private`  | only `ownerDid`                                                    |
| `operator` | any agent owned by the same operator (resolved via agent-identity) |
| `shared`   | only DIDs in `sharedWith` (plus the owner)                         |
| `public`   | any authenticated agent                                            |

Only the owner can update or share a memory. Permission filters are enforced
in two places:

1. **Qdrant filter layer** — server-side, prevents the vector store from
   returning hits the caller can't see.
2. **Postgres re-check** — runs after we hydrate the row, so even a
   misconfigured Qdrant payload can't leak data.

The operator id is looked up from the `agents` table that the agent-identity
service writes to (column `owner_operator_id`). When the operator can't be
resolved (test env, unregistered DID), `operator` visibility falls back to
"owner-only" — never broader.

---

## Encryption (placeholder KMS)

`encryption.enabled=true` on store opts the memory into AES-256-GCM
envelope encryption of the `text` field at rest. Storage layout:

```
base64( IV(12B) || ciphertext || authTag(16B) )
```

The embedding is generated **before** encryption — semantic search needs
cleartext during the embed call. Decryption only happens for callers that
pass the `canRead` ACL check.

The current key model is a single global key from `MEMORY_ENCRYPTION_KEY`.
Per-tenant KMS resolution lands in P1.7 and is a constructor change at
`server.ts` (the `EncryptionService` interface stays stable).

---

## REST endpoints

All responses follow the `{ ok: true, data } | { ok: false, error }` envelope
defined in `@praxis/core-types`.

### `POST /v1/memory`

Persist a new memory. Generates the embedding via the configured provider.

```jsonc
// request
{
  "ownerDid": "did:key:z6MkA…",
  "type": "fact",
  "text": "The buyer prefers EU-located suppliers.",
  "payload": { "tags": ["procurement", "preference"] },
  "permissions": { "visibility": "private" },
  "encryption": { "enabled": false }
}

// 201 Created
{
  "ok": true,
  "data": {
    "id": "1c0…",
    "embedding": { "model": "nomic-embed-text", "dim": 768 }
  }
}
```

### `POST /v1/memory/search`

Top-k semantic search restricted to memories visible to `queryDid`.

```jsonc
// request
{
  "queryDid": "did:key:z6MkA…",
  "queryText": "Where does the buyer prefer to source?",
  "topK": 10,
  "filters": { "type": "fact" }
}

// 200 OK
{
  "ok": true,
  "data": {
    "hits": [
      {
        "id": "…",
        "score": 0.87,
        "type": "fact",
        "ownerDid": "did:key:z6MkA…",
        "snippet": "The buyer prefers EU-located suppliers."
      }
    ]
  }
}
```

### `GET /v1/memory/:id?callerDid=…`

Fetch the full record. Decrypts the text if the caller is authorised.

### `PATCH /v1/memory/:id`

Update text and/or payload. Captures the previous state into
`memory_versions`. Re-embeds when text changes. Owner-only.

```jsonc
// request
{ "callerDid": "did:key:z6MkA…", "text": "The buyer prefers North-America-located suppliers." }

// 200 OK
{ "ok": true, "data": { "id": "…", "version": 2, "embedding": { "model": "…", "dim": 768 } } }
```

### `POST /v1/memory/:id/share`

Grant additional agents read access. Owner-only.

```jsonc
// request
{
  "callerDid": "did:key:z6MkA…",
  "shareWith": ["did:key:z6MkB…"],
  "expiresAt": "2026-12-31T23:59:59.000Z"
}

// 200 OK
{ "ok": true, "data": { "id": "…", "sharedWith": ["did:key:z6MkB…"] } }
```

Errors:

- `400 VALIDATION_FAILED` — schema, range, or type violation.
- `403 UNAUTHORIZED` — caller lacks the required permission.
- `404 NOT_FOUND` — memory id is unknown.

---

## MCP tools

Four tools registered under the `memory.` namespace. Schemas are
Zod-defined in `src/mcp/tools.ts` and round-trip via the in-process
`McpToolRegistry`.

| Tool              | Version | Purpose                                |
| ----------------- | ------- | -------------------------------------- |
| `memory.store`    | `1.0.0` | Persist a new memory                   |
| `memory.retrieve` | `1.0.0` | Permission-aware semantic search       |
| `memory.update`   | `1.0.0` | Update text and/or payload (versioned) |
| `memory.share`    | `1.0.0` | Grant read access to additional agents |

---

## gRPC

Proto contract: [`proto/memory.proto`](./proto/memory.proto).
Service: `praxis.memory.v1.MemoryService` with `Store`, `Retrieve`, `Update`,
`Share`, `Get` RPCs. Inter-service usage only — never exposed to the
public edge.

---

## Embedding providers

Two implementations behind the `EmbeddingProvider` interface:

1. **`OllamaEmbeddingProvider`** — calls `POST {OLLAMA_URL}/api/embeddings`
   with `{ model, prompt }`. Default model `nomic-embed-text` (768 dims).
   Multi-provider design from CDC R6 — swap in Voyage/Cohere/OpenAI by
   adding a sibling implementation, no domain changes.
2. **`DeterministicStubProvider`** — SHA-256-derived deterministic vectors.
   Used in unit + integration tests so the whole pipeline can be exercised
   without Ollama. Not for retrieval-quality assertions.

Selection happens at boot via `MEMORY_EMBEDDING_PROVIDER`.

---

## Tests

```sh
pnpm --filter @praxis/memory test          # unit + integration (in-memory fakes)
pnpm --filter @praxis/memory test:coverage # with v8 coverage, ≥ 80% target on domain/
```

Integration tests do **not** require running services — they use in-memory
fakes from `test/fakes/`. The live integration suite under `test/live/` is
gated behind `PRAXIS_LIVE_TESTS=1` and intentionally not wired in CI.
Filling it in requires `pnpm --filter @praxis/memory add -D testcontainers
@testcontainers/postgresql @testcontainers/qdrant` first.

---

## Observability

- Logs: pino JSON, `service=memory` on every line. Set `PRETTY_LOGS=true`
  for human-readable dev output.
- Metrics: `fastify-metrics` exposes Prometheus counters/histograms on
  `/metrics`.
- Tracing: planned via OpenTelemetry once the OBSERVABILITY module lands.

---

## Build container

```sh
# from the repo root
docker build -f apps/memory/Dockerfile -t praxis/memory:dev .
```
