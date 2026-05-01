import { getSignatureProvider, toBase64 } from '@colber/core-crypto';
import { ERROR_CODES, ColberError } from '@colber/core-types';
import { beforeEach, describe, expect, it } from 'vitest';

import { IdentityService } from '../../src/domain/identity-service.js';
import { InMemoryAgentRepository } from '../fakes/in-memory-repo.js';

describe('IdentityService', () => {
  let repo: InMemoryAgentRepository;
  let service: IdentityService;
  const ed = getSignatureProvider('Ed25519');

  beforeEach(() => {
    repo = new InMemoryAgentRepository();
    service = new IdentityService(repo);
  });

  describe('register', () => {
    it('registers an agent and returns a did:key DID', async () => {
      const kp = await ed.generateKeyPair();
      const result = await service.register({
        publicKeyBase64: toBase64(kp.publicKey),
        ownerOperatorId: 'op_test',
      });

      expect(result.did).toMatch(/^did:key:z6Mk/);
      expect(result.agentId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.signatureScheme).toBe('Ed25519');
      expect(result.ownerOperatorId).toBe('op_test');
      expect(repo.size()).toBe(1);
    });

    it('rejects a non-base64 public key', async () => {
      await expect(
        service.register({ publicKeyBase64: 'not!base64', ownerOperatorId: 'op' }),
      ).rejects.toBeInstanceOf(ColberError);
    });

    it('rejects a public key of the wrong length', async () => {
      const tooShort = toBase64(new Uint8Array(16));
      await expect(
        service.register({ publicKeyBase64: tooShort, ownerOperatorId: 'op' }),
      ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_PUBLIC_KEY });
    });

    it('rejects double registration of the same key', async () => {
      const kp = await ed.generateKeyPair();
      await service.register({
        publicKeyBase64: toBase64(kp.publicKey),
        ownerOperatorId: 'op',
      });
      await expect(
        service.register({
          publicKeyBase64: toBase64(kp.publicKey),
          ownerOperatorId: 'op',
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.DID_ALREADY_REGISTERED });
    });
  });

  describe('resolve', () => {
    it('returns the registered agent', async () => {
      const kp = await ed.generateKeyPair();
      const reg = await service.register({
        publicKeyBase64: toBase64(kp.publicKey),
        ownerOperatorId: 'op',
      });
      const got = await service.resolve(reg.did);
      expect(got.did).toBe(reg.did);
      expect(got.agentId).toBe(reg.agentId);
    });

    it('throws DID_NOT_FOUND on unknown DID', async () => {
      await expect(service.resolve('did:key:z6MkUnknown')).rejects.toMatchObject({
        code: ERROR_CODES.DID_NOT_FOUND,
      });
    });
  });

  describe('verify', () => {
    it('returns valid:true for a correct signature', async () => {
      const kp = await ed.generateKeyPair();
      const reg = await service.register({
        publicKeyBase64: toBase64(kp.publicKey),
        ownerOperatorId: 'op',
      });
      const message = new TextEncoder().encode('hello agentic world');
      const signature = await ed.sign(message, kp.privateKey);

      const res = await service.verify({
        did: reg.did,
        messageBase64: toBase64(message),
        signatureBase64: toBase64(signature),
      });
      expect(res.valid).toBe(true);
    });

    it('returns valid:false for a tampered message', async () => {
      const kp = await ed.generateKeyPair();
      const reg = await service.register({
        publicKeyBase64: toBase64(kp.publicKey),
        ownerOperatorId: 'op',
      });
      const original = new TextEncoder().encode('original');
      const signature = await ed.sign(original, kp.privateKey);

      const res = await service.verify({
        did: reg.did,
        messageBase64: toBase64(new TextEncoder().encode('tampered')),
        signatureBase64: toBase64(signature),
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it('throws DID_NOT_FOUND for unknown DID', async () => {
      await expect(
        service.verify({
          did: 'did:key:z6MkUnknown',
          messageBase64: toBase64(new Uint8Array([1])),
          signatureBase64: toBase64(new Uint8Array(64)),
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.DID_NOT_FOUND });
    });
  });
});
