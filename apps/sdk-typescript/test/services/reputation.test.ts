import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { TEST_BASE_URLS, makeClient } from '../fixtures.js';
import { server } from '../msw-server.js';

const DID = 'did:key:zbar';

describe('ReputationService', () => {
  describe('score', () => {
    it('GETs /v1/reputation/score/:did and returns the signed envelope', async () => {
      server.use(
        http.get(`${TEST_BASE_URLS.reputation}/v1/reputation/score/:did`, () =>
          HttpResponse.json({
            ok: true,
            data: {
              did: DID,
              score: 510,
              scoreVersion: 'v1.0',
              computedAt: '2026-04-30T00:00:00.000Z',
              attestation: 'AAA',
            },
          }),
        ),
      );
      const client = makeClient();
      const result = await client.reputation.score({ did: DID });
      expect(result.score).toBe(510);
      expect(result.attestation).toBe('AAA');
    });
  });

  describe('history', () => {
    it('GETs /v1/reputation/history/:did with optional query params', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${TEST_BASE_URLS.reputation}/v1/reputation/history/:did`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({
            ok: true,
            data: {
              did: DID,
              transactions: [],
              feedbacksReceived: [],
              feedbacksIssued: [],
              nextCursor: null,
            },
          });
        }),
      );
      const client = makeClient();
      await client.reputation.history({ did: DID, limit: 25, cursor: 'abc' });
      const url = new URL(capturedUrl);
      expect(url.searchParams.get('limit')).toBe('25');
      expect(url.searchParams.get('cursor')).toBe('abc');
    });

    it('omits absent optional params', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${TEST_BASE_URLS.reputation}/v1/reputation/history/:did`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({
            ok: true,
            data: {
              did: DID,
              transactions: [],
              feedbacksReceived: [],
              feedbacksIssued: [],
              nextCursor: null,
            },
          });
        }),
      );
      const client = makeClient();
      await client.reputation.history({ did: DID });
      const url = new URL(capturedUrl);
      expect(url.search).toBe('');
    });
  });

  describe('verify', () => {
    it('POSTs the score+attestation pair to /v1/reputation/verify', async () => {
      let captured: unknown;
      server.use(
        http.post(`${TEST_BASE_URLS.reputation}/v1/reputation/verify`, async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ ok: true, data: { valid: true } });
        }),
      );
      const client = makeClient();
      const result = await client.reputation.verify({
        score: {
          did: DID,
          score: 510,
          scoreVersion: 'v1.0',
          computedAt: '2026-04-30T00:00:00.000Z',
        },
        attestation: 'AAA',
      });
      expect(captured).toEqual({
        score: {
          did: DID,
          score: 510,
          scoreVersion: 'v1.0',
          computedAt: '2026-04-30T00:00:00.000Z',
        },
        attestation: 'AAA',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('submitFeedback', () => {
    it('POSTs the signed feedback envelope to /v1/reputation/feedback', async () => {
      let captured: unknown;
      server.use(
        http.post(`${TEST_BASE_URLS.reputation}/v1/reputation/feedback`, async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json(
            {
              ok: true,
              data: {
                accepted: true,
                idempotent: false,
                feedbackId: '00000000-0000-0000-0000-000000000001',
              },
            },
            { status: 201 },
          );
        }),
      );
      const client = makeClient();
      const result = await client.reputation.submitFeedback({
        feedbackId: '00000000-0000-0000-0000-000000000001',
        fromDid: 'did:key:zfoo',
        toDid: DID,
        txId: 'tx-1',
        rating: 5,
        dimensions: { delivery: 5, quality: 5, communication: 5 },
        signedAt: '2026-04-30T00:00:00.000Z',
        signature: 'AAA',
      });
      expect(captured).toMatchObject({ rating: 5, txId: 'tx-1' });
      expect(result.accepted).toBe(true);
    });
  });
});
