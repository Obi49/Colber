import type { Logger } from '@colber/core-logger';

/**
 * Thin HTTP client for the `reputation` service.
 *
 * Responsibilities:
 *  - GET `${baseUrl}/v1/reputation/score/:did` and parse the envelope.
 *  - In-memory cache by DID with a configurable TTL (default 60s).
 *  - On any failure (network error, non-200, malformed body), log at warn
 *    and return a fallback score (500 — neutral). The pricing engine then
 *    treats the agent as a typical-risk counterparty.
 *
 * The `fetch` impl is injected via the constructor so unit tests can pass
 * a fake without monkey-patching globals.
 */

export interface ReputationLookup {
  readonly score: number;
  readonly fallback: boolean;
}

export interface ReputationClient {
  getScore(did: string): Promise<ReputationLookup>;
  /** Lightweight readiness check — does the upstream answer at /healthz? */
  ping(): Promise<void>;
}

export interface ReputationClientOptions {
  readonly baseUrl: string;
  readonly cacheTtlSeconds: number;
  readonly fallbackScore?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly timeoutMs?: number;
}

interface CacheEntry {
  readonly score: number;
  readonly expiresAt: number;
}

const DEFAULT_FALLBACK_SCORE = 500;
const DEFAULT_TIMEOUT_MS = 2_000;

const isFiniteIntegerInRange = (raw: unknown, lo: number, hi: number): raw is number =>
  typeof raw === 'number' &&
  Number.isFinite(raw) &&
  Number.isInteger(raw) &&
  raw >= lo &&
  raw <= hi;

interface ScoreEnvelope {
  readonly ok?: boolean;
  readonly data?: {
    readonly did?: string;
    readonly score?: number;
  };
}

const extractScore = (raw: unknown): number | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const env = raw as ScoreEnvelope;
  const score = env.data?.score;
  if (!isFiniteIntegerInRange(score, 0, 1_000)) {
    return null;
  }
  return score;
};

export class HttpReputationClient implements ReputationClient {
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;
  private readonly fallbackScore: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly logger: Logger | undefined;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(opts: ReputationClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/u, '');
    this.cacheTtlMs = opts.cacheTtlSeconds * 1_000;
    this.fallbackScore = opts.fallbackScore ?? DEFAULT_FALLBACK_SCORE;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.logger = opts.logger;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async getScore(did: string): Promise<ReputationLookup> {
    if (this.cacheTtlMs > 0) {
      const cached = this.cache.get(did);
      if (cached && cached.expiresAt > this.now()) {
        return { score: cached.score, fallback: false };
      }
    }

    const url = `${this.baseUrl}/v1/reputation/score/${encodeURIComponent(did)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger?.warn(
          { did, status: res.status, url },
          'reputation lookup failed; using fallback score',
        );
        return { score: this.fallbackScore, fallback: true };
      }
      const body: unknown = await res.json();
      const score = extractScore(body);
      if (score === null) {
        this.logger?.warn({ did, url }, 'reputation response malformed; using fallback score');
        return { score: this.fallbackScore, fallback: true };
      }
      if (this.cacheTtlMs > 0) {
        this.cache.set(did, { score, expiresAt: this.now() + this.cacheTtlMs });
      }
      return { score, fallback: false };
    } catch (cause) {
      this.logger?.warn(
        { did, url, err: cause instanceof Error ? cause.message : String(cause) },
        'reputation lookup threw; using fallback score',
      );
      return { score: this.fallbackScore, fallback: true };
    } finally {
      clearTimeout(timer);
    }
  }

  public async ping(): Promise<void> {
    const url = `${this.baseUrl}/healthz`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`reputation /healthz returned ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Test-only: clear the in-memory cache. */
  public _resetCache(): void {
    this.cache.clear();
  }
}
