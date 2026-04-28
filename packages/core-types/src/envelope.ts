/**
 * Cross-cutting envelopes used in REST + MCP responses.
 * Keeps the wire format consistent between modules.
 */

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  /** Correlation id, mirrored from the request when available. */
  readonly traceId?: string;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError };

export const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });
export const err = (error: ApiError): ApiResult<never> => ({ ok: false, error });
