import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { TEST_BASE_URLS, makeClient } from '../fixtures.js';
import { server } from '../msw-server.js';

const ID = '00000000-0000-0000-0000-000000000001';
const OWNER = 'did:key:zfoo';

describe('MemoryService', () => {
  it('store: POSTs to /v1/memory and returns id + embedding meta', async () => {
    server.use(
      http.post(`${TEST_BASE_URLS.memory}/v1/memory`, () =>
        HttpResponse.json(
          {
            ok: true,
            data: { id: ID, embedding: { model: 'nomic-embed-text', dim: 768 } },
          },
          { status: 201 },
        ),
      ),
    );
    const client = makeClient();
    const r = await client.memory.store({
      ownerDid: OWNER,
      type: 'fact',
      text: 'water boils at 100C',
      permissions: { visibility: 'private' },
    });
    expect(r.id).toBe(ID);
    expect(r.embedding.dim).toBe(768);
  });

  it('search: POSTs to /v1/memory/search and returns the hit list', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.memory}/v1/memory/search`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          ok: true,
          data: {
            hits: [{ id: ID, score: 0.91, type: 'fact', ownerDid: OWNER, snippet: 'water...' }],
          },
        });
      }),
    );
    const client = makeClient();
    const r = await client.memory.search({
      queryDid: OWNER,
      queryText: 'boiling',
      topK: 3,
      filters: { type: 'fact' },
    });
    expect(captured).toMatchObject({ topK: 3, filters: { type: 'fact' } });
    expect(r.hits).toHaveLength(1);
  });

  it('retrieve: GETs /v1/memory/:id?callerDid=...', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${TEST_BASE_URLS.memory}/v1/memory/:id`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: {
            id: ID,
            ownerDid: OWNER,
            type: 'fact',
            text: 'water boils at 100C',
            payload: {},
            permissions: { visibility: 'private', sharedWith: [] },
            encryption: { enabled: false, algorithm: '', keyId: '' },
            createdAt: '2026-04-30T00:00:00.000Z',
            updatedAt: '2026-04-30T00:00:00.000Z',
            version: 1,
            embedding: { model: 'nomic-embed-text', dim: 768 },
          },
        });
      }),
    );
    const client = makeClient();
    await client.memory.retrieve({ id: ID, callerDid: OWNER });
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('callerDid')).toBe(OWNER);
    expect(url.pathname).toBe(`/v1/memory/${ID}`);
  });

  it('update: PATCHes /v1/memory/:id with the partial body', async () => {
    let captured: unknown;
    server.use(
      http.patch(`${TEST_BASE_URLS.memory}/v1/memory/:id`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { id: ID, version: 2, embedding: { model: 'nomic-embed-text', dim: 768 } },
        });
      }),
    );
    const client = makeClient();
    const r = await client.memory.update({
      id: ID,
      callerDid: OWNER,
      text: 'water boils at 100°C at 1 atm',
    });
    expect(captured).toEqual({ callerDid: OWNER, text: 'water boils at 100°C at 1 atm' });
    expect(r.version).toBe(2);
  });

  it('share: POSTs to /v1/memory/:id/share with the share list', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.memory}/v1/memory/:id/share`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { id: ID, sharedWith: ['did:key:zbar'] },
        });
      }),
    );
    const client = makeClient();
    const r = await client.memory.share({
      id: ID,
      callerDid: OWNER,
      shareWith: ['did:key:zbar'],
    });
    expect(captured).toMatchObject({ shareWith: ['did:key:zbar'] });
    expect(r.sharedWith).toEqual(['did:key:zbar']);
  });
});
