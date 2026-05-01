import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  AesGcmEncryptionService,
  ENCRYPTION_ALGORITHM,
  NoopEncryptionService,
} from '../../src/domain/encryption.js';

const freshKey = (): string => randomBytes(32).toString('base64');

describe('AesGcmEncryptionService', () => {
  it('round-trips arbitrary UTF-8 strings', () => {
    const svc = new AesGcmEncryptionService({ keyB64: freshKey() });
    const cases = ['hello world', 'unicode — ✨ 你好 🤖', 'a'.repeat(10_000), '{"json":"like"}'];
    for (const plaintext of cases) {
      const enc = svc.encrypt(plaintext);
      expect(enc.algorithm).toBe(ENCRYPTION_ALGORITHM);
      expect(enc.keyId).toBe('colber-memory-v1');
      expect(enc.ciphertext).not.toBe(plaintext);
      expect(svc.decrypt(enc.ciphertext)).toBe(plaintext);
    }
  });

  it('produces a fresh IV per call (no two ciphertexts identical)', () => {
    const svc = new AesGcmEncryptionService({ keyB64: freshKey() });
    const a = svc.encrypt('the same plaintext');
    const b = svc.encrypt('the same plaintext');
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects malformed base64 keys at construction', () => {
    expect(() => new AesGcmEncryptionService({ keyB64: '@@not base64@@' })).toThrow(
      /must be valid base64|must decode to 32 bytes/i,
    );
  });

  it('rejects keys of the wrong length', () => {
    const tooShort = Buffer.alloc(16).toString('base64');
    expect(() => new AesGcmEncryptionService({ keyB64: tooShort })).toThrow(/32 bytes/);
  });

  it('rejects malformed ciphertext', () => {
    const svc = new AesGcmEncryptionService({ keyB64: freshKey() });
    expect(() => svc.decrypt('aaaaa')).toThrow(/too short|decryption failed/i);
  });

  it('rejects ciphertext encrypted under a different key', () => {
    const a = new AesGcmEncryptionService({ keyB64: freshKey() });
    const b = new AesGcmEncryptionService({ keyB64: freshKey() });
    const enc = a.encrypt('secret');
    expect(() => b.decrypt(enc.ciphertext)).toThrow(/decryption failed/i);
  });

  it('uses a stable key id by default', () => {
    const svc = new AesGcmEncryptionService({ keyB64: freshKey(), keyId: 'tenant-acme-2026' });
    expect(svc.keyId).toBe('tenant-acme-2026');
    const enc = svc.encrypt('hi');
    expect(enc.keyId).toBe('tenant-acme-2026');
  });
});

describe('NoopEncryptionService', () => {
  it('reports unavailable and refuses to encrypt or decrypt', () => {
    const svc = new NoopEncryptionService();
    expect(svc.available).toBe(false);
    expect(() => svc.encrypt()).toThrow(/no key is configured/i);
    expect(() => svc.decrypt()).toThrow(/Cannot decrypt/);
  });
});
