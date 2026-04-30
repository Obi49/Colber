/**
 * `did:key` Ed25519 helpers (W3C did:key spec).
 *
 * Mirror of `apps/agent-identity` + `packages/core-crypto/src/did-key.ts`,
 * inlined here so the SDK ships standalone.
 *
 * Format: `did:key:z<multibase-base58btc(0xed01 || pubkey32)>`
 *
 * `0xed 0x01` is the varint multicodec prefix for Ed25519 public keys.
 */

import * as ed from '@noble/ed25519';

import { fromBase58btc, toBase58btc, toBase64 } from './codec.js';
import { wireSha512 } from './sha512.js';

// `@noble/ed25519` v2 is hash-pluggable but ships without a default sha512.
// We wire it once at module load to a Node-native implementation. Wiring is
// idempotent — a second call from another module simply re-assigns the same
// function.
ed.etc.sha512Sync = wireSha512;
ed.etc.sha512Async = (...messages: Uint8Array[]) => Promise.resolve(wireSha512(...messages));

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);
const DID_KEY_PREFIX = 'did:key:';

export interface GeneratedDidKey {
  /** `did:key:z6Mk...` identifier ready to register with `agent-identity`. */
  readonly did: string;
  /** Raw 32-byte Ed25519 public key, base64-encoded (RFC 4648, with padding). */
  readonly publicKeyBase64: string;
  /** Raw 32-byte Ed25519 secret key, base64-encoded. KEEP SECRET. */
  readonly secretKeyBase64: string;
}

/**
 * Generate a fresh Ed25519 keypair and encode the public key as a `did:key`.
 * Returns the DID + base64-encoded public/secret keys ready to feed into
 * `client.identity.register({ publicKey: publicKeyBase64, ... })`.
 */
export const generateDidKey = async (): Promise<GeneratedDidKey> => {
  const secretKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(secretKey);
  return {
    did: encodeDidKey(publicKey),
    publicKeyBase64: toBase64(publicKey),
    secretKeyBase64: toBase64(secretKey),
  };
};

/** Encode a 32-byte Ed25519 public key into its `did:key` form. */
export const encodeDidKey = (publicKey: Uint8Array): string => {
  if (publicKey.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${publicKey.length}`);
  }
  const prefixed = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length);
  prefixed.set(ED25519_MULTICODEC_PREFIX, 0);
  prefixed.set(publicKey, ED25519_MULTICODEC_PREFIX.length);
  return `${DID_KEY_PREFIX}z${toBase58btc(prefixed)}`;
};

export interface ParsedDidKey {
  readonly publicKey: Uint8Array;
  readonly publicKeyBase64: string;
}

/**
 * Decode a `did:key` identifier into its raw + base64 public-key forms.
 * Throws on malformed prefix, non-`z` multibase, or unknown multicodec.
 */
export const parseDidKey = (did: string): ParsedDidKey => {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new Error(`Not a did:key identifier: ${did}`);
  }
  const multibase = did.slice(DID_KEY_PREFIX.length);
  if (!multibase.startsWith('z')) {
    throw new Error(`Unsupported multibase encoding (expected 'z'): ${multibase[0] ?? ''}`);
  }
  const decoded = fromBase58btc(multibase.slice(1));
  if (decoded.length < 3) {
    throw new Error('Decoded did:key payload too short');
  }
  if (decoded[0] !== ED25519_MULTICODEC_PREFIX[0] || decoded[1] !== ED25519_MULTICODEC_PREFIX[1]) {
    throw new Error(
      `Unknown did:key multicodec prefix: 0x${(decoded[0] ?? 0).toString(16)}${(decoded[1] ?? 0).toString(16)}`,
    );
  }
  const publicKey = decoded.slice(ED25519_MULTICODEC_PREFIX.length);
  return { publicKey, publicKeyBase64: toBase64(publicKey) };
};

// Re-export for tests + consumer convenience.
export { fromBase64, toBase64 } from './codec.js';
