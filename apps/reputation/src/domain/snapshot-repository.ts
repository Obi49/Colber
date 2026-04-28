import { eq } from 'drizzle-orm';

import { scoreSnapshots, type ScoreSnapshotInsert } from '../db/schema.js';

import type { Database } from '../db/client.js';

/**
 * Persistent log of every signed score we have handed out.
 * Used for audit + future "verify by issuance" backfills.
 */
export interface SnapshotRepository {
  insert(record: SnapshotInsertParams): Promise<void>;
  findLatestByDid(did: string): Promise<StoredSnapshot | null>;
}

export interface SnapshotInsertParams {
  readonly id: string;
  readonly did: string;
  readonly score: number;
  readonly scoreVersion: string;
  readonly computedAt: Date;
  readonly attestation: string;
}

export interface StoredSnapshot {
  readonly id: string;
  readonly did: string;
  readonly score: number;
  readonly scoreVersion: string;
  readonly computedAt: Date;
  readonly attestation: string;
}

export class DrizzleSnapshotRepository implements SnapshotRepository {
  constructor(private readonly db: Database) {}

  public async insert(params: SnapshotInsertParams): Promise<void> {
    const insert: ScoreSnapshotInsert = {
      id: params.id,
      did: params.did,
      score: params.score,
      scoreVersion: params.scoreVersion,
      computedAt: params.computedAt,
      attestation: params.attestation,
    };
    await this.db.insert(scoreSnapshots).values(insert);
  }

  public async findLatestByDid(did: string): Promise<StoredSnapshot | null> {
    // Drizzle's typed builder doesn't strictly need a tuple destructure here,
    // but keeping the result mapping explicit makes the field-by-field
    // shape conversion easier to read at a glance.
    const rows = await this.db
      .select()
      .from(scoreSnapshots)
      .where(eq(scoreSnapshots.did, did))
      .orderBy(scoreSnapshots.computedAt)
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      did: row.did,
      score: row.score,
      scoreVersion: row.scoreVersion,
      computedAt: row.computedAt,
      attestation: row.attestation,
    };
  }
}
