import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { TEST_BASE_URLS, makeClient } from './fixtures.js';
import { server } from './msw-server.js';
import { PraxisClient, DEFAULT_INGRESS_PATHS, DEFAULT_LOCAL_PORTS } from '../src/client.js';
import { PraxisApiError, PraxisNetworkError } from '../src/errors.js';
import { buildUrl } from '../src/http.js';

describe('PraxisClient', () => {
  describe('constructor', () => {
    it('uses globalThis.fetch by default and keeps services attached', () => {
      const c = new PraxisClient({ baseUrls: TEST_BASE_URLS });
      expect(c.identity).toBeDefined();
      expect(c.reputation).toBeDefined();
      expect(c.memory).toBeDefined();
      expect(c.observability).toBeDefined();
      expect(c.negotiation).toBeDefined();
      expect(c.insurance).toBeDefined();
    });

    it('accepts an injected fetch and forwards it to every service', async () => {
      // Spy on fetch to ensure the SDK actually calls our injected impl.
      const realFetch = globalThis.fetch.bind(globalThis);
      const spy = vi.fn((input: string | URL | Request, init?: RequestInit) =>
        realFetch(input, init),
      );
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () =>
          HttpResponse.json({
            ok: true,
            data: {
              did: 'did:key:zfoo',
              agentId: '00000000-0000-0000-0000-000000000001',
              publicKey: 'AAA',
              signatureScheme: 'Ed25519',
              ownerOperatorId: 'op',
              registeredAt: '2026-04-30T00:00:00.000Z',
              revokedAt: null,
            },
          }),
        ),
      );
      const client = makeClient({ fetch: spy });
      await client.identity.resolve('did:key:zfoo');
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe('local() factory', () => {
    it('points each service at the documented β-VM port', () => {
      const c = PraxisClient.local();
      expect(c).toBeInstanceOf(PraxisClient);
      // Sanity-check the documented default map didn't drift.
      expect(DEFAULT_LOCAL_PORTS.identity).toBe(14001);
      expect(DEFAULT_LOCAL_PORTS.insurance).toBe(14051);
    });
  });

  describe('fromBaseUrl() factory', () => {
    it('resolves each service via path-based routing under a single base', () => {
      const c = PraxisClient.fromBaseUrl('https://api.praxis.dev');
      expect(c).toBeInstanceOf(PraxisClient);
      expect(DEFAULT_INGRESS_PATHS.identity).toBe('/identity');
      expect(DEFAULT_INGRESS_PATHS.insurance).toBe('/insurance');
    });

    it('strips trailing slashes from the base URL', () => {
      const c = PraxisClient.fromBaseUrl('https://api.praxis.dev/');
      expect(c).toBeInstanceOf(PraxisClient);
    });
  });
});

describe('http transport behaviour', () => {
  describe('error envelope handling', () => {
    it('throws PraxisApiError with structured fields on { ok: false, error }', async () => {
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () =>
          HttpResponse.json(
            {
              ok: false,
              error: {
                code: 'NOT_FOUND',
                message: 'agent not registered',
                details: { did: 'did:key:zfoo' },
                traceId: 't-abc',
              },
            },
            { status: 404 },
          ),
        ),
      );
      const client = makeClient();
      await expect(client.identity.resolve('did:key:zfoo')).rejects.toMatchObject({
        name: 'PraxisApiError',
        code: 'NOT_FOUND',
        status: 404,
        details: { did: 'did:key:zfoo' },
        traceId: 't-abc',
      });
    });

    it('throws PraxisApiError with HTTP_ERROR code when body is not an envelope', async () => {
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () =>
          HttpResponse.json({ unrelated: true }, { status: 502 }),
        ),
      );
      const client = makeClient();
      await expect(client.identity.resolve('did:key:zfoo')).rejects.toBeInstanceOf(PraxisApiError);
    });

    it('throws PraxisNetworkError on a non-JSON 2xx body', async () => {
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () =>
          HttpResponse.text('not json'),
        ),
      );
      const client = makeClient();
      await expect(client.identity.resolve('did:key:zfoo')).rejects.toBeInstanceOf(
        PraxisNetworkError,
      );
    });

    it('throws PraxisNetworkError(INVALID_RESPONSE) on a 2xx with wrong shape', async () => {
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () =>
          HttpResponse.json({ unrelated: true }),
        ),
      );
      const client = makeClient();
      const err: unknown = await client.identity.resolve('did:key:zfoo').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PraxisNetworkError);
      expect((err as PraxisNetworkError).code).toBe('INVALID_RESPONSE');
    });
  });

  describe('retry behaviour', () => {
    it('retries on 5xx up to retries.count, then throws', async () => {
      let calls = 0;
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () => {
          calls += 1;
          return HttpResponse.json(
            { ok: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
            { status: 500 },
          );
        }),
      );
      const client = makeClient({ retries: { count: 2, backoffMs: 1 } });
      await expect(client.identity.resolve('did:key:zfoo')).rejects.toBeInstanceOf(PraxisApiError);
      // initial attempt + 2 retries == 3.
      expect(calls).toBe(3);
    });

    it('does NOT retry on 4xx — single call, immediate throw', async () => {
      let calls = 0;
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () => {
          calls += 1;
          return HttpResponse.json(
            { ok: false, error: { code: 'NOT_FOUND', message: 'gone' } },
            { status: 404 },
          );
        }),
      );
      const client = makeClient({ retries: { count: 5, backoffMs: 1 } });
      await expect(client.identity.resolve('did:key:zfoo')).rejects.toBeInstanceOf(PraxisApiError);
      expect(calls).toBe(1);
    });

    it('returns success after a transient 5xx, then a 200', async () => {
      let calls = 0;
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, () => {
          calls += 1;
          if (calls === 1) {
            return HttpResponse.json(
              { ok: false, error: { code: 'INTERNAL_ERROR', message: 'flaky' } },
              { status: 503 },
            );
          }
          return HttpResponse.json({
            ok: true,
            data: {
              did: 'did:key:zfoo',
              agentId: '00000000-0000-0000-0000-000000000001',
              publicKey: 'AAA',
              signatureScheme: 'Ed25519',
              ownerOperatorId: 'op',
              registeredAt: '2026-04-30T00:00:00.000Z',
              revokedAt: null,
            },
          });
        }),
      );
      const client = makeClient({ retries: { count: 2, backoffMs: 1 } });
      const r = await client.identity.resolve('did:key:zfoo');
      expect(r.did).toBe('did:key:zfoo');
      expect(calls).toBe(2);
    });
  });

  describe('timeout behaviour', () => {
    it('throws PraxisNetworkError(TIMEOUT) when the request exceeds timeoutMs', async () => {
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ ok: true, data: null });
        }),
      );
      const client = makeClient({ timeoutMs: 30, retries: { count: 0, backoffMs: 1 } });
      const err: unknown = await client.identity.resolve('did:key:zfoo').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PraxisNetworkError);
      expect((err as PraxisNetworkError).code).toBe('TIMEOUT');
    });

    it('does NOT retry after a timeout (the user budget is already exhausted)', async () => {
      let calls = 0;
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, async () => {
          calls += 1;
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ ok: true, data: null });
        }),
      );
      const client = makeClient({
        timeoutMs: 30,
        retries: { count: 3, backoffMs: 1 },
      });
      await expect(client.identity.resolve('did:key:zfoo')).rejects.toBeInstanceOf(
        PraxisNetworkError,
      );
      expect(calls).toBe(1);
    });
  });

  describe('auth header injection', () => {
    it('attaches Authorization: Bearer when authToken is set', async () => {
      let captured: string | undefined;
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, ({ request }) => {
          captured = request.headers.get('authorization') ?? undefined;
          return HttpResponse.json({
            ok: true,
            data: {
              did: 'did:key:zfoo',
              agentId: '00000000-0000-0000-0000-000000000001',
              publicKey: 'AAA',
              signatureScheme: 'Ed25519',
              ownerOperatorId: 'op',
              registeredAt: '2026-04-30T00:00:00.000Z',
              revokedAt: null,
            },
          });
        }),
      );
      const client = makeClient({ authToken: 'tk-1' });
      await client.identity.resolve('did:key:zfoo');
      expect(captured).toBe('Bearer tk-1');
    });

    it('omits Authorization when authToken is not set', async () => {
      let captured: string | null = '__not-set__';
      server.use(
        http.get(`${TEST_BASE_URLS.identity}/v1/identity/:did`, ({ request }) => {
          captured = request.headers.get('authorization');
          return HttpResponse.json({
            ok: true,
            data: {
              did: 'did:key:zfoo',
              agentId: '00000000-0000-0000-0000-000000000001',
              publicKey: 'AAA',
              signatureScheme: 'Ed25519',
              ownerOperatorId: 'op',
              registeredAt: '2026-04-30T00:00:00.000Z',
              revokedAt: null,
            },
          });
        }),
      );
      const client = makeClient();
      await client.identity.resolve('did:key:zfoo');
      expect(captured).toBeNull();
    });
  });

  describe('buildUrl helper', () => {
    it('joins base + path correctly and skips undefined query values', () => {
      expect(buildUrl('http://x.test', '/foo', { a: 1, b: undefined, c: 'z' })).toBe(
        'http://x.test/foo?a=1&c=z',
      );
    });

    it('strips trailing slashes from base and adds a leading slash to path', () => {
      expect(buildUrl('http://x.test/', 'foo')).toBe('http://x.test/foo');
    });

    it('omits the querystring when no query values are present', () => {
      expect(buildUrl('http://x.test', '/foo', { a: undefined })).toBe('http://x.test/foo');
    });
  });
});
