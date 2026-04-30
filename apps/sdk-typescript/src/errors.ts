/**
 * Error classes thrown by the SDK.
 *
 * Three layers, mutually exclusive at the `instanceof` level:
 *   - `PraxisApiError`         — service responded with `{ ok: false, error }`
 *                                 or a non-2xx the SDK couldn't parse as JSON.
 *   - `PraxisNetworkError`     — fetch threw, body parse failed, or timeout.
 *   - `PraxisValidationError`  — local SDK rejected the call before sending.
 *
 * All three extend `PraxisError` so callers can do a single base catch.
 */

import type { ApiErrorBody } from './envelope.js';

export class PraxisError extends Error {
  public override readonly name: string = 'PraxisError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PraxisApiErrorInit {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly traceId?: string;
}

/**
 * Thrown when a service returns a structured error envelope or a non-2xx
 * response. Carries the wire fields verbatim so callers can branch on
 * `code` (e.g. `VALIDATION_FAILED`, `NOT_FOUND`, `IDEMPOTENCY_REPLAY`).
 */
export class PraxisApiError extends PraxisError {
  public override readonly name = 'PraxisApiError';
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Readonly<Record<string, unknown>>;
  public readonly traceId?: string;

  constructor(init: PraxisApiErrorInit) {
    super(init.message);
    this.code = init.code;
    this.status = init.status;
    if (init.details !== undefined) {
      this.details = init.details;
    }
    if (init.traceId !== undefined) {
      this.traceId = init.traceId;
    }
  }

  /** Construct from a parsed `{ ok: false, error: ... }` envelope. */
  public static fromBody(status: number, body: ApiErrorBody): PraxisApiError {
    return new PraxisApiError({
      code: body.code,
      message: body.message,
      status,
      ...(body.details !== undefined ? { details: body.details } : {}),
      ...(body.traceId !== undefined ? { traceId: body.traceId } : {}),
    });
  }

  /** JSON-friendly representation for logging. */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.traceId !== undefined ? { traceId: this.traceId } : {}),
    };
  }
}

export type PraxisNetworkErrorCode =
  | 'TIMEOUT'
  | 'FETCH_FAILED'
  | 'INVALID_RESPONSE'
  | 'INVALID_JSON';

export interface PraxisNetworkErrorInit {
  readonly code: PraxisNetworkErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

/** Thrown for transport-level failures: fetch threw, timeout, malformed body. */
export class PraxisNetworkError extends PraxisError {
  public override readonly name = 'PraxisNetworkError';
  public readonly code: PraxisNetworkErrorCode;

  constructor(init: PraxisNetworkErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.code = init.code;
  }
}

/** Thrown when the SDK rejects the call locally (currently unused; reserved). */
export class PraxisValidationError extends PraxisError {
  public override readonly name = 'PraxisValidationError';
  public readonly path?: string;

  constructor(message: string, path?: string) {
    super(message);
    if (path !== undefined) {
      this.path = path;
    }
  }
}
