import { fromBase64, getSignatureProvider, toBase64 } from '@colber/core-crypto';
import { ERROR_CODES, ColberError } from '@colber/core-types';

import { canonicalizeBytes } from './canonical-json.js';

/**
 * The signed payload returned by `reputation.score`.
 * `attestation` is an Ed25519 signature (base64) over the JCS canonical form
 * of `{ did, score, scoreVersion, computedAt }`.
 */
export interface SignedScore {
  readonly did: string;
  readonly score: number;
  readonly scoreVersion: string;
  /** ISO-8601 UTC. */
  readonly computedAt: string;
}

export interface SignedScoreEnvelope extends SignedScore {
  /** Base64 Ed25519 signature over the canonicalized SignedScore payload. */
  readonly attestation: string;
}

const provider = getSignatureProvider('Ed25519');

const ED25519_KEY_BYTES = 32;

export interface PlatformKeyMaterial {
  /** Raw 32-byte Ed25519 private key. */
  readonly privateKey: Uint8Array;
  /** Raw 32-byte Ed25519 public key. */
  readonly publicKey: Uint8Array;
}

/**
 * Decode the platform attestation key from base64 env strings, deriving the
 * public key from the private key when not explicitly supplied. Throws a
 * `ColberError(VALIDATION_FAILED)` so the misconfiguration surfaces as a
 * bootstrap failure rather than silently signing with garbage.
 */
export const loadPlatformKey = async (
  privateKeyB64: string,
  publicKeyB64: string | undefined,
): Promise<PlatformKeyMaterial> => {
  let privateKey: Uint8Array;
  try {
    privateKey = fromBase64(privateKeyB64);
  } catch {
    throw new ColberError(
      ERROR_CODES.VALIDATION_FAILED,
      'REPUTATION_PLATFORM_PRIVATE_KEY must be valid base64',
      500,
    );
  }
  if (privateKey.length !== ED25519_KEY_BYTES) {
    throw new ColberError(
      ERROR_CODES.VALIDATION_FAILED,
      `REPUTATION_PLATFORM_PRIVATE_KEY must be ${ED25519_KEY_BYTES} bytes, got ${privateKey.length}`,
      500,
    );
  }

  let publicKey: Uint8Array;
  if (publicKeyB64) {
    try {
      publicKey = fromBase64(publicKeyB64);
    } catch {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'REPUTATION_PLATFORM_PUBLIC_KEY must be valid base64',
        500,
      );
    }
    if (publicKey.length !== ED25519_KEY_BYTES) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `REPUTATION_PLATFORM_PUBLIC_KEY must be ${ED25519_KEY_BYTES} bytes, got ${publicKey.length}`,
        500,
      );
    }
  } else {
    // Derive the public key from the private key. Cheap and avoids the
    // operator having to wire two env vars to use a fresh key.
    const ed = await import('@noble/ed25519');
    publicKey = await ed.getPublicKeyAsync(privateKey);
  }

  return { privateKey, publicKey };
};

/**
 * Signs a score payload, returning `{ ...score, attestation }`.
 */
export const signScore = async (
  score: SignedScore,
  key: PlatformKeyMaterial,
): Promise<SignedScoreEnvelope> => {
  const payload: Record<string, unknown> = {
    did: score.did,
    score: score.score,
    scoreVersion: score.scoreVersion,
    computedAt: score.computedAt,
  };
  const bytes = canonicalizeBytes(payload);
  const sig = await provider.sign(bytes, key.privateKey);
  return { ...score, attestation: toBase64(sig) };
};

/**
 * Verifies a signed-score envelope against a platform public key.
 * Returns `{ valid, reason? }`. Never throws on bad signatures — only on
 * inputs that can't even be parsed (e.g. malformed base64 attestation).
 */
export const verifyScore = async (
  envelope: SignedScoreEnvelope,
  publicKey: Uint8Array,
): Promise<{ valid: boolean; reason?: string }> => {
  let signature: Uint8Array;
  try {
    signature = fromBase64(envelope.attestation);
  } catch {
    return { valid: false, reason: 'invalid_attestation_encoding' };
  }
  const payload: Record<string, unknown> = {
    did: envelope.did,
    score: envelope.score,
    scoreVersion: envelope.scoreVersion,
    computedAt: envelope.computedAt,
  };
  const bytes = canonicalizeBytes(payload);
  const result = await provider.verify(bytes, signature, publicKey);
  return result.valid ? { valid: true } : { valid: false, reason: result.reason ?? 'unknown' };
};
