import { decodeDidKey } from '@colber/core-crypto';

import type { IdentityResolver, ResolvedIdentity } from '../../src/domain/identity-resolver.js';

/**
 * Test stub: only resolves did:key DIDs (which are self-describing) and
 * optionally allows preloaded entries. Does not touch Postgres.
 */
export class StubIdentityResolver implements IdentityResolver {
  private readonly extras = new Map<string, ResolvedIdentity>();

  public preload(record: ResolvedIdentity): void {
    this.extras.set(record.did, record);
  }

  public async resolve(did: string): Promise<ResolvedIdentity | null> {
    const preloaded = this.extras.get(did);
    if (preloaded) {
      return Promise.resolve(preloaded);
    }
    if (did.startsWith('did:key:')) {
      try {
        const decoded = decodeDidKey(did);
        return Promise.resolve({
          did,
          publicKey: decoded.publicKey,
          signatureScheme: decoded.scheme,
          revoked: false,
        });
      } catch {
        return Promise.resolve(null);
      }
    }
    return Promise.resolve(null);
  }
}
