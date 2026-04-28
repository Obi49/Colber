import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AesGcmEncryptionService } from '../../src/domain/encryption.js';
import { MemoryService } from '../../src/domain/memory-service.js';
import { DeterministicStubProvider } from '../../src/embeddings/stub.js';
import { buildMemoryMcpRegistry } from '../../src/mcp/tools.js';
import { InMemoryMemoryRepository } from '../fakes/in-memory-memory-repo.js';
import { InMemoryVectorRepository } from '../fakes/in-memory-vector-repo.js';
import { StubOperatorResolver } from '../fakes/stub-operator-resolver.js';

const NOW = new Date('2026-04-27T00:00:00.000Z');

const buildRegistry = async () => {
  const repo = new InMemoryMemoryRepository();
  const vectors = new InMemoryVectorRepository();
  const embeddings = new DeterministicStubProvider(64, 'praxis-stub');
  const encryption = new AesGcmEncryptionService({
    keyB64: randomBytes(32).toString('base64'),
  });
  const operators = new StubOperatorResolver();
  const service = new MemoryService(
    repo,
    vectors,
    embeddings,
    encryption,
    operators,
    { maxVersions: 100 },
    () => NOW,
  );
  await service.init();
  return { service, registry: buildMemoryMcpRegistry(service) };
};

describe('memory MCP registry', () => {
  it('registers the four tools from CDC §2.5', async () => {
    const { registry } = await buildRegistry();
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(['memory.store', 'memory.retrieve', 'memory.update', 'memory.share']);
  });

  it('round-trips through `memory.store` with input + output validation', async () => {
    const { registry } = await buildRegistry();
    const out = (await registry.invoke(
      'memory.store',
      {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'something to remember',
        permissions: { visibility: 'private' },
      },
      { traceId: 't-1' },
    )) as { id: string; embedding: { model: string; dim: number } };
    expect(out.embedding).toEqual({ model: 'praxis-stub', dim: 64 });
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exposes `memory.retrieve` with permission filtering', async () => {
    const { registry } = await buildRegistry();
    await registry.invoke(
      'memory.store',
      {
        ownerDid: 'did:key:alice',
        type: 'fact',
        text: 'public',
        permissions: { visibility: 'public' },
      },
      { traceId: 't-2' },
    );
    const result = (await registry.invoke(
      'memory.retrieve',
      { queryDid: 'did:key:bob', queryText: 'public', topK: 5 },
      { traceId: 't-3' },
    )) as { hits: { id: string; ownerDid: string }[] };
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.ownerDid).toBe('did:key:alice');
  });

  it('rejects update calls without text or payload at the schema layer', async () => {
    const { registry } = await buildRegistry();
    await expect(
      registry.invoke(
        'memory.update',
        { id: '00000000-0000-0000-0000-000000000000', callerDid: 'did:key:alice' },
        { traceId: 't-4' },
      ),
    ).rejects.toThrow(/Invalid input/);
  });
});
