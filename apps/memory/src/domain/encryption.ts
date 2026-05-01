import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ERROR_CODES, ColberError } from '@colber/core-types';

/**
 * AES-256-GCM envelope encryption for sensitive memory text.
 *
 * v1 uses a single global key supplied via `MEMORY_ENCRYPTION_KEY`. This is
 * an explicit placeholder for the per-tenant KMS key model that ships with
 * P1.7 — see CDC §4.5 (sécurité par défaut, chiffrement bout-en-bout des
 * mémoires sensibles). The interface is shaped so that swapping the key
 * source for a `KMSResolver` later is a constructor change.
 *
 * Storage layout for a ciphertext: base64( IV(12B) || ciphertext || authTag(16B) ).
 *
 * The embedding is generated from the *cleartext* before encryption (semantic
 * search is impossible over ciphertext); only the at-rest representation in
 * Postgres is encrypted.
 */
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptionService {
  /** True when an operational key is present and encryption can be performed. */
  readonly available: boolean;
  /** Stable identifier for the key currently in use (KMS reference placeholder). */
  readonly keyId: string;
  encrypt(plaintext: string): { ciphertext: string; algorithm: string; keyId: string };
  decrypt(ciphertext: string): string;
}

export interface AesGcmServiceOptions {
  /** Base64-encoded 32-byte key. */
  readonly keyB64: string;
  /** Optional logical key identifier. Default `colber-memory-v1`. */
  readonly keyId?: string;
}

/**
 * Symmetric AES-256-GCM service using a single global key from env.
 * Throws at construction if the supplied key is malformed — fail-fast at boot
 * is preferable to silently mis-encrypting memories.
 */
export class AesGcmEncryptionService implements EncryptionService {
  public readonly available = true;
  public readonly keyId: string;
  private readonly key: Buffer;

  constructor(opts: AesGcmServiceOptions) {
    let raw: Buffer;
    try {
      raw = Buffer.from(opts.keyB64, 'base64');
    } catch {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'MEMORY_ENCRYPTION_KEY must be valid base64',
        500,
      );
    }
    if (raw.length !== KEY_BYTES) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `MEMORY_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length})`,
        500,
      );
    }
    this.key = raw;
    this.keyId = opts.keyId ?? 'colber-memory-v1';
  }

  public encrypt(plaintext: string): {
    ciphertext: string;
    algorithm: string;
    keyId: string;
  } {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, enc, tag]).toString('base64');
    return { ciphertext: blob, algorithm: ENCRYPTION_ALGORITHM, keyId: this.keyId };
  }

  public decrypt(ciphertext: string): string {
    let raw: Buffer;
    try {
      raw = Buffer.from(ciphertext, 'base64');
    } catch {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'ciphertext is not valid base64', 400);
    }
    if (raw.length < IV_BYTES + TAG_BYTES + 1) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'ciphertext too short to be a valid AES-GCM envelope',
        400,
      );
    }
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);
    const body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    try {
      const dec = Buffer.concat([decipher.update(body), decipher.final()]);
      return dec.toString('utf8');
    } catch (cause) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `decryption failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        400,
      );
    }
  }
}

/**
 * No-op fallback used when no key is configured (or for tests where you
 * want to bypass encryption end-to-end). `available=false` so the service
 * can refuse `encryption.enabled=true` requests instead of silently storing
 * cleartext.
 */
export class NoopEncryptionService implements EncryptionService {
  public readonly available = false;
  public readonly keyId = '';
  public encrypt(): { ciphertext: string; algorithm: string; keyId: string } {
    throw new ColberError(
      ERROR_CODES.INTERNAL_ERROR,
      'Encryption requested but no key is configured (MEMORY_ENCRYPTION_KEY)',
      500,
    );
  }
  public decrypt(): string {
    throw new ColberError(
      ERROR_CODES.INTERNAL_ERROR,
      'Cannot decrypt without a configured key',
      500,
    );
  }
}
