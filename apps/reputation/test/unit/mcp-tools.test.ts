import { encodeDidKey, getSignatureProvider, toBase64 } from '@praxis/core-crypto';
import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { canonicalizeBytes } from '../../src/domain/canonical-json.js';
import { ReputationService } from '../../src/domain/reputation-service.js';
import { buildReputationMcpRegistry } from '../../src/mcp/tools.js';
import { InMemoryScoreCache } from '../fakes/in-memory-cache.js';
import { InMemoryFeedbackRepository } from '../fakes/in-memory-feedback-repo.js';
import { InMemoryGraphRepository } from '../fakes/in-memory-graph-repo.js';
import { InMemorySnapshotRepository } from '../fakes/in-memory-snapshot-repo.js';
import { StubIdentityResolver } from '../fakes/stub-identity-resolver.js';

const ed = getSignatureProvider('Ed25519');

const buildService = async (): Promise<ReputationService> => {
  const platformKp = await ed.generateKeyPair();
  const service = new ReputationService(
    new InMemoryGraphRepository(),
    new InMemorySnapshotRepository(),
    new InMemoryFeedbackRepository(),
    new InMemoryScoreCache(),
    new StubIdentityResolver(),
    {
      scoring: { txDelta: 10, negFeedbackPenalty: 40, decayDays: 90 },
      cacheTtlSeconds: 60,
      platformPrivateKeyB64: toBase64(platformKp.privateKey),
      platformPublicKeyB64: undefined,
    },
  );
  await service.init();
  return service;
};

describe('MCP tools (reputation)', () => {
  it('exposes the four required tools', async () => {
    const reg = buildReputationMcpRegistry(await buildService());
    const names = reg
      .list()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual([
      'reputation.feedback',
      'reputation.history',
      'reputation.score',
      'reputation.verify',
    ]);
  });

  it('round-trips reputation.score → reputation.verify', async () => {
    const service = await buildService();
    const reg = buildReputationMcpRegistry(service);

    const env = (await reg.invoke(
      'reputation.score',
      { agentDid: 'did:key:z6MkAgent' },
      { traceId: 'trace-1' },
    )) as {
      did: string;
      score: number;
      attestation: string;
      scoreVersion: string;
      computedAt: string;
    };

    const verified = (await reg.invoke(
      'reputation.verify',
      {
        score: {
          did: env.did,
          score: env.score,
          scoreVersion: env.scoreVersion,
          computedAt: env.computedAt,
        },
        attestation: env.attestation,
      },
      { traceId: 'trace-2' },
    )) as { valid: boolean };
    expect(verified.valid).toBe(true);
  });

  it('accepts a signed feedback via reputation.feedback', async () => {
    const service = await buildService();
    const reg = buildReputationMcpRegistry(service);

    const issuerKp = await ed.generateKeyPair();
    const targetKp = await ed.generateKeyPair();
    const fromDid = encodeDidKey(issuerKp.publicKey, 'Ed25519');
    const toDid = encodeDidKey(targetKp.publicKey, 'Ed25519');

    const feedbackId = uuidv4();
    const txId = 'tx-mcp';
    const rating = 5;
    const dimensions = { delivery: 5, quality: 5, communication: 5 };
    const signedAt = new Date().toISOString();

    const sig = await ed.sign(
      canonicalizeBytes({
        feedbackId,
        fromDid,
        toDid,
        txId,
        rating,
        dimensions,
        signedAt,
      }),
      issuerKp.privateKey,
    );

    const result = (await reg.invoke(
      'reputation.feedback',
      {
        feedbackId,
        fromDid,
        toDid,
        txId,
        rating,
        dimensions,
        signedAt,
        signature: toBase64(sig),
      },
      { traceId: 'trace-3' },
    )) as { accepted: boolean; idempotent: boolean };
    expect(result.accepted).toBe(true);
    expect(result.idempotent).toBe(false);
  });

  it('returns a paginated history page for an unseen agent', async () => {
    const service = await buildService();
    const reg = buildReputationMcpRegistry(service);
    const page = (await reg.invoke(
      'reputation.history',
      { agentDid: 'did:key:z6MkUnknown' },
      { traceId: 'trace-4' },
    )) as { transactions: unknown[]; feedbacksReceived: unknown[]; nextCursor: string | null };
    expect(page.transactions).toEqual([]);
    expect(page.feedbacksReceived).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});
