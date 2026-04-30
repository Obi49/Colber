import { describe, expect, it } from 'vitest';

import { isErrorEnvelope, isOkEnvelope } from '../src/envelope.js';

describe('envelope guards', () => {
  describe('isOkEnvelope', () => {
    it('accepts a valid success envelope', () => {
      expect(isOkEnvelope({ ok: true, data: { foo: 1 } })).toBe(true);
      expect(isOkEnvelope({ ok: true, data: null })).toBe(true);
    });

    it('rejects null, primitives, and arrays', () => {
      expect(isOkEnvelope(null)).toBe(false);
      expect(isOkEnvelope(42)).toBe(false);
      expect(isOkEnvelope('ok')).toBe(false);
      expect(isOkEnvelope([])).toBe(false);
    });

    it('rejects an envelope with ok=false', () => {
      expect(isOkEnvelope({ ok: false, error: { code: 'X', message: 'y' } })).toBe(false);
    });

    it('rejects an envelope missing the data field', () => {
      expect(isOkEnvelope({ ok: true })).toBe(false);
    });
  });

  describe('isErrorEnvelope', () => {
    it('accepts a valid error envelope', () => {
      expect(isErrorEnvelope({ ok: false, error: { code: 'X', message: 'y' } })).toBe(true);
    });

    it('accepts an error envelope with details and traceId', () => {
      expect(
        isErrorEnvelope({
          ok: false,
          error: { code: 'X', message: 'y', details: { foo: 1 }, traceId: 't-1' },
        }),
      ).toBe(true);
    });

    it('rejects when error.code or error.message is missing or wrong type', () => {
      expect(isErrorEnvelope({ ok: false, error: { code: 'X' } })).toBe(false);
      expect(isErrorEnvelope({ ok: false, error: { code: 1, message: 'y' } })).toBe(false);
      expect(isErrorEnvelope({ ok: false, error: null })).toBe(false);
    });

    it('rejects when ok is not false', () => {
      expect(isErrorEnvelope({ ok: true, error: { code: 'X', message: 'y' } })).toBe(false);
    });
  });
});
