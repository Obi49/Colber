import type { AgentIdentity, Did } from '@praxis/core-types';

import type {
  AgentInsertParams,
  AgentRepository,
} from '../../src/domain/agent-repository.js';

/**
 * Fake repository for unit-testing the domain service without a DB.
 */
export class InMemoryAgentRepository implements AgentRepository {
  private readonly byDid = new Map<string, AgentIdentity>();

  public async findByDid(did: Did): Promise<AgentIdentity | null> {
    return Promise.resolve(this.byDid.get(did) ?? null);
  }

  public async insert(params: AgentInsertParams): Promise<void> {
    this.byDid.set(params.did, {
      agentId: params.id as AgentIdentity['agentId'],
      did: params.did as Did,
      publicKey: params.publicKey,
      signatureScheme: params.signatureScheme,
      ownerOperatorId: params.ownerOperatorId as AgentIdentity['ownerOperatorId'],
      registeredAt: params.registeredAt.toISOString(),
      revokedAt: params.revokedAt?.toISOString() ?? null,
    });
    return Promise.resolve();
  }

  public size(): number {
    return this.byDid.size;
  }
}
