import { z } from 'zod';

import {
  AlertConditionSchema,
  AlertRuleCreateSchema,
  AlertRuleUpdateSchema,
  NotificationConfigSchema,
} from '../domain/alert-validation.js';
import { ALERT_SCOPES, FILTER_OPERATORS } from '../domain/alert-types.js';

/**
 * Zod schemas for the REST surface of the observability service.
 * Re-used by the MCP layer to share validation rules.
 *
 * Telemetry payloads are validated via the imperative validators in
 * `domain/telemetry-validation.ts` rather than zod — that gives us
 * per-event `{ index, reason }` rejection metadata without paying the cost
 * of building a `ZodError` for every item in a 1000-event batch.
 */

// ---------- ingestion ----------

const IsoDate = z.string().datetime();

/** Lightweight envelope schemas — actual log/span shapes are validated in the domain. */
export const IngestLogsRequestSchema = z.object({
  events: z.array(z.unknown()).min(1).max(10_000),
});
export type IngestLogsRequest = z.infer<typeof IngestLogsRequestSchema>;

export const IngestSpansRequestSchema = z.object({
  spans: z.array(z.unknown()).min(1).max(10_000),
});
export type IngestSpansRequest = z.infer<typeof IngestSpansRequestSchema>;

export const IngestResponseSchema = z.object({
  accepted: z.number().int().min(0),
  rejected: z.array(
    z.object({
      index: z.number().int().min(0),
      reason: z.string(),
    }),
  ),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

// ---------- query ----------

export const QueryFilterSchema = z.object({
  field: z.string().min(1).max(256),
  op: z.enum(FILTER_OPERATORS),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()])).min(1).max(256),
  ]),
});

export const QueryRequestSchema = z
  .object({
    scope: z.enum(['logs', 'spans']),
    filters: z.array(QueryFilterSchema).max(64).default([]),
    timeRange: z.object({
      from: IsoDate,
      to: IsoDate,
    }),
    limit: z.number().int().min(1).max(10_000).default(100),
    offset: z.number().int().min(0).default(0),
  })
  .superRefine((val, ctx) => {
    if (Date.parse(val.timeRange.from) >= Date.parse(val.timeRange.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'timeRange.from must be strictly less than timeRange.to',
        path: ['timeRange'],
      });
    }
  });
export type QueryRequestBody = z.infer<typeof QueryRequestSchema>;

const QueryRowSchema = z.object({
  timestamp: z.string(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  service: z.string(),
  agentDid: z.string().optional(),
  operatorId: z.string().optional(),
  level: z.string().optional(),
  message: z.string().optional(),
  name: z.string().optional(),
  kind: z.string().optional(),
  status: z.string().optional(),
  statusMessage: z.string().optional(),
  startTimestamp: z.string().optional(),
  endTimestamp: z.string().optional(),
  durationMs: z.number().optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean()])),
  resource: z.record(z.string()),
});
export const QueryResponseSchema = z.object({
  rows: z.array(QueryRowSchema),
  total: z.number().int().min(0),
});
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// ---------- alerts ----------

export const AlertCreateRequestSchema = AlertRuleCreateSchema;
export const AlertUpdateRequestSchema = AlertRuleUpdateSchema;

export const AlertResponseSchema = z.object({
  id: z.string().uuid(),
  ownerOperatorId: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  scope: z.enum(ALERT_SCOPES),
  condition: AlertConditionSchema,
  cooldownSeconds: z.number().int().min(0),
  notification: NotificationConfigSchema,
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type AlertResponse = z.infer<typeof AlertResponseSchema>;

export const AlertListResponseSchema = z.object({
  alerts: z.array(AlertResponseSchema),
});
export type AlertListResponse = z.infer<typeof AlertListResponseSchema>;

export const AlertParamsSchema = z.object({
  id: z.string().uuid(),
});

export const AlertListQuerySchema = z.object({
  operatorId: z.string().min(1).max(256),
});
