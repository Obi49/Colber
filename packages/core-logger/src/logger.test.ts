import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { createLogger } from './index.js';

describe('createLogger', () => {
  it('returns a pino logger with the configured service name', () => {
    const log = createLogger({ serviceName: 'agent-identity-test', level: 'silent' });
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
  });

  it('emits structured JSON with the service field', () =>
    new Promise<void>((resolve, reject) => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk: Buffer | string, _enc, cb) {
          const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
          lines.push(text);
          cb();
        },
      });
      const log = pino(
        {
          base: { service: 'svc-x' },
          level: 'info',
          formatters: { level: (label) => ({ level: label }) },
        },
        stream,
      );
      log.info({ foo: 'bar' }, 'hello');

      try {
        const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
        expect(parsed.service).toBe('svc-x');
        expect(parsed.msg).toBe('hello');
        expect(parsed.foo).toBe('bar');
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }));
});
