/**
 * Canonical Praxis telemetry shapes.
 *
 * The observability service ingests two streams:
 *   - LOG EVENTS — structured log lines (level, message, attributes) tied
 *                  to a span via the W3C trace/span ids.
 *   - TRACE SPANS — W3C-aligned, OTel-friendly spans describing one unit
 *                   of work (incoming request, outbound RPC, internal job).
 *
 * Both are aligned with OpenTelemetry semantic conventions but constrained
 * to the subset Praxis cares about. The OTel exporter (sprint 13) will map
 * these to OTLP — out of scope for this sprint.
 */

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const SPAN_KINDS = ['internal', 'client', 'server', 'producer', 'consumer'] as const;
export type SpanKind = (typeof SPAN_KINDS)[number];

export const SPAN_STATUSES = ['ok', 'error', 'unset'] as const;
export type SpanStatus = (typeof SPAN_STATUSES)[number];

/** Flat attribute map. Keys are dotted (`http.method`); values are scalars. */
export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

/** Canonical log event accepted by `observability.log`. */
export interface LogEvent {
  /** UTC ISO-8601, milliseconds precision. */
  readonly timestamp: string;
  /** 32-hex W3C trace id. Caller-supplied — services keep their context. */
  readonly traceId: string;
  /** 16-hex W3C span id. Caller-supplied. */
  readonly spanId: string;
  /** Optional 16-hex parent span id. */
  readonly parentSpanId?: string;
  /** Emitting service name (e.g. "agent-identity"). */
  readonly service: string;
  /** Operator/agent context. */
  readonly agentDid?: string;
  readonly operatorId?: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly attributes?: Attributes;
  readonly resource?: Record<string, string>;
}

/** Canonical span event accepted by `observability.trace`. */
export interface SpanEvent {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly service: string;
  readonly agentDid?: string;
  readonly operatorId?: string;
  /** UTC ISO-8601 — span start. */
  readonly startTimestamp: string;
  /** UTC ISO-8601 — span end. */
  readonly endTimestamp: string;
  /** Duration in milliseconds. Cross-checked against start/end (±5 ms). */
  readonly durationMs: number;
  readonly status: SpanStatus;
  readonly statusMessage?: string;
  readonly attributes?: Attributes;
  readonly events?: readonly SpanInnerEvent[];
}

export interface SpanInnerEvent {
  readonly timestamp: string;
  readonly name: string;
  readonly attributes?: Attributes;
}
