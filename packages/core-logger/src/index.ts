import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface LoggerFactoryOptions {
  /** Service name attached to every log line as `service`. */
  readonly serviceName: string;
  /** Log level. */
  readonly level?: LogLevel;
  /** Set to true in dev to get human-friendly pino-pretty output. */
  readonly pretty?: boolean;
  /** Extra base fields to attach to every log line. */
  readonly base?: Record<string, unknown>;
}

/**
 * Default fields that pino redacts in any log record.
 * Add more via `redact` in `LoggerOptions` at the call site.
 */
const DEFAULT_REDACTIONS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  '*.password',
  '*.privateKey',
  '*.secret',
  '*.token',
];

/**
 * Creates a pino logger with Praxis defaults:
 *  - JSON in non-dev, pino-pretty in dev (if `pretty`).
 *  - ISO timestamps.
 *  - Common redactions for credentials.
 *  - Service name + commit SHA (if `PRAXIS_COMMIT_SHA` is set) attached.
 */
export const createLogger = (options: LoggerFactoryOptions): Logger => {
  const { serviceName, level = 'info', pretty = false, base = {} } = options;

  const opts: LoggerOptions = {
    level,
    base: {
      service: serviceName,
      env: process.env.NODE_ENV ?? 'development',
      commit: process.env.PRAXIS_COMMIT_SHA ?? null,
      ...base,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: DEFAULT_REDACTIONS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  if (pretty) {
    opts.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,env,commit',
        singleLine: false,
      },
    };
  }

  return pino(opts);
};
