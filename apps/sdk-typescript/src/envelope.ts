/**
 * Wire envelope used by every Colber service.
 *
 * Success: `{ ok: true, data: T }`
 * Failure: `{ ok: false, error: { code, message, details?, traceId? } }`
 *
 * The SDK unwraps the envelope and surfaces `data` directly to callers, or
 * throws `ColberApiError` carrying the structured error fields.
 */

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly traceId?: string;
}

export interface OkEnvelope<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ErrorEnvelope {
  readonly ok: false;
  readonly error: ApiErrorBody;
}

export type Envelope<T> = OkEnvelope<T> | ErrorEnvelope;

/**
 * Type guard — true when the value matches the success envelope shape.
 */
export const isOkEnvelope = <T>(value: unknown): value is OkEnvelope<T> =>
  typeof value === 'object' &&
  value !== null &&
  (value as { ok?: unknown }).ok === true &&
  'data' in value;

/**
 * Type guard — true when the value matches the error envelope shape.
 */
export const isErrorEnvelope = (value: unknown): value is ErrorEnvelope => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as { ok?: unknown; error?: unknown };
  if (v.ok !== false || typeof v.error !== 'object' || v.error === null) {
    return false;
  }
  const err = v.error as { code?: unknown; message?: unknown };
  return typeof err.code === 'string' && typeof err.message === 'string';
};
