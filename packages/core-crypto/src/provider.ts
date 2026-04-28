import type { KeyPair, SignatureScheme, VerificationResult } from '@praxis/core-types';

/**
 * Pluggable signature provider.
 *
 * Adding a new scheme = implementing this interface and registering it
 * in `getSignatureProvider`. The rest of the codebase calls only this
 * abstraction and never touches `@noble/ed25519` directly.
 */
export interface SignatureProvider {
  readonly scheme: SignatureScheme;
  /** Generates a new random keypair using a cryptographically secure RNG. */
  generateKeyPair(): Promise<KeyPair>;
  /** Signs `message` with `privateKey`, returning the raw signature bytes. */
  sign(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;
  /** Verifies `signature` of `message` against `publicKey`. Never throws. */
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<VerificationResult>;
  /** Validates the wire-format of a public key for this scheme. */
  isValidPublicKey(bytes: Uint8Array): boolean;
}
