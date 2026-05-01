#!/usr/bin/env node
/**
 * `@colber/mcp` — entry point.
 *
 * Usage (stdio, default — for local clients like Claude Desktop):
 *   npx -y @colber/mcp
 *
 * Usage (HTTP/SSE — for remote MCP servers):
 *   npx -y @colber/mcp --transport=http --port=14080
 *
 * Environment:
 *   COLBER_BASE_URLS      JSON map of service base URLs.
 *   COLBER_AUTH_TOKEN     Optional bearer token forwarded to backend services.
 *   COLBER_LOG_LEVEL      pino log level (default: info).
 *   COLBER_MCP_TRANSPORT  stdio | http (default: stdio).
 *   COLBER_MCP_HTTP_PORT  default 14080. Ignored when transport=stdio.
 *   COLBER_MCP_HTTP_HOST  default 0.0.0.0. Ignored when transport=stdio.
 */

import { parseArgs } from 'node:util';

import { ColberClient } from '@colber/sdk';

import { loadAppConfig, type AppConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { buildToolRegistry } from './tools/index.js';
import { startHttpTransport } from './transports/http.js';
import { startStdioTransport } from './transports/stdio.js';

const PACKAGE_VERSION = '0.1.0';

const parseCliArgs = (): {
  transportOverride?: string;
  portOverride?: number;
  hostOverride?: string;
} => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      transport: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
    },
    // `strict: false` lets unknown args (e.g. extra positionals npx might
    // inject) pass through without throwing; we only consume the known ones.
    strict: false,
    allowPositionals: true,
  });
  // With `strict: false`, parseArgs widens values to `string | boolean | undefined`.
  // Coerce explicitly — only string overrides make sense for these flags.
  const transport = typeof values.transport === 'string' ? values.transport : undefined;
  const port = typeof values.port === 'string' ? Number(values.port) : undefined;
  const host = typeof values.host === 'string' ? values.host : undefined;
  return {
    ...(transport !== undefined ? { transportOverride: transport } : {}),
    ...(port !== undefined ? { portOverride: port } : {}),
    ...(host !== undefined ? { hostOverride: host } : {}),
  };
};

const buildSdk = (config: AppConfig): ColberClient => {
  return new ColberClient({
    baseUrls: config.baseUrls,
    ...(config.authToken !== undefined ? { authToken: config.authToken } : {}),
  });
};

export const main = async (): Promise<void> => {
  const overrides = parseCliArgs();
  const config = loadAppConfig(overrides);

  // The logger is wired to stderr for stdio transport (so it never writes
  // to FD 1, which the MCP JSON-RPC channel claims) and to stdout for HTTP.
  const logger: Logger = createLogger(config.logLevel, config.transport);
  const sdk = buildSdk(config);
  const registry = buildToolRegistry(sdk);

  logger.info(
    {
      transport: config.transport,
      tools: registry.size(),
      baseUrls: config.baseUrls,
      version: PACKAGE_VERSION,
    },
    'colber-mcp starting',
  );

  if (config.transport === 'http') {
    await startHttpTransport({
      registry,
      logger,
      host: config.httpHost,
      port: config.httpPort,
      serverVersion: PACKAGE_VERSION,
    });
  } else {
    await startStdioTransport({
      registry,
      logger,
      serverVersion: PACKAGE_VERSION,
    });
  }

  // Graceful shutdown.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ signal: sig }, 'shutting down');
      // Give pino a tick to flush; then exit.
      setTimeout(() => process.exit(0), 50);
    });
  }
};

// `import.meta.url` check lets unit tests `import { main }` without booting.
const isDirectRun = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  // Compare resolved file URLs to handle Windows path separators.
  try {
    const entryUrl = new URL(`file://${entry.replace(/\\/g, '/')}`).href;
    return import.meta.url === entryUrl;
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  main().catch((err: unknown) => {
    // Stdio transport claims stdout for JSON-RPC frames — log to stderr.

    console.error('[colber-mcp] fatal:', err);
    process.exit(1);
  });
}
