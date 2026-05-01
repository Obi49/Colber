import { describe, expect, it } from 'vitest';

import { registerObservabilityTools } from '../../src/tools/observability.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { newCtx, newRegistry, parseError, parseOk } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

const setup = (): { registry: ReturnType<typeof newRegistry>; sdk: FakeSdkClient } => {
  const sdk = new FakeSdkClient();
  const registry = newRegistry();
  registerObservabilityTools(registry, sdk as unknown as ColberClient);
  return { registry, sdk };
};

describe('observability MCP tools', () => {
  it('registers 8 tools (3 ingest/query + 5 alert CRUD)', () => {
    const { registry } = setup();
    expect(registry.size()).toBe(8);
    expect(registry.names()).toEqual(
      expect.arrayContaining([
        'colber_observability_log',
        'colber_observability_trace',
        'colber_observability_query',
        'colber_observability_alert_create',
        'colber_observability_alert_get',
        'colber_observability_alert_patch',
        'colber_observability_alert_list',
        'colber_observability_alert_delete',
      ]),
    );
  });

  it('log: ingests events', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_observability_log',
      { events: [{ ts: '2026-05-01T00:00:00Z', level: 'info', message: 'hi' }] },
      newCtx(),
    );
    const body = parseOk(result) as { accepted: number };
    expect(body.accepted).toBe(1);
    expect(sdk.observability.state.lastCall?.method).toBe('ingestLogs');
  });

  it('trace: ingests spans', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_observability_trace',
      { spans: [{ traceId: 't1', spanId: 's1', name: 'op' }] },
      newCtx(),
    );
    parseOk(result);
    expect(sdk.observability.state.lastCall?.method).toBe('ingestSpans');
  });

  it('query: builds a structured query', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_observability_query',
      {
        scope: 'logs',
        timeRange: { from: '2026-05-01T00:00:00Z', to: '2026-05-01T01:00:00Z' },
        filters: [{ field: 'level', op: 'eq', value: 'error' }],
        limit: 50,
      },
      newCtx(),
    );
    parseOk(result);
    const args = sdk.observability.state.lastCall?.args[0] as { scope: string; limit: number };
    expect(args.scope).toBe('logs');
    expect(args.limit).toBe(50);
  });

  it('query: rejects out-of-range scope', async () => {
    const { registry } = setup();
    const result = await registry.call(
      'colber_observability_query',
      {
        scope: 'metrics',
        timeRange: { from: '2026-05-01T00:00:00Z', to: '2026-05-01T01:00:00Z' },
      },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('alert_create: forwards condition + notification', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_observability_alert_create',
      {
        ownerOperatorId: 'op-1',
        name: 'high-error-rate',
        scope: 'logs',
        condition: {
          operator: 'and',
          filters: [{ field: 'level', op: 'eq', value: 'error' }],
          windowSeconds: 60,
          threshold: 10,
        },
      },
      newCtx(),
    );
    const body = parseOk(result) as { id: string };
    expect(body.id).toBe('44444444-4444-4444-8444-444444444444');
    expect(sdk.observability.state.lastCall?.method).toBe('createAlert');
  });

  it('alert_get: forwards id', async () => {
    const { registry, sdk } = setup();
    const id = '44444444-4444-4444-8444-444444444444';
    const result = await registry.call('colber_observability_alert_get', { id }, newCtx());
    parseOk(result);
    expect(sdk.observability.state.lastCall?.args[0]).toBe(id);
  });

  it('alert_patch: forwards only the provided fields', async () => {
    const { registry, sdk } = setup();
    const id = '44444444-4444-4444-8444-444444444444';
    const result = await registry.call(
      'colber_observability_alert_patch',
      { id, enabled: false },
      newCtx(),
    );
    parseOk(result);
    expect(sdk.observability.state.lastCall?.method).toBe('patchAlert');
    const args = sdk.observability.state.lastCall?.args as [string, Record<string, unknown>];
    expect(args[0]).toBe(id);
    expect(args[1]).toEqual({ enabled: false });
  });

  it('alert_list: returns the list', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_observability_alert_list',
      { operatorId: 'op-1' },
      newCtx(),
    );
    const body = parseOk(result) as { alerts: unknown[] };
    expect(body.alerts).toEqual([]);
    expect(sdk.observability.state.lastCall?.args[0]).toBe('op-1');
  });

  it('alert_delete: returns { deleted: true, id }', async () => {
    const { registry, sdk } = setup();
    const id = '44444444-4444-4444-8444-444444444444';
    const result = await registry.call('colber_observability_alert_delete', { id }, newCtx());
    const body = parseOk(result) as { deleted: boolean; id: string };
    expect(body.deleted).toBe(true);
    expect(body.id).toBe(id);
    expect(sdk.observability.state.lastCall?.method).toBe('deleteAlert');
  });
});
