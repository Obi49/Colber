import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  fromBase58btc,
  fromBase64,
  fromHex,
  toBase58btc,
  toBase64,
  toHex,
} from './codec.js';

describe('codec', () => {
  describe('base64 round-trip', () => {
    it('encodes and decodes empty bytes', () => {
      const empty = new Uint8Array();
      expect(fromBase64(toBase64(empty))).toEqual(empty);
    });

    it('encodes and decodes arbitrary bytes', () => {
      const bytes = new Uint8Array([0, 1, 127, 128, 255, 42, 7]);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    });
  });

  describe('hex round-trip', () => {
    it('encodes to lower-case hex', () => {
      expect(toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef');
    });

    it('strips 0x prefix on decode', () => {
      expect(fromHex('0xdeadbeef')).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    });
  });

  describe('base58btc round-trip', () => {
    it('handles empty input', () => {
      expect(toBase58btc(new Uint8Array())).toBe('');
      expect(fromBase58btc('')).toEqual(new Uint8Array());
    });

    it('preserves leading zeros (encoded as "1")', () => {
      const bytes = new Uint8Array([0, 0, 1, 2, 3]);
      const encoded = toBase58btc(bytes);
      expect(encoded.startsWith('11')).toBe(true);
      expect(fromBase58btc(encoded)).toEqual(bytes);
    });

    it('round-trips known did:key payload prefix', () => {
      // 0xed 0x01 + 32 random-ish bytes
      const bytes = new Uint8Array([
        0xed, 0x01, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
        0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
        0x1d, 0x1e, 0x1f, 0x20,
      ]);
      const encoded = toBase58btc(bytes);
      expect(fromBase58btc(encoded)).toEqual(bytes);
    });

    it('rejects invalid characters', () => {
      expect(() => fromBase58btc('0OIl')).toThrow(/Invalid base58/);
    });
  });

  describe('constantTimeEqual', () => {
    it('returns true for identical buffers', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it('returns false for different lengths', () => {
      expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
    });

    it('returns false for differing content', () => {
      expect(
        constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])),
      ).toBe(false);
    });
  });
});
