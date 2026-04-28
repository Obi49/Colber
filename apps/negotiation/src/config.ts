import {
  BaseServiceEnvSchema,
  loadConfig,
  PortSchema,
  PostgresUrlSchema,
} from '@praxis/core-config';
import { z } from 'zod';

/**
 * Validated runtime configuration for the negotiation service.
 * Loaded once at startup; the resulting object is the single source of truth.
 */

const Bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const ConfigSchema = BaseServiceEnvSchema.extend({
  SERVICE_NAME: z.string().min(1).default('negotiation'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: PortSchema.default(4041),
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: PortSchema.default(4042),

  DATABASE_URL: PostgresUrlSchema,

  // --- Domain limits ---
  NEGOTIATION_DEFAULT_DEADLINE_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  NEGOTIATION_MAX_PROPOSALS_PER_NEGOTIATION: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(200),
  NEGOTIATION_MAX_PARTIES: z.coerce.number().int().min(2).max(64).default(16),

  PRETTY_LOGS: Bool.default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const loadAppConfig = (): AppConfig =>
  loadConfig(ConfigSchema, { loadDotenv: process.env.NODE_ENV !== 'test' });
