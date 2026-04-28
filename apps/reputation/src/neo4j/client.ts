import neo4j, { type Driver, type Session } from 'neo4j-driver';

import type {
  GraphRepository,
  HistoryPage,
  HistoryQuery,
  ReceivedFeedbackRecord,
  IssuedFeedbackRecord,
  RecordFeedbackEdgeInput,
  TransactionEventRecord,
  TransactionParticipationRecord,
} from '../domain/graph-repository.js';

export interface Neo4jClientOptions {
  readonly url: string;
  readonly username: string;
  readonly password: string;
  readonly database: string;
}

/**
 * Helpers for converting Neo4j driver result rows.
 *
 * The driver returns `Integer` and `DateTime` types that don't round-trip
 * naturally through `JSON.stringify`. We coerce eagerly at the boundary.
 */
const toJsNumber = (v: unknown): number => {
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v === 'bigint') {
    return Number(v);
  }
  if (v && typeof v === 'object' && 'toNumber' in v && typeof v.toNumber === 'function') {
    return (v.toNumber as () => number).call(v);
  }
  return Number(v);
};

const toJsDate = (v: unknown): Date => {
  if (v instanceof Date) {
    return v;
  }
  if (v === null || v === undefined) {
    return new Date(NaN);
  }
  if (typeof v === 'string' || typeof v === 'number') {
    return new Date(v);
  }
  if (typeof v === 'object') {
    // neo4j DateTime carries its own `toString` whose default produces an
    // ISO-8601-shaped value. We can't statically prove that, so inspect the
    // prototype chain to reject plain objects whose `toString` is just the
    // inherited `Object.prototype.toString` (which would return
    // `[object Object]`).
    const proto: unknown = (v as { toString?: unknown }).toString;
    if (typeof proto === 'function' && proto !== Object.prototype.toString) {
      const fn = proto as () => string;
      return new Date(fn.call(v));
    }
  }
  return new Date(NaN);
};

const toStringSafe = (v: unknown): string => (typeof v === 'string' ? v : String(v));
const toOptionalString = (v: unknown): string | undefined => {
  if (v === null || v === undefined) {
    return undefined;
  }
  return toStringSafe(v);
};

/**
 * Typed view onto the props bag the driver returns. We don't exhaustively
 * model every property that *could* live on a node — only the ones we read.
 */
type Props = Record<string, unknown>;
const props = (record: { get: (key: string) => unknown }, key: string): Props => {
  const v = record.get(key) as { properties?: unknown } | null;
  return (v?.properties ?? {}) as Props;
};

export interface Neo4jClient extends GraphRepository {
  /** Underlying driver — escape hatch for live integration tests. */
  readonly driver: Driver;
}

/**
 * Real Neo4j-backed graph repository.
 *
 * Schema:
 *   (:Agent { did, registeredAt })
 *     -[:PARTICIPATED_IN { role, txId, amount, currency, completedAt }]->
 *   (:Transaction { txId, status, completedAt, hasNegativeFeedback })
 *
 *   (:Agent)-[:RATED { feedbackId, txId, rating, dimensions(JSON),
 *                      comment, signedAt, signature }]->(:Agent)
 *
 * In MVP we don't model `(:Transaction)-[:HAS_FEEDBACK]->(:Feedback)` as
 * separate nodes — the feedback lives on the RATED edge. Sub-dimensions are
 * stored as a JSON string on the edge to keep the property model flat.
 */
export const createNeo4jClient = (options: Neo4jClientOptions): Neo4jClient => {
  const driver = neo4j.driver(options.url, neo4j.auth.basic(options.username, options.password), {
    disableLosslessIntegers: true,
  });
  const sessionFor = (): Session => driver.session({ database: options.database });

  const ensureSchema = async (): Promise<void> => {
    const session = sessionFor();
    try {
      await session.run(
        'CREATE CONSTRAINT agent_did_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.did IS UNIQUE',
      );
      await session.run(
        'CREATE CONSTRAINT tx_id_unique IF NOT EXISTS FOR (t:Transaction) REQUIRE t.txId IS UNIQUE',
      );
    } finally {
      await session.close();
    }
  };

  return {
    driver,

    async upsertAgent(did, registeredAt) {
      const session = sessionFor();
      try {
        await session.run(
          'MERGE (a:Agent { did: $did }) ON CREATE SET a.registeredAt = datetime($registeredAt)',
          { did, registeredAt: registeredAt.toISOString() },
        );
      } finally {
        await session.close();
      }
    },

    async loadScoringSnapshot(did) {
      const session = sessionFor();
      try {
        const agentRes = await session.run('MATCH (a:Agent { did: $did }) RETURN a', { did });
        const first = agentRes.records[0];
        if (!first) {
          return null;
        }
        const agentProps = props(first, 'a');

        const txRes = await session.run(
          `MATCH (a:Agent { did: $did })-[:PARTICIPATED_IN]->(t:Transaction)
           RETURN t.txId AS txId,
                  t.status AS status,
                  t.completedAt AS completedAt,
                  t.hasNegativeFeedback AS hasNegativeFeedback`,
          { did },
        );
        const transactions: TransactionEventRecord[] = txRes.records.map((r) => ({
          txId: toStringSafe(r.get('txId')),
          completed: toStringSafe(r.get('status')) === 'completed',
          hasNegativeFeedback: r.get('hasNegativeFeedback') === true,
          completedAt: toJsDate(r.get('completedAt')),
        }));

        const fbRes = await session.run(
          `MATCH (issuer:Agent)-[r:RATED]->(:Agent { did: $did })
           RETURN r.feedbackId AS feedbackId,
                  issuer.did AS fromDid,
                  r.txId AS txId,
                  r.rating AS rating,
                  r.signedAt AS signedAt,
                  r.comment AS comment`,
          { did },
        );
        const feedbacks: ReceivedFeedbackRecord[] = fbRes.records.map((r) => {
          const comment = toOptionalString(r.get('comment'));
          return {
            feedbackId: toStringSafe(r.get('feedbackId')),
            fromDid: toStringSafe(r.get('fromDid')),
            txId: toStringSafe(r.get('txId')),
            rating: toJsNumber(r.get('rating')),
            signedAt: toJsDate(r.get('signedAt')),
            ...(comment !== undefined ? { comment } : {}),
          };
        });

        return {
          agent: {
            did: toStringSafe(agentProps.did),
            registeredAt: toJsDate(agentProps.registeredAt),
          },
          transactions,
          feedbacks,
        };
      } finally {
        await session.close();
      }
    },

    async recordFeedbackEdge(input: RecordFeedbackEdgeInput) {
      const session = sessionFor();
      try {
        await session.executeWrite(async (tx) => {
          // Ensure both endpoints + the transaction node exist. The
          // transaction may have been minted by another module; we MERGE
          // with default fields so reading the snapshot is always defined.
          await tx.run(
            `MERGE (issuer:Agent { did: $fromDid })
               ON CREATE SET issuer.registeredAt = datetime($now)
             MERGE (target:Agent { did: $toDid })
               ON CREATE SET target.registeredAt = datetime($now)
             MERGE (txn:Transaction { txId: $txId })
               ON CREATE SET txn.status = 'completed',
                             txn.completedAt = datetime($now),
                             txn.hasNegativeFeedback = false
             MERGE (issuer)-[:PARTICIPATED_IN { role: 'buyer', txId: $txId }]->(txn)
             MERGE (target)-[:PARTICIPATED_IN { role: 'seller', txId: $txId }]->(txn)
             MERGE (issuer)-[r:RATED { feedbackId: $feedbackId }]->(target)
               ON CREATE SET r.txId = $txId,
                             r.rating = $rating,
                             r.dimensions = $dimensions,
                             r.comment = $comment,
                             r.signedAt = datetime($signedAt),
                             r.signature = $signature
             FOREACH (_ IN CASE WHEN $rating <= 2 THEN [1] ELSE [] END |
                SET txn.hasNegativeFeedback = true)`,
            {
              feedbackId: input.feedbackId,
              fromDid: input.fromDid,
              toDid: input.toDid,
              txId: input.txId,
              rating: input.rating,
              dimensions: JSON.stringify(input.dimensions),
              comment: input.comment ?? null,
              signedAt: input.signedAt.toISOString(),
              signature: input.signature,
              now: new Date().toISOString(),
            },
          );
        });
      } finally {
        await session.close();
      }
    },

    async loadHistory(did, query: HistoryQuery): Promise<HistoryPage> {
      const session = sessionFor();
      try {
        const limit = Math.max(1, Math.min(query.limit, 200));
        // Cursor is the ISO timestamp of the oldest item in the previous
        // page. Both transactions and feedbacks are filtered by
        // `<= cursor` so the next page picks up where we stopped.
        const cursor = query.cursor;

        const txRes = await session.run(
          `MATCH (a:Agent { did: $did })-[p:PARTICIPATED_IN]->(t:Transaction)
           WHERE $cursor IS NULL OR t.completedAt <= datetime($cursor)
           RETURN t.txId AS txId,
                  t.status AS status,
                  p.role AS role,
                  p.amount AS amount,
                  p.currency AS currency,
                  t.completedAt AS completedAt,
                  ((:Agent)-[:PARTICIPATED_IN]->(t))[0] AS counterparty
           ORDER BY t.completedAt DESC
           LIMIT $limit`,
          { did, cursor, limit },
        );
        const transactions: TransactionParticipationRecord[] = txRes.records.map((r) => {
          const cp = r.get('counterparty') as { properties?: { did?: string } } | null;
          return {
            txId: toStringSafe(r.get('txId')),
            counterpartyDid: cp?.properties?.did ?? '',
            role: toStringSafe(r.get('role')) === 'seller' ? 'seller' : 'buyer',
            amount: toStringSafe(r.get('amount') ?? '0'),
            currency: toStringSafe(r.get('currency') ?? 'USDC'),
            completedAt: toJsDate(r.get('completedAt')),
            status: toStringSafe(r.get('status')),
          };
        });

        const fbReceivedRes = await session.run(
          `MATCH (issuer:Agent)-[r:RATED]->(:Agent { did: $did })
           WHERE $cursor IS NULL OR r.signedAt <= datetime($cursor)
           RETURN r.feedbackId AS feedbackId,
                  issuer.did AS fromDid,
                  r.txId AS txId,
                  r.rating AS rating,
                  r.signedAt AS signedAt,
                  r.comment AS comment
           ORDER BY r.signedAt DESC
           LIMIT $limit`,
          { did, cursor, limit },
        );
        const feedbacksReceived: ReceivedFeedbackRecord[] = fbReceivedRes.records.map((r) => {
          const comment = toOptionalString(r.get('comment'));
          return {
            feedbackId: toStringSafe(r.get('feedbackId')),
            fromDid: toStringSafe(r.get('fromDid')),
            txId: toStringSafe(r.get('txId')),
            rating: toJsNumber(r.get('rating')),
            signedAt: toJsDate(r.get('signedAt')),
            ...(comment !== undefined ? { comment } : {}),
          };
        });

        const fbIssuedRes = await session.run(
          `MATCH (:Agent { did: $did })-[r:RATED]->(target:Agent)
           WHERE $cursor IS NULL OR r.signedAt <= datetime($cursor)
           RETURN r.feedbackId AS feedbackId,
                  target.did AS toDid,
                  r.txId AS txId,
                  r.rating AS rating,
                  r.signedAt AS signedAt,
                  r.comment AS comment
           ORDER BY r.signedAt DESC
           LIMIT $limit`,
          { did, cursor, limit },
        );
        const feedbacksIssued: IssuedFeedbackRecord[] = fbIssuedRes.records.map((r) => {
          const comment = toOptionalString(r.get('comment'));
          return {
            feedbackId: toStringSafe(r.get('feedbackId')),
            fromDid: did,
            toDid: toStringSafe(r.get('toDid')),
            txId: toStringSafe(r.get('txId')),
            rating: toJsNumber(r.get('rating')),
            signedAt: toJsDate(r.get('signedAt')),
            ...(comment !== undefined ? { comment } : {}),
          };
        });

        // Compute the next cursor as the oldest timestamp we returned across
        // any of the three lists. If we returned fewer than `limit` items in
        // every list, we know we've exhausted the data and signal "done".
        const allDates: Date[] = [];
        for (const t of transactions) {
          allDates.push(t.completedAt);
        }
        for (const f of feedbacksReceived) {
          allDates.push(f.signedAt);
        }
        for (const f of feedbacksIssued) {
          allDates.push(f.signedAt);
        }
        const oldest = allDates.reduce<Date | null>(
          (acc, d) => (acc === null || d < acc ? d : acc),
          null,
        );

        const exhausted =
          transactions.length < limit &&
          feedbacksReceived.length < limit &&
          feedbacksIssued.length < limit;
        const nextCursor = exhausted || oldest === null ? null : oldest.toISOString();

        return { transactions, feedbacksReceived, feedbacksIssued, nextCursor };
      } finally {
        await session.close();
      }
    },

    async ping() {
      const session = sessionFor();
      try {
        await session.run('RETURN 1 AS ok');
      } finally {
        await session.close();
      }
    },

    async close() {
      await driver.close();
    },
  };

  // Note: caller is responsible for invoking `ensureSchema()` once during
  // service boot. We expose it via the local closure so it stays out of the
  // GraphRepository interface (the in-memory fake doesn't need it).
  void ensureSchema;
};

/**
 * Bootstrap helper — run schema constraints once. Not on the public
 * `GraphRepository` interface to keep the in-memory fake clean. Callers from
 * `server.ts` invoke this against a real Neo4jClient at startup.
 */
export const bootstrapNeo4jSchema = async (client: Neo4jClient): Promise<void> => {
  const session = client.driver.session();
  try {
    await session.run(
      'CREATE CONSTRAINT agent_did_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.did IS UNIQUE',
    );
    await session.run(
      'CREATE CONSTRAINT tx_id_unique IF NOT EXISTS FOR (t:Transaction) REQUIRE t.txId IS UNIQUE',
    );
  } finally {
    await session.close();
  }
};
