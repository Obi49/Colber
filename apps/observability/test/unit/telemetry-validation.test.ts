import { ERROR_CODES } from '@colber/core-types';
import { describe, expect, it } from 'vitest';

import { validateLogEvent, validateSpanEvent } from '../../src/domain/telemetry-validation.js';

const VALID_TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const VALID_SPAN_ID = 'b7ad6b7169203331';
const VALID_PARENT_ID = '00f067aa0ba902b7';

const baseLog = {
  timestamp: '2026-04-27T10:00:00.000Z',
  traceId: VALID_TRACE_ID,
  spanId: VALID_SPAN_ID,
  service: 'agent-identity',
  level: 'info',
  message: 'Hello world',
};

const baseSpan = {
  traceId: VALID_TRACE_ID,
  spanId: VALID_SPAN_ID,
  name: 'POST /v1/identity',
  kind: 'server',
  service: 'agent-identity',
  startTimestamp: '2026-04-27T10:00:00.000Z',
  endTimestamp: '2026-04-27T10:00:00.150Z',
  durationMs: 150,
  status: 'ok',
};

describe('validateLogEvent', () => {
  it('accepts a minimal valid event', () => {
    const out = validateLogEvent(baseLog);
    expect(out.message).toBe('Hello world');
    expect(out.traceId).toBe(VALID_TRACE_ID);
  });

  it('preserves optional fields when present', () => {
    const out = validateLogEvent({
      ...baseLog,
      parentSpanId: VALID_PARENT_ID,
      agentDid: 'did:key:alice',
      operatorId: 'op-acme',
      attributes: { 'http.status': 200, ok: true, op: 'register' },
      resource: { 'service.version': '1.2.3' },
    });
    expect(out.parentSpanId).toBe(VALID_PARENT_ID);
    expect(out.attributes).toEqual({ 'http.status': 200, ok: true, op: 'register' });
    expect(out.resource).toEqual({ 'service.version': '1.2.3' });
  });

  it('rejects an invalid traceId', () => {
    expect(() => validateLogEvent({ ...baseLog, traceId: 'too-short' })).toThrowError(/traceId/);
  });

  it('rejects an invalid spanId length', () => {
    expect(() => validateLogEvent({ ...baseLog, spanId: 'abc' })).toThrowError(/spanId/);
  });

  it('rejects an unknown level', () => {
    expect(() => validateLogEvent({ ...baseLog, level: 'panic' })).toThrowError(/level/);
  });

  it('rejects nested attribute objects', () => {
    expect(() =>
      validateLogEvent({
        ...baseLog,
        attributes: { nested: { foo: 'bar' } } as unknown,
      }),
    ).toThrowError(/attributes\.nested/);
  });

  it('rejects an invalid timestamp', () => {
    expect(() => validateLogEvent({ ...baseLog, timestamp: 'yesterday' })).toThrowError(
      /timestamp/,
    );
  });

  it('rejects an empty message', () => {
    expect(() => validateLogEvent({ ...baseLog, message: '' })).toThrowError(/message/);
  });

  it('produces a ColberError(VALIDATION_FAILED)', () => {
    try {
      validateLogEvent({ ...baseLog, level: 'panic' });
    } catch (err) {
      expect((err as { code: string }).code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }
  });
});

describe('validateSpanEvent', () => {
  it('accepts a minimal valid span', () => {
    const out = validateSpanEvent(baseSpan);
    expect(out.durationMs).toBe(150);
  });

  it('rejects when durationMs disagrees with end-start by more than 5 ms', () => {
    expect(() =>
      validateSpanEvent({
        ...baseSpan,
        durationMs: 999,
      }),
    ).toThrowError(/durationMs/);
  });

  it('accepts duration within ±5 ms tolerance', () => {
    expect(() =>
      validateSpanEvent({
        ...baseSpan,
        // end-start = 150, durationMs = 153 → within 5 ms.
        durationMs: 153,
      }),
    ).not.toThrow();
  });

  it('rejects when end < start', () => {
    expect(() =>
      validateSpanEvent({
        ...baseSpan,
        startTimestamp: '2026-04-27T10:00:01.000Z',
        endTimestamp: '2026-04-27T10:00:00.000Z',
        durationMs: -1000,
      }),
    ).toThrowError(/endTimestamp/);
  });

  it('rejects unknown kind', () => {
    expect(() => validateSpanEvent({ ...baseSpan, kind: 'unknown' })).toThrowError(/kind/);
  });

  it('rejects unknown status', () => {
    expect(() => validateSpanEvent({ ...baseSpan, status: 'whatever' })).toThrowError(/status/);
  });

  it('decodes inner span events', () => {
    const out = validateSpanEvent({
      ...baseSpan,
      events: [
        {
          timestamp: '2026-04-27T10:00:00.050Z',
          name: 'cache_miss',
          attributes: { key: 'a' },
        },
      ],
    });
    expect(out.events).toHaveLength(1);
    expect(out.events?.[0]?.name).toBe('cache_miss');
  });

  it('rejects malformed inner span events', () => {
    expect(() =>
      validateSpanEvent({
        ...baseSpan,
        events: [{ timestamp: 'nope', name: 'bad' }],
      }),
    ).toThrowError(/events\[0\]\.timestamp/);
  });
});
