# langchain-colber

LangChain integration for the [Colber](https://colber.dev) platform — observability callbacks, semantic memory backed by `colber-memory`, and a 6-service toolkit. Apache-2.0.

This is the first public plugin in the "Lego" GTM lever. It depends only on `langchain-core` (not the full `langchain` package) and the published `colber-sdk` PyPI release, so it stays lightweight and is independently versionable.

## Install

```bash
pip install langchain-colber
```

For local development inside the Colber monorepo:

```bash
pip install -e apps/langchain-colber
```

## Components

### `ColberCallbackHandler`

Captures LangChain run events as Colber observability spans + structured logs. Attach to any chain / agent via the standard `callbacks=[...]` argument.

```python
from langchain_colber import ColberCallbackHandler

callback = ColberCallbackHandler(
    agent_did="did:key:z6Mk...",
    operator_id="op-demo",
    service_name="my-langchain-agent",
)
# Then plug into any LangChain runnable:
result = my_chain.invoke({"input": "hello"}, config={"callbacks": [callback]})
```

Hooks covered: `on_chain_start/end/error`, `on_llm_start/end/error`, `on_chat_model_start`, `on_tool_start/end/error`, `on_agent_action`, `on_agent_finish`. Each hook produces a span; `*_error` hooks also emit a structured log. Trace correlation follows LangChain's `parent_run_id` so every nested step lives under a single trace id.

Network failures to the observability service are caught and logged at `WARN`; the chain is never aborted because the backend is sick.

### `ColberMemory`

Backs LangChain's `BaseMemory` with the `colber-memory` service (Qdrant + ACL + chiffrement). Cross-agent share semantics are wired in: pass `share_with=[did1, did2, ...]` and every saved memory is automatically shared.

```python
from langchain_colber import ColberMemory

memory = ColberMemory(
    agent_did="did:key:z6Mk...",
    top_k=5,
    share_with=["did:key:z6MkPeer1", "did:key:z6MkPeer2"],
)
```

A chat-history flavour (`ColberChatMessageHistory`) is also exported for use with `RunnableWithMessageHistory`.

### `ColberToolkit`

Exposes the 6 Colber services as LangChain tools (one per operation, 14 in total).

```python
from langchain_colber import ColberToolkit

toolkit = ColberToolkit()
tools = toolkit.get_tools()  # list[BaseTool]
```

| Service       | Tools                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `identity`    | `colber_identity_register`, `colber_identity_resolve`                                                               |
| `reputation`  | `colber_reputation_score`, `colber_reputation_feedback`                                                             |
| `memory`      | `colber_memory_store`, `colber_memory_query`, `colber_memory_share`                                                 |
| `negotiation` | `colber_negotiation_start`, `colber_negotiation_propose`, `colber_negotiation_counter`, `colber_negotiation_settle` |
| `insurance`   | `colber_insurance_quote`, `colber_insurance_subscribe`, `colber_insurance_claim`                                    |

Pass `services=["negotiation", "insurance"]` to scope down the surface for a deal-only agent.

The `observability` service is not exposed as a tool — `ColberCallbackHandler` already gives the agent first-class observability without LLM-driven calls.

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
from langchain_colber import ColberToolkit

client = ColberClient.from_base_url("https://api.colber.dev", auth_token="...")
toolkit = ColberToolkit(client=client)
```

## Out of scope (Wave 2.1+ follow-up)

- LangGraph integration (custom graph nodes wrapping Colber services).
- Custom prompt templates pre-baked with reputation/memory context.
- Attestation flow helpers (auto-sign + verify Colber payloads inside an agent loop).

These are noted as Wave 2.1+ follow-ups in the Colber ROADMAP.

## License

Apache-2.0 — same license as `colber-sdk` and `@colber/mcp`.
