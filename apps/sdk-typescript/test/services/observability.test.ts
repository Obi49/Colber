import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { TEST_BASE_URLS, makeClient } from '../fixtures.js';
import { server } from '../msw-server.js';

const ALERT_ID = '00000000-0000-0000-0000-0000000000aa';

const sampleAlertResponse = {
  id: ALERT_ID,
  ownerOperatorId: 'op-1',
  name: 'high-error-rate',
  description: '',
  enabled: true,
  scope: 'logs' as const,
  condition: {
    operator: 'and' as const,
    filters: [{ field: 'level', op: 'eq' as const, value: 'error' }],
    windowSeconds: 60,
    threshold: 5,
  },
  cooldownSeconds: 300,
  notification: { channels: [] },
  createdAt: '2026-04-30T00:00:00.000Z',
  updatedAt: '2026-04-30T00:00:00.000Z',
};

describe('ObservabilityService', () => {
  it('ingestLogs: POSTs to /v1/observability/logs and returns the accept count', async () => {
    server.use(
      http.post(`${TEST_BASE_URLS.observability}/v1/observability/logs`, () =>
        HttpResponse.json({ ok: true, data: { accepted: 2, rejected: [] } }, { status: 202 }),
      ),
    );
    const client = makeClient();
    const r = await client.observability.ingestLogs({
      events: [{ a: 1 }, { b: 2 }],
    });
    expect(r.accepted).toBe(2);
  });

  it('ingestSpans: POSTs to /v1/observability/traces', async () => {
    let captured: unknown;
    server.use(
      http.post(`${TEST_BASE_URLS.observability}/v1/observability/traces`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(
          { ok: true, data: { accepted: 1, rejected: [] } },
          { status: 202 },
        );
      }),
    );
    const client = makeClient();
    await client.observability.ingestSpans({ spans: [{ kind: 'server' }] });
    expect(captured).toEqual({ spans: [{ kind: 'server' }] });
  });

  it('query: POSTs to /v1/observability/query with structured filters', async () => {
    server.use(
      http.post(`${TEST_BASE_URLS.observability}/v1/observability/query`, () =>
        HttpResponse.json({ ok: true, data: { rows: [], total: 0 } }),
      ),
    );
    const client = makeClient();
    const r = await client.observability.query({
      scope: 'logs',
      filters: [{ field: 'service', op: 'eq', value: 'reputation' }],
      timeRange: { from: '2026-04-29T00:00:00.000Z', to: '2026-04-30T00:00:00.000Z' },
      limit: 50,
    });
    expect(r.total).toBe(0);
  });

  describe('alerts CRUD', () => {
    it('listAlerts: GETs /v1/observability/alerts?operatorId=...', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${TEST_BASE_URLS.observability}/v1/observability/alerts`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ ok: true, data: { alerts: [sampleAlertResponse] } });
        }),
      );
      const client = makeClient();
      const r = await client.observability.listAlerts('op-1');
      expect(new URL(capturedUrl).searchParams.get('operatorId')).toBe('op-1');
      expect(r.alerts).toHaveLength(1);
    });

    it('createAlert: POSTs to /v1/observability/alerts and returns the rule', async () => {
      server.use(
        http.post(`${TEST_BASE_URLS.observability}/v1/observability/alerts`, () =>
          HttpResponse.json({ ok: true, data: sampleAlertResponse }, { status: 201 }),
        ),
      );
      const client = makeClient();
      const r = await client.observability.createAlert({
        ownerOperatorId: 'op-1',
        name: 'high-error-rate',
        scope: 'logs',
        condition: sampleAlertResponse.condition,
      });
      expect(r.id).toBe(ALERT_ID);
    });

    it('getAlert: GETs /v1/observability/alerts/:id', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${TEST_BASE_URLS.observability}/v1/observability/alerts/:id`, ({ request }) => {
          capturedUrl = new URL(request.url).pathname;
          return HttpResponse.json({ ok: true, data: sampleAlertResponse });
        }),
      );
      const client = makeClient();
      await client.observability.getAlert(ALERT_ID);
      expect(capturedUrl).toBe(`/v1/observability/alerts/${ALERT_ID}`);
    });

    it('patchAlert: PATCHes /v1/observability/alerts/:id', async () => {
      let captured: unknown;
      server.use(
        http.patch(
          `${TEST_BASE_URLS.observability}/v1/observability/alerts/:id`,
          async ({ request }) => {
            captured = await request.json();
            return HttpResponse.json({
              ok: true,
              data: { ...sampleAlertResponse, enabled: false },
            });
          },
        ),
      );
      const client = makeClient();
      const r = await client.observability.patchAlert(ALERT_ID, { enabled: false });
      expect(captured).toEqual({ enabled: false });
      expect(r.enabled).toBe(false);
    });

    it('deleteAlert: DELETEs /v1/observability/alerts/:id and resolves on 204', async () => {
      let calls = 0;
      server.use(
        http.delete(`${TEST_BASE_URLS.observability}/v1/observability/alerts/:id`, () => {
          calls += 1;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      const client = makeClient();
      await client.observability.deleteAlert(ALERT_ID);
      expect(calls).toBe(1);
    });
  });
});
