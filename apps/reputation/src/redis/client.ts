import { Redis, type Redis as RedisClient } from 'ioredis';

import { cacheKey, type ScoreCache } from '../domain/score-cache.js';

import type { SignedScoreEnvelope } from '../domain/attestation.js';

/**
 * ioredis-backed `ScoreCache`.
 *
 * `lazyConnect: true` means the TCP connection is only opened on first use
 * (or explicit `.connect()`), which keeps the server boot deterministic when
 * Redis isn't ready yet — the `/readyz` probe will report not-ready until
 * the first `ping()` succeeds.
 */
export const createRedisScoreCache = (url: string): ScoreCache => {
  const client: RedisClient = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });

  const ensureConnected = async (): Promise<void> => {
    if (
      client.status === 'ready' ||
      client.status === 'connecting' ||
      client.status === 'connect'
    ) {
      return;
    }
    await client.connect();
  };

  return {
    async get(did, scoreVersion) {
      await ensureConnected();
      const raw = await client.get(cacheKey(did, scoreVersion));
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw) as SignedScoreEnvelope;
      } catch {
        // Treat poisoned cache entries as cache misses; the score will be
        // re-computed and re-stored.
        return null;
      }
    },

    async set(envelope, ttlSeconds) {
      await ensureConnected();
      const key = cacheKey(envelope.did, envelope.scoreVersion);
      const value = JSON.stringify(envelope);
      if (ttlSeconds > 0) {
        await client.set(key, value, 'EX', ttlSeconds);
      } else {
        await client.set(key, value);
      }
    },

    async ping() {
      await ensureConnected();
      const pong: string = await client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected Redis PING response: ${String(pong)}`);
      }
    },

    async close() {
      if (client.status === 'end') {
        return;
      }
      await client.quit().catch(() => {
        // disconnected before reply; force-disconnect.
        client.disconnect();
      });
    },
  };
};
