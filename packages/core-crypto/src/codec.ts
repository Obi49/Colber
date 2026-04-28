/**
 * Encoding helpers — pure functions, no crypto.
 * Kept separate so they can be tested in isolation and reused across services.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** RFC 4648 base64 (with padding) — both directions. */
export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
export const fromBase64 = (str: string): Uint8Array =>
  Uint8Array.from(Buffer.from(str, 'base64'));

/** Hex helpers (lower-case, no `0x` prefix). */
export const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
export const fromHex = (str: string): Uint8Array =>
  Uint8Array.from(Buffer.from(str.replace(/^0x/, ''), 'hex'));

/**
 * Base58btc encoding (Bitcoin alphabet) — used by multibase `z` prefix
 * which is the encoding required by the W3C did:key spec.
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

  // Convert to base58 by repeated division on a Uint8Array.
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

/** Constant-time byte equality. Uses XOR-fold to avoid early-exit timing leaks. */
export const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
};
