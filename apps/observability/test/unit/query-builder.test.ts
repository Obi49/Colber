import { describe, expect, it } from 'vitest';

import { buildQuery } from '../../src/clickhouse/query-builder.js';

describe('buildQuery', () => {
  it('builds a logs query with no filters', () => {
    const built = buildQuery({
      scope: 'logs',
      filters: [],
      timeRange: { from: '2026-04-27T00:00:00Z', to: '2026-04-28T00:00:00Z' },
      limit: 100,
      offset: 0,
    });
    expect(built.sql).toBe(
      'SELECT * FROM praxis_logs WHERE timestamp >= parseDateTime64BestEffort({from:String}, 3) AND timestamp < parseDateTime64BestEffort({to:String}, 3) ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}',
    );
    expect(built.params).toMatchObject({
      from: '2026-04-27T00:00:00Z',
      to: '2026-04-28T00:00:00Z',
      limit: 100,
      offset: 0,
    });
  });

  it('renders eq, neq, in, gt, gte, lt, lte, contains, matches', () => {
    const built = buildQuery({
      scope: 'spans',
      filters: [
        { field: 'service', op: 'eq', value: 'memory' },
        { field: 'status', op: 'neq', value: 'ok' },
        { field: 'kind', op: 'in', value: ['client', 'server'] },
        { field: 'durationMs', op: 'gt', value: 100 },
        { field: 'durationMs', op: 'gte', value: 100 },
        { field: 'durationMs', op: 'lt', value: 500 },
        { field: 'durationMs', op: 'lte', value: 500 },
        { field: 'name', op: 'contains', value: 'POST' },
        { field: 'name', op: 'matches', value: '^POST .+' },
      ],
      timeRange: { from: '2026-04-27T00:00:00Z', to: '2026-04-28T00:00:00Z' },
      limit: 100,
      offset: 0,
    });
    expect(built.sql).toContain('service = {f0:String}');
    expect(built.sql).toContain('status != {f1:String}');
    expect(built.sql).toContain('kind IN {f2:Array(String)}');
    expect(built.sql).toContain('duration_ms > {f3:Float64}');
    expect(built.sql).toContain('duration_ms >= {f4:Float64}');
    expect(built.sql).toContain('duration_ms < {f5:Float64}');
    expect(built.sql).toContain('duration_ms <= {f6:Float64}');
    expect(built.sql).toContain('position(name, {f7:String}) > 0');
    expect(built.sql).toContain('match(name, {f8:String})');
    expect(built.params['f0']).toBe('memory');
    expect(built.params['f3']).toBe(100);
    expect(built.params['f7']).toBe('POST');
  });

  it('renders attribute keys via parallel-arrays lookup', () => {
    const built = buildQuery({
      scope: 'logs',
      filters: [{ field: 'attributes.http.status', op: 'eq', value: '200' }],
      timeRange: { from: '2026-04-27T00:00:00Z', to: '2026-04-28T00:00:00Z' },
      limit: 10,
      offset: 0,
    });
    expect(built.sql).toContain(
      "arrayElement(attributes_values, indexOf(attributes_keys, 'http.status')) = {f0:String}",
    );
    expect(built.params['f0']).toBe('200');
  });

  it('rejects unknown fields per scope', () => {
    expect(() =>
      buildQuery({
        scope: 'logs',
        filters: [{ field: 'durationMs', op: 'gt', value: 100 }],
        timeRange: { from: '2026-04-27T00:00:00Z', to: '2026-04-28T00:00:00Z' },
        limit: 10,
        offset: 0,
      }),
    ).toThrowError(/durationMs/);
  });

  it('rejects in with non-array value', () => {
    expect(() =>
      buildQuery({
        scope: 'logs',
        filters: [{ field: 'level', op: 'in', value: 'error' }],
        timeRange: { from: '2026-04-27T00:00:00Z', to: '2026-04-28T00:00:00Z' },
        limit: 10,
        offset: 0,
      }),
    ).toThrowError(/op=in/);
  });

  it('rejects numeric ops with non-number values', () => {
    expect(() =>
      buildQuery({
        scope: 'spans',
        filters: [{ field: 'durationMs', op: 'gt', value: 'fast' }],
        timeRange: { from: '2026-04-27T00:00:00Z', to: '2026-04-28T00:00:00Z' },
        limit: 10,
        offset: 0,
      }),
    ).toThrowError(/op=gt/);
  });

  it('escapes single quotes in attribute keys', () => {
    const built = buildQuery({
      scope: 'logs',
      filters: [{ field: "attributes.with'quote", op: 'eq', value: 'x' }],
      timeRange: { from: '2026-04-27T00:00:00Z', to: '2026-04-28T00:00:00Z' },
      limit: 10,
      offset: 0,
    });
    expect(built.sql).toContain("attributes_keys, 'with''quote'");
  });
});
