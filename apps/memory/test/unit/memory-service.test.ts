import { randomBytes } from 'node:crypto';

import { ERROR_CODES } from '@praxis/core-types';
import { describe, expect, it } from 'vitest';

import { AesGcmEncryptionService, NoopEncryptionService } from '../../src/domain/encryption.js';
import { MemoryService, type MemoryServiceConfig } from '../../src/domain/memory-service.js';
import { DeterministicStubProvider } from '../../src/embeddings/stub.js';
import { InMemoryMemoryRepository } from '../fakes/in-memory-memory-repo.js';
import { InMemoryVectorRepository } from '../fakes/in-memory-vector-repo.js';
import { StubOperatorResolver } from '../fakes/stub-operator-resolver.js';

const NOW = new Date('2026-04-27T00:00:00.000Z');

const buildSvc = async (cfg: Partial<MemoryServiceConfig> = {}) => {
  const repo = new InMemoryMemoryRepository();
  const vectors = new InMemoryVectorRepository();
  const embeddings = new DeterministicStubProvider(64, 'praxis-stub-v1');
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
    { maxVersions: 100, ...cfg },
    () => NOW,
  );
  await service.init();
  return { service, repo, vectors, embeddings, encryption, operators };
};

describe('MemoryService.init', () => {
  it('ensures the underlying Qdrant collection exists', async () => {
    const { vectors, embeddings } = await buildSvc();
    expect(vectors.collectionInitialised).toBe(true);
    expect(vectors.collectionDim).toBe(embeddings.dim);
  });
});

describe('MemoryService.store', () => {
  it('persists a memory + the matching vector', async () => {
    const { service, repo, vectors } = await buildSvc();
    const result = await service.store({
      ownerDid: 'did:key:z6MkOwner',
      type: 'fact',
      text: 'The buyer prefers EU suppliers.',
      permissions: { visibility: 'private' },
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.embedding).toEqual({ model: 'praxis-stub-v1', dim: 64 });
    expect(repo.size()).toBe(1);
    expect(vectors.points.size).toBe(1);
  });

  it('stores cleartext when encryption is not requested', async () => {
    const { service, repo } = await buildSvc();
    await service.store({
      ownerDid: 'did:key:z6MkOwner',
      type: 'fact',
      text: 'cleartext truth',
      permissions: { visibility: 'private' },
    });
    const stored = Array.from(repo.entries.values())[0];
    expect(stored?.text).toBe('cleartext truth');
    expect(stored?.encryption.enabled).toBe(false);
  });

  it('encrypts the text at rest when encryption.enabled=true', async () => {
    const { service, repo, encryption } = await buildSvc();
    await service.store({
      ownerDid: 'did:key:z6MkOwner',
      type: 'fact',
      text: 'sensitive information',
      permissions: { visibility: 'private' },
      encryption: { enabled: true },
    });
    const stored = Array.from(repo.entries.values())[0];
    expect(stored?.encryption.enabled).toBe(true);
    expect(stored?.encryption.algorithm).toBe('aes-256-gcm');
    // Cleartext must not be persisted.
    expect(stored?.text).not.toContain('sensitive');
    // Round-trip via the encryption service to prove the ciphertext is real.
    if (stored) {
      expect(encryption.decrypt(stored.text)).toBe('sensitive information');
    }
  });

  it('refuses encryption when no key is configured', async () => {
    const repo = new InMemoryMemoryRepository();
    const vectors = new InMemoryVectorRepository();
    const service = new MemoryService(
      repo,
      vectors,
      new DeterministicStubProvider(64),
      new NoopEncryptionService(),
      new StubOperatorResolver(),
      { maxVersions: 100 },
      () => NOW,
    );
    await service.init();
    await expect(
      service.store({
        ownerDid: 'did:key:z6MkOwner',
        type: 'fact',
        text: 'will fail',
        permissions: { visibility: 'private' },
        encryption: { enabled: true },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects empty text', async () => {
    const { service } = await buildSvc();
    await expect(
      service.store({
        ownerDid: 'did:key:owner',
        type: 'fact',
        text: '',
        permissions: { visibility: 'private' },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects visibility=shared without sharedWith', async () => {
    const { service } = await buildSvc();
    await expect(
      service.store({
        ownerDid: 'did:key:owner',
        type: 'fact',
        text: 'hello',
        permissions: { visibility: 'shared', sharedWith: [] },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('writes the operator id into the Qdrant payload when known', async () => {
    const { service, vectors, operators } = await buildSvc();
    operators.setOperator('did:key:owner', 'op-acme');
    await service.store({
      ownerDid: 'did:key:owner',
      type: 'fact',
      text: 'hello',
      permissions: { visibility: 'operator' },
    });
    const point = Array.from(vectors.points.values())[0];
    expect(point?.payload.operatorId).toBe('op-acme');
  });
});

describe('MemoryService.retrieve', () => {
  it('returns memories the caller is allowed to read', async () => {
    const { service } = await buildSvc();
    await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'Alice owns a public memory.',
      permissions: { visibility: 'public' },
    });
    const hits = await service.retrieve({
      queryDid: 'did:key:bob',
      queryText: 'Alice owns a public memory.',
      topK: 5,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.ownerDid).toBe('did:key:alice');
  });

  it('hides private memories from non-owners', async () => {
    const { service } = await buildSvc();
    await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'private to Alice',
      permissions: { visibility: 'private' },
    });
    const hits = await service.retrieve({
      queryDid: 'did:key:bob',
      queryText: 'private to Alice',
      topK: 5,
    });
    expect(hits).toHaveLength(0);
  });

  it('returns shared memories to listed agents only', async () => {
    const { service } = await buildSvc();
    await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'shared with Bob',
      permissions: { visibility: 'shared', sharedWith: ['did:key:bob'] },
    });
    const bobHits = await service.retrieve({
      queryDid: 'did:key:bob',
      queryText: 'shared with Bob',
      topK: 5,
    });
    expect(bobHits).toHaveLength(1);
    const carolHits = await service.retrieve({
      queryDid: 'did:key:carol',
      queryText: 'shared with Bob',
      topK: 5,
    });
    expect(carolHits).toHaveLength(0);
  });

  it('returns operator-scoped memories to siblings under the same operator', async () => {
    const { service, operators } = await buildSvc();
    operators.setOperator('did:key:alice', 'op-acme');
    operators.setOperator('did:key:bob', 'op-acme');
    operators.setOperator('did:key:eve', 'op-evil');
    await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'operator-scoped',
      permissions: { visibility: 'operator' },
    });
    expect(
      await service.retrieve({
        queryDid: 'did:key:bob',
        queryText: 'operator-scoped',
        topK: 5,
      }),
    ).toHaveLength(1);
    expect(
      await service.retrieve({
        queryDid: 'did:key:eve',
        queryText: 'operator-scoped',
        topK: 5,
      }),
    ).toHaveLength(0);
  });

  it('decrypts the snippet for authorised callers', async () => {
    const { service } = await buildSvc();
    await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'my encrypted public truth',
      permissions: { visibility: 'public' },
      encryption: { enabled: true },
    });
    const hits = await service.retrieve({
      queryDid: 'did:key:bob',
      queryText: 'my encrypted public truth',
      topK: 5,
    });
    expect(hits[0]?.snippet).toContain('encrypted public truth');
  });

  it('rejects empty queryText', async () => {
    const { service } = await buildSvc();
    await expect(
      service.retrieve({ queryDid: 'did:key:bob', queryText: '', topK: 5 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });
});

describe('MemoryService.update', () => {
  it('captures the previous version + bumps the version counter', async () => {
    const { service, repo } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'first version',
      permissions: { visibility: 'private' },
    });
    const updated = await service.update({
      id: stored.id,
      callerDid: 'did:key:alice',
      text: 'second version',
    });
    expect(updated.version).toBe(2);
    expect(repo.versions).toHaveLength(1);
    expect(repo.versions[0]?.text).toBe('first version');
    const refreshed = await repo.findById(stored.id);
    expect(refreshed?.text).toBe('second version');
    expect(refreshed?.version).toBe(2);
  });

  it('only allows the owner to update', async () => {
    const { service } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'mine',
      permissions: { visibility: 'public' },
    });
    await expect(
      service.update({
        id: stored.id,
        callerDid: 'did:key:bob',
        text: 'hacked',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHORIZED });
  });

  it('regenerates the embedding when text changes', async () => {
    const { service, vectors } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'apples',
      permissions: { visibility: 'public' },
    });
    const before = Array.from(vectors.points.values())[0]?.vector ?? new Float32Array();
    await service.update({
      id: stored.id,
      callerDid: 'did:key:alice',
      text: 'oranges',
    });
    const after = Array.from(vectors.points.values())[0]?.vector ?? new Float32Array();
    expect(Array.from(before)).not.toEqual(Array.from(after));
  });

  it('keeps the embedding stable when only payload changes', async () => {
    const { service, vectors } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'fixed text',
      payload: { tag: 'v1' },
      permissions: { visibility: 'public' },
    });
    const before = Array.from(vectors.points.values())[0]?.vector ?? new Float32Array();
    await service.update({
      id: stored.id,
      callerDid: 'did:key:alice',
      payload: { tag: 'v2' },
    });
    const after = Array.from(vectors.points.values())[0]?.vector ?? new Float32Array();
    expect(Array.from(before)).toEqual(Array.from(after));
  });

  it('rejects updates that change neither text nor payload', async () => {
    const { service } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'unchanged',
      permissions: { visibility: 'private' },
    });
    await expect(
      service.update({ id: stored.id, callerDid: 'did:key:alice' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('returns 404 for an unknown id', async () => {
    const { service } = await buildSvc();
    await expect(
      service.update({
        id: '00000000-0000-0000-0000-000000000000',
        callerDid: 'did:key:alice',
        text: 'whatever',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('prunes versions beyond the configured cap', async () => {
    const { service, repo } = await buildSvc({ maxVersions: 2 });
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'rev 1',
      permissions: { visibility: 'private' },
    });
    for (let i = 2; i <= 5; i++) {
      await service.update({
        id: stored.id,
        callerDid: 'did:key:alice',
        text: `rev ${i}`,
      });
    }
    const own = repo.versions.filter((v) => v.memoryId === stored.id);
    expect(own.length).toBe(2);
  });
});

describe('MemoryService.share', () => {
  it('lets the owner grant access', async () => {
    const { service, repo, vectors } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'mine',
      permissions: { visibility: 'private' },
    });
    const result = await service.share({
      id: stored.id,
      callerDid: 'did:key:alice',
      shareWith: ['did:key:bob', 'did:key:carol'],
    });
    expect(result.sharedWith).toEqual(['did:key:bob', 'did:key:carol']);
    const refreshed = await repo.findById(stored.id);
    // Visibility is upgraded from private to shared.
    expect(refreshed?.visibility).toBe('shared');
    const point = vectors.points.get(stored.id);
    expect(point?.payload.visibility).toBe('shared');
    expect(point?.payload.sharedWith).toEqual(['did:key:bob', 'did:key:carol']);
  });

  it('refuses to share for non-owners', async () => {
    const { service } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'mine',
      permissions: { visibility: 'public' },
    });
    await expect(
      service.share({
        id: stored.id,
        callerDid: 'did:key:bob',
        shareWith: ['did:key:eve'],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHORIZED });
  });

  it('persists the per-grantee share log', async () => {
    const { service, repo } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'mine',
      permissions: { visibility: 'private' },
    });
    await service.share({
      id: stored.id,
      callerDid: 'did:key:alice',
      shareWith: ['did:key:bob'],
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    const shares = await repo.listShares(stored.id);
    expect(shares).toHaveLength(1);
    expect(shares[0]?.grantedToDid).toBe('did:key:bob');
    expect(shares[0]?.expiresAt?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('rejects empty shareWith', async () => {
    const { service } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'mine',
      permissions: { visibility: 'private' },
    });
    await expect(
      service.share({ id: stored.id, callerDid: 'did:key:alice', shareWith: [] }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });
});

describe('MemoryService.get', () => {
  it('returns the cleartext for authorised callers', async () => {
    const { service } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'public truth',
      permissions: { visibility: 'public' },
    });
    const rec = await service.get(stored.id, 'did:key:bob');
    expect(rec.text).toBe('public truth');
  });

  it('decrypts before returning when encryption is on', async () => {
    const { service } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'encrypted public truth',
      permissions: { visibility: 'public' },
      encryption: { enabled: true },
    });
    const rec = await service.get(stored.id, 'did:key:bob');
    expect(rec.text).toBe('encrypted public truth');
    expect(rec.encryption.enabled).toBe(true);
  });

  it('returns 403 for unauthorised callers', async () => {
    const { service } = await buildSvc();
    const stored = await service.store({
      ownerDid: 'did:key:alice',
      type: 'fact',
      text: 'private',
      permissions: { visibility: 'private' },
    });
    await expect(service.get(stored.id, 'did:key:bob')).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('returns 404 for unknown ids', async () => {
    const { service } = await buildSvc();
    await expect(
      service.get('00000000-0000-0000-0000-000000000000', 'did:key:bob'),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });
});
