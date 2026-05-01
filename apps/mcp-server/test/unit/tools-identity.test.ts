import { describe, expect, it } from 'vitest';

import { registerIdentityTools } from '../../src/tools/identity.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { newCtx, newRegistry, parseError, parseOk } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

const setup = (): { registry: ReturnType<typeof newRegistry>; sdk: FakeSdkClient } => {
  const sdk = new FakeSdkClient();
  const registry = newRegistry();
  registerIdentityTools(registry, sdk as unknown as ColberClient);
  return { registry, sdk };
};

describe('identity MCP tools', () => {
  it('registers exactly 3 tools with the expected names', () => {
    const { registry } = setup();
    expect(registry.size()).toBe(3);
    expect(registry.names()).toEqual(
      expect.arrayContaining([
        'colber_identity_register',
        'colber_identity_resolve',
        'colber_identity_verify',
      ]),
    );
  });

  describe('colber_identity_register', () => {
    it('forwards inputs to the SDK and returns the fixture', async () => {
      const { registry, sdk } = setup();
      const result = await registry.call(
        'colber_identity_register',
        { publicKey: 'AAAA', ownerOperatorId: 'op-1' },
        newCtx(),
      );
      const body = parseOk(result) as { did: string };
      expect(body.did).toBe('did:key:z6Mkfake-register');
      expect(sdk.identity.state.lastCall?.method).toBe('register');
      expect(sdk.identity.state.lastCall?.args[0]).toMatchObject({
        publicKey: 'AAAA',
        ownerOperatorId: 'op-1',
      });
    });

    it('rejects invalid input via zod', async () => {
      const { registry } = setup();
      const result = await registry.call(
        'colber_identity_register',
        { publicKey: '', ownerOperatorId: 'op-1' },
        newCtx(),
      );
      const err = parseError(result);
      expect(err.code).toBe('VALIDATION_FAILED');
    });

    it('maps SDK ColberApiError to isError content', async () => {
      const { registry, sdk } = setup();
      sdk.identity.state.nextError = { kind: 'api', status: 409, code: 'CONFLICT' };
      const result = await registry.call(
        'colber_identity_register',
        { publicKey: 'AAAA', ownerOperatorId: 'op-1' },
        newCtx(),
      );
      const err = parseError(result);
      expect(err.code).toBe('CONFLICT');
    });
  });

  describe('colber_identity_resolve', () => {
    it('forwards the did and returns the agent record', async () => {
      const { registry, sdk } = setup();
      const result = await registry.call(
        'colber_identity_resolve',
        { did: 'did:key:zResolve' },
        newCtx(),
      );
      const body = parseOk(result) as { did: string };
      expect(body.did).toBe('did:key:zResolve');
      expect(sdk.identity.state.lastCall?.args[0]).toBe('did:key:zResolve');
    });

    it('maps network errors', async () => {
      const { registry, sdk } = setup();
      sdk.identity.state.nextError = { kind: 'network', code: 'TIMEOUT' };
      const result = await registry.call(
        'colber_identity_resolve',
        { did: 'did:key:zX' },
        newCtx(),
      );
      const err = parseError(result);
      expect(err.code).toBe('TIMEOUT');
    });
  });

  describe('colber_identity_verify', () => {
    it('passes through did/message/signature', async () => {
      const { registry, sdk } = setup();
      const result = await registry.call(
        'colber_identity_verify',
        { did: 'did:key:zV', message: 'bWVzc2FnZQ==', signature: 'c2ln' },
        newCtx(),
      );
      const body = parseOk(result) as { valid: boolean };
      expect(body.valid).toBe(true);
      expect(sdk.identity.state.lastCall?.method).toBe('verify');
    });
  });
});
