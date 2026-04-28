import type { SignatureScheme } from './did.js';

/**
 * A cryptographic key pair, scheme-agnostic.
 * Bytes are passed as `Uint8Array` everywhere internally; base64 only at API edges.
 */
export interface KeyPair {
  readonly scheme: SignatureScheme;
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
}

/** A signature, paired with the scheme that produced it. */
export interface Signature {
  readonly scheme: SignatureScheme;
  readonly bytes: Uint8Array;
}

/** Result of a verification attempt. Errors are explicit, not thrown. */
export interface VerificationResult {
  readonly valid: boolean;
  readonly reason?: string;
}
