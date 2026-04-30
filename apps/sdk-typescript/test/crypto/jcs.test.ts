import { describe, expect, it } from 'vitest';

import { canonicalizeJcs, canonicalizeJcsBytes } from '../../src/crypto/jcs.js';

/**
 * JCS test vectors mirror those in `apps/reputation/test/unit/canonical-json.test.ts`
 * so the SDK's behaviour is provably identical to the platform's.
 */
describe('canonicalizeJcs (RFC 8785)', () => {
  it('serialises primitives like JSON.stringify', () => {
    expect(canonicalizeJcs(null)).toBe('null');
    expect(canonicalizeJcs(true)).toBe('true');
    expect(canonicalizeJcs(false)).toBe('false');
    expect(canonicalizeJcs(0)).toBe('0');
    expect(canonicalizeJcs(42)).toBe('42');
    expect(canonicalizeJcs(-3.14)).toBe('-3.14');
    expect(canonicalizeJcs('hello')).toBe('"hello"');
    expect(canonicalizeJcs('')).toBe('""');
  });

  it('sorts object keys lexicographically by code unit', () => {
    expect(canonicalizeJcs({ b: 2, a: 1, c: 3 })).toBe('{"a":1,"b":2,"c":3}');
    expect(canonicalizeJcs({ Z: 1, A: 2, a: 3 })).toBe('{"A":2,"Z":1,"a":3}');
  });

  it('handles nested objects with stable ordering', () => {
    const input = {
      score: 642,
      did: 'did:key:abc',
      scoreVersion: 'v1.0',
      computedAt: '2026-04-27T00:00:00.000Z',
    };
    expect(canonicalizeJcs(input)).toBe(
      '{"computedAt":"2026-04-27T00:00:00.000Z","did":"did:key:abc","score":642,"scoreVersion":"v1.0"}',
    );
  });

  it('preserves array order, recurses into items', () => {
    expect(canonicalizeJcs([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalizeJcs([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('escapes control characters and quotes', () => {
    expect(canonicalizeJcs('a"b')).toBe('"a\\"b"');
    expect(canonicalizeJcs('line1\nline2')).toBe('"line1\\nline2"');
    expect(canonicalizeJcs(String.fromCharCode(1))).toBe('"\\u0001"');
    expect(canonicalizeJcs('\\')).toBe('"\\\\"');
  });

  it('produces a deterministic output independent of property insertion order', () => {
    const a = { foo: 1, bar: 2 };
    const b = { bar: 2, foo: 1 };
    expect(canonicalizeJcs(a)).toBe(canonicalizeJcs(b));
  });

  it('skips undefined object properties', () => {
    expect(canonicalizeJcs({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('encodes undefined array members as null (mirrors JSON.stringify)', () => {
    expect(canonicalizeJcs([1, undefined, 3])).toBe('[1,null,3]');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalizeJcs(NaN)).toThrow(TypeError);
    expect(() => canonicalizeJcs(Infinity)).toThrow(TypeError);
    expect(() => canonicalizeJcs(-Infinity)).toThrow(TypeError);
  });

  it('rejects bigints', () => {
    expect(() => canonicalizeJcs(1n)).toThrow(TypeError);
  });

  it('rejects functions and symbols', () => {
    expect(() => canonicalizeJcs(() => 1)).toThrow(TypeError);
    expect(() => canonicalizeJcs(Symbol('x'))).toThrow(TypeError);
  });

  it('rejects circular structures', () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(() => canonicalizeJcs(a)).toThrow(TypeError);
  });

  it('returns UTF-8 bytes via canonicalizeJcsBytes', () => {
    const bytes = canonicalizeJcsBytes({ a: 1 });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
  });
});
