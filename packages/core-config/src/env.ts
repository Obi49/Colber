import { config as loadDotenv } from 'dotenv';
import { type ZodError, type ZodType, type ZodTypeDef } from 'zod';

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
 *
 * The signature uses `ZodType<TOutput, _, TInput>` (rather than the alias
 * `ZodSchema<T>` which collapses input and output) so that schemas with
 * `.default()` / `.transform()` correctly infer the parsed Output type as
 * the return value. Without this distinction, TS picks the input type and
 * users see properties like `SERVICE_NAME?: string | undefined` on what
 * should be a fully-defaulted required `string`.
 */
export const loadConfig = <TOutput, TInput = TOutput>(
  schema: ZodType<TOutput, ZodTypeDef, TInput>,
  options: LoadConfigOptions = {},
): TOutput => {
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
