import { describe, expect, it } from 'vitest';

import { ED25519_CONSTANTS, getSignatureProvider } from './ed25519.js';

describe('Ed25519 provider', () => {
  const provider = getSignatureProvider('Ed25519');

  it('generates keypairs of the correct size', async () => {
    const kp = await provider.generateKeyPair();
    expect(kp.scheme).toBe('Ed25519');
    expect(kp.publicKey.length).toBe(ED25519_CONSTANTS.PUBLIC_KEY_BYTES);
    expect(kp.privateKey.length).toBe(ED25519_CONSTANTS.PRIVATE_KEY_BYTES);
  });

  it('signs and verifies a message', async () => {
    const kp = await provider.generateKeyPair();
    const msg = new TextEncoder().encode('hello praxis');
    const sig = await provider.sign(msg, kp.privateKey);
    expect(sig.length).toBe(ED25519_CONSTANTS.SIGNATURE_BYTES);

    const result = await provider.verify(msg, sig, kp.publicKey);
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered message', async () => {
    const kp = await provider.generateKeyPair();
    const msg = new TextEncoder().encode('hello praxis');
    const sig = await provider.sign(msg, kp.privateKey);

    const tampered = new TextEncoder().encode('hello praxis!');
    const result = await provider.verify(tampered, sig, kp.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('rejects a wrong public key', async () => {
    const kpA = await provider.generateKeyPair();
    const kpB = await provider.generateKeyPair();
    const msg = new TextEncoder().encode('hello');
    const sig = await provider.sign(msg, kpA.privateKey);

    const result = await provider.verify(msg, sig, kpB.publicKey);
    expect(result.valid).toBe(false);
  });

  it('returns structured failure on malformed inputs', async () => {
    const kp = await provider.generateKeyPair();
    const msg = new TextEncoder().encode('x');

    const wrongPubKeyLen = await provider.verify(msg, new Uint8Array(64), new Uint8Array(10));
    expect(wrongPubKeyLen.valid).toBe(false);
    expect(wrongPubKeyLen.reason).toBe('invalid_public_key_length');

    const wrongSigLen = await provider.verify(msg, new Uint8Array(10), kp.publicKey);
    expect(wrongSigLen.valid).toBe(false);
    expect(wrongSigLen.reason).toBe('invalid_signature_length');
  });

  it('throws on signing with wrong private key length', async () => {
    await expect(provider.sign(new Uint8Array([1, 2, 3]), new Uint8Array(10))).rejects.toThrow(
      /Invalid Ed25519 private key length/,
    );
  });

  it('Secp256k1 is not yet implemented', () => {
    expect(() => getSignatureProvider('Secp256k1')).toThrow(/not implemented yet/);
  });
});
