import { isDidKey } from '@praxis/core-types';
import { describe, expect, it } from 'vitest';

import { decodeDidKey, encodeDidKey } from './did-key.js';
import { getSignatureProvider } from './ed25519.js';

describe('did:key', () => {
  it('encodes an Ed25519 public key into a valid did:key string', async () => {
    const provider = getSignatureProvider('Ed25519');
    const kp = await provider.generateKeyPair();
    const did = encodeDidKey(kp.publicKey, 'Ed25519');
    expect(isDidKey(did)).toBe(true);
  });

  it('round-trips encode/decode', async () => {
    const provider = getSignatureProvider('Ed25519');
    const kp = await provider.generateKeyPair();
    const did = encodeDidKey(kp.publicKey, 'Ed25519');
    const decoded = decodeDidKey(did);
    expect(decoded.scheme).toBe('Ed25519');
    expect(Array.from(decoded.publicKey)).toEqual(Array.from(kp.publicKey));
  });

  it('throws on non-did:key prefix', () => {
    expect(() => decodeDidKey('did:web:example.com')).toThrow(/Not a did:key/);
  });

  it('throws on invalid multibase prefix', () => {
    expect(() => decodeDidKey('did:key:fdeadbeef')).toThrow(/Unsupported multibase/);
  });

  it('throws on truncated payload', () => {
    expect(() => decodeDidKey('did:key:z')).toThrow(/too short/);
  });
});
