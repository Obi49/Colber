import type { SignedScoreEnvelope } from './attestation.js';

/**
 * Pluggable score cache. The Redis-backed implementation lives in
 * `src/redis/client.ts`; an in-memory fake under `test/fakes/` covers unit
 * tests.
 *
 * Cache key layout: `reputation:score:v{version}:{did}`. The score version is
 * baked into the key so that rolling out a v2 scorer naturally invalidates
 * every cached v1 envelope without a flush.
 */
export interface ScoreCache {
  get(did: string, scoreVersion: string): Promise<SignedScoreEnvelope | null>;
  set(envelope: SignedScoreEnvelope, ttlSeconds: number): Promise<void>;
  /** Closes the underlying connection. Idempotent. */
  close(): Promise<void>;
  /** Lightweight readiness check. */
  ping(): Promise<void>;
}

export const cacheKey = (did: string, scoreVersion: string): string =>
  `reputation:score:${scoreVersion}:${did}`;
