/**
 * Runtime configuration for `@colber/mcp`.
 *
 * Loaded once at startup. Supports two override layers:
 *   1. Environment variables (default — through `@colber/core-config`).
 *   2. CLI flags via `--transport=`, `--port=`, `--host=`. CLI wins over env
 *      so users can flip the transport without re-exporting env vars.
 */

import { LogLevelSchema, loadConfig, PortSchema } from '@colber/core-config';
import { z } from 'zod';

import type { BaseUrls } from '@colber/sdk';

export type Transport = 'stdio' | 'http';

const TransportSchema = z.enum(['stdio', 'http']);

const DEFAULT_BASE_URLS: BaseUrls = {
  identity: 'http://localhost:14001',
  reputation: 'http://localhost:14011',
  memory: 'http://localhost:14021',
  observability: 'http://localhost:14031',
  negotiation: 'http://localhost:14041',
  insurance: 'http://localhost:14051',
};

const BaseUrlsSchema = z.object({
  identity: z.string().url(),
  reputation: z.string().url(),
  memory: z.string().url(),
  observability: z.string().url(),
  negotiation: z.string().url(),
  insurance: z.string().url(),
});

/**
 * Parse the `COLBER_BASE_URLS` env value. Accepts:
 *   - undefined → returns the local defaults.
 *   - JSON object string → validated against `BaseUrlsSchema`.
 */
const parseBaseUrls = (raw: string | undefined): BaseUrls => {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_BASE_URLS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`COLBER_BASE_URLS must be a valid JSON object: ${(cause as Error).message}`);
  }
  return BaseUrlsSchema.parse(parsed);
};

const EnvSchema = z.object({
  COLBER_MCP_TRANSPORT: TransportSchema.default('stdio'),
  COLBER_MCP_HTTP_PORT: PortSchema.default(14080),
  COLBER_MCP_HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  COLBER_BASE_URLS: z.string().optional(),
  COLBER_AUTH_TOKEN: z.string().min(1).optional(),
  COLBER_LOG_LEVEL: LogLevelSchema,
});

export interface AppConfig {
  readonly transport: Transport;
  readonly httpPort: number;
  readonly httpHost: string;
  readonly baseUrls: BaseUrls;
  readonly authToken: string | undefined;
  readonly logLevel: z.infer<typeof LogLevelSchema>;
}

export interface ConfigOverrides {
  readonly transportOverride?: string | undefined;
  readonly portOverride?: number | undefined;
  readonly hostOverride?: string | undefined;
}

/**
 * Validate env + apply CLI overrides. Throws `ConfigValidationError` if env
 * is malformed (e.g. non-numeric port, invalid log level, bad JSON).
 */
export const loadAppConfig = (overrides: ConfigOverrides = {}): AppConfig => {
  // `@colber/mcp` is consumed via `npx -y @colber/mcp` or a Docker container.
  // Env always comes from `process.env`, never from a `.env` file. Keeping
  // dotenv disabled also avoids tsup inlining the CJS `dotenv` module into
  // the ESM bundle, which crashes at startup on the synthetic `require('fs')`
  // shim (`Dynamic require of "fs" is not supported`).
  const env = loadConfig(EnvSchema, { loadDotenv: false });

  const transport: Transport =
    overrides.transportOverride !== undefined
      ? TransportSchema.parse(overrides.transportOverride)
      : env.COLBER_MCP_TRANSPORT;

  const httpPort =
    overrides.portOverride !== undefined
      ? PortSchema.parse(overrides.portOverride)
      : env.COLBER_MCP_HTTP_PORT;

  const httpHost =
    overrides.hostOverride !== undefined
      ? z.string().min(1).parse(overrides.hostOverride)
      : env.COLBER_MCP_HTTP_HOST;

  return {
    transport,
    httpPort,
    httpHost,
    baseUrls: parseBaseUrls(env.COLBER_BASE_URLS),
    authToken: env.COLBER_AUTH_TOKEN,
    logLevel: env.COLBER_LOG_LEVEL,
  };
};
