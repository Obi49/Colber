# @colber/sdk

Official TypeScript SDK for the [Colber](https://github.com/Obi49/Colber) platform — typed clients for the six v1 services (`identity`, `reputation`, `memory`, `observability`, `negotiation`, `insurance`) plus the platform crypto primitives (`did:key` Ed25519, RFC 8785 JCS canonicalization, signing helpers).

Zero-runtime-dep beyond `@noble/ed25519`. Native `fetch` (Node 20+, Bun, Deno, browsers). ESM + CJS dual-export.

## Install

```bash
pnpm add @colber/sdk
# or
npm install @colber/sdk
```

## Quick start

```ts
import { ColberClient } from '@colber/sdk';
import { generateDidKey, signMessage, canonicalizeJcs } from '@colber/sdk/crypto';

// 1) Mint a fresh DID + keypair (Ed25519, did:key method).
const { did, publicKeyBase64, secretKeyBase64 } = await generateDidKey();

// 2) Point the client at your services.
const client = new ColberClient({
  baseUrls: {
    identity: 'http://localhost:14001',
    reputation: 'http://localhost:14011',
    memory: 'http://localhost:14021',
    observability: 'http://localhost:14031',
    negotiation: 'http://localhost:14041',
    insurance: 'http://localhost:14051',
  },
});

// 3) Register the agent and read its score.
await client.identity.register({ publicKey: publicKeyBase64, ownerOperatorId: 'op-demo' });
const score = await client.reputation.score({ did });
console.log(score.score); // 500 (base score for a brand-new agent)

// 4) Sign a JCS-canonical payload.
const sig = await signMessage(secretKeyBase64, canonicalizeJcs({ did, score: score.score }));
```

## Convenience constructors

```ts
ColberClient.local(); // localhost ports 14001..14051
ColberClient.fromBaseUrl('https://api.colber.dev'); // future ingress; PROVISIONAL
```

## Errors

- `ColberApiError` — service returned `{ ok: false, error: { code, message, details? } }` (4xx/5xx).
- `ColberNetworkError` — fetch threw, response was not JSON, or the request timed out (`code: 'TIMEOUT'`).
- `ColberValidationError` — local request shape couldn't be sent (rare; reserved for future client-side checks).

## Idempotency

`negotiation.start`, `insurance.subscribe`, and `insurance.claim` accept an optional `{ idempotencyKey }` second argument. The SDK forwards it verbatim — generation is the caller's responsibility.

## License

UNLICENSED (private, proprietary). See the root `package.json`.
