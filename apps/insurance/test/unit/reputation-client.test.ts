import { describe, expect, it, vi } from 'vitest';

import { HttpReputationClient } from '../../src/integrations/reputation-client.js';

const okResponse = (score: number, did = 'did:key:x'): Response =>
  ({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        ok: true,
        data: { did, score, scoreVersion: 'v1', computedAt: '2026-04-28T10:00:00Z' },
      }),
  }) as unknown as Response;

const errResponse = (status: number): Response =>
  ({
    ok: false,
    status,
    json: () => Promise.resolve({ ok: false, error: { code: 'X', message: 'down' } }),
  }) as unknown as Response;

describe('HttpReputationClient', () => {
  it('returns the score from a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(750, 'did:key:alice'));
    const client = new HttpReputationClient({
      baseUrl: 'http://reputation:4011',
      cacheTtlSeconds: 60,
      fetchImpl: fetchImpl,
    });
    const lookup = await client.getScore('did:key:alice');
    expect(lookup.score).toBe(750);
    expect(lookup.fallback).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/v1/reputation/score/did%3Akey%3Aalice',
    );
  });

  it('caches by DID for the configured TTL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(750));
    let now = 1_000;
    const client = new HttpReputationClient({
      baseUrl: 'http://reputation:4011',
      cacheTtlSeconds: 60,
      fetchImpl: fetchImpl,
      now: () => now,
    });
    await client.getScore('did:key:alice');
    await client.getScore('did:key:alice');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Past TTL → re-fetch.
    now += 61_000;
    await client.getScore('did:key:alice');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to score=500 on non-200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errResponse(503));
    const client = new HttpReputationClient({
      baseUrl: 'http://reputation:4011',
      cacheTtlSeconds: 60,
      fetchImpl: fetchImpl,
    });
    const lookup = await client.getScore('did:key:bob');
    expect(lookup.score).toBe(500);
    expect(lookup.fallback).toBe(true);
  });

  it('falls back to score=500 when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('econnrefused'));
    const client = new HttpReputationClient({
      baseUrl: 'http://reputation:4011',
      cacheTtlSeconds: 60,
      fetchImpl: fetchImpl,
    });
    const lookup = await client.getScore('did:key:bob');
    expect(lookup.score).toBe(500);
    expect(lookup.fallback).toBe(true);
  });

  it('falls back to score=500 on a malformed response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ totally: 'wrong' }),
    });
    const client = new HttpReputationClient({
      baseUrl: 'http://reputation:4011',
      cacheTtlSeconds: 60,
      fetchImpl: fetchImpl,
    });
    const lookup = await client.getScore('did:key:c');
    expect(lookup.score).toBe(500);
    expect(lookup.fallback).toBe(true);
  });

  it('does NOT cache fallback responses (so we retry next call)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse(800));
    const client = new HttpReputationClient({
      baseUrl: 'http://reputation:4011',
      cacheTtlSeconds: 60,
      fetchImpl: fetchImpl,
    });
    const first = await client.getScore('did:key:retry');
    expect(first.fallback).toBe(true);
    const second = await client.getScore('did:key:retry');
    expect(second.fallback).toBe(false);
    expect(second.score).toBe(800);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('ping rejects when the upstream returns non-OK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errResponse(500));
    const client = new HttpReputationClient({
      baseUrl: 'http://reputation:4011',
      cacheTtlSeconds: 60,
      fetchImpl: fetchImpl,
    });
    await expect(client.ping()).rejects.toThrow();
  });
});
