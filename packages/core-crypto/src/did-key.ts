import { asDid, type Did, type SignatureScheme } from '@colber/core-types';

import { fromBase58btc, toBase58btc } from './codec.js';

/**
 * Multicodec prefixes (varint-encoded codes from the multicodec table).
 *  - 0xed = Ed25519 public key, varint-encoded as 0xed 0x01
 *  - 0xe7 = Secp256k1 public key, varint-encoded as 0xe7 0x01 (reserved for future)
 */
const MULTICODEC_PREFIXES: Record<SignatureScheme, Uint8Array> = {
  Ed25519: new Uint8Array([0xed, 0x01]),
  Secp256k1: new Uint8Array([0xe7, 0x01]),
};

const DID_KEY_PREFIX = 'did:key:';

/**
 * Encodes a public key into a `did:key` identifier per W3C did:key spec.
 * @see https://w3c-ccg.github.io/did-method-key/
 */
export const encodeDidKey = (publicKey: Uint8Array, scheme: SignatureScheme): Did => {
  const prefix = MULTICODEC_PREFIXES[scheme];
  const prefixed = new Uint8Array(prefix.length + publicKey.length);
  prefixed.set(prefix, 0);
  prefixed.set(publicKey, prefix.length);
  // Multibase 'z' prefix indicates base58btc encoding.
  return asDid(`${DID_KEY_PREFIX}z${toBase58btc(prefixed)}`);
};

export interface DecodedDidKey {
  readonly scheme: SignatureScheme;
  readonly publicKey: Uint8Array;
}

/**
 * Decodes a `did:key` identifier into its scheme + raw public key bytes.
 * Throws if the DID is malformed or the multicodec prefix is unknown.
 */
export const decodeDidKey = (did: string): DecodedDidKey => {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new Error(`Not a did:key identifier: ${did}`);
  }
  const multibase = did.slice(DID_KEY_PREFIX.length);
  if (!multibase.startsWith('z')) {
    throw new Error(`Unsupported multibase encoding: ${multibase[0] ?? ''}`);
  }
  const decoded = fromBase58btc(multibase.slice(1));
  if (decoded.length < 3) {
    throw new Error('Decoded did:key payload too short');
  }

  // Identify the scheme by its 2-byte multicodec prefix.
  for (const [scheme, prefix] of Object.entries(MULTICODEC_PREFIXES) as [
    SignatureScheme,
    Uint8Array,
  ][]) {
    if (decoded[0] === prefix[0] && decoded[1] === prefix[1]) {
      return { scheme, publicKey: decoded.slice(prefix.length) };
    }
  }
  throw new Error(
    `Unknown did:key multicodec prefix: 0x${(decoded[0] ?? 0).toString(16)}${(decoded[1] ?? 0).toString(16)}`,
  );
};
