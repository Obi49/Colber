import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';

import type { SignatureProvider } from './provider.js';
import type { KeyPair, SignatureScheme, VerificationResult } from '@colber/core-types';

// `@noble/ed25519` v2 is hash-pluggable but ships without a default hash to
// stay zero-dep. We wire it to `@noble/hashes/sha2` once at module load.
const wireSha512 = (...messages: Uint8Array[]): Uint8Array => {
  // Single-message fast path. `noUncheckedIndexedAccess` makes the array
  // access narrow to `Uint8Array | undefined`; the `messages.length === 1`
  // guard rules out `undefined` at runtime, so we use a non-null assertion
  // to satisfy the type system without a type assertion (which the
  // `non-nullable-type-assertion-style` lint rule would flag).
  if (messages.length === 1) {
    return sha512(messages[0]!);
  }
  return sha512(ed.etc.concatBytes(...messages));
};
ed.etc.sha512Sync = wireSha512;
ed.etc.sha512Async = (...messages: Uint8Array[]) => Promise.resolve(wireSha512(...messages));

const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_PRIVATE_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

class Ed25519Provider implements SignatureProvider {
  public readonly scheme: SignatureScheme = 'Ed25519';

  public async generateKeyPair(): Promise<KeyPair> {
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    return { scheme: this.scheme, privateKey, publicKey };
  }

  public async sign(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    if (privateKey.length !== ED25519_PRIVATE_KEY_BYTES) {
      throw new Error(
        `Invalid Ed25519 private key length: expected ${ED25519_PRIVATE_KEY_BYTES}, got ${privateKey.length}`,
      );
    }
    return ed.signAsync(message, privateKey);
  }

  public async verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<VerificationResult> {
    if (publicKey.length !== ED25519_PUBLIC_KEY_BYTES) {
      return { valid: false, reason: 'invalid_public_key_length' };
    }
    if (signature.length !== ED25519_SIGNATURE_BYTES) {
      return { valid: false, reason: 'invalid_signature_length' };
    }
    try {
      const valid = await ed.verifyAsync(signature, message, publicKey);
      return valid ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
    } catch (cause) {
      return {
        valid: false,
        reason: cause instanceof Error ? cause.message : 'verification_threw',
      };
    }
  }

  public isValidPublicKey(bytes: Uint8Array): boolean {
    return bytes.length === ED25519_PUBLIC_KEY_BYTES;
  }
}

const ed25519Provider = new Ed25519Provider();

/**
 * Returns the signature provider for a given scheme.
 * Throws on unsupported schemes — explicit failure beats silent fallthrough.
 */
export const getSignatureProvider = (scheme: SignatureScheme): SignatureProvider => {
  switch (scheme) {
    case 'Ed25519':
      return ed25519Provider;
    case 'Secp256k1':
      throw new Error('Secp256k1 provider not implemented yet (planned for post-MVP)');
    default: {
      // Exhaustiveness check — TS will error at compile time if a scheme is unhandled.
      const _exhaustive: never = scheme;
      throw new Error(`Unhandled signature scheme: ${String(_exhaustive)}`);
    }
  }
};

export const ED25519_CONSTANTS = {
  PUBLIC_KEY_BYTES: ED25519_PUBLIC_KEY_BYTES,
  PRIVATE_KEY_BYTES: ED25519_PRIVATE_KEY_BYTES,
  SIGNATURE_BYTES: ED25519_SIGNATURE_BYTES,
} as const;
