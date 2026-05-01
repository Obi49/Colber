/**
 * `@colber/sdk/crypto` — public crypto surface.
 *
 * - DID:key Ed25519 generation + parsing
 * - Sign / verify on base64-encoded payloads
 * - JCS RFC 8785 canonicalization
 * - Base64 encode/decode helpers (since the wire format is base64 everywhere)
 */

export {
  encodeDidKey,
  generateDidKey,
  parseDidKey,
  type GeneratedDidKey,
  type ParsedDidKey,
} from './did-key.js';

export { signMessage, verifySignature } from './signing.js';

export { canonicalizeJcs, canonicalizeJcsBytes } from './jcs.js';

export { fromBase64, toBase64 } from './codec.js';
