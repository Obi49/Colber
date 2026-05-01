/**
 * Ed25519 sign / verify helpers operating on base64-encoded keys + signatures.
 *
 * Mirrors the on-the-wire convention used by every Colber service:
 *   - 32-byte raw secret key, base64-encoded
 *   - 32-byte raw public key, base64-encoded
 *   - 64-byte signature, base64-encoded
 *   - message: `Uint8Array` of UTF-8 bytes (typically the JCS canonical
 *     form of a payload — see `canonicalizeJcsBytes`).
 *
 * Both functions accept the message either as a `Uint8Array` or as a string
 * (UTF-8 encoded internally) for caller convenience.
 */

import * as ed from '@noble/ed25519';

import { fromBase64, toBase64 } from './codec.js';
// Importing `did-key` ensures `wireSha512` is bound to `@noble/ed25519`
// before any sign/verify call, even if the caller never imports did-key
// directly. Re-importing the wiring module would also work but go through
// the public surface to keep the side-effect chain explicit.
import './did-key.js';

const ED25519_SECRET_KEY_BYTES = 32;
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

const toBytes = (m: Uint8Array | string): Uint8Array =>
  typeof m === 'string' ? new TextEncoder().encode(m) : m;

/**
 * Sign `message` with `secretKeyBase64` and return the signature as base64.
 *
 * The secret key MUST be a 32-byte raw Ed25519 secret key (the kind produced
 * by {@link generateDidKey}). Throws if the decoded key length is wrong.
 */
export const signMessage = async (
  secretKeyBase64: string,
  message: Uint8Array | string,
): Promise<string> => {
  const secretKey = fromBase64(secretKeyBase64);
  if (secretKey.length !== ED25519_SECRET_KEY_BYTES) {
    throw new Error(
      `Invalid Ed25519 secret key length: expected ${ED25519_SECRET_KEY_BYTES}, got ${secretKey.length}`,
    );
  }
  const sig = await ed.signAsync(toBytes(message), secretKey);
  return toBase64(sig);
};

/**
 * Verify `signatureBase64` against `message` + `publicKeyBase64`.
 * Returns `false` for any cryptographic mismatch or malformed input — never
 * throws on a bad signature.
 */
export const verifySignature = async (
  publicKeyBase64: string,
  message: Uint8Array | string,
  signatureBase64: string,
): Promise<boolean> => {
  let publicKey: Uint8Array;
  let signature: Uint8Array;
  try {
    publicKey = fromBase64(publicKeyBase64);
    signature = fromBase64(signatureBase64);
  } catch {
    return false;
  }
  if (
    publicKey.length !== ED25519_PUBLIC_KEY_BYTES ||
    signature.length !== ED25519_SIGNATURE_BYTES
  ) {
    return false;
  }
  try {
    return await ed.verifyAsync(signature, toBytes(message), publicKey);
  } catch {
    return false;
  }
};
