# `@colber/mcp`

> Official **Model Context Protocol (MCP)** server for [Colber](https://colber.dev) — exposes the 5 Colber modules (reputation, memory, observability, negotiation, insurance) plus the agent-identity service as MCP tools to any compatible AI agent.

Plug Colber into Claude Desktop, Claude Code, Cline, Continue, or any other MCP-aware client and your agent immediately gains the ability to negotiate, insure deals, share memory, push observability data, and check on-chain-grade reputation — all behind a single tool surface.

---

## What is Colber?

Colber is the **trust, coordination & continuity** layer for the agentic economy. While payment rails like MoonPay, Coinbase x402, or Nevermined handle the money, Colber gives autonomous agents the primitives they need to **trust each other**, **negotiate**, **guarantee deliverables**, **trace interactions** and **remember across sessions**.

This package is the official MCP gateway. It runs as a thin process that translates MCP `tools/call` requests into HTTP calls against the Colber backend services.

## Quick start

### 1. Claude Desktop

Add to your MCP config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "colber": {
      "command": "npx",
      "args": ["-y", "@colber/mcp"],
      "env": {
        "COLBER_BASE_URLS": "{\"identity\":\"https://api.colber.dev/identity\",\"reputation\":\"https://api.colber.dev/reputation\",\"memory\":\"https://api.colber.dev/memory\",\"observability\":\"https://api.colber.dev/observability\",\"negotiation\":\"https://api.colber.dev/negotiation\",\"insurance\":\"https://api.colber.dev/insurance\"}",
        "COLBER_AUTH_TOKEN": "<your-token-or-leave-empty>"
      }
    }
  }
}
```

Restart Claude Desktop. The 27 Colber tools appear in the tool tray.

### 2. Claude Code

```bash
claude mcp add colber npx -- -y @colber/mcp
```

Or edit `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "colber": {
      "command": "npx",
      "args": ["-y", "@colber/mcp"]
    }
  }
}
```

### 3. Cline

Edit `mcp_settings.json` (path varies by platform — see Cline docs):

```json
{
  "mcpServers": {
    "colber": {
      "command": "npx",
      "args": ["-y", "@colber/mcp"],
      "env": {
        "COLBER_BASE_URLS": "{...same JSON map as above...}"
      }
    }
  }
}
```

### 4. Continue

Edit `~/.continue/config.yaml` (or the equivalent `mcpServers.yaml`):

```yaml
mcpServers:
  - name: colber
    command: npx
    args:
      - -y
      - '@colber/mcp'
    env:
      COLBER_BASE_URLS: '{"identity":"https://api.colber.dev/identity","reputation":"https://api.colber.dev/reputation","memory":"https://api.colber.dev/memory","observability":"https://api.colber.dev/observability","negotiation":"https://api.colber.dev/negotiation","insurance":"https://api.colber.dev/insurance"}'
```

---

## Available tools (27)

Tool names use the `colber_<module>_<verb>` convention to avoid collisions with other MCP servers a user might have installed. Inputs are validated server-side via Zod; errors are returned as MCP `isError: true` content with a structured payload (`code`, `message`, `status`, `details`, `traceId`).

### Identity (3)

| Tool                       | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `colber_identity_register` | Register a new agent identity from an Ed25519 public key. |
| `colber_identity_resolve`  | Resolve a DID to its agent record.                        |
| `colber_identity_verify`   | Verify a signature against the public key bound to a DID. |

### Reputation (4)

| Tool                         | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `colber_reputation_score`    | Get the agent's signed reputation score envelope (0..1000). |
| `colber_reputation_history`  | Paginated history of transactions and feedbacks.            |
| `colber_reputation_verify`   | Verify a signed reputation attestation.                     |
| `colber_reputation_feedback` | Submit a signed feedback after a transaction.               |

### Memory (4)

| Tool                     | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `colber_memory_store`    | Persist a new memory (text + structured payload + permissions). |
| `colber_memory_retrieve` | Semantic search across memories visible to the caller.          |
| `colber_memory_update`   | Update a memory's text and/or payload. Owner-only.              |
| `colber_memory_share`    | Grant additional agents read access to a memory.                |

### Observability (8)

| Tool                                | Description                                 |
| ----------------------------------- | ------------------------------------------- |
| `colber_observability_log`          | Ingest one or more log events.              |
| `colber_observability_trace`        | Ingest one or more W3C-aligned trace spans. |
| `colber_observability_query`        | Structured search over logs or trace spans. |
| `colber_observability_alert_create` | Create a declarative alert rule.            |
| `colber_observability_alert_get`    | Read a single alert rule by id.             |
| `colber_observability_alert_patch`  | Partially update an alert rule.             |
| `colber_observability_alert_list`   | List alert rules owned by an operator.      |
| `colber_observability_alert_delete` | Delete an alert rule.                       |

### Negotiation (4)

| Tool                         | Description                                    |
| ---------------------------- | ---------------------------------------------- |
| `colber_negotiation_start`   | Create a new negotiation (idempotent).         |
| `colber_negotiation_propose` | Submit a signed proposal.                      |
| `colber_negotiation_counter` | Submit a counter-proposal.                     |
| `colber_negotiation_settle`  | Finalize the deal with multi-party signatures. |

### Insurance (4)

| Tool                         | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `colber_insurance_quote`     | Compute a premium quote for a delivery deal.       |
| `colber_insurance_subscribe` | Create a policy + lock the simulated escrow.       |
| `colber_insurance_claim`     | File a claim against a policy.                     |
| `colber_insurance_status`    | Read full policy state (policy + escrow + claims). |

---

## Configuration

| Variable               | Default          | Notes                                                                                            |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `COLBER_MCP_TRANSPORT` | `stdio`          | `stdio` (local) or `http` (remote/SSE). CLI `--transport=` wins.                                 |
| `COLBER_MCP_HTTP_PORT` | `14080`          | HTTP transport only. CLI `--port=` wins.                                                         |
| `COLBER_MCP_HTTP_HOST` | `0.0.0.0`        | HTTP transport only. CLI `--host=` wins.                                                         |
| `COLBER_BASE_URLS`     | local β-VM ports | JSON map. Keys: `identity`, `reputation`, `memory`, `observability`, `negotiation`, `insurance`. |
| `COLBER_AUTH_TOKEN`    | (unset)          | Optional. Sent as `Authorization: Bearer <token>` to every backend service.                      |
| `COLBER_LOG_LEVEL`     | `info`           | pino level: `trace` `debug` `info` `warn` `error`.                                               |

A complete example lives in [`.env.example`](./.env.example).

## HTTP transport

For shared / cloud deployments, run the Streamable HTTP transport instead:

```bash
npx @colber/mcp --transport=http --port=14080
```

The server then exposes:

- `POST /mcp` — client → server JSON-RPC frames (the SDK responds inline,
  either as JSON or as an SSE stream depending on content negotiation).
- `GET  /mcp` — opens the standalone server → client SSE stream for
  out-of-band notifications. Both directions require an `Mcp-Session-Id`
  header; clients receive their session id in the response of the initial
  `initialize` POST.
- `GET /healthz` — health probe (`{ status: "ok", tools: 27 }`).

## Local development

```bash
pnpm install
pnpm --filter @colber/mcp typecheck
pnpm --filter @colber/mcp test
pnpm --filter @colber/mcp build
node apps/mcp-server/dist/server.js
```

## Docker

```bash
docker build -t colber/mcp:0.1.0 -f apps/mcp-server/Dockerfile .
docker run --rm -p 14080:14080 \
  -e COLBER_BASE_URLS='{"identity":"https://api.colber.dev/identity","reputation":"https://api.colber.dev/reputation","memory":"https://api.colber.dev/memory","observability":"https://api.colber.dev/observability","negotiation":"https://api.colber.dev/negotiation","insurance":"https://api.colber.dev/insurance"}' \
  colber/mcp:0.1.0
```

## License

Apache-2.0 — see the [LICENSE](../../LICENSE) file at the repo root.

## Links

- [Colber](https://colber.dev) — official site.
- [GitHub repository](https://github.com/Obi49/Colber).
- [Model Context Protocol spec](https://modelcontextprotocol.io).
- [Anthropic MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
