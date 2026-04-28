import { and, eq } from 'drizzle-orm';

import { feedbackLog, type FeedbackLogInsert } from '../db/schema.js';

import type { Database } from '../db/client.js';

/**
 * Idempotency + anti-spam log for feedback submissions.
 *
 * Two invariants are enforced here:
 *   - `feedbackId` is the idempotency key (primary key).
 *   - `(fromDid, toDid, txId)` is unique (anti-spam).
 *
 * The graph (RATED edge in Neo4j) is the canonical "what was rated" record;
 * this Postgres table is the canonical "have we already accepted this".
 */
export interface FeedbackRepository {
  /** Returns an existing entry for `feedbackId` if it has already been recorded. */
  findById(feedbackId: string): Promise<StoredFeedback | null>;
  /** Returns an existing entry for the (from, to, tx) triple if any. */
  findByTriple(fromDid: string, toDid: string, txId: string): Promise<StoredFeedback | null>;
  insert(record: FeedbackInsertParams): Promise<void>;
}

export interface FeedbackInsertParams {
  readonly feedbackId: string;
  readonly fromDid: string;
  readonly toDid: string;
  readonly txId: string;
  readonly rating: number;
  readonly signedAt: Date;
  readonly signature: string;
}

export interface StoredFeedback {
  readonly feedbackId: string;
  readonly fromDid: string;
  readonly toDid: string;
  readonly txId: string;
  readonly rating: number;
  readonly signedAt: Date;
  readonly signature: string;
  readonly recordedAt: Date;
}

export class DrizzleFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: Database) {}

  public async findById(feedbackId: string): Promise<StoredFeedback | null> {
    const rows = await this.db
      .select()
      .from(feedbackLog)
      .where(eq(feedbackLog.feedbackId, feedbackId))
      .limit(1);
    return rows[0] ? rowToStored(rows[0]) : null;
  }

  public async findByTriple(
    fromDid: string,
    toDid: string,
    txId: string,
  ): Promise<StoredFeedback | null> {
    const rows = await this.db
      .select()
      .from(feedbackLog)
      .where(
        and(
          eq(feedbackLog.fromDid, fromDid),
          eq(feedbackLog.toDid, toDid),
          eq(feedbackLog.txId, txId),
        ),
      )
      .limit(1);
    return rows[0] ? rowToStored(rows[0]) : null;
  }

  public async insert(params: FeedbackInsertParams): Promise<void> {
    const insert: FeedbackLogInsert = {
      feedbackId: params.feedbackId,
      fromDid: params.fromDid,
      toDid: params.toDid,
      txId: params.txId,
      rating: params.rating,
      signedAt: params.signedAt,
      signature: params.signature,
    };
    await this.db.insert(feedbackLog).values(insert);
  }
}

const rowToStored = (row: {
  feedbackId: string;
  fromDid: string;
  toDid: string;
  txId: string;
  rating: number;
  signedAt: Date;
  signature: string;
  recordedAt: Date;
}): StoredFeedback => ({
  feedbackId: row.feedbackId,
  fromDid: row.fromDid,
  toDid: row.toDid,
  txId: row.txId,
  rating: row.rating,
  signedAt: row.signedAt,
  signature: row.signature,
  recordedAt: row.recordedAt,
});
