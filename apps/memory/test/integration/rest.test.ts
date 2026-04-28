/**
 * REST integration tests using fastify's `inject` (no real HTTP socket needed).
 * Uses the in-memory fakes — no real Postgres / Qdrant / Ollama connection.
 */
import { randomBytes } from 'node:crypto';

import { createLogger, type Logger } from '@praxis/core-logger';
import { ERROR_CODES } from '@praxis/core-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AesGcmEncryptionService } from '../../src/domain/encryption.js';
import { MemoryService } from '../../src/domain/memory-service.js';
import { DeterministicStubProvider } from '../../src/embeddings/stub.js';
import { buildApp } from '../../src/http/app.js';
import { InMemoryMemoryRepository } from '../fakes/in-memory-memory-repo.js';
import { InMemoryVectorRepository } from '../fakes/in-memory-vector-repo.js';
import { StubOperatorResolver } from '../fakes/stub-operator-resolver.js';

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

interface StoreData {
  id: string;
  embedding: { model: string; dim: number };
}
interface SearchData {
  hits: { id: string; ownerDid: string; type: string; snippet: string; score: number }[];
}
interface UpdateData {
  id: string;
  version: number;
  embedding: { model: string; dim: number };
}
interface ShareData {
  id: string;
  sharedWith: string[];
}
interface MemoryData {
  id: string;
  ownerDid: string;
  type: string;
  text: string;
  payload: Record<string, unknown>;
  permissions: { visibility: string; sharedWith: string[] };
  encryption: { enabled: boolean };
  version: number;
}

const fakeDbClient = (alive = true): DbClient => ({
  db: {} as unknown as Database,
  sql: {} as unknown as Sql,
  close: () => Promise.resolve(),
  ping: () => (alive ? Promise.resolve() : Promise.reject(new Error('db down'))),
});

const NOW = new Date('2026-04-27T00:00:00.000Z');

describe('REST /v1/memory*', () => {
  let app: FastifyInstance;
  let logger: Logger;
  let vectors: InMemoryVectorRepository;
  let embeddings: DeterministicStubProvider;

  beforeEach(async () => {
    const repo = new InMemoryMemoryRepository();
    vectors = new InMemoryVectorRepository();
    embeddings = new DeterministicStubProvider(64, 'praxis-stub-v1');
    const encryption = new AesGcmEncryptionService({
      keyB64: randomBytes(32).toString('base64'),
    });
    const operators = new StubOperatorResolver();
    const service = new MemoryService(
      repo,
      vectors,
      embeddings,
      encryption,
      operators,
      { maxVersions: 100 },
      () => NOW,
    );
    await service.init();

    logger = createLogger({ serviceName: 'memory-test', level: 'silent' });
    app = await buildApp({
      logger,
      dbClient: fakeDbClient(),
      vectors,
      embeddings,
      memoryService: service,
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
      checks: { database: 'ok', vectors: 'ok', embeddings: 'ok' },
    });
  });

  it('GET /metrics exposes Prometheus metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/^# HELP/m);
  });

  it('POST /v1/memory creates a memory and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'EU procurement preference',
        permissions: { visibility: 'private' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<Envelope<StoreData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.embedding.dim).toBe(64);
  });

  it('POST /v1/memory rejects an unknown visibility with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'x',
        permissions: { visibility: 'omniscient' },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<Envelope<StoreData>>();
    if (body.ok) {
      throw new Error('expected error envelope');
    }
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('POST /v1/memory/search returns top-k visible hits', async () => {
    const stored = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'unique-search-token-xyz',
        permissions: { visibility: 'public' },
      },
    });
    expect(stored.statusCode).toBe(201);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/memory/search',
      payload: {
        queryDid: 'did:key:bob',
        queryText: 'unique-search-token-xyz',
        topK: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<SearchData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.hits).toHaveLength(1);
    expect(body.data.hits[0]?.snippet).toContain('unique-search-token-xyz');
  });

  it('GET /v1/memory/:id returns the full record for the owner', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'preference',
        text: 'private taste',
        payload: { tag: 'food' },
        permissions: { visibility: 'private' },
      },
    });
    const createBody = created.json<Envelope<StoreData>>();
    if (!createBody.ok) {
      throw new Error('store failed');
    }
    const res = await app.inject({
      method: 'GET',
      url: `/v1/memory/${createBody.data.id}?callerDid=${encodeURIComponent('did:key:alice')}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<MemoryData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.text).toBe('private taste');
    expect(body.data.payload).toEqual({ tag: 'food' });
  });

  it('GET /v1/memory/:id returns 403 for unauthorised callers', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'private',
        permissions: { visibility: 'private' },
      },
    });
    const createBody = created.json<Envelope<StoreData>>();
    if (!createBody.ok) {
      throw new Error('store failed');
    }
    const res = await app.inject({
      method: 'GET',
      url: `/v1/memory/${createBody.data.id}?callerDid=${encodeURIComponent('did:key:bob')}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH /v1/memory/:id updates the text and bumps the version', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'first',
        permissions: { visibility: 'private' },
      },
    });
    const createBody = created.json<Envelope<StoreData>>();
    if (!createBody.ok) {
      throw new Error('store failed');
    }

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/memory/${createBody.data.id}`,
      payload: { callerDid: 'did:key:alice', text: 'second' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<UpdateData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.version).toBe(2);
  });

  it('PATCH /v1/memory/:id returns 403 for non-owners', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'mine',
        permissions: { visibility: 'public' },
      },
    });
    const createBody = created.json<Envelope<StoreData>>();
    if (!createBody.ok) {
      throw new Error('store failed');
    }
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/memory/${createBody.data.id}`,
      payload: { callerDid: 'did:key:bob', text: 'hacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /v1/memory/:id/share grants access', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'share me',
        permissions: { visibility: 'private' },
      },
    });
    const createBody = created.json<Envelope<StoreData>>();
    if (!createBody.ok) {
      throw new Error('store failed');
    }
    const res = await app.inject({
      method: 'POST',
      url: `/v1/memory/${createBody.data.id}/share`,
      payload: {
        callerDid: 'did:key:alice',
        shareWith: ['did:key:bob'],
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<ShareData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.sharedWith).toEqual(['did:key:bob']);

    // Bob can now retrieve it.
    const search = await app.inject({
      method: 'POST',
      url: '/v1/memory/search',
      payload: { queryDid: 'did:key:bob', queryText: 'share me', topK: 5 },
    });
    const searchBody = search.json<Envelope<SearchData>>();
    if (!searchBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(searchBody.data.hits).toHaveLength(1);
  });

  it('POST /v1/memory/:id/share returns 403 for non-owners', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'mine',
        permissions: { visibility: 'public' },
      },
    });
    const createBody = created.json<Envelope<StoreData>>();
    if (!createBody.ok) {
      throw new Error('store failed');
    }
    const res = await app.inject({
      method: 'POST',
      url: `/v1/memory/${createBody.data.id}/share`,
      payload: { callerDid: 'did:key:bob', shareWith: ['did:key:eve'] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 on schema violations', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: { type: 'fact' }, // missing many required fields
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<Envelope<StoreData>>();
    if (body.ok) {
      throw new Error('expected error envelope');
    }
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });
});
