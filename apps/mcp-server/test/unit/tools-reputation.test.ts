import { describe, expect, it } from 'vitest';

import { registerReputationTools } from '../../src/tools/reputation.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { newCtx, newRegistry, parseError, parseOk } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

const setup = (): { registry: ReturnType<typeof newRegistry>; sdk: FakeSdkClient } => {
  const sdk = new FakeSdkClient();
  const registry = newRegistry();
  registerReputationTools(registry, sdk as unknown as ColberClient);
  return { registry, sdk };
};

describe('reputation MCP tools', () => {
  it('registers exactly 4 tools', () => {
    const { registry } = setup();
    expect(registry.size()).toBe(4);
    expect(registry.names()).toEqual(
      expect.arrayContaining([
        'colber_reputation_score',
        'colber_reputation_history',
        'colber_reputation_verify',
        'colber_reputation_feedback',
      ]),
    );
  });

  it('score: forwards did and returns the signed envelope', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call('colber_reputation_score', { did: 'did:key:zS' }, newCtx());
    const body = parseOk(result) as { score: number };
    expect(body.score).toBe(750);
    expect(sdk.reputation.state.lastCall?.method).toBe('score');
  });

  it('history: forwards limit + cursor when provided', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_reputation_history',
      { did: 'did:key:zS', limit: 25, cursor: 'cur-abc' },
      newCtx(),
    );
    parseOk(result);
    const args = sdk.reputation.state.lastCall?.args[0] as {
      did: string;
      limit?: number;
      cursor?: string;
    };
    expect(args.did).toBe('did:key:zS');
    expect(args.limit).toBe(25);
    expect(args.cursor).toBe('cur-abc');
  });

  it('history: omits optional fields when not provided', async () => {
    const { registry, sdk } = setup();
    await registry.call('colber_reputation_history', { did: 'did:key:zS' }, newCtx());
    const args = sdk.reputation.state.lastCall?.args[0] as Record<string, unknown>;
    expect('limit' in args).toBe(false);
    expect('cursor' in args).toBe(false);
  });

  it('verify: forwards score envelope and attestation', async () => {
    const { registry, sdk } = setup();
    const score = {
      did: 'did:key:zS',
      score: 800,
      scoreVersion: 'v1',
      computedAt: '2026-05-01T00:00:00.000Z',
    };
    const result = await registry.call(
      'colber_reputation_verify',
      { score, attestation: 'AAAA' },
      newCtx(),
    );
    const body = parseOk(result) as { valid: boolean };
    expect(body.valid).toBe(true);
    expect(sdk.reputation.state.lastCall?.method).toBe('verify');
  });

  it('feedback: rejects ratings outside [1,5]', async () => {
    const { registry } = setup();
    const result = await registry.call(
      'colber_reputation_feedback',
      {
        feedbackId: '11111111-1111-4111-8111-111111111111',
        fromDid: 'did:key:zA',
        toDid: 'did:key:zB',
        txId: 'tx-1',
        rating: 7,
        dimensions: { delivery: 5, quality: 5, communication: 5 },
        signedAt: '2026-05-01T00:00:00.000Z',
        signature: 'AAAA',
      },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('feedback: maps SDK 5xx errors', async () => {
    const { registry, sdk } = setup();
    sdk.reputation.state.nextError = {
      kind: 'api',
      status: 500,
      code: 'INTERNAL_ERROR',
    };
    const result = await registry.call(
      'colber_reputation_feedback',
      {
        feedbackId: '11111111-1111-4111-8111-111111111111',
        fromDid: 'did:key:zA',
        toDid: 'did:key:zB',
        txId: 'tx-1',
        rating: 4,
        dimensions: { delivery: 4, quality: 4, communication: 5 },
        signedAt: '2026-05-01T00:00:00.000Z',
        signature: 'AAAA',
      },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});
