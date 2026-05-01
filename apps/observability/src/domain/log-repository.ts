/**
 * ClickHouse-backed telemetry repository abstraction.
 *
 * Backed by `@clickhouse/client` over HTTP in production
 * (`src/clickhouse/client.ts`) and by an in-memory fake in tests
 * (`test/fakes/in-memory-clickhouse-client.ts`). The domain service only
 * ever sees this interface, so swapping providers later is a constructor
 * change.
 *
 * Two streams:
 *   - LOG events  → `colber_logs` table.
 *   - SPAN events → `colber_spans` table.
 *
 * Bulk writes are batched up the call stack by the `Batcher` (see
 * `src/domain/batcher.ts`); this interface is the *flush* boundary.
 */

import type { QueryRequest, QueryRow } from './query-types.js';
import type { LogEvent, SpanEvent } from './telemetry-types.js';

export interface TelemetryRepository {
  /** Idempotent DDL bootstrap. Safe to call at boot. */
  bootstrap(): Promise<void>;
  /** Insert a batch of log events. */
  insertLogs(events: readonly LogEvent[]): Promise<void>;
  /** Insert a batch of trace spans. */
  insertSpans(spans: readonly SpanEvent[]): Promise<void>;
  /** Run a structured query against `colber_logs` or `colber_spans`. */
  query(request: QueryRequest): Promise<readonly QueryRow[]>;
  /** Lightweight readiness check. */
  ping(): Promise<void>;
  /** Closes the underlying HTTP client. Idempotent. */
  close(): Promise<void>;
}
