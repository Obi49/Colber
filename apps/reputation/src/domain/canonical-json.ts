/**
 * JCS — JSON Canonicalization Scheme (RFC 8785).
 *
 * The signed-attestation surface (`reputation.score` / `reputation.verify`)
 * and signed-feedback surface (`reputation.feedback`) need a deterministic
 * byte representation of the payload before either side hashes/signs it.
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
 * This implementation deliberately rejects any non-finite number (NaN,
 * +/-Infinity), `undefined`, BigInt, function, symbol, and circular graphs.
 * Throws a `TypeError` so the caller can map to a 400 with a clear message.
 *
 * Why not pull a library: the spec is small, dependencies are precious, and
 * we want the byte-exact behaviour locked in tests in this repo. The standard
 * `JSON.stringify` plus key sorting and escape normalization is sufficient
 * for the payload shapes we sign.
 */

const HEX = '0123456789abcdef';

const escapeString = (s: string): string => {
  // ECMA-262 §24.5.2 "safe" escapes.
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
      // Control character — escape as \u00XX.
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
    // ECMA-262 ToString matches `JSON.stringify(n)` for finite numbers,
    // which is what JCS prescribes (RFC 8785 §3.2.2.3).
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
        // JSON.stringify converts `undefined` array members to `null`.
        // RFC 8785 inherits ES behaviour, so we do the same.
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
    // RFC 8785 §3.2.3: sort by code unit. JS string `<` comparison on UTF-16
    // strings is exactly that.
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts: string[] = [];
    for (const key of keys) {
      const v = value[key];
      if (v === undefined) {
        // JCS does not encode `undefined` properties (mirrors JSON.stringify).
        continue;
      }
      parts.push(`${escapeString(key)}:${writeValue(v, seen)}`);
    }
    seen.delete(value);
    return `{${parts.join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize value of type ${typeof value}`);
};

/**
 * Canonicalize a JSON-compatible value to its RFC 8785 (JCS) string form.
 *
 * Throws `TypeError` on unsupported inputs (functions, symbols, BigInt,
 * non-finite numbers, circular graphs, non-plain objects).
 */
export const canonicalize = (value: unknown): string => writeValue(value, new WeakSet<object>());

/**
 * Canonicalize and return the UTF-8 byte representation, ready to be hashed
 * or signed.
 */
export const canonicalizeBytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(canonicalize(value));
