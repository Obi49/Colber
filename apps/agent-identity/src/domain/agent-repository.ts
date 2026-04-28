import {
  asAgentId,
  asOperatorId,
  type AgentIdentity,
  type Did,
  type SignatureScheme,
} from '@praxis/core-types';
import { eq } from 'drizzle-orm';

import { agents, type AgentInsert, type AgentRow } from '../db/schema.js';

import type { Database } from '../db/client.js';

/**
 * Repository abstraction over the `agents` table.
 * Used by the domain service so unit tests can swap in an in-memory fake.
 */
export interface AgentRepository {
  findByDid(did: Did): Promise<AgentIdentity | null>;
  insert(record: AgentInsertParams): Promise<void>;
}

export interface AgentInsertParams {
  readonly id: string;
  readonly did: string;
  readonly publicKey: string; // base64
  readonly signatureScheme: SignatureScheme;
  readonly ownerOperatorId: string;
  readonly registeredAt: Date;
  readonly revokedAt: Date | null;
}

const rowToIdentity = (row: AgentRow): AgentIdentity => ({
  agentId: asAgentId(row.id),
  did: row.did as Did,
  publicKey: row.publicKey,
  signatureScheme: row.signatureScheme as SignatureScheme,
  ownerOperatorId: asOperatorId(row.ownerOperatorId),
  registeredAt: row.registeredAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
});

export class DrizzleAgentRepository implements AgentRepository {
  constructor(private readonly db: Database) {}

  public async findByDid(did: Did): Promise<AgentIdentity | null> {
    const rows = await this.db.select().from(agents).where(eq(agents.did, did)).limit(1);
    const row = rows[0];
    return row ? rowToIdentity(row) : null;
  }

  public async insert(params: AgentInsertParams): Promise<void> {
    const insert: AgentInsert = {
      id: params.id,
      did: params.did,
      publicKey: params.publicKey,
      signatureScheme: params.signatureScheme,
      ownerOperatorId: params.ownerOperatorId,
      registeredAt: params.registeredAt,
      revokedAt: params.revokedAt,
    };
    await this.db.insert(agents).values(insert);
  }
}
