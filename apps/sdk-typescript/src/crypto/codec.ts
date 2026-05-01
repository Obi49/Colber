/**
 * Encoding helpers — pure, no crypto. Inlined from `@colber/core-crypto` so
 * the SDK has no runtime workspace dependency.
 *
 * The base58btc encoder is the one required by the W3C `did:key` spec
 * (multibase `z` prefix). RFC 4648 base64 (with padding) is used for
 * signature/key wire formats. Constant-time compare is here for parity with
 * core-crypto even though the SDK doesn't currently use it.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** RFC 4648 base64 (with padding) — encode. */
export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** RFC 4648 base64 (with padding) — decode. */
export const fromBase64 = (str: string): Uint8Array => Uint8Array.from(Buffer.from(str, 'base64'));

/**
 * Base58btc encoding (Bitcoin alphabet). Used by the multibase `z` prefix
 * required by the W3C did:key spec.
 */
export const toBase58btc = (bytes: Uint8Array): string => {
  if (bytes.length === 0) {
    return '';
  }

  // Count leading zero bytes — they map 1:1 to leading '1' chars in base58.
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++;
  }

  const size = Math.ceil(((bytes.length - zeros) * 138) / 100) + 1;
  const buffer = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i] ?? 0;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * (buffer[k] ?? 0);
      buffer[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }

  let it = size - length;
  while (it < size && buffer[it] === 0) {
    it++;
  }

  let out = '1'.repeat(zeros);
  for (; it < size; it++) {
    const idx = buffer[it];
    if (idx === undefined) {
      continue;
    }
    out += BASE58_ALPHABET[idx];
  }
  return out;
};

/** Inverse of {@link toBase58btc}. Throws on an invalid character. */
export const fromBase58btc = (str: string): Uint8Array => {
  if (str.length === 0) {
    return new Uint8Array();
  }

  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') {
    zeros++;
  }

  const size = Math.ceil(((str.length - zeros) * 733) / 1000) + 1;
  const buffer = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < str.length; i++) {
    const ch = str[i];
    if (ch === undefined) {
      continue;
    }
    const carryStart = BASE58_ALPHABET.indexOf(ch);
    if (carryStart === -1) {
      throw new Error(`Invalid base58 character: ${ch}`);
    }

    let carry = carryStart;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * (buffer[k] ?? 0);
      buffer[k] = carry & 0xff;
      carry >>= 8;
    }
    length = j;
  }

  let it = size - length;
  while (it < size && buffer[it] === 0) {
    it++;
  }

  const out = new Uint8Array(zeros + (size - it));
  out.set(new Uint8Array(zeros).fill(0), 0);
  out.set(buffer.subarray(it), zeros);
  return out;
};
