/**
 * Stable error codes used across Colber services.
 * Keep this list curated: any new code should be added here first,
 * then referenced by services. Codes are SCREAMING_SNAKE_CASE.
 */
export const ERROR_CODES = {
  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',

  // Identity-specific
  INVALID_PUBLIC_KEY: 'INVALID_PUBLIC_KEY',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  DID_ALREADY_REGISTERED: 'DID_ALREADY_REGISTERED',
  DID_NOT_FOUND: 'DID_NOT_FOUND',
  DID_REVOKED: 'DID_REVOKED',
  UNSUPPORTED_DID_METHOD: 'UNSUPPORTED_DID_METHOD',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Domain error thrown by services. Caught by the HTTP layer and mapped
 * to a structured `ApiError` envelope (see `envelope.ts`).
 */
export class ColberError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ColberError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
