import { describe, expect, it } from 'vitest';

import { isDidKey, parseDidMethod } from './did.js';

describe('did', () => {
  describe('isDidKey', () => {
    it('accepts a well-formed did:key Ed25519 identifier', () => {
      const sample = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSweuBV5xZLwhHTLkbm5';
      expect(isDidKey(sample)).toBe(true);
    });

    it('rejects empty strings', () => {
      expect(isDidKey('')).toBe(false);
    });

    it('rejects DIDs with the wrong method', () => {
      expect(isDidKey('did:web:example.com')).toBe(false);
    });

    it('rejects DIDs with invalid multibase prefix', () => {
      expect(isDidKey('did:key:abc123')).toBe(false);
    });
  });

  describe('parseDidMethod', () => {
    it('extracts the method', () => {
      expect(parseDidMethod('did:key:z6Mkxxx')).toBe('key');
      expect(parseDidMethod('did:web:example.com')).toBe('web');
      expect(parseDidMethod('did:ethr:0xabc')).toBe('ethr');
    });

    it('returns undefined for unknown methods', () => {
      expect(parseDidMethod('did:foo:bar')).toBeUndefined();
    });

    it('returns undefined for malformed DIDs', () => {
      expect(parseDidMethod('not-a-did')).toBeUndefined();
      expect(parseDidMethod('did:key')).toBeUndefined();
    });
  });
});
