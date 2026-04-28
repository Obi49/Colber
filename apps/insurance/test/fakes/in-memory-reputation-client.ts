import type {
  ReputationClient,
  ReputationLookup,
} from '../../src/integrations/reputation-client.js';

/**
 * Test-only `ReputationClient`. Returns a configurable score map; defaults
 * to 500 (neutral) for unknown DIDs. Tracks how many times each DID was
 * looked up so caching tests can assert behaviour.
 */
export class InMemoryReputationClient implements ReputationClient {
  public readonly callsByDid = new Map<string, number>();
  public pingFails = false;

  constructor(
    private readonly scores: Map<string, number> = new Map(),
    private readonly fallback = 500,
  ) {}

  public setScore(did: string, score: number): void {
    this.scores.set(did, score);
  }

  public getScore(did: string): Promise<ReputationLookup> {
    this.callsByDid.set(did, (this.callsByDid.get(did) ?? 0) + 1);
    const stored = this.scores.get(did);
    if (stored === undefined) {
      return Promise.resolve({ score: this.fallback, fallback: true });
    }
    return Promise.resolve({ score: stored, fallback: false });
  }

  public ping(): Promise<void> {
    if (this.pingFails) {
      return Promise.reject(new Error('reputation upstream is down'));
    }
    return Promise.resolve();
  }
}
