/**
 * `ColberClient` — the main entry point of the SDK.
 *
 * Bundles one typed client per service, sharing a single fetch wrapper
 * configured with timeout / retry / auth. Constructor accepts a fully
 * explicit base URL map; convenience factories `local()` and `fromBaseUrl()`
 * cover the common cases.
 */

import { IdentityService } from './services/identity.js';
import { InsuranceService } from './services/insurance.js';
import { MemoryService } from './services/memory.js';
import { NegotiationService } from './services/negotiation.js';
import { ObservabilityService } from './services/observability.js';
import { ReputationService } from './services/reputation.js';

import type { FetchLike, HttpClientOptions, RetryConfig } from './http.js';
import type { BaseUrls, ServiceName } from './types.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES: RetryConfig = { count: 2, backoffMs: 100 };

/** Default β-VM ports. Used by the `local()` factory and as docs. */
export const DEFAULT_LOCAL_PORTS: Readonly<Record<ServiceName, number>> = {
  identity: 14001,
  reputation: 14011,
  memory: 14021,
  observability: 14031,
  negotiation: 14041,
  insurance: 14051,
};

/** Service path used by `fromBaseUrl()` ingress mapping (PROVISIONAL). */
export const DEFAULT_INGRESS_PATHS: Readonly<Record<ServiceName, string>> = {
  identity: '/identity',
  reputation: '/reputation',
  memory: '/memory',
  observability: '/observability',
  negotiation: '/negotiation',
  insurance: '/insurance',
};

export interface ColberClientOptions {
  readonly baseUrls: BaseUrls;
  /**
   * Custom fetch implementation. Defaults to `globalThis.fetch` (Node 20+,
   * Bun, Deno, browsers). Tests inject a mocked fetch to assert request
   * shape and simulate failures.
   */
  readonly fetch?: FetchLike;
  /** Per-request timeout in ms. Default: 5_000. */
  readonly timeoutMs?: number;
  /** Retry policy on 5xx and transport failures. Default: 2 retries, 100ms backoff. */
  readonly retries?: RetryConfig;
  /**
   * Optional bearer token. Sent as `Authorization: Bearer <token>` on every
   * request. The v1 platform doesn't enforce auth yet, but the hook is in
   * place for v2.
   */
  readonly authToken?: string;
  /**
   * Override the inter-retry sleep. Tests inject a no-op stub. Production
   * leaves this undefined and the http layer uses `setTimeout`.
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

export class ColberClient {
  public readonly identity: IdentityService;
  public readonly reputation: ReputationService;
  public readonly memory: MemoryService;
  public readonly observability: ObservabilityService;
  public readonly negotiation: NegotiationService;
  public readonly insurance: InsuranceService;

  constructor(options: ColberClientOptions) {
    const fetchImpl = options.fetch ?? ColberClient.resolveDefaultFetch();

    const httpOpts: HttpClientOptions = {
      fetch: fetchImpl,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: options.retries ?? DEFAULT_RETRIES,
      ...(options.authToken !== undefined ? { authToken: options.authToken } : {}),
      ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    };

    this.identity = new IdentityService(httpOpts, options.baseUrls.identity);
    this.reputation = new ReputationService(httpOpts, options.baseUrls.reputation);
    this.memory = new MemoryService(httpOpts, options.baseUrls.memory);
    this.observability = new ObservabilityService(httpOpts, options.baseUrls.observability);
    this.negotiation = new NegotiationService(httpOpts, options.baseUrls.negotiation);
    this.insurance = new InsuranceService(httpOpts, options.baseUrls.insurance);
  }

  /**
   * Returns a client wired to the default β-VM ports on `localhost`. Handy
   * for local dev against `colber-stack/docker-compose.services.yml`.
   */
  public static local(overrides?: Omit<ColberClientOptions, 'baseUrls'>): ColberClient {
    const baseUrls: BaseUrls = {
      identity: `http://localhost:${DEFAULT_LOCAL_PORTS.identity}`,
      reputation: `http://localhost:${DEFAULT_LOCAL_PORTS.reputation}`,
      memory: `http://localhost:${DEFAULT_LOCAL_PORTS.memory}`,
      observability: `http://localhost:${DEFAULT_LOCAL_PORTS.observability}`,
      negotiation: `http://localhost:${DEFAULT_LOCAL_PORTS.negotiation}`,
      insurance: `http://localhost:${DEFAULT_LOCAL_PORTS.insurance}`,
    };
    return new ColberClient({ baseUrls, ...(overrides ?? {}) });
  }

  /**
   * Returns a client where every service is reached via path-based routing
   * under a single base (e.g. `https://api.colber.dev/identity`,
   * `https://api.colber.dev/reputation`).
   *
   * **PROVISIONAL** — assumes a future ingress configuration. The v1
   * deployment exposes each service on a dedicated port; use the explicit
   * `baseUrls` constructor for that case.
   */
  public static fromBaseUrl(
    base: string,
    overrides?: Omit<ColberClientOptions, 'baseUrls'>,
  ): ColberClient {
    const trimmed = base.replace(/\/+$/, '');
    const baseUrls: BaseUrls = {
      identity: `${trimmed}${DEFAULT_INGRESS_PATHS.identity}`,
      reputation: `${trimmed}${DEFAULT_INGRESS_PATHS.reputation}`,
      memory: `${trimmed}${DEFAULT_INGRESS_PATHS.memory}`,
      observability: `${trimmed}${DEFAULT_INGRESS_PATHS.observability}`,
      negotiation: `${trimmed}${DEFAULT_INGRESS_PATHS.negotiation}`,
      insurance: `${trimmed}${DEFAULT_INGRESS_PATHS.insurance}`,
    };
    return new ColberClient({ baseUrls, ...(overrides ?? {}) });
  }

  /**
   * Resolves `globalThis.fetch` lazily so the SDK loads cleanly on runtimes
   * that polyfill fetch after import (older Node setups, custom test rigs).
   * Throws a clear error message if no fetch is available — better than a
   * cryptic "is not a function" later.
   */
  private static resolveDefaultFetch(): FetchLike {
    const f = (globalThis as { fetch?: FetchLike }).fetch;
    if (typeof f !== 'function') {
      throw new Error(
        'ColberClient: no global fetch found. Pass `options.fetch` (Node <18, custom runtime) or upgrade to Node 20+.',
      );
    }
    return f.bind(globalThis);
  }
}
