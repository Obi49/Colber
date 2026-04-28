import { ERROR_CODES, PraxisError } from '@praxis/core-types';
import { v4 as uuidv4 } from 'uuid';

import { Batcher } from './batcher.js';
import { validateLogEvent, validateSpanEvent } from './telemetry-validation.js';

import type { AlertRepository } from './alert-repository.js';
import type { AlertCondition, AlertRule, AlertScope, NotificationConfig } from './alert-types.js';
import type { TelemetryRepository } from './log-repository.js';
import type { QueryRequest, QueryRow } from './query-types.js';
import type { LogEvent, SpanEvent } from './telemetry-types.js';

/**
 * Composition root for the observability domain.
 *
 * Responsibilities:
 *  - Validate + ingest log/span events through the size+time batchers.
 *  - Run structured queries against ClickHouse.
 *  - CRUD for alert rule configuration (Postgres-backed).
 *
 * Out of scope (future sprints):
 *  - Alert evaluation engine (sprint 12).
 *  - ML anomaly detection (sprint 12).
 *  - Hot/warm/cold tiering (sprint 12).
 *  - OTel exporter (sprint 13).
 */

export interface ObservabilityServiceConfig {
  readonly flushIntervalMs: number;
  readonly flushBatchSize: number;
  readonly maxEventsPerRequest: number;
  readonly maxQueryLimit: number;
}

export interface IngestResultItem {
  readonly index: number;
  readonly reason: string;
}

export interface IngestResult {
  readonly accepted: number;
  readonly rejected: readonly IngestResultItem[];
}

export class ObservabilityService {
  private readonly logBatcher: Batcher<LogEvent>;
  private readonly spanBatcher: Batcher<SpanEvent>;

  constructor(
    private readonly telemetry: TelemetryRepository,
    private readonly alerts: AlertRepository,
    private readonly cfg: ObservabilityServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.logBatcher = new Batcher<LogEvent>({
      batchSize: cfg.flushBatchSize,
      intervalMs: cfg.flushIntervalMs,
      flush: (batch) => telemetry.insertLogs(batch),
      onError: (err, dropped) => {
        // Caller may install a custom logger; this fallback prevents
        // unhandled rejection.
        console.error('[observability] log flush failed', { err, dropped });
      },
    });
    this.spanBatcher = new Batcher<SpanEvent>({
      batchSize: cfg.flushBatchSize,
      intervalMs: cfg.flushIntervalMs,
      flush: (batch) => telemetry.insertSpans(batch),
      onError: (err, dropped) => {
        console.error('[observability] span flush failed', { err, dropped });
      },
    });
  }

  /** Idempotent ClickHouse DDL bootstrap. Safe to call at boot. */
  public async init(): Promise<void> {
    await this.telemetry.bootstrap();
  }

  /** Drain batchers + close transport. Used at shutdown. */
  public async shutdown(): Promise<void> {
    await this.logBatcher.close();
    await this.spanBatcher.close();
    await this.telemetry.close();
  }

  /** Force-flush any pending events. Useful in tests + on shutdown. */
  public async flush(): Promise<void> {
    await Promise.all([this.logBatcher.flushNow(), this.spanBatcher.flushNow()]);
  }

  // ---------------------------------------------------------------------
  // observability.log
  // ---------------------------------------------------------------------

  public async ingestLogs(rawEvents: readonly unknown[]): Promise<IngestResult> {
    this.assertBatchSize(rawEvents.length, 'events');
    const accepted: LogEvent[] = [];
    const rejected: IngestResultItem[] = [];
    for (let i = 0; i < rawEvents.length; i++) {
      try {
        accepted.push(validateLogEvent(rawEvents[i]));
      } catch (err) {
        rejected.push({ index: i, reason: this.errorReason(err) });
      }
    }
    if (accepted.length > 0) {
      await this.logBatcher.addMany(accepted);
    }
    return { accepted: accepted.length, rejected };
  }

  // ---------------------------------------------------------------------
  // observability.trace
  // ---------------------------------------------------------------------

  public async ingestSpans(rawSpans: readonly unknown[]): Promise<IngestResult> {
    this.assertBatchSize(rawSpans.length, 'spans');
    const accepted: SpanEvent[] = [];
    const rejected: IngestResultItem[] = [];
    for (let i = 0; i < rawSpans.length; i++) {
      try {
        accepted.push(validateSpanEvent(rawSpans[i]));
      } catch (err) {
        rejected.push({ index: i, reason: this.errorReason(err) });
      }
    }
    if (accepted.length > 0) {
      await this.spanBatcher.addMany(accepted);
    }
    return { accepted: accepted.length, rejected };
  }

  // ---------------------------------------------------------------------
  // observability.query
  // ---------------------------------------------------------------------

  public async query(request: QueryRequest): Promise<readonly QueryRow[]> {
    if (Date.parse(request.timeRange.from) >= Date.parse(request.timeRange.to)) {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        'timeRange.from must be strictly less than timeRange.to',
        400,
      );
    }
    if (request.limit > this.cfg.maxQueryLimit) {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        `limit must be <= ${this.cfg.maxQueryLimit}`,
        400,
      );
    }
    return this.telemetry.query(request);
  }

  // ---------------------------------------------------------------------
  // observability.alert  (CRUD; evaluation engine out of scope)
  // ---------------------------------------------------------------------

  public async createAlert(input: {
    readonly ownerOperatorId: string;
    readonly name: string;
    readonly description: string;
    readonly enabled: boolean;
    readonly scope: AlertScope;
    readonly condition: AlertCondition;
    readonly cooldownSeconds: number;
    readonly notification: NotificationConfig;
  }): Promise<AlertRule> {
    return this.alerts.insert({
      id: uuidv4(),
      ownerOperatorId: input.ownerOperatorId,
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      scope: input.scope,
      condition: input.condition,
      cooldownSeconds: input.cooldownSeconds,
      notification: input.notification,
      createdAt: this.now(),
    });
  }

  public async getAlert(id: string): Promise<AlertRule> {
    const alert = await this.alerts.findById(id);
    if (!alert) {
      throw new PraxisError(ERROR_CODES.NOT_FOUND, `Alert rule not found: ${id}`, 404);
    }
    return alert;
  }

  public async listAlerts(ownerOperatorId: string): Promise<readonly AlertRule[]> {
    return this.alerts.listByOwner(ownerOperatorId);
  }

  public async updateAlert(
    id: string,
    patch: {
      readonly name?: string;
      readonly description?: string;
      readonly enabled?: boolean;
      readonly scope?: AlertScope;
      readonly condition?: AlertCondition;
      readonly cooldownSeconds?: number;
      readonly notification?: NotificationConfig;
    },
  ): Promise<AlertRule> {
    if (Object.values(patch).every((v) => v === undefined)) {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        'patch must change at least one field',
        400,
      );
    }
    const updated = await this.alerts.update(id, { ...patch, updatedAt: this.now() });
    if (!updated) {
      throw new PraxisError(ERROR_CODES.NOT_FOUND, `Alert rule not found: ${id}`, 404);
    }
    return updated;
  }

  public async deleteAlert(id: string): Promise<void> {
    const deleted = await this.alerts.delete(id);
    if (!deleted) {
      throw new PraxisError(ERROR_CODES.NOT_FOUND, `Alert rule not found: ${id}`, 404);
    }
  }

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------

  private assertBatchSize(n: number, label: string): void {
    if (n === 0) {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        `${label} must contain at least one entry`,
        400,
      );
    }
    if (n > this.cfg.maxEventsPerRequest) {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        `${label} must contain at most ${this.cfg.maxEventsPerRequest} entries (got ${n})`,
        400,
      );
    }
  }

  private errorReason(err: unknown): string {
    if (err instanceof PraxisError) {
      return err.message;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
}
