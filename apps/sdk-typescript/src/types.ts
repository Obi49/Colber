/**
 * Shared DTO types for the public SDK surface.
 *
 * Each service file (`services/*.ts`) re-exports its own request/response
 * types. This module centralises the types that cross service boundaries
 * (envelope, error fields) and the type-level union of service names.
 */

export type ServiceName =
  | 'identity'
  | 'reputation'
  | 'memory'
  | 'observability'
  | 'negotiation'
  | 'insurance';

export type BaseUrls = Readonly<Record<ServiceName, string>>;

export interface IdempotentOptions {
  readonly idempotencyKey: string;
}
