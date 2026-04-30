# praxis-sdk

Official Python SDK for the [Praxis](https://github.com/Obi49/Praxis) platform — typed clients for the six v1 services (`identity`, `reputation`, `memory`, `observability`, `negotiation`, `insurance`) plus the platform crypto primitives (`did:key` Ed25519, RFC 8785 JCS canonicalization, signing helpers).

Mirror of the [TypeScript SDK](../sdk-typescript/) (`@praxis/sdk@0.1.0`). Same surface, same wire format, signatures produced here verify against payloads signed by the TS SDK and vice versa.

Runtime dependencies: `httpx` (sync) + `cryptography` (Ed25519 + sha512). No `pydantic`, no `requests`, no `pynacl`.

## Install

```bash
pip install praxis-sdk
```

The package is **PyPI-publishable as `praxis-sdk`**, but is not yet released. Use editable install from this repo while in v0.1.0:

```bash
pip install -e apps/sdk-python
```

## Quick start

```python
from praxis_sdk import PraxisClient
from praxis_sdk.crypto import generate_did_key, sign_message, canonicalize_jcs

# 1) Mint a fresh DID + Ed25519 keypair (did:key method, multibase z6Mk...).
keys = generate_did_key()

# 2) Point the client at your services. local() targets the β-VM ports.
client = PraxisClient.local()

# 3) Register the agent and read its score.
agent = client.identity.register(public_key=keys.public_key_b64, owner_operator_id="op-demo")
envelope = client.reputation.score(did=keys.did)
print(envelope.score)  # 500 (base score for a brand-new agent)

# 4) Sign a JCS-canonical payload.
sig = sign_message(
    keys.secret_key_b64,
    canonicalize_jcs({"did": keys.did, "score": envelope.score}),
)
```

## Convenience constructors

```python
PraxisClient.local()                                # localhost ports 14001..14051
PraxisClient.from_base_url("https://api.praxis.dev") # future ingress; PROVISIONAL
```

## Errors

- `PraxisApiError` — service returned `{ ok: false, error: { code, message, details? } }` (4xx/5xx).
- `PraxisNetworkError` — request failed at the transport layer (timeout, fetch error, malformed body).
- `PraxisValidationError` — local SDK rejected the call before sending. Currently unused, reserved for v0.2.

All three extend `PraxisError` so callers can do a single base catch.

## Idempotency

`negotiation.start`, `insurance.subscribe`, and `insurance.claim` accept an optional `idempotency_key: str | None = None` keyword argument. The SDK forwards it verbatim — generation is the caller's responsibility.

```python
client.negotiation.start(
    terms=terms,
    created_by="did:key:zA",
    idempotency_key="my-unique-key-123",
)
```

## Async support

**Synchronous-only in v0.1.0.** Async support (`AsyncPraxisClient` backed by `httpx.AsyncClient`) is planned for v0.2 — the public method names will mirror the sync surface with the `async`/`await` keywords added.

## License

UNLICENSED (private, proprietary). See the root `package.json`.
