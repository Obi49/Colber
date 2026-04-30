import { describe, expect, it } from 'vitest';

import { generateDidKey } from '../../src/crypto/did-key.js';
import { canonicalizeJcs } from '../../src/crypto/jcs.js';
import { signMessage, verifySignature } from '../../src/crypto/signing.js';

describe('Ed25519 sign / verify (base64-on-the-wire)', () => {
  it('round-trip: sign → verify succeeds', async () => {
    const { publicKeyBase64, secretKeyBase64 } = await generateDidKey();
    const message = new TextEncoder().encode('hello praxis');
    const sig = await signMessage(secretKeyBase64, message);
    const ok = await verifySignature(publicKeyBase64, message, sig);
    expect(ok).toBe(true);
  });

  it('signs over a string transparently (UTF-8 encoded)', async () => {
    const { publicKeyBase64, secretKeyBase64 } = await generateDidKey();
    const sig = await signMessage(secretKeyBase64, 'hello');
    expect(await verifySignature(publicKeyBase64, 'hello', sig)).toBe(true);
  });

  it('returns false on a tampered message (1-byte flip)', async () => {
    const { publicKeyBase64, secretKeyBase64 } = await generateDidKey();
    const sig = await signMessage(secretKeyBase64, 'hello praxis');
    const ok = await verifySignature(publicKeyBase64, 'hello praxis!', sig);
    expect(ok).toBe(false);
  });

  it('returns false on a wrong public key', async () => {
    const a = await generateDidKey();
    const b = await generateDidKey();
    const sig = await signMessage(a.secretKeyBase64, 'hello');
    expect(await verifySignature(b.publicKeyBase64, 'hello', sig)).toBe(false);
  });

  it('returns false on malformed inputs (wrong length, bad base64)', async () => {
    const { publicKeyBase64 } = await generateDidKey();
    expect(await verifySignature(publicKeyBase64, 'hello', 'not-base64-at-all!@#')).toBe(false);
    expect(await verifySignature('AAA=', 'hello', 'AAA=')).toBe(false);
  });

  it('throws on a wrong-length secret key', async () => {
    // Base64 of 16 zero bytes — half the expected length.
    const shortSecret = Buffer.from(new Uint8Array(16)).toString('base64');
    await expect(signMessage(shortSecret, 'x')).rejects.toThrow(/secret key length/);
  });

  it('signs a JCS-canonical payload and verifies it (the platform pattern)', async () => {
    const { publicKeyBase64, secretKeyBase64 } = await generateDidKey();
    const payload = {
      did: 'did:key:z6Mkfoo',
      score: 510,
      scoreVersion: 'v1.0',
      computedAt: '2026-04-30T00:00:00.000Z',
    };
    const canon = canonicalizeJcs(payload);
    const sig = await signMessage(secretKeyBase64, canon);
    expect(await verifySignature(publicKeyBase64, canon, sig)).toBe(true);

    // A different field order canonicalizes identically — same signature works.
    const reordered = {
      computedAt: '2026-04-30T00:00:00.000Z',
      scoreVersion: 'v1.0',
      score: 510,
      did: 'did:key:z6Mkfoo',
    };
    expect(await verifySignature(publicKeyBase64, canonicalizeJcs(reordered), sig)).toBe(true);
  });
});
