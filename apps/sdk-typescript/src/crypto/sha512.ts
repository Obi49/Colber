/**
 * SHA-512 wiring for `@noble/ed25519`.
 *
 * `@noble/ed25519@2.x` is hash-pluggable and ships without a bundled hash to
 * stay zero-dep. We wire it to Node 20+'s built-in `node:crypto.createHash`
 * — no extra runtime dependency, fully synchronous, identical output to the
 * `@noble/hashes/sha512` implementation used elsewhere in the platform.
 */

import { createHash } from 'node:crypto';

const sha512 = (data: Uint8Array): Uint8Array => {
  const h = createHash('sha512');
  h.update(data);
  return Uint8Array.from(h.digest());
};

const concatBytes = (...arrays: Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const a of arrays) {
    total += a.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};

/**
 * Variadic sha512 — `@noble/ed25519` calls this with one or more chunks.
 * Single-chunk fast path skips the concat allocation.
 */
export const wireSha512 = (...messages: Uint8Array[]): Uint8Array => {
  if (messages.length === 1) {
    const m = messages[0];
    if (m === undefined) {
      throw new Error('sha512: undefined input');
    }
    return sha512(m);
  }
  return sha512(concatBytes(...messages));
};
