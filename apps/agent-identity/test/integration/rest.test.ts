/**
 * REST integration tests using fastify's `inject` (no real HTTP socket needed).
 * Uses the in-memory repository fake — no real DB connection.
 */
import { getSignatureProvider, toBase64 } from '@colber/core-crypto';
import { createLogger, type Logger } from '@colber/core-logger';
import { ERROR_CODES } from '@colber/core-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IdentityService } from '../../src/domain/identity-service.js';
import { buildApp } from '../../src/http/app.js';
import { InMemoryAgentRepository } from '../fakes/in-memory-repo.js';

import type { DbClient, Database } from '../../src/db/client.js';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';

/**
 * Wire shapes for parsing inject() responses. The REST envelope is
 * `{ ok: true, data: T } | { ok: false, error: { code, message, ... } }`,
 * mirroring the runtime contract in `src/http/error-handler.ts`. We declare
 * minimal subset shapes here so test assertions stay strongly typed without
 * depending on internal handler types.
 */
interface OkEnvelope<T> {
  ok: true;
  data: T;
}
interface ErrEnvelope {
  ok: false;
  error: { code: string; message: string };
}
type Envelope<T> = OkEnvelope<T> | ErrEnvelope;
interface RegisterData {
  did: string;
  agentId: string;
  registeredAt: string;
}
interface ResolveData {
  did: string;
  agentId: string;
  signatureScheme: string;
}
interface VerifyData {
  valid: boolean;
  reason?: string;
}

/**
 * Fake DB client that always reports healthy.
 *
 * The `db` and `sql` fields are typed via the real interfaces but we never
 * call any of their methods in tests (the route under test only uses
 * `dbClient.ping()`). Empty objects are cast through `unknown` so we don't
 * need an `any` escape hatch.
 */
const fakeDbClient = (alive = true): DbClient => ({
  db: {} as unknown as Database,
  sql: {} as unknown as Sql,
  close: () => Promise.resolve(),
  ping: () => (alive ? Promise.resolve() : Promise.reject(new Error('db down'))),
});

describe('REST /v1/identity/*', () => {
  let app: FastifyInstance;
  let logger: Logger;

  beforeEach(async () => {
    const repo = new InMemoryAgentRepository();
    const service = new IdentityService(repo);
    logger = createLogger({ serviceName: 'identity-test', level: 'silent' });
    app = await buildApp({
      logger,
      dbClient: fakeDbClient(),
      identityService: service,
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

  it('GET /readyz returns 200 when DB is up', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /metrics exposes Prometheus metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/^# HELP/m);
    expect(res.body).toMatch(/process_cpu_user_seconds_total/);
  });

  it('POST /v1/identity/register creates an agent', async () => {
    const ed = getSignatureProvider('Ed25519');
    const kp = await ed.generateKeyPair();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/identity/register',
      payload: {
        publicKey: toBase64(kp.publicKey),
        ownerOperatorId: 'op_int',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<Envelope<RegisterData>>();
    expect(body.ok).toBe(true);
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.did).toMatch(/^did:key:z6Mk/);
    expect(body.data.agentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST /v1/identity/register returns 400 on missing body fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/identity/register',
      payload: { publicKey: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<Envelope<RegisterData>>();
    expect(body.ok).toBe(false);
    if (body.ok) {
      throw new Error('expected error envelope');
    }
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('POST /v1/identity/register returns 409 on duplicate', async () => {
    const ed = getSignatureProvider('Ed25519');
    const kp = await ed.generateKeyPair();
    const payload = { publicKey: toBase64(kp.publicKey), ownerOperatorId: 'op' };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/identity/register',
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/identity/register',
      payload,
    });
    expect(second.statusCode).toBe(409);
    const body = second.json<Envelope<RegisterData>>();
    if (body.ok) {
      throw new Error('expected error envelope');
    }
    expect(body.error.code).toBe(ERROR_CODES.DID_ALREADY_REGISTERED);
  });

  it('GET /v1/identity/:did resolves a registered DID', async () => {
    const ed = getSignatureProvider('Ed25519');
    const kp = await ed.generateKeyPair();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/identity/register',
      payload: { publicKey: toBase64(kp.publicKey), ownerOperatorId: 'op' },
    });
    const regBody = reg.json<Envelope<RegisterData>>();
    if (!regBody.ok) {
      throw new Error('register failed');
    }
    const { data } = regBody;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/identity/${encodeURIComponent(data.did)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<ResolveData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.did).toBe(data.did);
    expect(body.data.signatureScheme).toBe('Ed25519');
  });

  it('GET /v1/identity/:did returns 404 for unknown DIDs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/identity/${encodeURIComponent('did:key:z6MkUnknown')}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /v1/identity/verify accepts a valid signature', async () => {
    const ed = getSignatureProvider('Ed25519');
    const kp = await ed.generateKeyPair();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/identity/register',
      payload: { publicKey: toBase64(kp.publicKey), ownerOperatorId: 'op' },
    });
    const regBody = reg.json<Envelope<RegisterData>>();
    if (!regBody.ok) {
      throw new Error('register failed');
    }
    const { data } = regBody;

    const message = new TextEncoder().encode('colber-rest-test');
    const signature = await ed.sign(message, kp.privateKey);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/identity/verify',
      payload: {
        did: data.did,
        message: toBase64(message),
        signature: toBase64(signature),
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<VerifyData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.valid).toBe(true);
  });

  it('POST /v1/identity/verify rejects a tampered signature', async () => {
    const ed = getSignatureProvider('Ed25519');
    const kp = await ed.generateKeyPair();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/identity/register',
      payload: { publicKey: toBase64(kp.publicKey), ownerOperatorId: 'op' },
    });
    const regBody = reg.json<Envelope<RegisterData>>();
    if (!regBody.ok) {
      throw new Error('register failed');
    }
    const { data } = regBody;

    const message = new TextEncoder().encode('original');
    const signature = await ed.sign(message, kp.privateKey);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/identity/verify',
      payload: {
        did: data.did,
        message: toBase64(new TextEncoder().encode('tampered')),
        signature: toBase64(signature),
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<VerifyData>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.valid).toBe(false);
  });
});
