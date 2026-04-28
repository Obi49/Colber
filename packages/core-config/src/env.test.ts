import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigValidationError, loadConfig } from './env.js';
import { BaseServiceEnvSchema, PortSchema } from './schemas.js';

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const schema = BaseServiceEnvSchema.extend({ PORT: PortSchema });
    const cfg = loadConfig(schema, {
      source: { NODE_ENV: 'test', LOG_LEVEL: 'debug', SERVICE_NAME: 'test-svc', PORT: '4000' },
      loadDotenv: false,
    });
    expect(cfg.NODE_ENV).toBe('test');
    expect(cfg.PORT).toBe(4000);
  });

  it('throws ConfigValidationError on missing required vars', () => {
    const schema = z.object({ MUST_HAVE: z.string().min(1) });
    expect(() => loadConfig(schema, { source: {}, loadDotenv: false })).toThrowError(
      ConfigValidationError,
    );
  });

  it('throws on invalid port', () => {
    const schema = z.object({ PORT: PortSchema });
    expect(() => loadConfig(schema, { source: { PORT: '99999' }, loadDotenv: false })).toThrow();
  });

  it('applies defaults from schema', () => {
    const cfg = loadConfig(BaseServiceEnvSchema, {
      source: { SERVICE_NAME: 'svc' },
      loadDotenv: false,
    });
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.LOG_LEVEL).toBe('info');
  });
});
