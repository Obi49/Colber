import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { TEST_BASE_URLS, makeClient } from '../fixtures.js';
import { server } from '../msw-server.js';

describe('IdentityService', () => {
  describe('register', () => {
    it('POSTs to /v1/identity/register and returns the unwrapped data', async () => {
      let captured: unknown;
      server.use(
        http.post(`${TEST_BASE_URLS.identity}/v1/identity/register`, async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json(
            {
              ok: true,
              data: {
                did: 'did:key:zfoo',
                agentId: '00000000-0000-0000-0000-000000000001',
                registeredAt: '2026-04-30T00:00:00.000Z',
              },
            },
            { status: 201 },
          );
        }),
      );
      const client = makeClient();
      const result = await client.identity.register({
        publicKey: 'AAA',
        ownerOperatorId: 'op-1',
      });
      expect(captured).toEqual({ publicKey: 'AAA', ownerOperatorId: 'op-1' });
      expect(result.did).toBe('did:key:zfoo');
    });
  });

  describe('resolve', () => {
    it('GETs /v1/identity/:did with the DID URL-encoded', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, ({ request }) => {
          capturedUrl = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              did: 'did:key:zfoo',
              agentId: '00000000-0000-0000-0000-000000000001',
              publicKey: 'AAA',
              signatureScheme: 'Ed25519',
              ownerOperatorId: 'op-1',
              registeredAt: '2026-04-30T00:00:00.000Z',
              revokedAt: null,
            },
          });
        }),
      );
      const client = makeClient();
      await client.identity.resolve('did:key:zfoo');
      // Colons are URL-encoded by the SDK, then decoded back into the path.
      expect(capturedUrl).toBe('/v1/identity/did%3Akey%3Azfoo');
    });
  });

  describe('verify', () => {
    it('POSTs to /v1/identity/verify and returns the typed result', async () => {
      server.use(
        http.post(`${TEST_BASE_URLS.identity}/v1/identity/verify`, () =>
          HttpResponse.json({ ok: true, data: { valid: true } }),
        ),
      );
      const client = makeClient();
      const result = await client.identity.verify({
        did: 'did:key:zfoo',
        message: 'aGVsbG8=',
        signature: 'AAA',
      });
      expect(result.valid).toBe(true);
    });

    it('forwards 400-level error envelopes verbatim', async () => {
      server.use(
        http.post(`${TEST_BASE_URLS.identity}/v1/identity/verify`, () =>
          HttpResponse.json(
            { ok: false, error: { code: 'VALIDATION_FAILED', message: 'bad sig' } },
            { status: 400 },
          ),
        ),
      );
      const client = makeClient();
      await expect(
        client.identity.verify({
          did: 'did:key:zfoo',
          message: '',
          signature: '',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    });
  });
});
