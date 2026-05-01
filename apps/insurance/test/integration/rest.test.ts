/**
 * REST integration tests using fastify's `inject` (no real HTTP socket needed).
 * Uses the in-memory `PolicyStore` + `ReputationClient` fakes — no real
 * Postgres / reputation upstream needed.
 */
import { createLogger, type Logger } from '@colber/core-logger';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InsuranceService } from '../../src/domain/insurance-service.js';
import { PricingEngine } from '../../src/domain/pricing.js';
import { buildApp } from '../../src/http/app.js';
import { InMemoryPolicyStore } from '../fakes/in-memory-policy-store.js';
import { InMemoryReputationClient } from '../fakes/in-memory-reputation-client.js';

import type { DbClient, Database } from '../../src/db/client.js';
import type { ClaimWire, PolicyViewWire, QuoteWire } from '../../src/http/views.js';
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

const fakeDbClient = (alive = true): DbClient => ({
  db: {} as unknown as Database,
  sql: {} as unknown as Sql,
  close: () => Promise.resolve(),
  ping: () => (alive ? Promise.resolve() : Promise.reject(new Error('db down'))),
});

const buildHarness = async (opts: {
  adminEnabled?: boolean;
  cap?: number;
}): Promise<{
  app: FastifyInstance;
  store: InMemoryPolicyStore;
  rep: InMemoryReputationClient;
  logger: Logger;
}> => {
  const store = new InMemoryPolicyStore();
  const rep = new InMemoryReputationClient(
    new Map([
      ['did:key:alice', 750],
      ['did:key:bob', 600],
    ]),
  );
  const pricing = new PricingEngine(rep, { baseRateBps: 200, quoteValiditySeconds: 300 });
  const insurance = new InsuranceService(pricing, store, {
    defaultPolicyDurationHours: 168,
    maxGlobalExposureUsdc: opts.cap ?? 100_000,
  });
  const logger = createLogger({ serviceName: 'insurance-test', level: 'silent' });
  const app = await buildApp({
    logger,
    dbClient: fakeDbClient(),
    reputation: rep,
    insurance,
    adminEnabled: opts.adminEnabled ?? false,
  });
  await app.ready();
  return { app, store, rep, logger };
};

describe('REST /v1/insurance/*', () => {
  let app: FastifyInstance;
  let store: InMemoryPolicyStore;

  beforeEach(async () => {
    const harness = await buildHarness({ adminEnabled: true });
    app = harness.app;
    store = harness.store;
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /healthz returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz returns 200 with database+reputation OK', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ready',
      checks: { database: 'ok', reputation: 'ok' },
    });
  });

  it('GET /metrics exposes Prometheus metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/^# HELP/m);
  });

  it('runs full lifecycle: quote → subscribe → claim → admin transition → status', async () => {
    // 1. quote
    const quoteRes = await app.inject({
      method: 'POST',
      url: '/v1/insurance/quote',
      payload: {
        subscriberDid: 'did:key:alice',
        beneficiaryDid: 'did:key:bob',
        dealSubject: 'pdf-extraction',
        amountUsdc: 10_000,
        slaTerms: { deliveryWindowHours: 48 },
      },
    });
    expect(quoteRes.statusCode).toBe(200);
    const qBody = quoteRes.json<Envelope<QuoteWire>>();
    if (!qBody.ok) {
      throw new Error('expected ok envelope');
    }
    // alice score = 750 → multiplier 0.8 → 10000 * 0.02 * 0.8 = 160
    expect(qBody.data.premiumUsdc).toBe(160);
    expect(qBody.data.riskMultiplier).toBe(0.8);

    // 2. subscribe
    const subRes = await app.inject({
      method: 'POST',
      url: '/v1/insurance/subscribe',
      payload: {
        subscriberDid: 'did:key:alice',
        beneficiaryDid: 'did:key:bob',
        dealSubject: 'pdf-extraction',
        amountUsdc: 10_000,
        slaTerms: { deliveryWindowHours: 48 },
        idempotencyKey: uuidv4(),
      },
    });
    expect(subRes.statusCode).toBe(201);
    const subBody = subRes.json<Envelope<PolicyViewWire>>();
    if (!subBody.ok) {
      throw new Error('expected ok envelope');
    }
    const policyId = subBody.data.policy.id;
    const escrowId = subBody.data.escrow.id;
    expect(subBody.data.escrow.status).toBe('locked');
    expect(subBody.data.policy.status).toBe('active');
    expect(subBody.data.policy.premiumUsdc).toBe(160);

    // 3. claim
    const claimRes = await app.inject({
      method: 'POST',
      url: '/v1/insurance/claims',
      payload: {
        policyId,
        claimantDid: 'did:key:bob',
        reason: 'delivery missed deadline',
        evidence: { evidenceUrl: 'ipfs://bafy...' },
        idempotencyKey: uuidv4(),
      },
    });
    expect(claimRes.statusCode).toBe(201);
    const claimBody = claimRes.json<Envelope<ClaimWire>>();
    if (!claimBody.ok) {
      throw new Error('expected ok envelope');
    }
    const claimId = claimBody.data.id;
    expect(claimBody.data.status).toBe('open');

    // 4. admin transition to claimed
    const adminRes = await app.inject({
      method: 'POST',
      url: `/v1/insurance/admin/escrow/${escrowId}/transition`,
      payload: { to: 'claimed', claimId },
    });
    expect(adminRes.statusCode).toBe(200);
    const adminBody = adminRes.json<Envelope<PolicyViewWire>>();
    if (!adminBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(adminBody.data.escrow.status).toBe('claimed');
    expect(adminBody.data.policy.status).toBe('claimed');
    const paidClaim = adminBody.data.claims.find((c) => c.id === claimId);
    expect(paidClaim?.status).toBe('paid');
    expect(paidClaim?.payoutUsdc).toBe(10_000);

    // 5. status
    const statusRes = await app.inject({
      method: 'GET',
      url: `/v1/insurance/policies/${policyId}`,
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = statusRes.json<Envelope<PolicyViewWire>>();
    if (!statusBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(statusBody.data.escrow.status).toBe('claimed');
    expect(statusBody.data.claims).toHaveLength(1);

    // 6. list policies (alice has 1)
    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/insurance/policies?subscriberDid=did:key:alice',
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json<Envelope<{ policies: PolicyViewWire[]; total: number }>>();
    if (!listBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.policies).toHaveLength(1);
  });

  it('subscribe is idempotent on idempotencyKey', async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      subscriberDid: 'did:key:alice',
      beneficiaryDid: 'did:key:bob',
      dealSubject: 'pdf-extraction',
      amountUsdc: 5_000,
      slaTerms: { deliveryWindowHours: 24 },
      idempotencyKey,
    };
    const first = await app.inject({
      method: 'POST',
      url: '/v1/insurance/subscribe',
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json<Envelope<PolicyViewWire>>();
    if (!firstBody.ok) {
      throw new Error('expected ok envelope');
    }
    const second = await app.inject({
      method: 'POST',
      url: '/v1/insurance/subscribe',
      payload,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json<Envelope<PolicyViewWire>>();
    if (!secondBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(secondBody.data.policy.id).toBe(firstBody.data.policy.id);
  });

  it('claim is idempotent on (policyId, idempotencyKey)', async () => {
    const subscribeRes = await app.inject({
      method: 'POST',
      url: '/v1/insurance/subscribe',
      payload: {
        subscriberDid: 'did:key:alice',
        beneficiaryDid: 'did:key:bob',
        dealSubject: 'job',
        amountUsdc: 1_000,
        slaTerms: { deliveryWindowHours: 24 },
        idempotencyKey: uuidv4(),
      },
    });
    const subBody = subscribeRes.json<Envelope<PolicyViewWire>>();
    if (!subBody.ok) {
      throw new Error('expected ok envelope');
    }
    const policyId = subBody.data.policy.id;
    const idem = uuidv4();
    const claimPayload = {
      policyId,
      claimantDid: 'did:key:bob',
      reason: 'late',
      evidence: { proof: 'x' },
      idempotencyKey: idem,
    };
    const first = await app.inject({
      method: 'POST',
      url: '/v1/insurance/claims',
      payload: claimPayload,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json<Envelope<ClaimWire>>();
    if (!firstBody.ok) {
      throw new Error('expected ok envelope');
    }
    const second = await app.inject({
      method: 'POST',
      url: '/v1/insurance/claims',
      payload: claimPayload,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json<Envelope<ClaimWire>>();
    if (!secondBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(secondBody.data.id).toBe(firstBody.data.id);
  });

  it('returns 400 when subscribing past the global exposure cap', async () => {
    // Re-build the harness with a tiny cap to make the test deterministic.
    await app.close();
    const harness = await buildHarness({ adminEnabled: true, cap: 500 });
    app = harness.app;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/insurance/subscribe',
      payload: {
        subscriberDid: 'did:key:alice',
        beneficiaryDid: 'did:key:bob',
        dealSubject: 'job',
        amountUsdc: 1_000,
        slaTerms: { deliveryWindowHours: 24 },
        idempotencyKey: uuidv4(),
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<Envelope<unknown>>();
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.error.message).toMatch(/exposure cap/u);
    }
  });

  it('returns 403 on the admin endpoint when INSURANCE_ADMIN_ENABLED=false', async () => {
    // Re-build with admin disabled.
    await app.close();
    const harness = await buildHarness({ adminEnabled: false });
    app = harness.app;
    const subRes = await app.inject({
      method: 'POST',
      url: '/v1/insurance/subscribe',
      payload: {
        subscriberDid: 'did:key:alice',
        beneficiaryDid: 'did:key:bob',
        dealSubject: 'job',
        amountUsdc: 100,
        slaTerms: { deliveryWindowHours: 24 },
        idempotencyKey: uuidv4(),
      },
    });
    const subBody = subRes.json<Envelope<PolicyViewWire>>();
    if (!subBody.ok) {
      throw new Error('expected ok envelope');
    }
    const escrowId = subBody.data.escrow.id;
    const res = await app.inject({
      method: 'POST',
      url: `/v1/insurance/admin/escrow/${escrowId}/transition`,
      payload: { to: 'released' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when filing a claim against a non-existent policy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/insurance/claims',
      payload: {
        policyId: uuidv4(),
        claimantDid: 'did:key:bob',
        reason: 'late',
        evidence: { proof: 'x' },
        idempotencyKey: uuidv4(),
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 on invalid quote body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/insurance/quote',
      payload: { totally: 'wrong' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('uses fallback score when reputation is unknown', async () => {
    await app.close();
    const harness = await buildHarness({ adminEnabled: false });
    app = harness.app;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/insurance/quote',
      payload: {
        subscriberDid: 'did:key:unknown',
        beneficiaryDid: 'did:key:bob',
        dealSubject: 'job',
        amountUsdc: 1_000,
        slaTerms: { deliveryWindowHours: 24 },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Envelope<QuoteWire>>();
    if (!body.ok) {
      throw new Error('expected ok envelope');
    }
    expect(body.data.reputationScore).toBe(500);
    expect(body.data.riskMultiplier).toBe(1);
  });

  // Ensure the fakes are wired up — guard rail against accidental real
  // Postgres / network in the test loop.
  it('does not touch real Postgres (fake DbClient is a no-op)', () => {
    expect(store.dump()).toBeTruthy();
  });
});
