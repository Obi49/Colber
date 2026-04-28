import { createClient, type ClickHouseClient } from '@clickhouse/client';

import { buildQuery } from './query-builder.js';

import type { TelemetryRepository } from '../domain/log-repository.js';
import type { QueryRequest, QueryRow } from '../domain/query-types.js';
import type { Attributes, LogEvent, SpanEvent } from '../domain/telemetry-types.js';

/**
 * ClickHouse-backed `TelemetryRepository`.
 *
 * Storage strategy:
 *  - `praxis_logs`  partitioned by `toYYYYMMDD(timestamp)`,
 *                   ORDER BY (timestamp, traceId, spanId), TTL 30 days.
 *  - `praxis_spans` partitioned by `toYYYYMMDD(start_timestamp)`,
 *                   ORDER BY (start_timestamp, traceId, spanId), TTL 30 days.
 *
 * Attributes + resource maps are stored as PARALLEL ARRAYS
 * (`attributes_keys`, `attributes_values`, `resource_keys`, `resource_values`)
 * because that's the most portable shape across ClickHouse versions and
 * works without the experimental `JSON` type. Reads convert back to a flat
 * object.
 */

export interface ClickHouseConfig {
  readonly url: string;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly logTtlDays: number;
  readonly spanTtlDays: number;
}

interface AttrColumns {
  readonly attributes_keys: string[];
  readonly attributes_values: string[];
  readonly attributes_types: string[];
}

interface ResourceColumns {
  readonly resource_keys: string[];
  readonly resource_values: string[];
}

const flattenAttributes = (a: Attributes | undefined): AttrColumns => {
  const keys: string[] = [];
  const values: string[] = [];
  const types: string[] = [];
  if (a) {
    for (const [k, v] of Object.entries(a)) {
      keys.push(k);
      if (typeof v === 'string') {
        values.push(v);
        types.push('string');
      } else if (typeof v === 'number') {
        values.push(String(v));
        types.push('number');
      } else {
        values.push(v ? 'true' : 'false');
        types.push('boolean');
      }
    }
  }
  return { attributes_keys: keys, attributes_values: values, attributes_types: types };
};

const flattenResource = (r: Record<string, string> | undefined): ResourceColumns => {
  const keys: string[] = [];
  const values: string[] = [];
  if (r) {
    for (const [k, v] of Object.entries(r)) {
      keys.push(k);
      values.push(v);
    }
  }
  return { resource_keys: keys, resource_values: values };
};

const inflateAttributes = (
  keys: readonly string[],
  values: readonly string[],
  types: readonly string[],
): Record<string, string | number | boolean> => {
  const out: Record<string, string | number | boolean> = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = values[i];
    const t = types[i];
    if (k === undefined || v === undefined) {
      continue;
    }
    if (t === 'number') {
      const n = Number(v);
      out[k] = Number.isFinite(n) ? n : v;
    } else if (t === 'boolean') {
      out[k] = v === 'true';
    } else {
      out[k] = v;
    }
  }
  return out;
};

const inflateResource = (
  keys: readonly string[],
  values: readonly string[],
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = values[i];
    if (k !== undefined && v !== undefined) {
      out[k] = v;
    }
  }
  return out;
};

const logToRow = (e: LogEvent): Record<string, unknown> => {
  const attr = flattenAttributes(e.attributes);
  const resource = flattenResource(e.resource);
  return {
    timestamp: e.timestamp,
    trace_id: e.traceId,
    span_id: e.spanId,
    parent_span_id: e.parentSpanId ?? '',
    service: e.service,
    agent_did: e.agentDid ?? '',
    operator_id: e.operatorId ?? '',
    level: e.level,
    message: e.message,
    ...attr,
    ...resource,
  };
};

const spanToRow = (s: SpanEvent): Record<string, unknown> => {
  const attr = flattenAttributes(s.attributes);
  const resource: ResourceColumns = { resource_keys: [], resource_values: [] };
  return {
    trace_id: s.traceId,
    span_id: s.spanId,
    parent_span_id: s.parentSpanId ?? '',
    name: s.name,
    kind: s.kind,
    service: s.service,
    agent_did: s.agentDid ?? '',
    operator_id: s.operatorId ?? '',
    start_timestamp: s.startTimestamp,
    end_timestamp: s.endTimestamp,
    duration_ms: s.durationMs,
    status: s.status,
    status_message: s.statusMessage ?? '',
    events_json: s.events ? JSON.stringify(s.events) : '[]',
    ...attr,
    ...resource,
  };
};

const rowToQueryRow = (
  request: QueryRequest,
  raw: Record<string, unknown>,
): QueryRow => {
  const attr = inflateAttributes(
    (raw['attributes_keys'] as string[] | undefined) ?? [],
    (raw['attributes_values'] as string[] | undefined) ?? [],
    (raw['attributes_types'] as string[] | undefined) ?? [],
  );
  const resource = inflateResource(
    (raw['resource_keys'] as string[] | undefined) ?? [],
    (raw['resource_values'] as string[] | undefined) ?? [],
  );

  if (request.scope === 'logs') {
    const out: QueryRow = {
      timestamp: String(raw['timestamp']),
      traceId: String(raw['trace_id']),
      spanId: String(raw['span_id']),
      service: String(raw['service']),
      level: String(raw['level']),
      message: String(raw['message']),
      attributes: attr,
      resource,
      ...(raw['parent_span_id'] ? { parentSpanId: String(raw['parent_span_id']) } : {}),
      ...(raw['agent_did'] ? { agentDid: String(raw['agent_did']) } : {}),
      ...(raw['operator_id'] ? { operatorId: String(raw['operator_id']) } : {}),
    };
    return out;
  }
  const out: QueryRow = {
    timestamp: String(raw['start_timestamp']),
    traceId: String(raw['trace_id']),
    spanId: String(raw['span_id']),
    service: String(raw['service']),
    name: String(raw['name']),
    kind: String(raw['kind']),
    status: String(raw['status']),
    startTimestamp: String(raw['start_timestamp']),
    endTimestamp: String(raw['end_timestamp']),
    durationMs: Number(raw['duration_ms']),
    attributes: attr,
    resource,
    ...(raw['parent_span_id'] ? { parentSpanId: String(raw['parent_span_id']) } : {}),
    ...(raw['agent_did'] ? { agentDid: String(raw['agent_did']) } : {}),
    ...(raw['operator_id'] ? { operatorId: String(raw['operator_id']) } : {}),
    ...(raw['status_message'] ? { statusMessage: String(raw['status_message']) } : {}),
  };
  return out;
};

export class ClickHouseTelemetryRepository implements TelemetryRepository {
  private readonly client: ClickHouseClient;

  constructor(private readonly cfg: ClickHouseConfig) {
    this.client = createClient({
      url: cfg.url,
      username: cfg.username,
      password: cfg.password,
      database: cfg.database,
      // 5 s connect, 30 s query — observability writes are bursty but
      // queries can be slow on cold partitions.
      request_timeout: 30_000,
      compression: { request: false, response: true },
    });
  }

  public async bootstrap(): Promise<void> {
    const logsDdl = buildLogsDdl(this.cfg.database, this.cfg.logTtlDays);
    const spansDdl = buildSpansDdl(this.cfg.database, this.cfg.spanTtlDays);
    await this.client.command({ query: logsDdl });
    await this.client.command({ query: spansDdl });
  }

  public async insertLogs(events: readonly LogEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.client.insert({
      table: 'praxis_logs',
      values: events.map(logToRow),
      format: 'JSONEachRow',
    });
  }

  public async insertSpans(spans: readonly SpanEvent[]): Promise<void> {
    if (spans.length === 0) {
      return;
    }
    await this.client.insert({
      table: 'praxis_spans',
      values: spans.map(spanToRow),
      format: 'JSONEachRow',
    });
  }

  public async query(request: QueryRequest): Promise<readonly QueryRow[]> {
    const built = buildQuery(request);
    const result = await this.client.query({
      query: built.sql,
      query_params: built.params,
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Record<string, unknown>[];
    return rows.map((row) => rowToQueryRow(request, row));
  }

  public async ping(): Promise<void> {
    const res = await this.client.ping();
    if (!res.success) {
      throw new Error(`ClickHouse ping failed: ${String(res.error)}`);
    }
  }

  public async close(): Promise<void> {
    await this.client.close();
  }
}

export const buildLogsDdl = (db: string, ttlDays: number): string =>
  `CREATE TABLE IF NOT EXISTS ${db}.praxis_logs (
    timestamp DateTime64(3, 'UTC'),
    trace_id String,
    span_id String,
    parent_span_id String DEFAULT '',
    service LowCardinality(String),
    agent_did String DEFAULT '',
    operator_id String DEFAULT '',
    level LowCardinality(String),
    message String,
    attributes_keys Array(String),
    attributes_values Array(String),
    attributes_types Array(String),
    resource_keys Array(String),
    resource_values Array(String)
  )
  ENGINE = MergeTree
  PARTITION BY toYYYYMMDD(timestamp)
  ORDER BY (timestamp, trace_id, span_id)
  TTL toDateTime(timestamp) + INTERVAL ${ttlDays} DAY
  SETTINGS index_granularity = 8192`;

export const buildSpansDdl = (db: string, ttlDays: number): string =>
  `CREATE TABLE IF NOT EXISTS ${db}.praxis_spans (
    trace_id String,
    span_id String,
    parent_span_id String DEFAULT '',
    name String,
    kind LowCardinality(String),
    service LowCardinality(String),
    agent_did String DEFAULT '',
    operator_id String DEFAULT '',
    start_timestamp DateTime64(3, 'UTC'),
    end_timestamp DateTime64(3, 'UTC'),
    duration_ms Float64,
    status LowCardinality(String),
    status_message String DEFAULT '',
    events_json String DEFAULT '[]',
    attributes_keys Array(String),
    attributes_values Array(String),
    attributes_types Array(String),
    resource_keys Array(String) DEFAULT [],
    resource_values Array(String) DEFAULT []
  )
  ENGINE = MergeTree
  PARTITION BY toYYYYMMDD(start_timestamp)
  ORDER BY (start_timestamp, trace_id, span_id)
  TTL toDateTime(start_timestamp) + INTERVAL ${ttlDays} DAY
  SETTINGS index_granularity = 8192`;
