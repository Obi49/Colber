/**
 * @colber/core-config — env loading + schema validation.
 *
 * Pattern: each service defines a Zod schema describing the env it needs,
 * passes it to `loadConfig`, and gets back a fully-typed, validated config
 * object. Loader fails fast on the first invalid env variable.
 */

export * from './env.js';
export * from './schemas.js';
