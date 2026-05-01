import { z } from 'zod';

/**
 * Reusable Zod fragments for env validation.
 * Services compose these into their own schema (see e.g. `apps/agent-identity/src/config.ts`).
 */

export const NodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

export const LogLevelSchema = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info');

/** Coerced integer port, 1..65535. */
export const PortSchema = z.coerce.number().int().min(1).max(65535);

/** Postgres URL must be a valid URL with `postgres:` or `postgresql:` protocol. */
export const PostgresUrlSchema = z
  .string()
  .url()
  .refine((url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
    message: 'Must be a postgres:// or postgresql:// URL',
  });

/** Common base every Colber service shares. */
export const BaseServiceEnvSchema = z.object({
  NODE_ENV: NodeEnvSchema,
  LOG_LEVEL: LogLevelSchema,
  SERVICE_NAME: z.string().min(1),
});

export type BaseServiceEnv = z.infer<typeof BaseServiceEnvSchema>;
