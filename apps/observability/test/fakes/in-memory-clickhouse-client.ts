import type { FilterOperator } from '../../src/domain/alert-types.js';
import type { TelemetryRepository } from '../../src/domain/log-repository.js';
import type { QueryFilter, QueryRequest, QueryRow } from '../../src/domain/query-types.js';
import type { LogEvent, SpanEvent } from '../../src/domain/telemetry-types.js';

interface StoredLog extends LogEvent {
  readonly _ts: number;
}
interface StoredSpan extends SpanEvent {
  readonly _ts: number;
}

/**
 * In-memory `TelemetryRepository` for unit + integration tests.
 *
 * Records every write and supports a tiny subset of the query DSL —
 * enough for the integration tests in this package to verify routing
 * + parameter wiring. NOT a faithful ClickHouse simulator.
 *
 * Public arrays + flags are surfaced so tests can read state without
 * round-tripping through the domain.
 */
export class InMemoryClickHouseClient implements TelemetryRepository {
  public readonly logs: StoredLog[] = [];
  public readonly spans: StoredSpan[] = [];
  public bootstrapCount = 0;
  public closed = false;
  /** When set, the next call throws this error (then resets to null). */
  public throwNext: Error | null = null;

  public async bootstrap(): Promise<void> {
    this.bootstrapCount += 1;
    return Promise.resolve();
  }

  public async insertLogs(events: readonly LogEvent[]): Promise<void> {
    this.maybeThrow();
    for (const e of events) {
      this.logs.push({ ...e, _ts: Date.parse(e.timestamp) });
    }
    return Promise.resolve();
  }

  public async insertSpans(spans: readonly SpanEvent[]): Promise<void> {
    this.maybeThrow();
    for (const s of spans) {
      this.spans.push({ ...s, _ts: Date.parse(s.startTimestamp) });
    }
    return Promise.resolve();
  }

  public query(request: QueryRequest): Promise<readonly QueryRow[]> {
    this.maybeThrow();
    const fromTs = Date.parse(request.timeRange.from);
    const toTs = Date.parse(request.timeRange.to);
    if (request.scope === 'logs') {
      const matched = this.logs
        .filter((l) => l._ts >= fromTs && l._ts < toTs)
        .filter((l) => request.filters.every((f) => matchesLog(l, f)))
        .sort((a, b) => b._ts - a._ts)
        .slice(request.offset, request.offset + request.limit);
      return Promise.resolve(matched.map(toLogRow));
    }
    const matched = this.spans
      .filter((s) => s._ts >= fromTs && s._ts < toTs)
      .filter((s) => request.filters.every((f) => matchesSpan(s, f)))
      .sort((a, b) => b._ts - a._ts)
      .slice(request.offset, request.offset + request.limit);
    return Promise.resolve(matched.map(toSpanRow));
  }

  public async ping(): Promise<void> {
    this.maybeThrow();
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  private maybeThrow(): void {
    if (this.throwNext) {
      const err = this.throwNext;
      this.throwNext = null;
      throw err;
    }
  }
}

const toLogRow = (l: LogEvent): QueryRow => {
  const attrs: Record<string, string | number | boolean> = { ...(l.attributes ?? {}) };
  return {
    timestamp: l.timestamp,
    traceId: l.traceId,
    spanId: l.spanId,
    service: l.service,
    level: l.level,
    message: l.message,
    attributes: attrs,
    resource: { ...(l.resource ?? {}) },
    ...(l.parentSpanId !== undefined ? { parentSpanId: l.parentSpanId } : {}),
    ...(l.agentDid !== undefined ? { agentDid: l.agentDid } : {}),
    ...(l.operatorId !== undefined ? { operatorId: l.operatorId } : {}),
  };
};

const toSpanRow = (s: SpanEvent): QueryRow => {
  const attrs: Record<string, string | number | boolean> = { ...(s.attributes ?? {}) };
  return {
    timestamp: s.startTimestamp,
    traceId: s.traceId,
    spanId: s.spanId,
    service: s.service,
    name: s.name,
    kind: s.kind,
    status: s.status,
    startTimestamp: s.startTimestamp,
    endTimestamp: s.endTimestamp,
    durationMs: s.durationMs,
    attributes: attrs,
    resource: {},
    ...(s.parentSpanId !== undefined ? { parentSpanId: s.parentSpanId } : {}),
    ...(s.agentDid !== undefined ? { agentDid: s.agentDid } : {}),
    ...(s.operatorId !== undefined ? { operatorId: s.operatorId } : {}),
    ...(s.statusMessage !== undefined ? { statusMessage: s.statusMessage } : {}),
  };
};

const ATTR_PREFIX = 'attributes.';

const fieldValueLog = (l: LogEvent, field: string): unknown => {
  if (field.startsWith(ATTR_PREFIX)) {
    return l.attributes?.[field.slice(ATTR_PREFIX.length)];
  }
  switch (field) {
    case 'service':
      return l.service;
    case 'level':
      return l.level;
    case 'agentDid':
      return l.agentDid ?? '';
    case 'operatorId':
      return l.operatorId ?? '';
    case 'traceId':
      return l.traceId;
    case 'spanId':
      return l.spanId;
    case 'parentSpanId':
      return l.parentSpanId ?? '';
    case 'message':
      return l.message;
    default:
      return undefined;
  }
};

const fieldValueSpan = (s: SpanEvent, field: string): unknown => {
  if (field.startsWith(ATTR_PREFIX)) {
    return s.attributes?.[field.slice(ATTR_PREFIX.length)];
  }
  switch (field) {
    case 'service':
      return s.service;
    case 'kind':
      return s.kind;
    case 'status':
      return s.status;
    case 'statusMessage':
      return s.statusMessage ?? '';
    case 'agentDid':
      return s.agentDid ?? '';
    case 'operatorId':
      return s.operatorId ?? '';
    case 'traceId':
      return s.traceId;
    case 'spanId':
      return s.spanId;
    case 'parentSpanId':
      return s.parentSpanId ?? '';
    case 'name':
      return s.name;
    case 'durationMs':
      return s.durationMs;
    default:
      return undefined;
  }
};

const compare = (actual: unknown, op: FilterOperator, expected: unknown): boolean => {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && (expected as unknown[]).includes(actual);
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'contains':
      return (
        typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
      );
    case 'matches':
      return (
        typeof actual === 'string' &&
        typeof expected === 'string' &&
        new RegExp(expected).test(actual)
      );
    default:
      return false;
  }
};

const matchesLog = (l: LogEvent, filter: QueryFilter): boolean =>
  compare(fieldValueLog(l, filter.field), filter.op, filter.value);

const matchesSpan = (s: SpanEvent, filter: QueryFilter): boolean =>
  compare(fieldValueSpan(s, filter.field), filter.op, filter.value);
