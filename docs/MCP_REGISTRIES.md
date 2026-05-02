# MCP Registries — submission templates

Three places to list `@colber/mcp` for discoverability. Templates ready to copy-paste; the maintainer (CdP) does the actual submission since each requires a human account / GitHub login.

> **Prerequisite** : `@colber/mcp@0.1.0` must be live on npm
> (<https://www.npmjs.com/package/@colber/mcp>). ✅ Done 2026-05-03.

---

## 1. Anthropic — `modelcontextprotocol/servers` (highest priority)

The official curated list. Inclusion gives the most visibility to the Claude / MCP community.

### Step-by-step

1. **Fork** <https://github.com/modelcontextprotocol/servers> to your GitHub account.
2. Clone your fork locally, create a branch:
   ```bash
   git clone https://github.com/<your-user>/servers.git mcp-servers
   cd mcp-servers
   git checkout -b add-colber
   ```
3. **Edit `README.md`** of the forked repo: find the **"Community Servers"** section and add the entry below in alphabetical order (between any existing entries that start with letters before/after "C").
4. Commit + push to your fork:
   ```bash
   git add README.md
   git commit -m "docs: add Colber to community servers"
   git push origin add-colber
   ```
5. Open a PR from your fork → `modelcontextprotocol/servers:main`.

### Entry to add to their README.md

```markdown
- **[Colber](https://github.com/Obi49/Colber)** — Trust, coordination & continuity infrastructure for the agent economy: cryptographic reputation, semantic memory, A2A observability, multi-party negotiation, deliverable insurance. 27 tools.
```

### PR title

```
docs: add Colber to community servers
```

### PR body (copy-paste)

```markdown
## Summary

Add [Colber](https://colber.dev) to the Community Servers list.

Colber is the trust, coordination & continuity infrastructure for the agent economy. The MCP server (`@colber/mcp`) exposes **27 tools across 6 modules**:

| Module            | Tools                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| **identity**      | register, resolve, verify (DID:key + Ed25519)                               |
| **reputation**    | score, history, verify, feedback (cryptographic attestations, JCS RFC 8785) |
| **memory**        | store, retrieve, update, share (Qdrant vector search + ACL)                 |
| **observability** | log, trace, query + alert CRUD (ClickHouse, OTel-compatible)                |
| **negotiation**   | start, propose, counter, settle (event-sourced, multi-party signed)         |
| **insurance**     | quote, subscribe, claim, status (escrow, score-based pricing)               |

## Links

- **Repository**: https://github.com/Obi49/Colber (Apache-2.0)
- **npm package**: https://www.npmjs.com/package/@colber/mcp
- **Homepage**: https://colber.dev
- **Install**: `npx -y @colber/mcp` (also supports HTTP/SSE transport)

## Quality checklist

- [x] Public repo, Apache-2.0 license
- [x] npm package published with `@colber/mcp@0.1.0`
- [x] README with quick-start for Claude Desktop, Claude Code, Cline, Continue
- [x] 63 unit + integration tests (vitest)
- [x] Bundled single-file `dist/server.js` (no workspace deps)
- [x] Stdio (default) and HTTP/SSE transports
- [x] Live demo available at https://colber.dev

I have added the entry to the Community Servers section, alphabetically.
```

---

## 2. Smithery.ai

Smithery auto-detects servers via a `smithery.yaml` file at the repo root (already added — see `/smithery.yaml`).

### Step-by-step

1. Sign in with GitHub at <https://smithery.ai/auth/login> if not already.
2. Go to <https://smithery.ai> → **Submit a server** (top-right).
3. Paste the repo URL: `https://github.com/Obi49/Colber`.
4. Smithery clones the repo and reads `smithery.yaml` automatically; no extra form fields needed thanks to the YAML.
5. Wait 24–48 h for the auto-scan to complete (smithery checks the package can run, the tools are listed, etc.).
6. Once approved, the public URL is `https://smithery.ai/server/colber`.

### What smithery.yaml advertises

- `displayName: Colber`
- 27 tools indexed for search
- `startCommand: stdio` via `npx -y @colber/mcp@latest`
- Optional config: `baseUrls`, `authToken`, `logLevel`
- Categories: agent-infrastructure, memory, observability, trust, reputation

If smithery rejects the YAML for schema reasons, see <https://smithery.ai/docs/server-yaml> for the latest spec — fields evolve. Adjust and re-submit.

---

## 3. mcp.so

Plain web form, no GitHub integration required. Quickest of the three.

### Step-by-step

1. Open <https://mcp.so/submit> (or the equivalent "Submit a server" page on their site — link may move).
2. Fill the form with the values below, copy-paste from each block.

### Form fields

| Field                         | Value                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Name**                      | `Colber`                                                                                                   |
| **Slug** (if asked)           | `colber`                                                                                                   |
| **Short description**         | Trust, coordination & continuity infrastructure for the agent economy. 27 MCP tools across 6 modules.      |
| **Long description**          | (paste the markdown block below)                                                                           |
| **Repository**                | `https://github.com/Obi49/Colber`                                                                          |
| **npm package**               | `https://www.npmjs.com/package/@colber/mcp`                                                                |
| **Homepage**                  | `https://colber.dev`                                                                                       |
| **Install command**           | `npx -y @colber/mcp`                                                                                       |
| **License**                   | `Apache-2.0`                                                                                               |
| **Author**                    | `Johan / Colber`                                                                                           |
| **Categories** (multi-select) | `Agent Infrastructure`, `Memory`, `Observability`, `Trust`, `Reputation`                                   |
| **Tags / keywords**           | `agent, ai-agent, reputation, memory, observability, negotiation, insurance, did, ed25519, mcp, a2a, x402` |

### Long description (paste in the bigger textbox)

````markdown
**Colber** is the trust, coordination & continuity infrastructure that AI agents need to operate at scale. The official MCP server exposes 27 tools across 6 integrated modules:

- **Identity** — DID:key (Ed25519, W3C-compliant) registration and signature verification.
- **Reputation** — cryptographic scoring with offline-verifiable attestations (JCS RFC 8785, Ed25519).
- **Memory** — persistent semantic memory with vector search (Qdrant), ACL, encryption.
- **Observability** — distributed A2A tracing and logging (ClickHouse, OpenTelemetry-compatible).
- **Negotiation** — event-sourced multi-party broker with signed settlement (auction + multi-criteria strategies).
- **Insurance** — premium pricing based on reputation, simulated escrow, claim arbitration.

Apache-2.0 open source. Works with any MCP-compatible client (Claude Desktop, Claude Code, Cline, Continue). Stdio and HTTP/SSE transports.

**Quick install for Claude Desktop** (`claude_desktop_config.json`):

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
````

```

---

## Tracking

| Registry | Submitted | URL once live | Status |
|---|---|---|---|
| Anthropic `modelcontextprotocol/servers` | _todo_ | _PR pending review_ | _todo_ |
| Smithery.ai | _todo_ | https://smithery.ai/server/colber | _todo_ |
| mcp.so | _todo_ | https://mcp.so/server/colber | _todo_ |

Update this table after each submission so a future contributor (or future you) knows where Colber stands on each registry.
```
