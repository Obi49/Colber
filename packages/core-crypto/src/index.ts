/**
 * @praxis/core-crypto — cryptographic primitives for the Praxis platform.
 *
 * Design notes
 * -------------
 * - We use `@noble/ed25519` (audited, zero-dep, hash-pluggable).
 * - All public APIs go through the `SignatureProvider` interface, so we can
 *   add ECDSA secp256k1 later without touching callers (see ARCHITECTURE_BREAKDOWN §3.6.1).
 * - `did:key` encoding follows the W3C did:key spec for Ed25519:
 *   `did:key:z<multibase-base58btc(0xed01 || pubkey)>` where `0xed01` is the
 *   multicodec prefix for Ed25519 public keys.
 * - We keep `Uint8Array` everywhere internally; base64 only at API edges.
 */

export * from './codec.js';
export * from './did-key.js';
export * from './ed25519.js';
export * from './provider.js';
