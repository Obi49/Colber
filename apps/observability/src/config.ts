import {
  BaseServiceEnvSchema,
  loadConfig,
  PortSchema,
  PostgresUrlSchema,
} from '@praxis/core-config';
import { z } from 'zod';

/**
 * Validated runtime configuration for the observability service.
 * Loaded once at startup; the resulting object is the single source of truth.
 */

const Bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const HttpUrl = z
  .string()
  .min(1)
  .refine((u) => /^https?:\/\//.test(u), { message: 'must be an http:// or https:// URL' });

const ConfigSchema = BaseServiceEnvSchema.extend({
  SERVICE_NAME: z.string().min(1).default('observability'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: PortSchema.default(4031),
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: PortSchema.default(4032),

  DATABASE_URL: PostgresUrlSchema,

  // --- ClickHouse ---
  CLICKHOUSE_URL: HttpUrl.default('http://localhost:18123'),
  CLICKHOUSE_USER: z.string().min(1).default('praxis'),
  CLICKHOUSE_PASSWORD: z.string().min(0).default('praxis_dev'),
  CLICKHOUSE_DATABASE: z.string().min(1).default('praxis'),

  // --- Ingestion / batching ---
  OBSERVABILITY_FLUSH_INTERVAL_MS: z.coerce.number().int().min(50).max(60_000).default(1000),
  OBSERVABILITY_FLUSH_BATCH: z.coerce.number().int().min(1).max(10_000).default(500),
  OBSERVABILITY_MAX_EVENTS_PER_REQUEST: z.coerce.number().int().min(1).max(10_000).default(1000),
  OBSERVABILITY_MAX_QUERY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(1000),

  // --- Retention ---
  OBSERVABILITY_LOG_TTL_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  OBSERVABILITY_SPAN_TTL_DAYS: z.coerce.number().int().min(1).max(3650).default(30),

  PRETTY_LOGS: Bool.default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const loadAppConfig = (): AppConfig =>
  loadConfig(ConfigSchema, { loadDotenv: process.env.NODE_ENV !== 'test' });
