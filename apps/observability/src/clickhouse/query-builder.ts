import { ERROR_CODES, ColberError } from '@colber/core-types';

import type { QueryFilter, QueryRequest } from '../domain/query-types.js';

/**
 * Translates a structured `QueryRequest` into ClickHouse SQL.
 *
 * Approach: every filter is a parameterised binding (`{name:Type}`) so the
 * @clickhouse/client driver substitutes safely. The output is the SQL string
 * + a `params` map.
 *
 * Allowlist of fields per scope:
 *   logs:  service, level, agentDid, operatorId, traceId, spanId,
 *          parentSpanId, message, attributes.<key>
 *   spans: service, kind, status, statusMessage, agentDid, operatorId,
 *          traceId, spanId, parentSpanId, name, durationMs, attributes.<key>
 *
 * Anything else is rejected with `VALIDATION_FAILED`.
 */

const ATTR_PREFIX = 'attributes.';

const LOG_FIELDS = new Set([
  'service',
  'level',
  'agentDid',
  'operatorId',
  'traceId',
  'spanId',
  'parentSpanId',
  'message',
]);
const SPAN_FIELDS = new Set([
  'service',
  'kind',
  'status',
  'statusMessage',
  'agentDid',
  'operatorId',
  'traceId',
  'spanId',
  'parentSpanId',
  'name',
  'durationMs',
]);

const SQL_FIELD: Record<string, string> = {
  service: 'service',
  level: 'level',
  agentDid: 'agent_did',
  operatorId: 'operator_id',
  traceId: 'trace_id',
  spanId: 'span_id',
  parentSpanId: 'parent_span_id',
  message: 'message',
  kind: 'kind',
  status: 'status',
  statusMessage: 'status_message',
  name: 'name',
  durationMs: 'duration_ms',
};

const NUMERIC_FIELDS = new Set(['durationMs']);

export interface BuiltQuery {
  readonly sql: string;
  readonly params: Record<string, unknown>;
}

const reject = (msg: string): never => {
  throw new ColberError(ERROR_CODES.VALIDATION_FAILED, msg, 400);
};

const tableFor = (scope: 'logs' | 'spans'): string =>
  scope === 'logs' ? 'colber_logs' : 'colber_spans';

const timestampColumn = (scope: 'logs' | 'spans'): string =>
  scope === 'logs' ? 'timestamp' : 'start_timestamp';

const validateField = (scope: 'logs' | 'spans', field: string): void => {
  if (field.startsWith(ATTR_PREFIX)) {
    const key = field.slice(ATTR_PREFIX.length);
    // Allow alphanumerics, common separators, and single quotes (escaped in
    // the SQL renderer via doubling). Reject anything that could break
    // ClickHouse identifier quoting (backslash, semicolon, parenthesis…).
    if (key.length === 0 || !/^[A-Za-z0-9_.\-:']+$/.test(key)) {
      reject(`invalid attribute key: ${key}`);
    }
    return;
  }
  const allowed = scope === 'logs' ? LOG_FIELDS : SPAN_FIELDS;
  if (!allowed.has(field)) {
    reject(`field "${field}" is not queryable on scope=${scope}`);
  }
};

const renderFieldExpr = (field: string): string => {
  if (field.startsWith(ATTR_PREFIX)) {
    const key = field.slice(ATTR_PREFIX.length);
    // Attributes are stored as parallel arrays; the value at index k is
    // arrayElement(attributes_values, indexOf(attributes_keys, '<key>')).
    // Returning '' when missing keeps op semantics aligned with string
    // comparisons (`eq` against a missing key won't match unless caller
    // explicitly passes the empty string).
    return `arrayElement(attributes_values, indexOf(attributes_keys, '${key.replace(/'/g, "''")}'))`;
  }
  const sqlField = SQL_FIELD[field];
  if (!sqlField) {
    reject(`field "${field}" is not queryable`);
  }
  return sqlField!;
};

const isNumericField = (field: string): boolean => NUMERIC_FIELDS.has(field);

const renderClause = (
  scope: 'logs' | 'spans',
  filter: QueryFilter,
  paramName: string,
): { sql: string; params: Record<string, unknown> } => {
  validateField(scope, filter.field);
  const expr = renderFieldExpr(filter.field);
  const params: Record<string, unknown> = {};

  switch (filter.op) {
    case 'eq': {
      const t = isNumericField(filter.field) ? 'Float64' : 'String';
      params[paramName] = filter.value;
      return { sql: `${expr} = {${paramName}:${t}}`, params };
    }
    case 'neq': {
      const t = isNumericField(filter.field) ? 'Float64' : 'String';
      params[paramName] = filter.value;
      return { sql: `${expr} != {${paramName}:${t}}`, params };
    }
    case 'in': {
      if (!Array.isArray(filter.value)) {
        reject('op=in requires an array value');
      }
      const arr = filter.value as readonly (string | number)[];
      if (arr.length === 0) {
        reject('op=in requires at least one value');
      }
      const t = isNumericField(filter.field) ? 'Float64' : 'String';
      params[paramName] = arr;
      return { sql: `${expr} IN {${paramName}:Array(${t})}`, params };
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (typeof filter.value !== 'number') {
        reject(`op=${filter.op} requires a numeric value`);
      }
      params[paramName] = filter.value;
      const symbol =
        filter.op === 'gt' ? '>' : filter.op === 'gte' ? '>=' : filter.op === 'lt' ? '<' : '<=';
      return { sql: `${expr} ${symbol} {${paramName}:Float64}`, params };
    }
    case 'contains': {
      if (typeof filter.value !== 'string') {
        reject('op=contains requires a string value');
      }
      params[paramName] = filter.value;
      return { sql: `position(${expr}, {${paramName}:String}) > 0`, params };
    }
    case 'matches': {
      if (typeof filter.value !== 'string') {
        reject('op=matches requires a string value');
      }
      params[paramName] = filter.value;
      return { sql: `match(${expr}, {${paramName}:String})`, params };
    }
    default: {
      // Exhaustiveness check
      const _exhaustive: never = filter.op;
      void _exhaustive;
      return reject(`unknown op: ${String(filter.op)}`);
    }
  }
};

export const buildQuery = (request: QueryRequest): BuiltQuery => {
  const table = tableFor(request.scope);
  const tsCol = timestampColumn(request.scope);

  const params: Record<string, unknown> = {
    from: request.timeRange.from,
    to: request.timeRange.to,
    limit: request.limit,
    offset: request.offset,
  };
  const where: string[] = [
    `${tsCol} >= parseDateTime64BestEffort({from:String}, 3)`,
    `${tsCol} < parseDateTime64BestEffort({to:String}, 3)`,
  ];

  request.filters.forEach((filter, i) => {
    const built = renderClause(request.scope, filter, `f${i}`);
    where.push(built.sql);
    Object.assign(params, built.params);
  });

  const sql =
    `SELECT * FROM ${table} ` +
    `WHERE ${where.join(' AND ')} ` +
    `ORDER BY ${tsCol} DESC ` +
    `LIMIT {limit:UInt32} OFFSET {offset:UInt32}`;
  return { sql, params };
};
