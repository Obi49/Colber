/**
 * JCS — JSON Canonicalization Scheme (RFC 8785).
 *
 * Mirrors `apps/reputation/src/domain/canonical-json.ts` (the reputation
 * service does the same thing for its signed score / signed feedback
 * payloads). We deliberately keep a per-service copy rather than promoting
 * to `@colber/core-crypto` because:
 *   - The spec is small.
 *   - We want byte-exact behaviour locked in tests within this package.
 *   - Promoting later is mechanical if a third service needs it.
 *
 * RFC 8785 specifies:
 *   1. Object keys are sorted lexicographically by their UTF-16 code unit
 *      ordering.
 *   2. Whitespace is removed.
 *   3. Strings are serialized with the minimum-length escape rules from
 *      ECMA-262 7th edition §24.5.2 ("safe" escapes only).
 *   4. Numbers use the ECMA-262 ToString algorithm ("shortest round-trip"
 *      double-to-string), which is what `JSON.stringify` already produces
 *      for finite numbers.
 *   5. `null`, `true`, `false` are serialized literally.
 *   6. Arrays preserve member order.
 *
 * This implementation rejects any non-finite number (NaN, +/-Infinity),
 * `undefined`, BigInt, function, symbol, and circular graphs. Throws a
 * `TypeError` so the caller can map to a 400.
 */

const HEX = '0123456789abcdef';

const escapeString = (s: string): string => {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22 /* " */) {
      out += '\\"';
    } else if (c === 0x5c /* \ */) {
      out += '\\\\';
    } else if (c === 0x08) {
      out += '\\b';
    } else if (c === 0x09) {
      out += '\\t';
    } else if (c === 0x0a) {
      out += '\\n';
    } else if (c === 0x0c) {
      out += '\\f';
    } else if (c === 0x0d) {
      out += '\\r';
    } else if (c < 0x20) {
      out += `\\u00${HEX[(c >> 4) & 0xf] ?? '0'}${HEX[c & 0xf] ?? '0'}`;
    } else {
      out += s[i];
    }
  }
  out += '"';
  return out;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

const writeValue = (value: unknown, seen: WeakSet<object>): string => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return escapeString(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Cannot canonicalize non-finite number: ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    throw new TypeError('Cannot canonicalize bigint values');
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError('Circular reference detected during canonicalization');
    }
    seen.add(value);
    const parts: string[] = [];
    for (const item of value) {
      if (item === undefined) {
        parts.push('null');
      } else {
        parts.push(writeValue(item, seen));
      }
    }
    seen.delete(value);
    return `[${parts.join(',')}]`;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) {
      throw new TypeError('Circular reference detected during canonicalization');
    }
    seen.add(value);
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts: string[] = [];
    for (const key of keys) {
      const v = value[key];
      if (v === undefined) {
        continue;
      }
      parts.push(`${escapeString(key)}:${writeValue(v, seen)}`);
    }
    seen.delete(value);
    return `{${parts.join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize value of type ${typeof value}`);
};

/** Canonicalize a JSON-compatible value to its RFC 8785 (JCS) string form. */
export const canonicalize = (value: unknown): string => writeValue(value, new WeakSet<object>());

/** Canonicalize and return the UTF-8 byte representation. */
export const canonicalizeBytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(canonicalize(value));
