import { fromBase64, getSignatureProvider, toBase64 } from '@praxis/core-crypto';
import { describe, expect, it } from 'vitest';

import {
  loadPlatformKey,
  signScore,
  verifyScore,
  type SignedScore,
} from '../../src/domain/attestation.js';

const buildPair = async (): Promise<{ priv: string; pub: string }> => {
  const ed = getSignatureProvider('Ed25519');
  const kp = await ed.generateKeyPair();
  return { priv: toBase64(kp.privateKey), pub: toBase64(kp.publicKey) };
};

describe('attestation', () => {
  it('loads a platform key and derives the public key when missing', async () => {
    const { priv, pub } = await buildPair();
    const loaded = await loadPlatformKey(priv, undefined);
    expect(toBase64(loaded.publicKey)).toBe(pub);
  });

  it('rejects malformed base64 private keys', async () => {
    await expect(loadPlatformKey('not!base64', undefined)).rejects.toThrow();
  });

  it('rejects private keys of the wrong length', async () => {
    const tooShort = toBase64(new Uint8Array(16));
    await expect(loadPlatformKey(tooShort, undefined)).rejects.toThrow();
  });

  it('round-trips a signed score envelope', async () => {
    const { priv } = await buildPair();
    const key = await loadPlatformKey(priv, undefined);
    const score: SignedScore = {
      did: 'did:key:z6MkExample',
      score: 642,
      scoreVersion: 'v1.0',
      computedAt: '2026-04-27T00:00:00.000Z',
    };
    const envelope = await signScore(score, key);
    expect(envelope.attestation.length).toBeGreaterThan(0);

    const result = await verifyScore(envelope, key.publicKey);
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered score field', async () => {
    const { priv } = await buildPair();
    const key = await loadPlatformKey(priv, undefined);
    const envelope = await signScore(
      {
        did: 'did:key:z6MkExample',
        score: 642,
        scoreVersion: 'v1.0',
        computedAt: '2026-04-27T00:00:00.000Z',
      },
      key,
    );

    const tampered = { ...envelope, score: 999 };
    const result = await verifyScore(tampered, key.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('rejects a signature produced with a different key', async () => {
    const a = await buildPair();
    const b = await buildPair();
    const keyA = await loadPlatformKey(a.priv, undefined);
    const keyB = await loadPlatformKey(b.priv, undefined);

    const envelope = await signScore(
      {
        did: 'did:key:z6MkExample',
        score: 1,
        scoreVersion: 'v1.0',
        computedAt: '2026-04-27T00:00:00.000Z',
      },
      keyA,
    );
    const result = await verifyScore(envelope, keyB.publicKey);
    expect(result.valid).toBe(false);
  });

  it('rejects a malformed attestation', async () => {
    const { priv } = await buildPair();
    const key = await loadPlatformKey(priv, undefined);
    const result = await verifyScore(
      {
        did: 'did:key:z6MkExample',
        score: 1,
        scoreVersion: 'v1.0',
        computedAt: '2026-04-27T00:00:00.000Z',
        attestation: 'not!base64',
      },
      key.publicKey,
    );
    expect(result.valid).toBe(false);
  });

  it('signs the JCS canonical form (key order in payload does not matter)', async () => {
    const { priv } = await buildPair();
    const key = await loadPlatformKey(priv, undefined);
    const sig1 = await signScore(
      { did: 'd', score: 1, scoreVersion: 'v1.0', computedAt: '2026-04-27T00:00:00.000Z' },
      key,
    );
    const sig2 = await signScore(
      // Different declaration order — JCS sorts keys, so the bytes (and thus
      // the signature) are identical.
      { computedAt: '2026-04-27T00:00:00.000Z', score: 1, did: 'd', scoreVersion: 'v1.0' },
      key,
    );
    expect(sig1.attestation).toBe(sig2.attestation);
  });

  it('signature has the expected ed25519 length (64 bytes)', async () => {
    const { priv } = await buildPair();
    const key = await loadPlatformKey(priv, undefined);
    const env = await signScore(
      { did: 'd', score: 0, scoreVersion: 'v1.0', computedAt: '2026-04-27T00:00:00.000Z' },
      key,
    );
    const sig = fromBase64(env.attestation);
    expect(sig.length).toBe(64);
  });
});
