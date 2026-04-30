import { describe, expect, it } from 'vitest';

import {
  PraxisApiError,
  PraxisError,
  PraxisNetworkError,
  PraxisValidationError,
} from '../src/errors.js';

describe('error classes', () => {
  it('PraxisApiError carries structured wire fields', () => {
    const err = new PraxisApiError({
      code: 'NOT_FOUND',
      message: 'agent not registered',
      status: 404,
      details: { did: 'did:key:zfoo' },
      traceId: 't-1',
    });
    expect(err).toBeInstanceOf(PraxisError);
    expect(err.name).toBe('PraxisApiError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.details).toEqual({ did: 'did:key:zfoo' });
    expect(err.traceId).toBe('t-1');
  });

  it('PraxisApiError.fromBody round-trips a parsed envelope', () => {
    const err = PraxisApiError.fromBody(409, {
      code: 'IDEMPOTENCY_REPLAY',
      message: 'already accepted',
    });
    expect(err.code).toBe('IDEMPOTENCY_REPLAY');
    expect(err.status).toBe(409);
    expect(err.details).toBeUndefined();
    expect(err.traceId).toBeUndefined();
  });

  it('PraxisApiError.toJSON returns a logger-friendly snapshot', () => {
    const err = new PraxisApiError({
      code: 'X',
      message: 'y',
      status: 500,
    });
    expect(err.toJSON()).toEqual({
      name: 'PraxisApiError',
      code: 'X',
      message: 'y',
      status: 500,
    });
  });

  it('PraxisNetworkError exposes the failure code', () => {
    const err = new PraxisNetworkError({ code: 'TIMEOUT', message: 'slow' });
    expect(err).toBeInstanceOf(PraxisError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.name).toBe('PraxisNetworkError');
  });

  it('PraxisValidationError preserves its path', () => {
    const err = new PraxisValidationError('bad', 'body.field');
    expect(err.path).toBe('body.field');
    expect(err.name).toBe('PraxisValidationError');
  });

  it('all subclasses pass `instanceof PraxisError`', () => {
    expect(new PraxisApiError({ code: 'X', message: 'y', status: 500 })).toBeInstanceOf(
      PraxisError,
    );
    expect(new PraxisNetworkError({ code: 'TIMEOUT', message: 'slow' })).toBeInstanceOf(
      PraxisError,
    );
    expect(new PraxisValidationError('bad')).toBeInstanceOf(PraxisError);
  });
});
