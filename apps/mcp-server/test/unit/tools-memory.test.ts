import { describe, expect, it } from 'vitest';

import { registerMemoryTools } from '../../src/tools/memory.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { newCtx, newRegistry, parseError, parseOk } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

const setup = (): { registry: ReturnType<typeof newRegistry>; sdk: FakeSdkClient } => {
  const sdk = new FakeSdkClient();
  const registry = newRegistry();
  registerMemoryTools(registry, sdk as unknown as ColberClient);
  return { registry, sdk };
};

describe('memory MCP tools', () => {
  it('registers exactly 4 tools', () => {
    const { registry } = setup();
    expect(registry.size()).toBe(4);
    expect(registry.names()).toEqual(
      expect.arrayContaining([
        'colber_memory_store',
        'colber_memory_retrieve',
        'colber_memory_update',
        'colber_memory_share',
      ]),
    );
  });

  it('store: forwards core fields + permissions', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_memory_store',
      {
        ownerDid: 'did:key:zOwner',
        type: 'fact',
        text: 'Earth orbits the Sun.',
        permissions: { visibility: 'public' },
      },
      newCtx(),
    );
    const body = parseOk(result) as { id: string };
    expect(body.id).toBe('33333333-3333-4333-8333-333333333333');
    const args = sdk.memory.state.lastCall?.args[0] as Record<string, unknown>;
    expect(args.ownerDid).toBe('did:key:zOwner');
    expect(args.type).toBe('fact');
  });

  it('retrieve: maps to sdk.memory.search and forwards filters', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_memory_retrieve',
      {
        queryDid: 'did:key:zQ',
        queryText: 'orbital mechanics',
        topK: 5,
        filters: { type: 'fact', visibility: 'public' },
      },
      newCtx(),
    );
    parseOk(result);
    expect(sdk.memory.state.lastCall?.method).toBe('search');
    const args = sdk.memory.state.lastCall?.args[0] as {
      queryText: string;
      topK: number;
      filters: { type: string; visibility: string };
    };
    expect(args.queryText).toBe('orbital mechanics');
    expect(args.topK).toBe(5);
    expect(args.filters.type).toBe('fact');
    expect(args.filters.visibility).toBe('public');
  });

  it('update: rejects when neither text nor payload is provided', async () => {
    const { registry } = setup();
    const result = await registry.call(
      'colber_memory_update',
      {
        id: '33333333-3333-4333-8333-333333333333',
        callerDid: 'did:key:zC',
      },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('update: forwards changes to the SDK', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_memory_update',
      {
        id: '33333333-3333-4333-8333-333333333333',
        callerDid: 'did:key:zC',
        text: 'updated text',
      },
      newCtx(),
    );
    const body = parseOk(result) as { version: number };
    expect(body.version).toBe(2);
    const args = sdk.memory.state.lastCall?.args[0] as { text: string };
    expect(args.text).toBe('updated text');
  });

  it('share: forwards shareWith list', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_memory_share',
      {
        id: '33333333-3333-4333-8333-333333333333',
        callerDid: 'did:key:zC',
        shareWith: ['did:key:zPeer'],
      },
      newCtx(),
    );
    parseOk(result);
    const args = sdk.memory.state.lastCall?.args[0] as { shareWith: string[] };
    expect(args.shareWith).toEqual(['did:key:zPeer']);
  });

  it('share: maps a 404 from the SDK', async () => {
    const { registry, sdk } = setup();
    sdk.memory.state.nextError = { kind: 'api', status: 404, code: 'NOT_FOUND' };
    const result = await registry.call(
      'colber_memory_share',
      {
        id: '33333333-3333-4333-8333-333333333333',
        callerDid: 'did:key:zC',
        shareWith: ['did:key:zPeer'],
      },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('NOT_FOUND');
  });
});
