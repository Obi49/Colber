import {
  BaseServiceEnvSchema,
  loadConfig,
  PortSchema,
  PostgresUrlSchema,
} from '@praxis/core-config';
import { z } from 'zod';

/**
 * Validated runtime configuration for the reputation service.
 * Loaded once at startup; the resulting object is the single source of truth.
 */
const Base64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded');

const Bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const ConfigSchema = BaseServiceEnvSchema.extend({
  SERVICE_NAME: z.string().min(1).default('reputation'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: PortSchema.default(4011),
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: PortSchema.default(4012),

  DATABASE_URL: PostgresUrlSchema,

  NEO4J_BOLT_URL: z
    .string()
    .min(1)
    .refine((u) => /^(bolt|bolt\+s|bolt\+ssc|neo4j|neo4j\+s|neo4j\+ssc):\/\//.test(u), {
      message: 'must be a bolt:// or neo4j:// URL',
    })
    .default('bolt://localhost:17687'),
  NEO4J_USERNAME: z.string().min(1).default('neo4j'),
  NEO4J_PASSWORD: z.string().min(1).default('praxis_dev'),
  NEO4J_DATABASE: z.string().min(1).default('neo4j'),

  REDIS_URL: z
    .string()
    .min(1)
    .refine((u) => /^rediss?:\/\//.test(u), {
      message: 'must be a redis:// or rediss:// URL',
    })
    .default('redis://localhost:16379'),

  // --- Scoring engine v1 (config-driven) ---
  REPUTATION_SCORE_TX_DELTA: z.coerce.number().int().min(0).max(1000).default(10),
  REPUTATION_SCORE_NEG_FEEDBACK_PENALTY: z.coerce.number().int().min(0).max(1000).default(40),
  REPUTATION_SCORE_DECAY_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  REPUTATION_SCORE_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(60),

  // --- Platform attestation key (Ed25519, base64 — 32 bytes each) ---
  REPUTATION_PLATFORM_PRIVATE_KEY: Base64Schema,
  // Optional: derived from the private key at boot if missing.
  REPUTATION_PLATFORM_PUBLIC_KEY: Base64Schema.optional(),

  PRETTY_LOGS: Bool.default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const loadAppConfig = (): AppConfig =>
  loadConfig(ConfigSchema, { loadDotenv: process.env.NODE_ENV !== 'test' });
