import { describe, expect, it } from 'vitest';

import { registerNegotiationTools } from '../../src/tools/negotiation.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { newCtx, newRegistry, parseError, parseOk } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

const setup = (): { registry: ReturnType<typeof newRegistry>; sdk: FakeSdkClient } => {
  const sdk = new FakeSdkClient();
  const registry = newRegistry();
  registerNegotiationTools(registry, sdk as unknown as ColberClient);
  return { registry, sdk };
};

const validProposal = (): Record<string, unknown> => ({
  proposalId: '99999999-9999-4999-8999-999999999999',
  fromDid: 'did:key:zA',
  amount: 100,
  signature: 'AAAA',
  proposedAt: '2026-05-01T00:00:00.000Z',
});

describe('negotiation MCP tools', () => {
  it('registers exactly 4 tools', () => {
    const { registry } = setup();
    expect(registry.size()).toBe(4);
    expect(registry.names()).toEqual(
      expect.arrayContaining([
        'colber_negotiation_start',
        'colber_negotiation_propose',
        'colber_negotiation_counter',
        'colber_negotiation_settle',
      ]),
    );
  });

  it('start: forwards terms + idempotencyKey', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_negotiation_start',
      {
        terms: {
          subject: 'shipment-x',
          strategy: 'ascending-auction',
          partyDids: ['did:key:zA', 'did:key:zB'],
          deadline: '2026-06-01T00:00:00.000Z',
        },
        createdBy: 'op-1',
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      newCtx(),
    );
    parseOk(result);
    expect(sdk.negotiation.state.lastCall?.method).toBe('start');
    const [body, opts] = sdk.negotiation.state.lastCall?.args as [
      { createdBy: string },
      { idempotencyKey: string },
    ];
    expect(body.createdBy).toBe('op-1');
    expect(opts.idempotencyKey).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('start: rejects when partyDids has less than 2 entries', async () => {
    const { registry } = setup();
    const result = await registry.call(
      'colber_negotiation_start',
      {
        terms: {
          subject: 'shipment-x',
          strategy: 'ascending-auction',
          partyDids: ['did:key:zA'],
          deadline: '2026-06-01T00:00:00.000Z',
        },
        createdBy: 'op-1',
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('propose: forwards the negotiationId, proposal, publicKey', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_negotiation_propose',
      {
        negotiationId: '55555555-5555-4555-8555-555555555555',
        proposal: validProposal(),
        publicKey: 'pk-base64',
      },
      newCtx(),
    );
    parseOk(result);
    const args = sdk.negotiation.state.lastCall?.args[0] as {
      negotiationId: string;
      publicKey: string;
    };
    expect(args.negotiationId).toBe('55555555-5555-4555-8555-555555555555');
    expect(args.publicKey).toBe('pk-base64');
  });

  it('counter: forwards counterTo', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_negotiation_counter',
      {
        negotiationId: '55555555-5555-4555-8555-555555555555',
        counterTo: '99999999-9999-4999-8999-999999999999',
        proposal: validProposal(),
        publicKey: 'pk',
      },
      newCtx(),
    );
    parseOk(result);
    const args = sdk.negotiation.state.lastCall?.args[0] as { counterTo: string };
    expect(args.counterTo).toBe('99999999-9999-4999-8999-999999999999');
  });

  it('settle: maps SDK 409 conflict', async () => {
    const { registry, sdk } = setup();
    sdk.negotiation.state.nextError = {
      kind: 'api',
      status: 409,
      code: 'INVALID_STATE',
    };
    const result = await registry.call(
      'colber_negotiation_settle',
      {
        negotiationId: '55555555-5555-4555-8555-555555555555',
        signatures: [{ did: 'did:key:zA', signature: 'AAAA' }],
        publicKeys: [{ did: 'did:key:zA', publicKey: 'pk' }],
      },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('INVALID_STATE');
  });
});
