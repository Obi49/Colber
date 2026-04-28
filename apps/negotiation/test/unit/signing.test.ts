import { getSignatureProvider, toBase64 } from '@praxis/core-crypto';
import { describe, expect, it } from 'vitest';

import { canonicalize, canonicalizeBytes } from '../../src/domain/canonical-json.js';
import { verifyProposalSignature, verifySettlementSignatures } from '../../src/domain/signing.js';

import type { Proposal } from '../../src/domain/negotiation-types.js';

const ed = getSignatureProvider('Ed25519');

describe('canonicalize (RFC 8785)', () => {
  it('produces stable bytes regardless of key order', () => {
    const a = canonicalize({ b: 2, a: 1, c: { z: 1, y: 2 } });
    const b = canonicalize({ a: 1, c: { y: 2, z: 1 }, b: 2 });
    expect(a).toBe(b);
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalize({ x: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalize({ x: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });

  it('rejects bigint, function, symbol', () => {
    expect(() => canonicalize({ x: 1n })).toThrow(/bigint/);
    expect(() => canonicalize({ x: () => 0 })).toThrow();
    expect(() => canonicalize({ x: Symbol('s') })).toThrow();
  });

  it('drops undefined object members but converts undefined array members to null', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalize([1, undefined, 3])).toBe('[1,null,3]');
  });

  it('detects circular graphs', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => canonicalize(cyclic)).toThrow(/Circular/);
  });

  it('canonicalizeBytes returns UTF-8 of canonical string', () => {
    const bytes = canonicalizeBytes({ a: 'hello' });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":"hello"}');
  });
});

describe('verifyProposalSignature', () => {
  it('accepts a valid Ed25519 signature over the canonical proposal', async () => {
    const kp = await ed.generateKeyPair();
    const partial = {
      proposalId: '11111111-1111-4111-8111-111111111111',
      fromDid: 'did:key:alice',
      amount: 200,
      proposedAt: '2026-04-28T10:01:00.000Z',
    } as const;
    const bytes = canonicalizeBytes(partial);
    const sig = await ed.sign(bytes, kp.privateKey);
    const proposal: Proposal = { ...partial, signature: toBase64(sig) };
    await expect(
      verifyProposalSignature(proposal, toBase64(kp.publicKey)),
    ).resolves.toBeUndefined();
  });

  it('rejects when the proposal has been tampered post-sign', async () => {
    const kp = await ed.generateKeyPair();
    const partial = {
      proposalId: '11111111-1111-4111-8111-111111111111',
      fromDid: 'did:key:alice',
      amount: 200,
      proposedAt: '2026-04-28T10:01:00.000Z',
    } as const;
    const bytes = canonicalizeBytes(partial);
    const sig = await ed.sign(bytes, kp.privateKey);
    const proposal: Proposal = { ...partial, amount: 999, signature: toBase64(sig) };
    await expect(verifyProposalSignature(proposal, toBase64(kp.publicKey))).rejects.toThrow(
      /signature verification failed/,
    );
  });

  it('rejects a wrong-length signature', async () => {
    const kp = await ed.generateKeyPair();
    const proposal: Proposal = {
      proposalId: '11111111-1111-4111-8111-111111111111',
      fromDid: 'did:key:alice',
      amount: 200,
      // base64 of "abc" — decodes to 3 bytes, not the 64 expected for Ed25519.
      signature: 'YWJj',
      proposedAt: '2026-04-28T10:01:00.000Z',
    };
    await expect(verifyProposalSignature(proposal, toBase64(kp.publicKey))).rejects.toThrow(
      /signature/,
    );
  });

  it('rejects a wrong-length public key', async () => {
    const kp = await ed.generateKeyPair();
    const partial = {
      proposalId: '11111111-1111-4111-8111-111111111111',
      fromDid: 'did:key:alice',
      amount: 200,
      proposedAt: '2026-04-28T10:01:00.000Z',
    } as const;
    const bytes = canonicalizeBytes(partial);
    const sig = await ed.sign(bytes, kp.privateKey);
    const proposal: Proposal = { ...partial, signature: toBase64(sig) };
    await expect(verifyProposalSignature(proposal, toBase64(new Uint8Array(16)))).rejects.toThrow(
      /public key/,
    );
  });
});

describe('verifySettlementSignatures', () => {
  it('verifies one signature per party', async () => {
    const aliceKp = await ed.generateKeyPair();
    const bobKp = await ed.generateKeyPair();
    const payload = {
      negotiationId: '11111111-1111-4111-8111-111111111111',
      winningProposalId: '22222222-2222-4222-8222-222222222222',
    } as const;
    const bytes = canonicalizeBytes(payload);
    const aliceSig = await ed.sign(bytes, aliceKp.privateKey);
    const bobSig = await ed.sign(bytes, bobKp.privateKey);
    const pks = new Map<string, string>([
      ['did:key:alice', toBase64(aliceKp.publicKey)],
      ['did:key:bob', toBase64(bobKp.publicKey)],
    ]);
    await expect(
      verifySettlementSignatures(
        payload,
        [
          { did: 'did:key:alice', signature: toBase64(aliceSig) },
          { did: 'did:key:bob', signature: toBase64(bobSig) },
        ],
        pks,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects when a signature is over a different payload', async () => {
    const kp = await ed.generateKeyPair();
    const fakeBytes = canonicalizeBytes({ different: 'payload' });
    const sig = await ed.sign(fakeBytes, kp.privateKey);
    const pks = new Map<string, string>([['did:key:alice', toBase64(kp.publicKey)]]);
    await expect(
      verifySettlementSignatures(
        {
          negotiationId: '11111111-1111-4111-8111-111111111111',
          winningProposalId: '22222222-2222-4222-8222-222222222222',
        },
        [{ did: 'did:key:alice', signature: toBase64(sig) }],
        pks,
      ),
    ).rejects.toThrow(/signature verification failed/);
  });

  it('rejects when a public key is missing for a signing did', async () => {
    const kp = await ed.generateKeyPair();
    const payload = {
      negotiationId: '11111111-1111-4111-8111-111111111111',
      winningProposalId: '22222222-2222-4222-8222-222222222222',
    } as const;
    const sig = await ed.sign(canonicalizeBytes(payload), kp.privateKey);
    await expect(
      verifySettlementSignatures(
        payload,
        [{ did: 'did:key:alice', signature: toBase64(sig) }],
        new Map(),
      ),
    ).rejects.toThrow(/Missing publicKey/);
  });
});
