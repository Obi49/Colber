import { describe, expect, it } from 'vitest';

import {
  buildSearchFilter,
  canRead,
  canWrite,
  type CallerContext,
  type MemoryAcl,
} from '../../src/domain/permissions.js';

const owner: CallerContext = { callerDid: 'did:key:owner', operatorId: 'op-1' };
const stranger: CallerContext = { callerDid: 'did:key:stranger', operatorId: 'op-2' };
const sibling: CallerContext = { callerDid: 'did:key:sibling', operatorId: 'op-1' };
const friend: CallerContext = { callerDid: 'did:key:friend', operatorId: 'op-3' };

const baseAcl: MemoryAcl = {
  ownerDid: 'did:key:owner',
  visibility: 'private',
  sharedWith: [],
  operatorId: 'op-1',
};

describe('canRead', () => {
  it('always allows the owner regardless of visibility', () => {
    for (const v of ['private', 'operator', 'shared', 'public'] as const) {
      expect(canRead({ ...baseAcl, visibility: v }, owner)).toBe(true);
    }
  });

  it('private blocks everyone except the owner', () => {
    expect(canRead(baseAcl, stranger)).toBe(false);
    expect(canRead(baseAcl, sibling)).toBe(false);
  });

  it('public lets everyone in', () => {
    const acl: MemoryAcl = { ...baseAcl, visibility: 'public' };
    expect(canRead(acl, stranger)).toBe(true);
  });

  it('shared lets only listed DIDs in', () => {
    const acl: MemoryAcl = {
      ...baseAcl,
      visibility: 'shared',
      sharedWith: ['did:key:friend'],
    };
    expect(canRead(acl, friend)).toBe(true);
    expect(canRead(acl, stranger)).toBe(false);
  });

  it('operator matches only when both sides resolve to the same operator id', () => {
    const acl: MemoryAcl = { ...baseAcl, visibility: 'operator', operatorId: 'op-1' };
    expect(canRead(acl, sibling)).toBe(true);
    expect(canRead(acl, stranger)).toBe(false);
  });

  it('operator falls back to owner-only when the ACL has no operator id', () => {
    const acl: MemoryAcl = { ...baseAcl, visibility: 'operator', operatorId: null };
    expect(canRead(acl, sibling)).toBe(false);
  });

  it('operator falls back to owner-only when the caller has no operator id', () => {
    const acl: MemoryAcl = { ...baseAcl, visibility: 'operator', operatorId: 'op-1' };
    expect(canRead(acl, { callerDid: 'did:key:nobody', operatorId: null })).toBe(false);
  });
});

describe('canWrite', () => {
  it('only the owner can write', () => {
    expect(canWrite(baseAcl, owner)).toBe(true);
    expect(canWrite(baseAcl, sibling)).toBe(false);
    expect(canWrite(baseAcl, stranger)).toBe(false);
  });
});

describe('buildSearchFilter', () => {
  it('always includes owner-of-record + public + shared-with-me clauses', () => {
    const filter = buildSearchFilter({
      caller: { callerDid: 'did:key:me', operatorId: null },
    });
    const clauses = filter.anyOfClauses ?? [];
    expect(clauses).toContainEqual({ ownerDid: 'did:key:me' });
    expect(clauses).toContainEqual({ visibility: 'public' });
    expect(clauses).toContainEqual({ visibility: 'shared', sharedWithContains: 'did:key:me' });
  });

  it('adds the operator clause only when the caller has an operator id', () => {
    const withoutOp = buildSearchFilter({
      caller: { callerDid: 'did:key:me', operatorId: null },
    });
    const withOp = buildSearchFilter({
      caller: { callerDid: 'did:key:me', operatorId: 'op-1' },
    });
    const opClause = { visibility: 'operator', operatorId: 'op-1' };
    expect(withoutOp.anyOfClauses).not.toContainEqual(opClause);
    expect(withOp.anyOfClauses).toContainEqual(opClause);
  });

  it('passes the request-level filters through verbatim', () => {
    const filter = buildSearchFilter({
      caller: { callerDid: 'did:key:me', operatorId: null },
      type: 'fact',
      ownerDid: 'did:key:other',
      visibility: 'public',
    });
    expect(filter.type).toBe('fact');
    expect(filter.ownerDid).toBe('did:key:other');
    expect(filter.visibility).toBe('public');
  });
});
