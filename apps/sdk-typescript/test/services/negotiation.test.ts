import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { TEST_BASE_URLS, makeClient } from '../fixtures.js';
import { server } from '../msw-server.js';

const NID = '00000000-0000-0000-0000-0000000000bb';

const sampleView = {
  negotiationId: NID,
  status: 'open',
  strategy: 'ascending-auction',
  terms: {
    subject: 'rent a chunk of GPU',
    strategy: 'ascending-auction',
    constraints: {},
    partyDids: ['did:key:zA', 'did:key:zB'],
    deadline: '2026-05-01T00:00:00.000Z',
  },
  partyDids: ['did:key:zA', 'did:key:zB'],
  proposals: [],
  createdAt: '2026-04-30T00:00:00.000Z',
  updatedAt: '2026-04-30T00:00:00.000Z',
  expiresAt: '2026-05-01T00:00:00.000Z',
};

describe('NegotiationService', () => {
  describe('start', () => {
    it('POSTs to /v1/negotiation with the idempotency key in the body', async () => {
      let captured: unknown;
      server.use(
        http.post(`${TEST_BASE_URLS.negotiation}/v1/negotiation`, async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ ok: true, data: sampleView }, { status: 201 });
        }),
      );
      const client = makeClient();
      await client.negotiation.start(
        {
          terms: {
            subject: 'rent a chunk of GPU',
            strategy: 'ascending-auction',
            partyDids: ['did:key:zA', 'did:key:zB'],
            deadline: '2026-05-01T00:00:00.000Z',
          },
          createdBy: 'did:key:zA',
        },
        { idempotencyKey: '00000000-0000-0000-0000-0000000000aa' },
      );
      expect(captured).toMatchObject({
        idempotencyKey: '00000000-0000-0000-0000-0000000000aa',
        createdBy: 'did:key:zA',
      });
    });

    it('returns the same view on idempotent replay (200)', async () => {
      server.use(
        http.post(`${TEST_BASE_URLS.negotiation}/v1/negotiation`, () =>
          HttpResponse.json({ ok: true, data: sampleView }, { status: 200 }),
        ),
      );
      const client = makeClient();
      const r = await client.negotiation.start(
        {
          terms: sampleView.terms as Parameters<typeof client.negotiation.start>[0]['terms'],
          createdBy: 'did:key:zA',
        },
        { idempotencyKey: 'k-1' },
      );
      expect(r.negotiationId).toBe(NID);
    });
  });

  it('get: GETs /v1/negotiation/:id', async () => {
    server.use(
      http.get(`${TEST_BASE_URLS.negotiation}/v1/negotiation/:id`, () =>
        HttpResponse.json({ ok: true, data: sampleView }),
      ),
    );
    const client = makeClient();
    const r = await client.negotiation.get(NID);
    expect(r.negotiationId).toBe(NID);
  });

  it('history: GETs /v1/negotiation/:id/history with cursor + limit', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${TEST_BASE_URLS.negotiation}/v1/negotiation/:id/history`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true, data: { events: [], nextCursor: null } });
      }),
    );
    const client = makeClient();
    await client.negotiation.history({ negotiationId: NID, cursor: 5, limit: 10 });
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('cursor')).toBe('5');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('propose: POSTs to /v1/negotiation/:id/propose with proposal + publicKey', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.negotiation}/v1/negotiation/:id/propose`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true, data: sampleView });
      }),
    );
    const client = makeClient();
    await client.negotiation.propose({
      negotiationId: NID,
      proposal: {
        proposalId: '00000000-0000-0000-0000-0000000000cc',
        fromDid: 'did:key:zA',
        amount: 100,
        signature: 'AAA',
        proposedAt: '2026-04-30T00:00:00.000Z',
      },
      publicKey: 'BBB',
    });
    expect(captured).toMatchObject({ publicKey: 'BBB' });
  });

  it('counter: POSTs to /v1/negotiation/:id/counter with counterTo + proposal', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.negotiation}/v1/negotiation/:id/counter`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true, data: sampleView });
      }),
    );
    const client = makeClient();
    await client.negotiation.counter({
      negotiationId: NID,
      counterTo: '00000000-0000-0000-0000-0000000000cc',
      proposal: {
        proposalId: '00000000-0000-0000-0000-0000000000dd',
        fromDid: 'did:key:zB',
        amount: 150,
        signature: 'AAA',
        proposedAt: '2026-04-30T00:01:00.000Z',
      },
      publicKey: 'BBB',
    });
    expect(captured).toMatchObject({ counterTo: '00000000-0000-0000-0000-0000000000cc' });
  });

  it('settle: omits winningProposalId when not provided', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.negotiation}/v1/negotiation/:id/settle`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true, data: sampleView });
      }),
    );
    const client = makeClient();
    await client.negotiation.settle({
      negotiationId: NID,
      signatures: [{ did: 'did:key:zA', signature: 'AAA' }],
      publicKeys: [{ did: 'did:key:zA', publicKey: 'BBB' }],
    });
    expect(captured).not.toHaveProperty('winningProposalId');
  });

  it('settle: forwards winningProposalId when provided', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.negotiation}/v1/negotiation/:id/settle`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true, data: sampleView });
      }),
    );
    const client = makeClient();
    await client.negotiation.settle({
      negotiationId: NID,
      winningProposalId: '00000000-0000-0000-0000-0000000000cc',
      signatures: [{ did: 'did:key:zA', signature: 'AAA' }],
      publicKeys: [{ did: 'did:key:zA', publicKey: 'BBB' }],
    });
    expect(captured).toMatchObject({ winningProposalId: '00000000-0000-0000-0000-0000000000cc' });
  });
});
