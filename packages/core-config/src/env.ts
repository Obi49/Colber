import { config as loadDotenv } from 'dotenv';
import { type ZodError, type ZodSchema } from 'zod';

export interface LoadConfigOptions {
  /** Defaults to `process.env`. Override only in tests. */
  readonly source?: NodeJS.ProcessEnv;
  /** If `true` (default), reads `.env` files via dotenv. Set to `false` in tests. */
  readonly loadDotenv?: boolean;
  /** Path to the `.env` file. Default: cwd `.env`. */
  readonly dotenvPath?: string;
}

export class ConfigValidationError extends Error {
  public readonly issues: ZodError['issues'];

  constructor(error: ZodError) {
    const formatted = error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    super(`Invalid configuration:\n${formatted}`);
    this.name = 'ConfigValidationError';
    this.issues = error.issues;
  }
}

/**
 * Load + validate environment variables against a Zod schema.
 * Throws `ConfigValidationError` on any failure — caller should let it
 * propagate to crash the process before serving traffic.
 */
export const loadConfig = <T>(schema: ZodSchema<T>, options: LoadConfigOptions = {}): T => {
  const { source = process.env, loadDotenv: shouldLoadDotenv = true, dotenvPath } = options;

  if (shouldLoadDotenv) {
    loadDotenv(dotenvPath ? { path: dotenvPath } : undefined);
  }

  const result = schema.safeParse(source);
  if (!result.success) {
    throw new ConfigValidationError(result.error);
  }
  return result.data;
};
