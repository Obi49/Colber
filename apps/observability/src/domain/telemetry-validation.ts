import { ERROR_CODES, PraxisError } from '@praxis/core-types';

import {
  LOG_LEVELS,
  SPAN_KINDS,
  SPAN_STATUSES,
  type LogEvent,
  type LogLevel,
  type SpanEvent,
  type SpanKind,
  type SpanStatus,
} from './telemetry-types.js';

/**
 * Pure-function validators for telemetry payloads.
 *
 * Returns a typed `LogEvent` / `SpanEvent` on success, or throws a
 * `PraxisError(VALIDATION_FAILED)` describing the first violation. The HTTP
 * + MCP layers wrap callers so violations land as 400s with a stable
 * `{ index, reason }` shape.
 */

const HEX32 = /^[0-9a-f]{32}$/i;
const HEX16 = /^[0-9a-f]{16}$/i;

const SPAN_DURATION_TOLERANCE_MS = 5;

const isLogLevel = (v: unknown): v is LogLevel =>
  typeof v === 'string' && (LOG_LEVELS as readonly string[]).includes(v);

const isSpanKind = (v: unknown): v is SpanKind =>
  typeof v === 'string' && (SPAN_KINDS as readonly string[]).includes(v);

const isSpanStatus = (v: unknown): v is SpanStatus =>
  typeof v === 'string' && (SPAN_STATUSES as readonly string[]).includes(v);

const reject = (msg: string): never => {
  throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, msg, 400);
};

const requireIso8601 = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return reject(`${field} must be an ISO-8601 string`);
  }
  const t = Date.parse(raw);
  if (Number.isNaN(t)) {
    return reject(`${field} must be a valid ISO-8601 timestamp`);
  }
  return raw;
};

const requireHex = (raw: unknown, field: string, re: RegExp, label: string): string => {
  if (typeof raw !== 'string' || !re.test(raw)) {
    return reject(`${field} must be a ${label} hex string`);
  }
  return raw.toLowerCase();
};

const optionalHex = (
  raw: unknown,
  field: string,
  re: RegExp,
  label: string,
): string | undefined => {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  return requireHex(raw, field, re, label);
};

const requireString = (raw: unknown, field: string, max = 4096): string => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return reject(`${field} must be a non-empty string`);
  }
  if (raw.length > max) {
    return reject(`${field} exceeds maximum length of ${max}`);
  }
  return raw;
};

const optionalString = (raw: unknown, field: string, max = 4096): string | undefined => {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  return requireString(raw, field, max);
};

const requireAttributes = (
  raw: unknown,
  field: string,
): Record<string, string | number | boolean> | undefined => {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return reject(`${field} must be a flat object of scalar values`);
  }
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      return reject(`${field}.${k} must be string | number | boolean (no nested objects)`);
    }
    out[k] = v;
  }
  return out;
};

const requireResource = (
  raw: unknown,
  field: string,
): Record<string, string> | undefined => {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return reject(`${field} must be a flat string-valued object`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') {
      return reject(`${field}.${k} must be a string`);
    }
    out[k] = v;
  }
  return out;
};

/** Build a fully-validated `LogEvent`. Throws on first violation. */
export const validateLogEvent = (raw: unknown): LogEvent => {
  if (!raw || typeof raw !== 'object') {
    return reject('event must be an object');
  }
  const r = raw as Record<string, unknown>;
  const timestamp = requireIso8601(r['timestamp'], 'timestamp');
  const traceId = requireHex(r['traceId'], 'traceId', HEX32, '32-character');
  const spanId = requireHex(r['spanId'], 'spanId', HEX16, '16-character');
  const parentSpanId = optionalHex(r['parentSpanId'], 'parentSpanId', HEX16, '16-character');
  const service = requireString(r['service'], 'service', 256);
  const agentDid = optionalString(r['agentDid'], 'agentDid', 512);
  const operatorId = optionalString(r['operatorId'], 'operatorId', 256);
  if (!isLogLevel(r['level'])) {
    return reject(`level must be one of ${LOG_LEVELS.join(', ')}`);
  }
  const message = requireString(r['message'], 'message', 16_384);
  const attributes = requireAttributes(r['attributes'], 'attributes');
  const resource = requireResource(r['resource'], 'resource');

  const event: LogEvent = {
    timestamp,
    traceId,
    spanId,
    service,
    level: r['level'],
    message,
    ...(parentSpanId !== undefined ? { parentSpanId } : {}),
    ...(agentDid !== undefined ? { agentDid } : {}),
    ...(operatorId !== undefined ? { operatorId } : {}),
    ...(attributes !== undefined ? { attributes } : {}),
    ...(resource !== undefined ? { resource } : {}),
  };
  return event;
};

const validateSpanInnerEvents = (raw: unknown): SpanEvent['events'] => {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return reject('events must be an array');
  }
  return raw.map((e: unknown, i) => {
    if (!e || typeof e !== 'object') {
      return reject(`events[${i}] must be an object`);
    }
    const er = e as Record<string, unknown>;
    const ts = requireIso8601(er['timestamp'], `events[${i}].timestamp`);
    const name = requireString(er['name'], `events[${i}].name`, 512);
    const attributes = requireAttributes(er['attributes'], `events[${i}].attributes`);
    return {
      timestamp: ts,
      name,
      ...(attributes !== undefined ? { attributes } : {}),
    };
  });
};

/** Build a fully-validated `SpanEvent`. Throws on first violation. */
export const validateSpanEvent = (raw: unknown): SpanEvent => {
  if (!raw || typeof raw !== 'object') {
    return reject('span must be an object');
  }
  const r = raw as Record<string, unknown>;
  const traceId = requireHex(r['traceId'], 'traceId', HEX32, '32-character');
  const spanId = requireHex(r['spanId'], 'spanId', HEX16, '16-character');
  const parentSpanId = optionalHex(r['parentSpanId'], 'parentSpanId', HEX16, '16-character');
  const name = requireString(r['name'], 'name', 512);
  if (!isSpanKind(r['kind'])) {
    return reject(`kind must be one of ${SPAN_KINDS.join(', ')}`);
  }
  const service = requireString(r['service'], 'service', 256);
  const agentDid = optionalString(r['agentDid'], 'agentDid', 512);
  const operatorId = optionalString(r['operatorId'], 'operatorId', 256);
  const startTimestamp = requireIso8601(r['startTimestamp'], 'startTimestamp');
  const endTimestamp = requireIso8601(r['endTimestamp'], 'endTimestamp');
  const rawDuration = r['durationMs'];
  if (typeof rawDuration !== 'number' || !Number.isFinite(rawDuration) || rawDuration < 0) {
    return reject('durationMs must be a non-negative finite number');
  }
  const computedDuration = Date.parse(endTimestamp) - Date.parse(startTimestamp);
  if (computedDuration < 0) {
    return reject('endTimestamp must be greater than or equal to startTimestamp');
  }
  if (Math.abs(computedDuration - rawDuration) > SPAN_DURATION_TOLERANCE_MS) {
    return reject(
      `durationMs (${rawDuration}) does not match end-start (${computedDuration}) within ${SPAN_DURATION_TOLERANCE_MS} ms tolerance`,
    );
  }
  if (!isSpanStatus(r['status'])) {
    return reject(`status must be one of ${SPAN_STATUSES.join(', ')}`);
  }
  const statusMessage = optionalString(r['statusMessage'], 'statusMessage', 4096);
  const attributes = requireAttributes(r['attributes'], 'attributes');
  const events = validateSpanInnerEvents(r['events']);

  const span: SpanEvent = {
    traceId,
    spanId,
    name,
    kind: r['kind'],
    service,
    startTimestamp,
    endTimestamp,
    durationMs: rawDuration,
    status: r['status'],
    ...(parentSpanId !== undefined ? { parentSpanId } : {}),
    ...(agentDid !== undefined ? { agentDid } : {}),
    ...(operatorId !== undefined ? { operatorId } : {}),
    ...(statusMessage !== undefined ? { statusMessage } : {}),
    ...(attributes !== undefined ? { attributes } : {}),
    ...(events !== undefined ? { events } : {}),
  };
  return span;
};
