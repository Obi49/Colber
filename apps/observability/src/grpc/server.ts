import { fileURLToPath } from 'node:url';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ERROR_CODES, PraxisError } from '@praxis/core-types';

import { AlertCreateRequestSchema, QueryRequestSchema } from '../http/schemas.js';

import type { AlertRule, AlertScope } from '../domain/alert-types.js';
import type { ObservabilityService } from '../domain/observability-service.js';
import type { QueryFilter, QueryScope } from '../domain/query-types.js';
import type { Logger } from '@praxis/core-logger';

const PROTO_PATH = fileURLToPath(new URL('../../proto/observability.proto', import.meta.url));

interface IngestLogsReq {
  events_json: string[];
}
interface IngestSpansReq {
  spans_json: string[];
}
interface QueryFilterMsg {
  field: string;
  op: string;
  value_json: string;
}
interface QueryReq {
  scope: string;
  filters?: QueryFilterMsg[];
  time_range?: { from: string; to: string };
  limit?: number;
  offset?: number;
}
interface ConditionMsg {
  operator: string;
  filters?: QueryFilterMsg[];
  window_seconds?: number;
  threshold?: number;
}
interface NotificationChannelMsg {
  type: string;
  config_json: string;
}
interface NotificationMsg {
  channels?: NotificationChannelMsg[];
}
interface CreateAlertReq {
  owner_operator_id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  scope: string;
  condition: ConditionMsg;
  cooldown_seconds?: number;
  notification?: NotificationMsg;
}
interface GetAlertReq {
  id: string;
}
interface ListAlertsReq {
  operator_id: string;
}
interface UpdateAlertReq {
  id: string;
  name?: string;
  description?: string;
  set_enabled?: boolean;
  enabled_value?: boolean;
  scope?: string;
  condition?: ConditionMsg;
  cooldown_seconds?: number;
  notification?: NotificationMsg;
}
interface DeleteAlertReq {
  id: string;
}

interface ObservabilityGrpcService extends grpc.UntypedServiceImplementation {
  IngestLogs: grpc.handleUnaryCall<IngestLogsReq, unknown>;
  IngestSpans: grpc.handleUnaryCall<IngestSpansReq, unknown>;
  Query: grpc.handleUnaryCall<QueryReq, unknown>;
  CreateAlert: grpc.handleUnaryCall<CreateAlertReq, unknown>;
  GetAlert: grpc.handleUnaryCall<GetAlertReq, unknown>;
  ListAlerts: grpc.handleUnaryCall<ListAlertsReq, unknown>;
  UpdateAlert: grpc.handleUnaryCall<UpdateAlertReq, unknown>;
  DeleteAlert: grpc.handleUnaryCall<DeleteAlertReq, unknown>;
}

const toGrpcError = (err: unknown): grpc.ServiceError => {
  if (err instanceof PraxisError) {
    const code =
      err.statusCode === 404
        ? grpc.status.NOT_FOUND
        : err.statusCode === 409
          ? grpc.status.ALREADY_EXISTS
          : err.statusCode === 403
            ? grpc.status.PERMISSION_DENIED
            : err.statusCode === 410
              ? grpc.status.FAILED_PRECONDITION
              : err.statusCode >= 400 && err.statusCode < 500
                ? grpc.status.INVALID_ARGUMENT
                : grpc.status.INTERNAL;
    return Object.assign(new Error(err.message), {
      code,
      details: err.code,
      metadata: new grpc.Metadata(),
      name: 'ServiceError',
    });
  }
  return Object.assign(new Error('Internal error'), {
    code: grpc.status.INTERNAL,
    details: ERROR_CODES.INTERNAL_ERROR,
    metadata: new grpc.Metadata(),
    name: 'ServiceError',
  });
};

const parseJsonOrThrow = <T>(raw: string, label: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new PraxisError(
      ERROR_CODES.VALIDATION_FAILED,
      `${label} must be valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      400,
    );
  }
};

const isQueryScope = (raw: string): raw is QueryScope => raw === 'logs' || raw === 'spans';
const isAlertScope = (raw: string): raw is AlertScope => raw === 'logs' || raw === 'spans';

const decodeFilter = (msg: QueryFilterMsg): QueryFilter => {
  const value = parseJsonOrThrow<unknown>(msg.value_json, `filter[${msg.field}].value_json`);
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean' &&
    !Array.isArray(value)
  ) {
    throw new PraxisError(
      ERROR_CODES.VALIDATION_FAILED,
      `filter[${msg.field}].value must be a scalar or array of scalars`,
      400,
    );
  }
  return {
    field: msg.field,
    op: msg.op as QueryFilter['op'],
    value: value as QueryFilter['value'],
  };
};

export interface GrpcServerHandle {
  start(host: string, port: number): Promise<number>;
  stop(): Promise<void>;
}

export const buildGrpcServer = (
  service: ObservabilityService,
  logger: Logger,
): GrpcServerHandle => {
  const server = new grpc.Server();

  const handlers: ObservabilityGrpcService = {
    IngestLogs: (call, callback) => {
      try {
        const events = call.request.events_json.map((s, i) =>
          parseJsonOrThrow<unknown>(s, `events_json[${i}]`),
        );
        service
          .ingestLogs(events)
          .then((res) =>
            callback(null, {
              accepted: res.accepted,
              rejected: res.rejected.map((r) => ({ index: r.index, reason: r.reason })),
            }),
          )
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    IngestSpans: (call, callback) => {
      try {
        const spans = call.request.spans_json.map((s, i) =>
          parseJsonOrThrow<unknown>(s, `spans_json[${i}]`),
        );
        service
          .ingestSpans(spans)
          .then((res) =>
            callback(null, {
              accepted: res.accepted,
              rejected: res.rejected.map((r) => ({ index: r.index, reason: r.reason })),
            }),
          )
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Query: (call, callback) => {
      try {
        const req = call.request;
        if (!isQueryScope(req.scope)) {
          throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, `unknown scope: ${req.scope}`, 400);
        }
        const tr = req.time_range;
        if (!tr) {
          throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, 'time_range is required', 400);
        }
        const filters = (req.filters ?? []).map(decodeFilter);
        // Reuse the zod schema for limit/offset bounds.
        const validated = QueryRequestSchema.parse({
          scope: req.scope,
          filters,
          timeRange: { from: tr.from, to: tr.to },
          limit: req.limit ?? 100,
          offset: req.offset ?? 0,
        });
        service
          .query({
            scope: validated.scope,
            filters: validated.filters,
            timeRange: validated.timeRange,
            limit: validated.limit,
            offset: validated.offset,
          })
          .then((rows) =>
            callback(null, {
              rows: rows.map((row) => ({ row_json: JSON.stringify(row) })),
              total: rows.length,
            }),
          )
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    CreateAlert: (call, callback) => {
      try {
        const r = call.request;
        if (!isAlertScope(r.scope)) {
          throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, `unknown scope: ${r.scope}`, 400);
        }
        const conditionFilters = (r.condition.filters ?? []).map(decodeFilter);
        const channels = (r.notification?.channels ?? []).map((c) => ({
          type: c.type,
          config: parseJsonOrThrow<unknown>(c.config_json, `notification.channel.config_json`),
        }));
        const validated = AlertCreateRequestSchema.parse({
          ownerOperatorId: r.owner_operator_id,
          name: r.name,
          description: r.description ?? '',
          enabled: r.enabled ?? true,
          scope: r.scope,
          condition: {
            operator: r.condition.operator,
            filters: conditionFilters,
            windowSeconds: r.condition.window_seconds ?? 60,
            threshold: r.condition.threshold ?? 1,
          },
          cooldownSeconds: r.cooldown_seconds ?? 300,
          notification: { channels: channels as never },
        });
        service
          .createAlert({
            ownerOperatorId: validated.ownerOperatorId,
            name: validated.name,
            description: validated.description,
            enabled: validated.enabled,
            scope: validated.scope,
            condition: validated.condition,
            cooldownSeconds: validated.cooldownSeconds,
            notification: validated.notification,
          })
          .then((alert) => callback(null, alertToProto(alert)))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    GetAlert: (call, callback) => {
      service
        .getAlert(call.request.id)
        .then((alert) => callback(null, alertToProto(alert)))
        .catch((err: unknown) => callback(toGrpcError(err)));
    },

    ListAlerts: (call, callback) => {
      service
        .listAlerts(call.request.operator_id)
        .then((alerts) => callback(null, { alerts: alerts.map(alertToProto) }))
        .catch((err: unknown) => callback(toGrpcError(err)));
    },

    UpdateAlert: (call, callback) => {
      try {
        const r = call.request;
        // Validate scope eagerly so the type narrows before assembling the
        // patch object literal (the patch shape has `scope: AlertScope`).
        if (r.scope !== undefined && r.scope.length > 0 && !isAlertScope(r.scope)) {
          throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, `unknown scope: ${r.scope}`, 400);
        }
        const condition = r.condition
          ? {
              operator: r.condition.operator === 'or' ? ('or' as const) : ('and' as const),
              filters: (r.condition.filters ?? []).map(decodeFilter),
              windowSeconds: r.condition.window_seconds ?? 60,
              threshold: r.condition.threshold ?? 1,
            }
          : undefined;
        const notification = r.notification
          ? {
              channels: (r.notification.channels ?? []).map((c) => ({
                type: c.type,
                config: parseJsonOrThrow<unknown>(
                  c.config_json,
                  `notification.channel.config_json`,
                ),
              })) as never,
            }
          : undefined;
        const patch: Parameters<ObservabilityService['updateAlert']>[1] = {
          ...(r.name !== undefined && r.name.length > 0 ? { name: r.name } : {}),
          ...(r.description !== undefined ? { description: r.description } : {}),
          ...(r.set_enabled === true ? { enabled: r.enabled_value === true } : {}),
          ...(r.scope !== undefined && r.scope.length > 0 && isAlertScope(r.scope)
            ? { scope: r.scope }
            : {}),
          ...(condition !== undefined ? { condition } : {}),
          ...(typeof r.cooldown_seconds === 'number'
            ? { cooldownSeconds: r.cooldown_seconds }
            : {}),
          ...(notification !== undefined ? { notification } : {}),
        };
        service
          .updateAlert(r.id, patch)
          .then((alert) => callback(null, alertToProto(alert)))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    DeleteAlert: (call, callback) => {
      service
        .deleteAlert(call.request.id)
        .then(() => callback(null, { id: call.request.id, deleted: true }))
        .catch((err: unknown) => callback(toGrpcError(err)));
    },
  };

  return {
    async start(host, port) {
      const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      const proto = grpc.loadPackageDefinition(packageDef) as unknown as {
        praxis: {
          observability: { v1: { ObservabilityService: { service: grpc.ServiceDefinition } } };
        };
      };
      server.addService(proto.praxis.observability.v1.ObservabilityService.service, handlers);

      return new Promise<number>((resolve, reject) => {
        server.bindAsync(
          `${host}:${port}`,
          grpc.ServerCredentials.createInsecure(),
          (err, boundPort) => {
            if (err) {
              reject(err);
              return;
            }
            logger.info({ host, port: boundPort }, 'gRPC server listening');
            resolve(boundPort);
          },
        );
      });
    },
    async stop() {
      await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
    },
  };
};

interface AlertProto {
  id: string;
  owner_operator_id: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: string;
  condition: {
    operator: string;
    filters: { field: string; op: string; value_json: string }[];
    window_seconds: number;
    threshold: number;
  };
  cooldown_seconds: number;
  notification: { channels: { type: string; config_json: string }[] };
  created_at: string;
  updated_at: string;
}

const alertToProto = (a: AlertRule): AlertProto => ({
  id: a.id,
  owner_operator_id: a.ownerOperatorId,
  name: a.name,
  description: a.description,
  enabled: a.enabled,
  scope: a.scope,
  condition: {
    operator: a.condition.operator,
    filters: a.condition.filters.map((f) => ({
      field: f.field,
      op: f.op,
      value_json: JSON.stringify(f.value),
    })),
    window_seconds: a.condition.windowSeconds,
    threshold: a.condition.threshold,
  },
  cooldown_seconds: a.cooldownSeconds,
  notification: {
    channels: a.notification.channels.map((c) => {
      const { type, ...rest } = c;
      return { type, config_json: JSON.stringify(rest) };
    }),
  },
  created_at: a.createdAt.toISOString(),
  updated_at: a.updatedAt.toISOString(),
});
