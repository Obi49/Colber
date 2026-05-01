/**
 * Logger factory for `@colber/mcp`.
 *
 * Critical: the MCP stdio transport writes JSON-RPC frames to **stdout
 * exclusively** (FD 1). Anything else writing to FD 1 — a stray
 * `console.log`, pino's default destination — would corrupt the channel.
 *
 * Strategy:
 *   - For stdio transport, pino is created with `pino.destination(2)` so
 *     every log line goes straight to FD 2 (stderr), never through
 *     `process.stdout`. This keeps the stdio JSON-RPC stream pristine.
 *   - For HTTP transport, stdout is free; we use `@colber/core-logger`
 *     directly with its default destination.
 *
 * `Logger` is the pino logger type re-exported by `@colber/core-logger`.
 */

import { createLogger as createBaseLogger, type LogLevel, type Logger } from '@colber/core-logger';
import pino, { type Logger as PinoLogger } from 'pino';

export type { Logger };

const SERVICE_NAME = 'colber-mcp';

/** Logger wired to FD 2 (stderr). Use this for stdio transport. */
const createStderrLogger = (level: LogLevel): PinoLogger =>
  pino(
    {
      level,
      base: {
        service: SERVICE_NAME,
        env: process.env.NODE_ENV ?? 'development',
        commit: process.env.COLBER_COMMIT_SHA ?? null,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.privateKey',
          '*.secret',
          '*.token',
        ],
        censor: '[REDACTED]',
      },
    },
    pino.destination(2),
  );

/**
 * Build a logger appropriate for the chosen transport.
 *
 * @param level pino log level.
 * @param target `'stdio'` → write to FD 2; `'http'` → default (FD 1).
 */
export const createLogger = (level: LogLevel, target: 'stdio' | 'http' = 'http'): Logger => {
  if (target === 'stdio') {
    return createStderrLogger(level);
  }
  return createBaseLogger({
    serviceName: SERVICE_NAME,
    level,
    pretty: false,
  });
};
