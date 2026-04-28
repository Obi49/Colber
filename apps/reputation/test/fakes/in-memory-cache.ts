import { cacheKey, type ScoreCache } from '../../src/domain/score-cache.js';

import type { SignedScoreEnvelope } from '../../src/domain/attestation.js';

interface Entry {
  envelope: SignedScoreEnvelope;
  expiresAt: number; // epoch ms; +Infinity = never
}

export class InMemoryScoreCache implements ScoreCache {
  private readonly entries = new Map<string, Entry>();

  public async get(did: string, scoreVersion: string): Promise<SignedScoreEnvelope | null> {
    const key = cacheKey(did, scoreVersion);
    const entry = this.entries.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.envelope);
  }

  public async set(envelope: SignedScoreEnvelope, ttlSeconds: number): Promise<void> {
    const key = cacheKey(envelope.did, envelope.scoreVersion);
    this.entries.set(key, {
      envelope,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.POSITIVE_INFINITY,
    });
    return Promise.resolve();
  }

  public async ping(): Promise<void> {
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  public size(): number {
    return this.entries.size;
  }
}
