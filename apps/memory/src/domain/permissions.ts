import type { VectorFilter, VectorFilterClause } from './vector-repository.js';

/**
 * Permission model (CDC §2.5):
 *
 *   private  → only `ownerDid` reads/writes.
 *   operator → any agent registered under the same operator may read.
 *   shared   → only DIDs in `sharedWith` may read; only owner may update.
 *   public   → anyone authenticated may read.
 *
 * Operator linkage is established via `agent-identity` (see
 * `OperatorResolver`). When the operator can't be resolved (test envs, an
 * un-registered DID), `operator` visibility falls back to "owner-only" —
 * never broader. Defense in depth.
 *
 * # Two layers of enforcement
 *
 *   1. Qdrant filter (`buildSearchFilter`)  — server-side, prevents the
 *      vector store from ever returning a hit the caller can't see.
 *   2. Postgres re-check (`canRead`)       — runs after we hydrate the row
 *      from Postgres, so even a misconfigured Qdrant payload can't leak data.
 *
 * Both layers must agree: a memory should be visible iff *both* checks pass.
 */

export type Visibility = 'private' | 'operator' | 'shared' | 'public';

export const VISIBILITY_VALUES: readonly Visibility[] = ['private', 'operator', 'shared', 'public'];

export interface MemoryAcl {
  readonly ownerDid: string;
  readonly visibility: Visibility;
  readonly sharedWith: readonly string[];
  /** Operator id of the owner, if known. */
  readonly operatorId: string | null;
}

export interface CallerContext {
  readonly callerDid: string;
  /** Operator id of the caller, if known. */
  readonly operatorId: string | null;
}

/**
 * `true` when the caller is allowed to read the memory according to its ACL.
 */
export const canRead = (acl: MemoryAcl, caller: CallerContext): boolean => {
  if (acl.ownerDid === caller.callerDid) {
    return true;
  }
  switch (acl.visibility) {
    case 'private':
      return false;
    case 'public':
      return true;
    case 'shared':
      return acl.sharedWith.includes(caller.callerDid);
    case 'operator':
      // Both sides must have a known operator and they must match.
      return (
        acl.operatorId !== null &&
        caller.operatorId !== null &&
        acl.operatorId === caller.operatorId
      );
    default: {
      const _exhaustive: never = acl.visibility;
      return _exhaustive;
    }
  }
};

/** Only the owner may update or share a memory. */
export const canWrite = (acl: MemoryAcl, caller: CallerContext): boolean =>
  acl.ownerDid === caller.callerDid;

/**
 * Build a Qdrant filter that lets ONLY visible memories through.
 *
 * The shape we generate is conceptually:
 *   (caller_clause) AND (additional_filters_supplied_by_user)
 *
 * Where `caller_clause` is the OR of:
 *   - `ownerDid = callerDid`                                            (any visibility)
 *   - `visibility = public`
 *   - `visibility = shared AND sharedWith CONTAINS callerDid`
 *   - `visibility = operator AND operatorId = callerOperatorId`         (only when known)
 *
 * `additional_filters_supplied_by_user` carries the type/ownerDid/visibility
 * filters from the request body (post-permission-narrowing).
 */
export interface SearchFilterInputs {
  readonly caller: CallerContext;
  readonly type?: string;
  readonly ownerDid?: string;
  readonly visibility?: Visibility;
}

export const buildSearchFilter = (inputs: SearchFilterInputs): VectorFilter => {
  const aclClauses: VectorFilterClause[] = [];

  // (1) Owner-of-record sees everything.
  aclClauses.push({ ownerDid: inputs.caller.callerDid });

  // (2) Public is visible to everyone.
  aclClauses.push({ visibility: 'public' });

  // (3) Shared with the caller.
  aclClauses.push({
    visibility: 'shared',
    sharedWithContains: inputs.caller.callerDid,
  });

  // (4) Same operator. Only viable when we know the caller's operator id.
  if (inputs.caller.operatorId !== null) {
    aclClauses.push({
      visibility: 'operator',
      operatorId: inputs.caller.operatorId,
    });
  }

  const filter: VectorFilter = {
    ...(inputs.type !== undefined ? { type: inputs.type } : {}),
    ...(inputs.ownerDid !== undefined ? { ownerDid: inputs.ownerDid } : {}),
    ...(inputs.visibility !== undefined ? { visibility: inputs.visibility } : {}),
    anyOfClauses: aclClauses,
  };
  return filter;
};
