# colber-autogen

AutoGen 0.4+ integration for the [Colber](https://colber.dev) platform — per-tool observability instrumentation, an `autogen_core.memory.Memory` adapter backed by `colber-memory`, and a 5-service toolkit of typed `BaseTool[Args, Result]` subclasses. Apache-2.0.

This is the third framework plugin in the "Lego" GTM lever (after `langchain-colber` and `colber-crewai`). It depends only on `autogen-agentchat>=0.4` + `autogen-core>=0.4` and the published `colber-sdk` PyPI release, so it stays lightweight and is independently versionable.

> **AutoGen 0.4 only.** This plugin targets the Microsoft 2024-2025 redesign (`autogen-agentchat` + `autogen-core`). It does **not** depend on the legacy `pyautogen` 0.2 line.

## Install

```bash
pip install colber-autogen
```

For local development inside the Colber monorepo:

```bash
pip install -e apps/colber-autogen
```

## Components

### `ColberToolInstrumentation`

Wraps any AutoGen `BaseTool` (Colber-backed or not) so each call emits one Colber observability span (and one error log on failure). AutoGen 0.4 has no native `step_callback` equivalent to CrewAI, so we instrument at the tool boundary — that's the cleanest seam in AutoGen's "tools are first-class" architecture.

```python
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient
from colber_autogen import ColberToolInstrumentation, ColberToolkit

instr = ColberToolInstrumentation(
    agent_did="did:key:z6Mk...",
    operator_id="op-demo",
    service_name="my-autogen-agent",
)

toolkit = ColberToolkit(agent_did="did:key:z6Mk...")
tools = instr.wrap_all(toolkit.get_tools())

agent = AssistantAgent(
    name="trader",
    model_client=OpenAIChatCompletionClient(model="gpt-4o-mini"),
    tools=tools,
)
```

Each tool call emits one span (`/v1/observability/traces`) with `traceId`, `spanId`, `name=tool.<tool_name>`, `durationMs`, `status`, and a small `attributes` dict. Errors additionally emit a structured log event (`/v1/observability/logs`) at `level=error`, then propagate.

The wrapper preserves the underlying tool's `name`, `description`, `args_type`, `return_type`, and `schema` — the LLM sees the exact same tool definition.

Network failures to the observability backend are caught, logged at `WARNING`, and swallowed — the agent run is never aborted because telemetry is sick.

#### `ColberAgentMessageHook` (optional)

For operators who want turn-level spans (one per agent message), call `ColberAgentMessageHook` from the operator-side iteration over `agent.on_messages_stream`:

```python
from colber_autogen import ColberAgentMessageHook

hook = ColberAgentMessageHook(
    agent_did="did:key:z6Mk...",
    operator_id="op-demo",
)
async for message in agent.on_messages_stream(messages, cancellation_token):
    hook(message)
```

This is supplementary to `ColberToolInstrumentation`. Most users only need the tool-level instrumentation.

### `ColberMemory`

Implements AutoGen 0.4's `autogen_core.memory.Memory` protocol against the `colber-memory` service (Qdrant + ACL + chiffrement, with cross-agent `share` semantics).

```python
from autogen_agentchat.agents import AssistantAgent
from colber_autogen import ColberMemory

memory = ColberMemory(
    agent_did="did:key:z6Mk...",
    top_k=5,
    share_with=["did:key:z6MkPeer1"],
)

agent = AssistantAgent(
    name="trader",
    model_client=...,
    memory=[memory],
)
```

Five protocol methods are implemented:

| Method                                   | Behaviour                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `add(content)`                           | Calls `colber-memory.store` (and `share` when `share_with` is configured). Tolerant — transport errors are logged and swallowed.             |
| `query(query, top_k=, score_threshold=)` | Calls `colber-memory.search` scoped to `agent_did`. Returns `MemoryQueryResult` of `MemoryContent` hits.                                     |
| `update_context(model_context)`          | Reads the last user/system message, runs `query`, appends a `SystemMessage` summarising the hits (mirrors the `ListMemory` reference shape). |
| `clear()`                                | Logged no-op until colber-memory ships a bulk-delete-by-owner endpoint (Wave 2.4 follow-up).                                                 |
| `close()`                                | No-op — the SDK client's lifecycle is owned by the caller.                                                                                   |

### `ColberToolkit`

Exposes 5 Colber services as AutoGen `BaseTool[Args, str]` subclasses (one per operation, 14 in total).

```python
from colber_autogen import ColberToolkit

toolkit = ColberToolkit(agent_did="did:key:z6Mk...")
tools = toolkit.get_tools()  # list[autogen_core.tools.BaseTool]

# Plug into any AssistantAgent.
agent = AssistantAgent(name="negotiator", tools=tools, ...)
```

| Service       | Tools                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `identity`    | `colber_identity_register`, `colber_identity_resolve`                                                               |
| `reputation`  | `colber_reputation_score`, `colber_reputation_feedback`                                                             |
| `memory`      | `colber_memory_store`, `colber_memory_query`, `colber_memory_share`                                                 |
| `negotiation` | `colber_negotiation_start`, `colber_negotiation_propose`, `colber_negotiation_counter`, `colber_negotiation_settle` |
| `insurance`   | `colber_insurance_quote`, `colber_insurance_subscribe`, `colber_insurance_claim`                                    |

Pass `services=["negotiation", "insurance"]` to scope down the surface for a deal-only agent.

The `observability` service is **not** exposed as a tool. Letting an LLM call `log_ingest` is a footgun (the agent could DoS its own log pipeline). Use `ColberToolInstrumentation` for telemetry — it gives the agent first-class observability without LLM-driven calls. Passing `services=["observability"]` raises `ValueError` with the explicit reason.

Each tool subclasses `autogen_core.tools.BaseTool[ArgsT, str]` with a per-tool Pydantic v2 args model, so AutoGen's strict tool runner gets full schema validation up-front (and `mypy --strict` passes on the whole surface).

## Configuration

The plugin reads three environment variables when no explicit `ColberClient` is passed:

| Env var             | Description                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `COLBER_BASE_URLS`  | JSON object mapping each of the 6 service names to its base URL. Wins if set.                                            |
| `COLBER_BASE_URL`   | Single ingress base URL (e.g. `https://api.colber.dev`); paths are appended internally per `ColberClient.from_base_url`. |
| `COLBER_AUTH_TOKEN` | Optional bearer token forwarded to every Colber service.                                                                 |

If none are set, the plugin falls back to `ColberClient.local()` (β-VM ports on `localhost`).

You can always pass a pre-built client explicitly:

```python
from colber_sdk import ColberClient
from colber_autogen import ColberToolkit

client = ColberClient.from_base_url("https://api.colber.dev", auth_token="...")
toolkit = ColberToolkit(client=client, agent_did="did:key:z6Mk...")
```

## AutoGen version requirement

`autogen-agentchat>=0.4,<1` and `autogen-core>=0.4,<1`. The 0.4 line stabilised the public extension points this plugin depends on (`autogen_core.tools.BaseTool[ArgsT, ReturnT]`, `autogen_core.memory.Memory` protocol, `AssistantAgent.tools=` + `memory=` kwargs). The legacy `pyautogen` 0.2 line uses a different programming model and is **not** supported.

## Concurrency notes

The `colber-sdk` client is synchronous (`httpx.Client`). Every plugin component lifts blocking SDK calls into `asyncio.to_thread` so AutoGen's event loop is never stalled. The SDK client is thread-safe, so concurrent tool calls + memory operations are safe under `asyncio` concurrency.

## Out of scope (Wave 2.4+ follow-up)

- Native agent-level callback hook once AutoGen 0.4 lands a stable equivalent of CrewAI's `step_callback` (cf. microsoft/autogen#5891 — currently the wrapper-per-tool path is the cleanest framework-aligned answer).
- `colber-memory` bulk-delete-by-owner endpoint for `Memory.clear()` to do real work.
- Custom `ChatCompletionContext` subclass that auto-injects Colber memories without an explicit `update_context` call.

These are noted as Wave 2.4+ follow-ups in the Colber ROADMAP.

## License

Apache-2.0 — same license as `colber-sdk`, `langchain-colber`, `colber-crewai`, and `@colber/mcp`.
