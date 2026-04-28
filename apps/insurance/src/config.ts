import {
  BaseServiceEnvSchema,
  loadConfig,
  PortSchema,
  PostgresUrlSchema,
} from '@praxis/core-config';
import { z } from 'zod';

/**
 * Validated runtime configuration for the insurance service.
 * Loaded once at startup; the resulting object is the single source of truth.
 *
 * v1 MVP is simulation-only: pricing engine + Postgres-backed escrow + claims
 * workflow. No on-chain code (no Solidity, no viem, no chain RPC). The on-chain
 * version is a separate P3 ticket (étape 7b).
 */

const Bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const ConfigSchema = BaseServiceEnvSchema.extend({
  SERVICE_NAME: z.string().min(1).default('insurance'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: PortSchema.default(4051),
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: PortSchema.default(4052),

  DATABASE_URL: PostgresUrlSchema,

  // --- Reputation lookup ---
  REPUTATION_URL: z.string().url().default('http://reputation:4011'),

  // --- Pricing knobs ---
  INSURANCE_BASE_RATE_BPS: z.coerce.number().int().min(1).max(10_000).default(200),
  INSURANCE_QUOTE_VALIDITY_SECONDS: z.coerce.number().int().min(10).max(86_400).default(300),
  INSURANCE_MAX_GLOBAL_EXPOSURE_USDC: z.coerce.number().min(0).default(100_000),
  INSURANCE_DEFAULT_POLICY_DURATION_HOURS: z.coerce.number().int().min(1).max(8_760).default(168),
  INSURANCE_REPUTATION_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3_600).default(60),

  // --- Admin gate ---
  INSURANCE_ADMIN_ENABLED: Bool.default(false),

  PRETTY_LOGS: Bool.default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const loadAppConfig = (): AppConfig =>
  loadConfig(ConfigSchema, { loadDotenv: process.env.NODE_ENV !== 'test' });
