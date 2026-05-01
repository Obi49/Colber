import { encodeDidKey, getSignatureProvider, toBase64 } from '@colber/core-crypto';
import { ERROR_CODES } from '@colber/core-types';
import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { canonicalizeBytes } from '../../src/domain/canonical-json.js';
import { ReputationService } from '../../src/domain/reputation-service.js';
import { SCORE_BASE, SCORE_VERSION } from '../../src/domain/scoring/v1.js';
import { InMemoryScoreCache } from '../fakes/in-memory-cache.js';
import { InMemoryFeedbackRepository } from '../fakes/in-memory-feedback-repo.js';
import { InMemoryGraphRepository } from '../fakes/in-memory-graph-repo.js';
import { InMemorySnapshotRepository } from '../fakes/in-memory-snapshot-repo.js';
import { StubIdentityResolver } from '../fakes/stub-identity-resolver.js';

import type { ReputationServiceConfig } from '../../src/domain/reputation-service.js';

const ed = getSignatureProvider('Ed25519');

const buildPlatformKey = async (): Promise<{ privateKey: string }> => {
  const kp = await ed.generateKeyPair();
  return { privateKey: toBase64(kp.privateKey) };
};

const buildAgent = async (): Promise<{
  did: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> => {
  const kp = await ed.generateKeyPair();
  const did = encodeDidKey(kp.publicKey, 'Ed25519');
  return { did, publicKey: kp.publicKey, privateKey: kp.privateKey };
};

const NOW = new Date('2026-04-27T00:00:00.000Z');

const makeService = async (overrides: Partial<ReputationServiceConfig> = {}) => {
  const platform = await buildPlatformKey();
  const cfg: ReputationServiceConfig = {
    scoring: { txDelta: 10, negFeedbackPenalty: 40, decayDays: 90 },
    cacheTtlSeconds: 60,
    platformPrivateKeyB64: platform.privateKey,
    platformPublicKeyB64: undefined,
    ...overrides,
  };
  const graph = new InMemoryGraphRepository();
  const snapshots = new InMemorySnapshotRepository();
  const feedbacks = new InMemoryFeedbackRepository();
  const cache = new InMemoryScoreCache();
  const identity = new StubIdentityResolver();
  const service = new ReputationService(
    graph,
    snapshots,
    feedbacks,
    cache,
    identity,
    cfg,
    () => NOW,
  );
  await service.init();
  return { service, graph, snapshots, feedbacks, cache, identity };
};

describe('ReputationService.getScore', () => {
  it('returns a base score envelope for a fresh agent (graph node missing)', async () => {
    const { service } = await makeService();
    const env = await service.getScore('did:key:z6MkUnknown');
    expect(env.score).toBe(SCORE_BASE);
    expect(env.scoreVersion).toBe(SCORE_VERSION);
    expect(env.attestation.length).toBeGreaterThan(0);
  });

  it('signs the envelope so reputation.verify passes', async () => {
    const { service } = await makeService();
    const env = await service.getScore('did:key:z6MkUnknown');
    const result = await service.verify(env);
    expect(result.valid).toBe(true);
  });

  it('persists a snapshot row + caches the envelope', async () => {
    const { service, snapshots, cache } = await makeService();
    await service.getScore('did:key:z6MkSomeone');
    expect(snapshots.snapshots).toHaveLength(1);
    expect(cache.size()).toBe(1);
  });

  it('serves cached envelope on the second read', async () => {
    const { service, snapshots } = await makeService();
    const a = await service.getScore('did:key:z6MkA');
    const b = await service.getScore('did:key:z6MkA');
    expect(b.attestation).toBe(a.attestation);
    expect(snapshots.snapshots).toHaveLength(1);
  });

  it('rewards a successful transaction with the expected delta', async () => {
    const { service, graph } = await makeService();
    const did = 'did:key:z6MkAgent';
    graph.seedAgent(did);
    graph.seedTransaction({
      txId: 'tx-1',
      buyerDid: did,
      sellerDid: 'did:key:z6MkOther',
      completedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    });
    const env = await service.getScore(did);
    expect(env.score).toBe(SCORE_BASE + 10);
  });

  it('penalises agents who received negative feedbacks', async () => {
    const { service, graph } = await makeService();
    const did = 'did:key:z6MkBadActor';
    graph.seedAgent(did);
    graph.seedFeedback({
      feedbackId: uuidv4(),
      fromDid: 'did:key:z6MkRater',
      toDid: did,
      txId: 'tx-1',
      rating: 1,
      signedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    });
    const env = await service.getScore(did);
    expect(env.score).toBe(SCORE_BASE - 40);
  });
});

describe('ReputationService.verify', () => {
  it('rejects a tampered attestation envelope', async () => {
    const { service } = await makeService();
    const env = await service.getScore('did:key:z6MkA');
    const tampered = { ...env, score: env.score + 100 };
    const result = await service.verify(tampered);
    expect(result.valid).toBe(false);
  });
});

describe('ReputationService.submitFeedback', () => {
  const buildSignedFeedback = async (issuer: {
    did: string;
    privateKey: Uint8Array;
  }): Promise<{
    feedbackId: string;
    fromDid: string;
    toDid: string;
    txId: string;
    rating: number;
    dimensions: { delivery: number; quality: number; communication: number };
    signedAt: string;
    signature: string;
  }> => {
    const target = await buildAgent();
    const feedbackId = uuidv4();
    const txId = `tx-${feedbackId.slice(0, 8)}`;
    const rating = 5;
    const dimensions = { delivery: 5, quality: 5, communication: 5 };
    const signedAt = NOW.toISOString();
    const payload = canonicalizeBytes({
      feedbackId,
      fromDid: issuer.did,
      toDid: target.did,
      txId,
      rating,
      dimensions,
      signedAt,
    });
    const sig = await ed.sign(payload, issuer.privateKey);
    return {
      feedbackId,
      fromDid: issuer.did,
      toDid: target.did,
      txId,
      rating,
      dimensions,
      signedAt,
      signature: toBase64(sig),
    };
  };

  it('accepts a valid signed feedback', async () => {
    const { service } = await makeService();
    const issuer = await buildAgent();
    const fb = await buildSignedFeedback(issuer);
    const result = await service.submitFeedback(fb);
    expect(result.accepted).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.feedbackId).toBe(fb.feedbackId);
  });

  it('is idempotent on the same feedbackId', async () => {
    const { service } = await makeService();
    const issuer = await buildAgent();
    const fb = await buildSignedFeedback(issuer);
    await service.submitFeedback(fb);
    const second = await service.submitFeedback(fb);
    expect(second.accepted).toBe(true);
    expect(second.idempotent).toBe(true);
  });

  it('returns CONFLICT on the same (from, to, tx) with a fresh feedbackId', async () => {
    const { service } = await makeService();
    const issuer = await buildAgent();
    const fb = await buildSignedFeedback(issuer);
    await service.submitFeedback(fb);

    // Build a *new* feedbackId reusing the (fromDid, toDid, txId) triple.
    const dupFeedbackId = uuidv4();
    const payload = canonicalizeBytes({
      feedbackId: dupFeedbackId,
      fromDid: fb.fromDid,
      toDid: fb.toDid,
      txId: fb.txId,
      rating: 4,
      dimensions: fb.dimensions,
      signedAt: NOW.toISOString(),
    });
    const sig = await ed.sign(payload, issuer.privateKey);
    await expect(
      service.submitFeedback({
        feedbackId: dupFeedbackId,
        fromDid: fb.fromDid,
        toDid: fb.toDid,
        txId: fb.txId,
        rating: 4,
        dimensions: fb.dimensions,
        signedAt: NOW.toISOString(),
        signature: toBase64(sig),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT });
  });

  it('rejects a feedback with a bad signature', async () => {
    const { service } = await makeService();
    const issuer = await buildAgent();
    const fb = await buildSignedFeedback(issuer);
    await expect(
      service.submitFeedback({
        ...fb,
        rating: 1, // payload is signed for rating=5; tampering invalidates it
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_SIGNATURE });
  });

  it('rejects a feedback signed by a different key than the fromDid implies', async () => {
    const { service } = await makeService();
    const issuer = await buildAgent();
    const stranger = await buildAgent();
    const target = await buildAgent();
    const feedbackId = uuidv4();
    const payload = canonicalizeBytes({
      feedbackId,
      fromDid: issuer.did,
      toDid: target.did,
      txId: 'tx-1',
      rating: 5,
      dimensions: { delivery: 5, quality: 5, communication: 5 },
      signedAt: NOW.toISOString(),
    });
    const sigByStranger = await ed.sign(payload, stranger.privateKey);
    await expect(
      service.submitFeedback({
        feedbackId,
        fromDid: issuer.did,
        toDid: target.did,
        txId: 'tx-1',
        rating: 5,
        dimensions: { delivery: 5, quality: 5, communication: 5 },
        signedAt: NOW.toISOString(),
        signature: toBase64(sigByStranger),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_SIGNATURE });
  });

  it('rejects a feedback whose fromDid cannot be resolved', async () => {
    const { service, identity } = await makeService();
    void identity; // resolver only returns null for non-did:key DIDs
    await expect(
      service.submitFeedback({
        feedbackId: uuidv4(),
        fromDid: 'did:web:unknown.example',
        toDid: 'did:key:z6MkAnything',
        txId: 'tx-1',
        rating: 5,
        dimensions: { delivery: 5, quality: 5, communication: 5 },
        signedAt: NOW.toISOString(),
        signature: toBase64(new Uint8Array(64)),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.DID_NOT_FOUND });
  });

  it('rejects out-of-range ratings', async () => {
    const { service } = await makeService();
    const issuer = await buildAgent();
    const fb = await buildSignedFeedback(issuer);
    await expect(service.submitFeedback({ ...fb, rating: 0 })).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
    });
  });

  it('counts the negative feedback in the next score read', async () => {
    const { service } = await makeService();
    const issuer = await buildAgent();
    const target = await buildAgent();
    const feedbackId = uuidv4();
    const dimensions = { delivery: 1, quality: 1, communication: 1 };
    const txId = 'tx-neg';
    const signedAt = NOW.toISOString();
    const payload = canonicalizeBytes({
      feedbackId,
      fromDid: issuer.did,
      toDid: target.did,
      txId,
      rating: 1,
      dimensions,
      signedAt,
    });
    const sig = await ed.sign(payload, issuer.privateKey);
    await service.submitFeedback({
      feedbackId,
      fromDid: issuer.did,
      toDid: target.did,
      txId,
      rating: 1,
      dimensions,
      signedAt,
      signature: toBase64(sig),
    });

    const env = await service.getScore(target.did);
    expect(env.score).toBe(SCORE_BASE - 40);
  });
});

describe('ReputationService.getHistory', () => {
  it('returns paginated transactions and feedbacks', async () => {
    const { service, graph } = await makeService();
    const did = 'did:key:z6MkAgent';
    graph.seedAgent(did);
    graph.seedTransaction({
      txId: 'tx-1',
      buyerDid: did,
      sellerDid: 'did:key:z6MkBuyer',
      completedAt: new Date(NOW.getTime() - 1000),
    });
    graph.seedFeedback({
      feedbackId: uuidv4(),
      fromDid: 'did:key:z6MkBuyer',
      toDid: did,
      txId: 'tx-1',
      rating: 4,
      signedAt: new Date(NOW.getTime() - 500),
    });
    const page = await service.getHistory(did, { limit: 50, cursor: null });
    expect(page.transactions).toHaveLength(1);
    expect(page.feedbacksReceived).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
