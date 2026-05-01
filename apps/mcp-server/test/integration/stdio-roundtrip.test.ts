/**
 * Integration test: end-to-end roundtrip through the MCP `Server`.
 *
 * Exercises the full path from the MCP client → in-memory transport pair
 * → server handlers → registry → fake SDK. No subprocess, no real stdio.
 *
 * The `@modelcontextprotocol/sdk` package exports `InMemoryTransport`
 * which provides `createLinkedPair()` returning a `[clientTransport,
 * serverTransport]` tuple — perfect for round-tripping inside a single
 * Vitest process.
 *
 * If the SDK's import path for `InMemoryTransport` differs in your
 * installed version (the helper has been at
 * `@modelcontextprotocol/sdk/inMemory.js` since v1.0; older betas exposed
 * it under `/server/inMemory.js`), update the import below — the rest of
 * the test logic is portable.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { buildToolRegistry } from '../../src/tools/index.js';
import { buildStdioServer } from '../../src/transports/stdio.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { silentLogger } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

const buildLinkedClientServer = async () => {
  const sdk = new FakeSdkClient();
  const registry = buildToolRegistry(sdk as unknown as ColberClient);
  const server = buildStdioServer({ registry, logger: silentLogger() });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);

  return { sdk, registry, server, client };
};

describe('stdio roundtrip via in-memory transport', () => {
  it('advertises all 27 tools through tools/list', async () => {
    const { client, server } = await buildLinkedClientServer();
    try {
      const list = await client.listTools();
      expect(list.tools.length).toBe(27);
      expect(list.tools.map((t) => t.name)).toEqual(
        expect.arrayContaining([
          'colber_identity_register',
          'colber_reputation_score',
          'colber_memory_store',
          'colber_observability_alert_create',
          'colber_negotiation_start',
          'colber_insurance_quote',
        ]),
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('roundtrips tools/call for colber_identity_resolve', async () => {
    const { client, server } = await buildLinkedClientServer();
    try {
      const result = await client.callTool({
        name: 'colber_identity_resolve',
        arguments: { did: 'did:key:zRoundTrip' },
      });
      expect(result.isError).not.toBe(true);
      const content = result.content as readonly { type: string; text: string }[];
      const body = JSON.parse(content[0]?.text ?? '{}') as { did: string };
      expect(body.did).toBe('did:key:zRoundTrip');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns isError for an unknown tool name', async () => {
    const { client, server } = await buildLinkedClientServer();
    try {
      const result = await client.callTool({
        name: 'colber_nonexistent_tool',
        arguments: {},
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
