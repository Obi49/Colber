import { describe, expect, it } from 'vitest';

import { canonicalize, canonicalizeBytes } from '../../src/domain/canonical-json.js';

describe('canonical-json (RFC 8785 / JCS)', () => {
  it('serialises primitives like JSON.stringify', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(-3.14)).toBe('-3.14');
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize('')).toBe('""');
  });

  it('sorts object keys lexicographically by code unit', () => {
    expect(canonicalize({ b: 2, a: 1, c: 3 })).toBe('{"a":1,"b":2,"c":3}');
    expect(canonicalize({ Z: 1, A: 2, a: 3 })).toBe('{"A":2,"Z":1,"a":3}');
  });

  it('handles nested objects with stable ordering', () => {
    const input = {
      score: 642,
      did: 'did:key:abc',
      scoreVersion: 'v1.0',
      computedAt: '2026-04-27T00:00:00.000Z',
    };
    expect(canonicalize(input)).toBe(
      '{"computedAt":"2026-04-27T00:00:00.000Z","did":"did:key:abc","score":642,"scoreVersion":"v1.0"}',
    );
  });

  it('preserves array order, recurses into items', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalize([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('escapes control characters and quotes', () => {
    expect(canonicalize('a"b')).toBe('"a\\"b"');
    expect(canonicalize('line1\nline2')).toBe('"line1\\nline2"');
    expect(canonicalize(String.fromCharCode(1))).toBe('"\\u0001"');
    expect(canonicalize('\\')).toBe('"\\\\"');
  });

  it('produces a deterministic output independent of property insertion order', () => {
    const a = { foo: 1, bar: 2 };
    const b = { bar: 2, foo: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('skips undefined object properties', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('encodes undefined array members as null (mirrors JSON.stringify)', () => {
    expect(canonicalize([1, undefined, 3])).toBe('[1,null,3]');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalize(NaN)).toThrow(TypeError);
    expect(() => canonicalize(Infinity)).toThrow(TypeError);
    expect(() => canonicalize(-Infinity)).toThrow(TypeError);
  });

  it('rejects bigints', () => {
    expect(() => canonicalize(1n)).toThrow(TypeError);
  });

  it('rejects functions and symbols', () => {
    expect(() => canonicalize(() => 1)).toThrow(TypeError);
    expect(() => canonicalize(Symbol('x'))).toThrow(TypeError);
  });

  it('rejects circular structures', () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(() => canonicalize(a)).toThrow(TypeError);
  });

  it('returns UTF-8 bytes via canonicalizeBytes', () => {
    const bytes = canonicalizeBytes({ a: 1 });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
  });
});
