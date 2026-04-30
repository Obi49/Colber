/**
 * Lightweight fetch wrapper used by every service client.
 *
 * Responsibilities:
 *   - URL building (base + path + querystring)
 *   - Auth header injection (`Authorization: Bearer ...` if `authToken` set)
 *   - JSON encoding / decoding
 *   - Envelope unwrapping (`{ ok: true, data }` → data, `{ ok: false, error }` → throw)
 *   - Timeout via `AbortController`
 *   - Retry with exponential backoff on 5xx and fetch-level failures
 *
 * The wrapper is intentionally small and dependency-free. Tests inject a
 * stubbed `fetch` (typically MSW's interceptor) via the `PraxisClient`
 * constructor so this module is exercised in lockstep with the service
 * clients.
 */

import { isErrorEnvelope, isOkEnvelope } from './envelope.js';
import { PraxisApiError, PraxisNetworkError } from './errors.js';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface RetryConfig {
  /** Maximum extra attempts after the first try. `2` => up to 3 total tries. */
  readonly count: number;
  /** Initial backoff in ms; subsequent attempts double the delay. */
  readonly backoffMs: number;
}

export interface HttpClientOptions {
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
  readonly retries: RetryConfig;
  readonly authToken?: string;
  /**
   * When set, the client pauses for the requested ms between retries. Tests
   * inject a stub that returns immediately so retry semantics can be verified
   * without real timers.
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RequestParams {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  readonly baseUrl: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  /**
   * When `true`, treat the response body as `void` (no envelope, no JSON
   * decode). Used for 204-No-Content endpoints like `DELETE /alerts/:id`.
   */
  readonly expectNoBody?: boolean;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pure helper — joins `base` and `path` and appends a querystring built from
 * `query` (skipping `undefined` values). Exported for tests.
 */
export const buildUrl = (
  base: string,
  path: string,
  query?: Readonly<Record<string, string | number | boolean | undefined>>,
): string => {
  const trimmedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${trimmedBase}${normalizedPath}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      params.append(key, String(value));
    }
    const qs = params.toString();
    if (qs.length > 0) {
      url += `?${qs}`;
    }
  }
  return url;
};

const isRetriableStatus = (status: number): boolean => status >= 500 && status <= 599;

/**
 * Run a single HTTP attempt, including timeout. Resolves with the parsed body
 * (already envelope-checked) on 2xx, or throws `PraxisApiError` on a 4xx/5xx
 * with a parseable error envelope. Throws `PraxisNetworkError` on transport
 * failures; the caller decides whether to retry.
 */
const runOnce = async <T>(
  options: HttpClientOptions,
  params: RequestParams,
): Promise<T | undefined> => {
  const url = buildUrl(params.baseUrl, params.path, params.query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (params.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.authToken !== undefined) {
    headers.authorization = `Bearer ${options.authToken}`;
  }

  let response: Response;
  try {
    response = await options.fetch(url, {
      method: params.method,
      headers,
      ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
      signal: controller.signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new PraxisNetworkError({
        code: 'TIMEOUT',
        message: `Request timed out after ${options.timeoutMs}ms: ${params.method} ${url}`,
        cause,
      });
    }
    throw new PraxisNetworkError({
      code: 'FETCH_FAILED',
      message: `fetch failed: ${params.method} ${url}`,
      cause,
    });
  } finally {
    clearTimeout(timeout);
  }

  // 204 / explicit no-body — short-circuit.
  if (params.expectNoBody === true || response.status === 204) {
    if (!response.ok) {
      // 4xx with no body shouldn't happen from our services, but be defensive.
      throw new PraxisApiError({
        code: 'HTTP_ERROR',
        message: `HTTP ${response.status} ${response.statusText}`,
        status: response.status,
      });
    }
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    throw new PraxisNetworkError({
      code: 'INVALID_JSON',
      message: `failed to parse JSON response: ${params.method} ${url}`,
      cause,
    });
  }

  if (response.ok) {
    if (!isOkEnvelope<T>(parsed)) {
      throw new PraxisNetworkError({
        code: 'INVALID_RESPONSE',
        message: `unexpected response shape (missing ok/data): ${params.method} ${url}`,
      });
    }
    return parsed.data;
  }

  if (isErrorEnvelope(parsed)) {
    throw PraxisApiError.fromBody(response.status, parsed.error);
  }

  throw new PraxisApiError({
    code: 'HTTP_ERROR',
    message: `HTTP ${response.status} ${response.statusText}`,
    status: response.status,
  });
};

/**
 * Outer driver — runs `runOnce` up to `retries.count + 1` times, retrying on
 * 5xx `PraxisApiError` and on `PraxisNetworkError` (except TIMEOUT, which
 * indicates the user budget is exhausted on this call). Backoff is
 * exponential: `backoffMs * 2^attempt`.
 */
export const request = async <T>(
  options: HttpClientOptions,
  params: RequestParams,
): Promise<T | undefined> => {
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.retries.count + 1;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      return await runOnce<T>(options, params);
    } catch (err) {
      lastError = err;

      const isLast = attempt === maxAttempts - 1;
      if (isLast) {
        break;
      }

      // Decide whether to retry. We retry on:
      //   - PraxisNetworkError with code FETCH_FAILED or INVALID_JSON / INVALID_RESPONSE
      //   - PraxisApiError with HTTP 5xx
      // We do NOT retry on:
      //   - TIMEOUT (user budget already exhausted)
      //   - 4xx (client error — replaying won't help)
      let retriable = false;
      if (err instanceof PraxisNetworkError) {
        retriable = err.code !== 'TIMEOUT';
      } else if (err instanceof PraxisApiError) {
        retriable = isRetriableStatus(err.status);
      }
      if (!retriable) {
        break;
      }

      const delay = options.retries.backoffMs * Math.pow(2, attempt);
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
};
