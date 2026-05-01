import { describe, expect, it } from 'vitest';

import {
  ColberApiError,
  ColberError,
  ColberNetworkError,
  ColberValidationError,
} from '../src/errors.js';

describe('error classes', () => {
  it('ColberApiError carries structured wire fields', () => {
    const err = new ColberApiError({
      code: 'NOT_FOUND',
      message: 'agent not registered',
      status: 404,
      details: { did: 'did:key:zfoo' },
      traceId: 't-1',
    });
    expect(err).toBeInstanceOf(ColberError);
    expect(err.name).toBe('ColberApiError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.details).toEqual({ did: 'did:key:zfoo' });
    expect(err.traceId).toBe('t-1');
  });

  it('ColberApiError.fromBody round-trips a parsed envelope', () => {
    const err = ColberApiError.fromBody(409, {
      code: 'IDEMPOTENCY_REPLAY',
      message: 'already accepted',
    });
    expect(err.code).toBe('IDEMPOTENCY_REPLAY');
    expect(err.status).toBe(409);
    expect(err.details).toBeUndefined();
    expect(err.traceId).toBeUndefined();
  });

  it('ColberApiError.toJSON returns a logger-friendly snapshot', () => {
    const err = new ColberApiError({
      code: 'X',
      message: 'y',
      status: 500,
    });
    expect(err.toJSON()).toEqual({
      name: 'ColberApiError',
      code: 'X',
      message: 'y',
      status: 500,
    });
  });

  it('ColberNetworkError exposes the failure code', () => {
    const err = new ColberNetworkError({ code: 'TIMEOUT', message: 'slow' });
    expect(err).toBeInstanceOf(ColberError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.name).toBe('ColberNetworkError');
  });

  it('ColberValidationError preserves its path', () => {
    const err = new ColberValidationError('bad', 'body.field');
    expect(err.path).toBe('body.field');
    expect(err.name).toBe('ColberValidationError');
  });

  it('all subclasses pass `instanceof ColberError`', () => {
    expect(new ColberApiError({ code: 'X', message: 'y', status: 500 })).toBeInstanceOf(
      ColberError,
    );
    expect(new ColberNetworkError({ code: 'TIMEOUT', message: 'slow' })).toBeInstanceOf(
      ColberError,
    );
    expect(new ColberValidationError('bad')).toBeInstanceOf(ColberError);
  });
});
