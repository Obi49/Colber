import {
  BaseServiceEnvSchema,
  loadConfig,
  PortSchema,
  PostgresUrlSchema,
} from '@colber/core-config';
import { z } from 'zod';

/**
 * Validated runtime configuration for the agent-identity service.
 * Loaded once at startup; the resulting object is the single source of truth.
 */
const ConfigSchema = BaseServiceEnvSchema.extend({
  SERVICE_NAME: z.string().min(1).default('agent-identity'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: PortSchema.default(4001),
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: PortSchema.default(4002),
  DATABASE_URL: PostgresUrlSchema,
  PRETTY_LOGS: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const loadAppConfig = (): AppConfig =>
  loadConfig(ConfigSchema, { loadDotenv: process.env.NODE_ENV !== 'test' });
