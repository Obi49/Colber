/**
 * REST integration tests using fastify's `inject` (no real HTTP socket needed).
 * Uses the in-memory fakes — no real DB / Neo4j / Redis connection.
 */
import { encodeDidKey, getSignatureProvider, toBase64 } from '@praxis/core-crypto';
import { createLogger, type Logger } from '@praxis/core-logger';
import { ERROR_CODES } from '@praxis/core-types';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canonicalizeBytes } from '../../src/domain/canonical-json.js';
import { ReputationService } from '../../src/domain/reputation-service.js';
import { buildApp } from '../../src/http/app.js';
import { InMemoryScoreCache } from '../fakes/in-memory-cache.js';
import { InMemoryFeedbackRepository } from '../fakes/in-memory-feedback-repo.js';
import { InMemoryGraphRepository } from '../fakes/in-memory-graph-repo.js';
import { InMemorySnapshotRepository } from '../fakes/in-memory-snapshot-repo.js';
import { StubIdentityResolver } from '../fakes/stub-identity-resolver.js';

import type { DbClient, Database } from '../../src/db/client.js';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';

interface OkEnvelope<T> {
  ok: true;
  data: T;
}
interface ErrEnvelope {
  ok: false;
  error: { code: string; message: string };
}
type Envelope<T> = OkEnvelope<T> | ErrEnvelope;
interface ScoreData {
  did: string;
  score: number;
  scoreVersion: string;
  computedAt: string;
  attestation: string;
}
interface VerifyData {
  valid: boolean;
  reason?: string;
}
interface FeedbackData {
  accepted: boolean;
  idempotent: boolean;
  feedbackId: string;
}
interface HistoryData {
  did: string;
  transactions: unknown[];
  feedbacksReceived: unknown[];
  feedbacksIssued: unknown[];
  nextCursor: string | null;
}

const fakeDbClient = (alive = true): DbClient => ({
  db: {} as unknown as Database,
  sql: {} as unknown as Sql,
  close: () => Promise.resolve(),
  ping: () => (alive ? Promise.resolve() : Promise.reject(new Error('db down'))),
});

const ed = getSignatureProvider('Ed25519');

describe('REST /v1/reputation/*', () => {
  let app: FastifyInstance;
  let logger: Logger;
  let graph: InMemoryGraphRepository;

  beforeEach(async () => {
    const platformKp = await ed.generateKeyPair();
    graph = new InMemoryGraphRepository();
    const snapshots = new InMemorySnapshotRepository();
    const feedbacks = new InMemoryFeedbackRepository();
    const cache = new InMemoryScoreCache();
    const identity = new StubIdentityResolver();
    const service = new ReputationService(graph, snapshots, feedbacks, cache, identity, {
      scoring: { txDelta: 10, negFeedbackPenalty: 40, decayDays: 90 },
      cacheTtlSeconds: 60,
      platformPrivateKeyB64: toBase64(platformKp.privateKey),
      platformPublicKeyB64: undefined,
    });
    await service.init();

    logger = createLogger({ serviceName: 'reputation-test', level: 'silent' });
    app = await buildApp({
      logger,
      dbClient: fakeDbClient(),
      graphRepo: graph,
      cache,
      reputationService: service,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /healthz returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz returns 200 when all dependencies are healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ready',
      checks: { database: 'ok', graph: 'ok', cache: 'ok' },
    });
  });

  it('GET /metrics exposes Prometheus metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/^# HELP/m);
  });

  it('GET /v1/reputation/score/:agentDid returns a signed envelope', async () => {
    const did = 'did:key:z6MkA';
    const res = await app.inject({
      method: 'GET',
      url: `/v1/reputation/score/${encodeURIComponent(did)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<ScoreData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.did).toBe(did);
    expect(body.data.score).toBeGreaterThanOrEqual(0);
    expect(body.data.score).toBeLessThanOrEqual(1000);
    expect(body.data.attestation).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('POST /v1/reputation/verify accepts the envelope it just issued', async () => {
    const did = 'did:key:z6MkA';
    const scored = await app.inject({
      method: 'GET',
      url: `/v1/reputation/score/${encodeURIComponent(did)}`,
    });
    const body = scored.json<Envelope<ScoreData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    const env = body.data;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reputation/verify',
      payload: {
        score: {
          did: env.did,
          score: env.score,
          scoreVersion: env.scoreVersion,
          computedAt: env.computedAt,
        },
        attestation: env.attestation,
      },
    });
    expect(res.statusCode).toBe(200);
    const verified = res.json<Envelope<VerifyData>>();
    if (!verified.ok) {
      throw new Error('expected ok envelope');
    }
    expect(verified.data.valid).toBe(true);
  });

  it('POST /v1/reputation/verify rejects a tampered score', async () => {
    const did = 'did:key:z6MkA';
    const scored = await app.inject({
      method: 'GET',
      url: `/v1/reputation/score/${encodeURIComponent(did)}`,
    });
    const body = scored.json<Envelope<ScoreData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    const env = body.data;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reputation/verify',
      payload: {
        score: {
          did: env.did,
          score: env.score + 100,
          scoreVersion: env.scoreVersion,
          computedAt: env.computedAt,
        },
        attestation: env.attestation,
      },
    });
    expect(res.statusCode).toBe(200);
    const verified = res.json<Envelope<VerifyData>>();
    if (!verified.ok) {
      throw new Error('expected ok envelope');
    }
    expect(verified.data.valid).toBe(false);
  });

  it('POST /v1/reputation/feedback accepts a valid signed feedback', async () => {
    const issuerKp = await ed.generateKeyPair();
    const targetKp = await ed.generateKeyPair();
    const fromDid = encodeDidKey(issuerKp.publicKey, 'Ed25519');
    const toDid = encodeDidKey(targetKp.publicKey, 'Ed25519');
    const feedbackId = uuidv4();
    const txId = 'tx-rest-1';
    const dimensions = { delivery: 5, quality: 5, communication: 5 };
    const signedAt = new Date().toISOString();
    const payload = canonicalizeBytes({
      feedbackId,
      fromDid,
      toDid,
      txId,
      rating: 5,
      dimensions,
      signedAt,
    });
    const sig = await ed.sign(payload, issuerKp.privateKey);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reputation/feedback',
      payload: {
        feedbackId,
        fromDid,
        toDid,
        txId,
        rating: 5,
        dimensions,
        signedAt,
        signature: toBase64(sig),
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<Envelope<FeedbackData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.accepted).toBe(true);
    expect(body.data.idempotent).toBe(false);
  });

  it('POST /v1/reputation/feedback returns 200 idempotent on resubmit', async () => {
    const issuerKp = await ed.generateKeyPair();
    const targetKp = await ed.generateKeyPair();
    const fromDid = encodeDidKey(issuerKp.publicKey, 'Ed25519');
    const toDid = encodeDidKey(targetKp.publicKey, 'Ed25519');
    const feedbackId = uuidv4();
    const txId = 'tx-rest-2';
    const dimensions = { delivery: 4, quality: 4, communication: 4 };
    const signedAt = new Date().toISOString();
    const payload = canonicalizeBytes({
      feedbackId,
      fromDid,
      toDid,
      txId,
      rating: 4,
      dimensions,
      signedAt,
    });
    const sig = await ed.sign(payload, issuerKp.privateKey);
    const reqBody = {
      feedbackId,
      fromDid,
      toDid,
      txId,
      rating: 4,
      dimensions,
      signedAt,
      signature: toBase64(sig),
    };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/reputation/feedback',
      payload: reqBody,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/reputation/feedback',
      payload: reqBody,
    });
    expect(second.statusCode).toBe(200);
    const body = second.json<Envelope<FeedbackData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.idempotent).toBe(true);
  });

  it('POST /v1/reputation/feedback rejects an invalid signature with 400', async () => {
    const issuerKp = await ed.generateKeyPair();
    const targetKp = await ed.generateKeyPair();
    const fromDid = encodeDidKey(issuerKp.publicKey, 'Ed25519');
    const toDid = encodeDidKey(targetKp.publicKey, 'Ed25519');
    const feedbackId = uuidv4();
    // Sign over different payload than what we will send.
    const sig = await ed.sign(canonicalizeBytes({ different: 'bytes' }), issuerKp.privateKey);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reputation/feedback',
      payload: {
        feedbackId,
        fromDid,
        toDid,
        txId: 'tx-rest-3',
        rating: 5,
        dimensions: { delivery: 5, quality: 5, communication: 5 },
        signedAt: new Date().toISOString(),
        signature: toBase64(sig),
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<Envelope<FeedbackData>>();
    if (body.ok) {
      throw new Error('expected error envelope');
    }
    expect(body.error.code).toBe(ERROR_CODES.INVALID_SIGNATURE);
  });

  it('POST /v1/reputation/feedback returns 400 on schema violation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reputation/feedback',
      payload: { rating: 99 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<Envelope<FeedbackData>>();
    if (body.ok) {
      throw new Error('expected error envelope');
    }
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('GET /v1/reputation/history/:agentDid returns paginated history', async () => {
    const did = 'did:key:z6MkAgent';
    graph.seedAgent(did);
    graph.seedTransaction({
      txId: 'tx-h1',
      buyerDid: did,
      sellerDid: 'did:key:z6MkOther',
      completedAt: new Date(Date.now() - 1000),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/reputation/history/${encodeURIComponent(did)}?limit=10`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<HistoryData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.did).toBe(did);
    expect(body.data.transactions).toHaveLength(1);
  });
});
