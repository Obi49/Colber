/**
 * `ObservabilityService` — typed client for the `observability` service.
 *
 * Mirror of `apps/observability/src/http/routes.ts`:
 *   - POST   /v1/observability/logs
 *   - POST   /v1/observability/traces
 *   - POST   /v1/observability/query
 *   - GET    /v1/observability/alerts
 *   - POST   /v1/observability/alerts
 *   - GET    /v1/observability/alerts/:id
 *   - PATCH  /v1/observability/alerts/:id
 *   - DELETE /v1/observability/alerts/:id   (204 no body)
 *
 * Telemetry ingestion accepts a `events`/`spans` array of unknown shape —
 * the service validates each event imperatively (see
 * `domain/telemetry-validation.ts`) and reports per-index rejections in the
 * response. The SDK doesn't constrain the shape further; callers can pass
 * structured DTOs that match the platform's log/span contract.
 */

import { request } from '../http.js';

import type { HttpClientOptions } from '../http.js';

export type AlertScope = 'logs' | 'spans';

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'matches';

export type FilterValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly (string | number)[];

export interface QueryFilter {
  readonly field: string;
  readonly op: FilterOperator;
  readonly value: FilterValue;
}

export interface IngestResponse {
  readonly accepted: number;
  readonly rejected: readonly { readonly index: number; readonly reason: string }[];
}

export interface IngestLogsRequest {
  readonly events: readonly unknown[];
}

export interface IngestSpansRequest {
  readonly spans: readonly unknown[];
}

export interface QueryRequest {
  readonly scope: AlertScope;
  readonly filters?: readonly QueryFilter[];
  readonly timeRange: { readonly from: string; readonly to: string };
  readonly limit?: number;
  readonly offset?: number;
}

export interface QueryRow {
  readonly timestamp: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly service: string;
  readonly agentDid?: string;
  readonly operatorId?: string;
  readonly level?: string;
  readonly message?: string;
  readonly name?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly statusMessage?: string;
  readonly startTimestamp?: string;
  readonly endTimestamp?: string;
  readonly durationMs?: number;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly resource: Readonly<Record<string, string>>;
}

export interface QueryResponse {
  readonly rows: readonly QueryRow[];
  readonly total: number;
}

export type AlertCombinator = 'and' | 'or';

export interface AlertCondition {
  readonly operator: AlertCombinator;
  readonly filters: readonly QueryFilter[];
  readonly windowSeconds: number;
  readonly threshold: number;
}

export type NotificationChannel =
  | { readonly type: 'webhook'; readonly url: string }
  | { readonly type: 'slack'; readonly channel: string }
  | { readonly type: 'email'; readonly recipients: readonly string[] };

export interface NotificationConfig {
  readonly channels: readonly NotificationChannel[];
}

export interface AlertCreateRequest {
  readonly ownerOperatorId: string;
  readonly name: string;
  readonly description?: string;
  readonly enabled?: boolean;
  readonly scope: AlertScope;
  readonly condition: AlertCondition;
  readonly cooldownSeconds?: number;
  readonly notification?: NotificationConfig;
}

export interface AlertUpdateRequest {
  readonly name?: string;
  readonly description?: string;
  readonly enabled?: boolean;
  readonly scope?: AlertScope;
  readonly condition?: AlertCondition;
  readonly cooldownSeconds?: number;
  readonly notification?: NotificationConfig;
}

export interface AlertRule {
  readonly id: string;
  readonly ownerOperatorId: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly scope: AlertScope;
  readonly condition: AlertCondition;
  readonly cooldownSeconds: number;
  readonly notification: NotificationConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlertListResponse {
  readonly alerts: readonly AlertRule[];
}

export class ObservabilityService {
  constructor(
    private readonly opts: HttpClientOptions,
    private readonly baseUrl: string,
  ) {}

  /** POST /v1/observability/logs */
  public async ingestLogs(body: IngestLogsRequest): Promise<IngestResponse> {
    const data = await request<IngestResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/observability/logs',
      body,
    });
    if (data === undefined) {
      throw new Error('observability.ingestLogs: empty response body');
    }
    return data;
  }

  /** POST /v1/observability/traces */
  public async ingestSpans(body: IngestSpansRequest): Promise<IngestResponse> {
    const data = await request<IngestResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/observability/traces',
      body,
    });
    if (data === undefined) {
      throw new Error('observability.ingestSpans: empty response body');
    }
    return data;
  }

  /** POST /v1/observability/query */
  public async query(body: QueryRequest): Promise<QueryResponse> {
    const data = await request<QueryResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/observability/query',
      body,
    });
    if (data === undefined) {
      throw new Error('observability.query: empty response body');
    }
    return data;
  }

  /** GET /v1/observability/alerts?operatorId=... */
  public async listAlerts(operatorId: string): Promise<AlertListResponse> {
    const data = await request<AlertListResponse>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: '/v1/observability/alerts',
      query: { operatorId },
    });
    if (data === undefined) {
      throw new Error('observability.listAlerts: empty response body');
    }
    return data;
  }

  /** POST /v1/observability/alerts */
  public async createAlert(body: AlertCreateRequest): Promise<AlertRule> {
    const data = await request<AlertRule>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/observability/alerts',
      body,
    });
    if (data === undefined) {
      throw new Error('observability.createAlert: empty response body');
    }
    return data;
  }

  /** GET /v1/observability/alerts/:id */
  public async getAlert(id: string): Promise<AlertRule> {
    const data = await request<AlertRule>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/observability/alerts/${encodeURIComponent(id)}`,
    });
    if (data === undefined) {
      throw new Error('observability.getAlert: empty response body');
    }
    return data;
  }

  /** PATCH /v1/observability/alerts/:id */
  public async patchAlert(id: string, body: AlertUpdateRequest): Promise<AlertRule> {
    const data = await request<AlertRule>(this.opts, {
      method: 'PATCH',
      baseUrl: this.baseUrl,
      path: `/v1/observability/alerts/${encodeURIComponent(id)}`,
      body,
    });
    if (data === undefined) {
      throw new Error('observability.patchAlert: empty response body');
    }
    return data;
  }

  /** DELETE /v1/observability/alerts/:id  (204 No Content). */
  public async deleteAlert(id: string): Promise<void> {
    await request<void>(this.opts, {
      method: 'DELETE',
      baseUrl: this.baseUrl,
      path: `/v1/observability/alerts/${encodeURIComponent(id)}`,
      expectNoBody: true,
    });
  }
}
