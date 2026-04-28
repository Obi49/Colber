/**
 * Query DSL for `observability.query`.
 *
 * Mirrors the alert DSL field/op vocabulary so a user who built an alert can
 * test it as a query. Translated to ClickHouse SQL by the query builder
 * (`src/clickhouse/query-builder.ts`).
 */

import type { FilterOperator, FilterValue } from './alert-types.js';

export type QueryScope = 'logs' | 'spans';

export interface QueryFilter {
  readonly field: string;
  readonly op: FilterOperator;
  readonly value: FilterValue;
}

export interface QueryTimeRange {
  /** Inclusive lower bound (UTC ISO-8601). */
  readonly from: string;
  /** Exclusive upper bound (UTC ISO-8601). */
  readonly to: string;
}

export interface QueryRequest {
  readonly scope: QueryScope;
  readonly filters: readonly QueryFilter[];
  readonly timeRange: QueryTimeRange;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Result row — the union of the columns we expose. Unused columns are
 * `undefined` for the wrong scope (e.g. `durationMs` is only meaningful
 * on spans).
 */
export interface QueryRow {
  readonly timestamp: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly service: string;
  readonly agentDid?: string;
  readonly operatorId?: string;
  // Log-only fields
  readonly level?: string;
  readonly message?: string;
  // Span-only fields
  readonly name?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly statusMessage?: string;
  readonly startTimestamp?: string;
  readonly endTimestamp?: string;
  readonly durationMs?: number;
  readonly attributes: Record<string, string | number | boolean>;
  readonly resource: Record<string, string>;
}

export interface QueryResult {
  readonly rows: readonly QueryRow[];
  readonly total: number;
}
