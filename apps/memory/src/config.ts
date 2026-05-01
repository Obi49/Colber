import {
  BaseServiceEnvSchema,
  loadConfig,
  PortSchema,
  PostgresUrlSchema,
} from '@colber/core-config';
import { z } from 'zod';

/**
 * Validated runtime configuration for the memory service.
 * Loaded once at startup; the resulting object is the single source of truth.
 */
const Base64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded');

const Bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const HttpUrl = z
  .string()
  .min(1)
  .refine((u) => /^https?:\/\//.test(u), { message: 'must be an http:// or https:// URL' });

const ConfigSchema = BaseServiceEnvSchema.extend({
  SERVICE_NAME: z.string().min(1).default('memory'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: PortSchema.default(4021),
  GRPC_HOST: z.string().min(1).default('0.0.0.0'),
  GRPC_PORT: PortSchema.default(4022),

  DATABASE_URL: PostgresUrlSchema,

  // --- Qdrant ---
  QDRANT_URL: HttpUrl.default('http://localhost:16333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().min(1).default('colber_memories'),

  // --- Embedding provider ---
  MEMORY_EMBEDDING_PROVIDER: z.enum(['ollama', 'stub']).default('ollama'),
  OLLAMA_URL: HttpUrl.default('http://localhost:11434'),
  OLLAMA_EMBED_MODEL: z.string().min(1).default('nomic-embed-text'),
  MEMORY_EMBEDDING_DIM: z.coerce.number().int().min(1).max(8192).default(768),

  // --- Encryption (placeholder KMS — single global key) ---
  MEMORY_ENCRYPTION_KEY: Base64Schema,

  // --- Versioning ---
  MEMORY_MAX_VERSIONS: z.coerce.number().int().min(1).max(10_000).default(100),

  PRETTY_LOGS: Bool.default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const loadAppConfig = (): AppConfig =>
  loadConfig(ConfigSchema, { loadDotenv: process.env.NODE_ENV !== 'test' });
