import { ColberApiError, ColberNetworkError, ColberValidationError } from '@colber/sdk';
import { describe, expect, it } from 'vitest';
import { z, type ZodError } from 'zod';

import { toMcpErrorResult } from '../../src/errors.js';

describe('toMcpErrorResult', () => {
  it('maps ColberApiError(404) to a NOT_FOUND payload', () => {
    const err = new ColberApiError({
      code: 'NOT_FOUND',
      message: 'agent missing',
      status: 404,
      details: { did: 'did:key:zX' },
      traceId: 'trace-1',
    });
    const result = toMcpErrorResult(err, { toolName: 'colber_identity_resolve' });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.code).toBe('NOT_FOUND');
    expect(payload.status).toBe(404);
    expect(payload.tool).toBe('colber_identity_resolve');
    expect(payload.traceId).toBe('trace-1');
  });

  it('maps ColberApiError(409) idempotency conflict', () => {
    const err = new ColberApiError({
      code: 'IDEMPOTENCY_REPLAY',
      message: 'duplicate',
      status: 409,
    });
    const result = toMcpErrorResult(err, { toolName: 'colber_insurance_subscribe' });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.code).toBe('IDEMPOTENCY_REPLAY');
    expect(payload.status).toBe(409);
  });

  it('maps ColberValidationError to VALIDATION_FAILED', () => {
    const err = new ColberValidationError('bad input', 'publicKey');
    const result = toMcpErrorResult(err, { toolName: 'colber_identity_register' });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.code).toBe('VALIDATION_FAILED');
    expect((payload.details as { path?: string }).path).toBe('publicKey');
  });

  it('maps ColberNetworkError to its transport code', () => {
    const err = new ColberNetworkError({ code: 'TIMEOUT', message: '5s deadline' });
    const result = toMcpErrorResult(err, { toolName: 'colber_reputation_score' });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.code).toBe('TIMEOUT');
  });

  it('maps ZodError to VALIDATION_FAILED with issues', () => {
    const schema = z.object({ name: z.string().min(3) });
    const parsed = schema.safeParse({ name: 'a' });
    expect(parsed.success).toBe(false);
    const err = (parsed as { success: false; error: ZodError }).error;
    const result = toMcpErrorResult(err, { toolName: 'colber_test' });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.code).toBe('VALIDATION_FAILED');
    const issues = (payload.details as { issues: unknown[] }).issues;
    expect(Array.isArray(issues)).toBe(true);
  });

  it('maps generic Error to INTERNAL_ERROR', () => {
    const err = new Error('boom');
    const result = toMcpErrorResult(err, { toolName: 'colber_test' });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.code).toBe('INTERNAL_ERROR');
    expect(payload.message).toBe('boom');
  });

  it('maps non-Error throwables (string)', () => {
    const result = toMcpErrorResult('weird thrown string', { toolName: 'colber_test' });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.code).toBe('INTERNAL_ERROR');
    expect(payload.message).toBe('weird thrown string');
  });

  it('attaches traceId when provided in context', () => {
    const err = new Error('boom');
    const result = toMcpErrorResult(err, { toolName: 'colber_test', traceId: 'tr-9' });
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload.traceId).toBe('tr-9');
  });
});
