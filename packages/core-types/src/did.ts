import type { Brand } from './brand.js';

/**
 * W3C Decentralized Identifier.
 * For Colber MVP we only support `did:key` (Ed25519 multibase).
 * Future support: `did:web`, `did:ethr`. See ARCHITECTURE_BREAKDOWN §3.6.1.
 */
export type Did = Brand<string, 'Did'>;

/** Supported DID methods. Only `key` is implemented in MVP. */
export const DID_METHODS = ['key', 'web', 'ethr'] as const;
export type DidMethod = (typeof DID_METHODS)[number];

/** Supported signature schemes. ECDSA secp256k1 is reserved for future. */
export const SIGNATURE_SCHEMES = ['Ed25519', 'Secp256k1'] as const;
export type SignatureScheme = (typeof SIGNATURE_SCHEMES)[number];

/**
 * Lightweight format check for a `did:key:z6Mk…` Ed25519 DID.
 * Cryptographic validation lives in `@colber/core-crypto`.
 */
const DID_KEY_ED25519_PATTERN = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{43,46}$/;

export const isDidKey = (value: string): value is Did => DID_KEY_ED25519_PATTERN.test(value);

/**
 * Parses the method out of a DID string.
 * Returns `undefined` if the DID is malformed.
 */
export const parseDidMethod = (did: string): DidMethod | undefined => {
  const parts = did.split(':');
  if (parts.length < 3 || parts[0] !== 'did') {
    return undefined;
  }
  const method = parts[1];
  return (DID_METHODS as readonly string[]).includes(method ?? '')
    ? (method as DidMethod)
    : undefined;
};

/**
 * Brands a string as a Did. Caller is responsible for validation
 * (typically via `@colber/core-crypto`).
 */
export const asDid = (value: string): Did => value as Did;
