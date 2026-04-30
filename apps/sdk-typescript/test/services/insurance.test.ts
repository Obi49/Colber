import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { TEST_BASE_URLS, makeClient } from '../fixtures.js';
import { server } from '../msw-server.js';

const POLICY_ID = '00000000-0000-0000-0000-0000000000ff';
const SUBSCRIBER = 'did:key:zA';
const BENEFICIARY = 'did:key:zB';

const sampleQuote = {
  subscriberDid: SUBSCRIBER,
  beneficiaryDid: BENEFICIARY,
  dealSubject: 'render',
  amountUsdc: 1000,
  premiumUsdc: 20,
  riskMultiplier: 1,
  reputationScore: 500,
  computedAt: '2026-04-30T00:00:00.000Z',
  validUntil: '2026-04-30T01:00:00.000Z',
};

const samplePolicyDetail = {
  policy: {
    id: POLICY_ID,
    subscriberDid: SUBSCRIBER,
    beneficiaryDid: BENEFICIARY,
    dealSubject: 'render',
    amountUsdc: 1000,
    premiumUsdc: 20,
    riskMultiplier: 1,
    reputationScore: 500,
    slaTerms: { deliveryWindowHours: 24 },
    status: 'active',
    createdAt: '2026-04-30T00:00:00.000Z',
    expiresAt: '2026-05-01T00:00:00.000Z',
  },
  escrow: {
    id: '00000000-0000-0000-0000-0000000000aa',
    policyId: POLICY_ID,
    amountUsdc: 1000,
    status: 'locked',
    lockedAt: '2026-04-30T00:00:00.000Z',
  },
  claims: [],
};

const sampleClaim = {
  id: '00000000-0000-0000-0000-0000000000bb',
  policyId: POLICY_ID,
  claimantDid: BENEFICIARY,
  reason: 'late delivery',
  evidence: { tickets: ['OPS-1234'] },
  status: 'open',
  createdAt: '2026-04-30T00:00:00.000Z',
};

describe('InsuranceService', () => {
  it('quote: POSTs to /v1/insurance/quote and returns the priced view', async () => {
    server.use(
      http.post(`${TEST_BASE_URLS.insurance}/v1/insurance/quote`, () =>
        HttpResponse.json({ ok: true, data: sampleQuote }),
      ),
    );
    const client = makeClient();
    const r = await client.insurance.quote({
      subscriberDid: SUBSCRIBER,
      beneficiaryDid: BENEFICIARY,
      dealSubject: 'render',
      amountUsdc: 1000,
      slaTerms: { deliveryWindowHours: 24 },
    });
    expect(r.premiumUsdc).toBe(20);
  });

  describe('subscribe', () => {
    it('POSTs to /v1/insurance/subscribe and forwards idempotencyKey', async () => {
      let captured: unknown;
      server.use(
        http.post(`${TEST_BASE_URLS.insurance}/v1/insurance/subscribe`, async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ ok: true, data: samplePolicyDetail }, { status: 201 });
        }),
      );
      const client = makeClient();
      const r = await client.insurance.subscribe(
        {
          subscriberDid: SUBSCRIBER,
          beneficiaryDid: BENEFICIARY,
          dealSubject: 'render',
          amountUsdc: 1000,
          slaTerms: { deliveryWindowHours: 24 },
        },
        { idempotencyKey: 'k-sub-1' },
      );
      expect(captured).toMatchObject({ idempotencyKey: 'k-sub-1', amountUsdc: 1000 });
      expect(r.policy.id).toBe(POLICY_ID);
    });

    it('treats a 200 idempotent replay as success', async () => {
      server.use(
        http.post(`${TEST_BASE_URLS.insurance}/v1/insurance/subscribe`, () =>
          HttpResponse.json({ ok: true, data: samplePolicyDetail }, { status: 200 }),
        ),
      );
      const client = makeClient();
      const r = await client.insurance.subscribe(
        {
          subscriberDid: SUBSCRIBER,
          beneficiaryDid: BENEFICIARY,
          dealSubject: 'render',
          amountUsdc: 1000,
          slaTerms: { deliveryWindowHours: 24 },
        },
        { idempotencyKey: 'k-sub-1' },
      );
      expect(r.policy.id).toBe(POLICY_ID);
    });
  });

  it('claim: POSTs to /v1/insurance/claims and forwards idempotencyKey', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.insurance}/v1/insurance/claims`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true, data: sampleClaim }, { status: 201 });
      }),
    );
    const client = makeClient();
    const r = await client.insurance.claim(
      {
        policyId: POLICY_ID,
        claimantDid: BENEFICIARY,
        reason: 'late delivery',
        evidence: { tickets: ['OPS-1234'] },
      },
      { idempotencyKey: 'k-claim-1' },
    );
    expect(captured).toMatchObject({ idempotencyKey: 'k-claim-1', policyId: POLICY_ID });
    expect(r.status).toBe('open');
  });

  it('status: GETs /v1/insurance/policies/:id', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${TEST_BASE_URLS.insurance}/v1/insurance/policies/:id`, ({ request }) => {
        capturedUrl = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true, data: samplePolicyDetail });
      }),
    );
    const client = makeClient();
    await client.insurance.status(POLICY_ID);
    expect(capturedUrl).toBe(`/v1/insurance/policies/${POLICY_ID}`);
  });

  it('list: GETs /v1/insurance/policies with subscriberDid + pagination', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${TEST_BASE_URLS.insurance}/v1/insurance/policies`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: { policies: [], total: 0, limit: 10, offset: 0 },
        });
      }),
    );
    const client = makeClient();
    await client.insurance.list({ subscriberDid: SUBSCRIBER, limit: 10, offset: 0 });
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('subscriberDid')).toBe(SUBSCRIBER);
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('offset')).toBe('0');
  });
});
