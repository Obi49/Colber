# colber-crewai

CrewAI integration for the [Colber](https://colber.dev) platform — step / task observability callbacks, long-term semantic memory backed by `colber-memory`, and a 5-service toolkit. Apache-2.0.

This is the second framework plugin in the "Lego" GTM lever (after `langchain-colber`). It depends only on `crewai>=0.80` and the published `colber-sdk` PyPI release, so it stays lightweight and is independently versionable.

## Install

```bash
pip install colber-crewai
```

For local development inside the Colber monorepo:

```bash
pip install -e apps/colber-crewai
```

## Components

### `ColberStepCallback` + `ColberTaskCallback`

Captures CrewAI step and task events as Colber observability spans + structured logs. CrewAI exposes two hook points (plain callables, **not** a `BaseCallbackHandler` like LangChain):

- `step_callback`: invoked after each agent step (LLM call OR tool call).
- `task_callback`: invoked after each task completes.

Wire them on either an `Agent` or a `Crew`:

```python
from crewai import Agent, Task, Crew
from colber_crewai import ColberStepCallback, ColberTaskCallback

step_cb = ColberStepCallback(
    agent_did="did:key:z6Mk...",
    operator_id="op-demo",
    service_name="my-crewai-agent",
)
task_cb = ColberTaskCallback(
    agent_did="did:key:z6Mk...",
    operator_id="op-demo",
    service_name="my-crewai-agent",
)

agent = Agent(
    role="Researcher",
    goal="...",
    backstory="...",
    step_callback=step_cb,
)
task = Task(description="...", agent=agent, callback=task_cb)
crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
```

Each invocation emits one span (`/v1/observability/traces`) with `traceId`, `spanId`, `name`, `durationMs`, `status`, and a small `attributes` dict. Errors additionally emit a structured log event (`/v1/observability/logs`) at `level=error`.

Network failures to the observability backend are caught, logged at `WARNING`, and swallowed — the crew is never aborted because telemetry is sick. Both callbacks are thread-safe (CrewAI may run agents concurrently).

### `ColberLongTermMemory`

Backs CrewAI's `LongTermMemory` with the `colber-memory` service (Qdrant + ACL + chiffrement). CrewAI keeps short-term and entity memory native (in-memory / SQLite); we plug Colber on **long-term** only — the tier where Colber differentiates (cross-agent share, semantic search, encrypted at rest).

```python
from crewai import Agent, Crew
from crewai.memory import EntityMemory, ShortTermMemory
from colber_crewai import ColberLongTermMemory

long_term = ColberLongTermMemory(
    agent_did="did:key:z6Mk...",
    top_k=5,
    share_with=["did:key:z6MkPeer1"],
)
crew = Crew(
    agents=[...],
    tasks=[...],
    memory=True,
    long_term_memory=long_term,
)
```

`save(value, metadata)` persists the value via `colber-memory.store` (auto-shared with the configured peer DIDs); `search(query, limit)` runs a semantic top-K query via `colber-memory.query`.

### `ColberToolkit`

Exposes 5 Colber services as CrewAI `BaseTool` instances (one per operation, 14 in total).

```python
from colber_crewai import ColberToolkit

toolkit = ColberToolkit(agent_did="did:key:z6Mk...")
tools = toolkit.get_tools()  # list[crewai_tools.BaseTool]

# Plug into any CrewAI agent.
agent = Agent(role="Negotiator", tools=tools, ...)
```

| Service       | Tools                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `identity`    | `colber_identity_register`, `colber_identity_resolve`                                                               |
| `reputation`  | `colber_reputation_score`, `colber_reputation_feedback`                                                             |
| `memory`      | `colber_memory_store`, `colber_memory_query`, `colber_memory_share`                                                 |
| `negotiation` | `colber_negotiation_start`, `colber_negotiation_propose`, `colber_negotiation_counter`, `colber_negotiation_settle` |
| `insurance`   | `colber_insurance_quote`, `colber_insurance_subscribe`, `colber_insurance_claim`                                    |

Pass `services=["negotiation", "insurance"]` to scope down the surface for a deal-only agent.

The `observability` service is **not** exposed as a tool. Letting an LLM call `log_ingest` is a footgun (the agent could DoS its own log pipeline). Use `ColberStepCallback` / `ColberTaskCallback` for telemetry — they give the agent first-class observability without LLM-driven calls. Passing `services=["observability"]` raises `ValueError` with the explicit reason.

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
from colber_crewai import ColberToolkit

client = ColberClient.from_base_url("https://api.colber.dev", auth_token="...")
toolkit = ColberToolkit(client=client, agent_did="did:key:z6Mk...")
```

## CrewAI version requirement

`crewai>=0.80,<1`. The 0.80+ line stabilised the public extension points this plugin depends on (`step_callback` / `task_callback` plain-callable convention, `LongTermMemory` save/search storage interface). Older versions ship different signatures.

## Out of scope (Wave 2.3+ follow-up)

- CrewAI Flows integration (declarative state machines).
- Custom prompt templates pre-baked with reputation/memory context.
- Attestation flow helpers (auto-sign + verify Colber payloads inside an agent loop).

These are noted as Wave 2.3+ follow-ups in the Colber ROADMAP.

## License

Apache-2.0 — same license as `colber-sdk`, `langchain-colber`, and `@colber/mcp`.
