import { ERROR_CODES, PraxisError } from '@praxis/core-types';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { claims, escrowEvents, escrowHoldings, policies } from './schema.js';
import { validateTransition } from '../domain/escrow.js';

import type { Database, DbClient } from './client.js';
import type { ClaimRow, EscrowEventRow, EscrowRow, PolicyRow } from './schema.js';
import type {
  ListPoliciesQuery,
  PolicyStore,
  PolicyView,
  SubmitClaimInput,
  SubmitClaimResult,
  SubscribeInput,
  SubscribeResult,
} from '../domain/policy-store.js';
import type {
  Claim,
  ClaimStatus,
  EscrowEvent,
  EscrowHolding,
  EscrowStatus,
  Policy,
  PolicyStatus,
  SlaTerms,
} from '../domain/types.js';

/**
 * Postgres-backed policy + escrow + claims store.
 *
 * Subscribe transaction:
 *   1. Lock-aware exposure check inside the transaction:
 *        SELECT COALESCE(SUM(amount_usdc), 0) FROM escrow_holdings
 *         WHERE status='locked'
 *      then compare with `policy.amountUsdc + sum < cap`. We do NOT use
 *      `FOR UPDATE` here: a concurrent insert that pushes the total past
 *      the cap is acceptable in v1 (the cap is a soft circuit-breaker, not
 *      a regulatory ceiling). Documented as a deviation; if we ever want
 *      strict enforcement we can switch to advisory locking.
 *   2. INSERT the policy. ON CONFLICT (idempotency_key) DO NOTHING +
 *      RETURNING — if no row was returned, treat as an idempotent replay
 *      and re-fetch the existing view.
 *   3. INSERT the escrow holding (status `locked`).
 *   4. INSERT `escrow.locked` event.
 *
 * SubmitClaim transaction:
 *   1. INSERT the claim. ON CONFLICT (policy_id, idempotency_key) DO
 *      NOTHING — if no row was returned, treat as replay and re-fetch.
 */
export class DrizzlePolicyStore implements PolicyStore {
  private readonly db: Database;
  private readonly client: DbClient;

  constructor(client: DbClient) {
    this.client = client;
    this.db = client.db;
  }

  public async subscribe(input: SubscribeInput): Promise<SubscribeResult> {
    return this.db.transaction(async (tx) => {
      const exposure = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${escrowHoldings.amountUsdc}), 0)`,
        })
        .from(escrowHoldings)
        .where(eq(escrowHoldings.status, 'locked'));
      const totalLocked = Number(exposure[0]?.total ?? '0');
      if (totalLocked + input.policy.amountUsdc > input.maxGlobalExposureUsdc) {
        throw new PraxisError(
          ERROR_CODES.VALIDATION_FAILED,
          `global exposure cap reached (${totalLocked} + ${input.policy.amountUsdc} > ${input.maxGlobalExposureUsdc})`,
          400,
        );
      }

      const inserted = await tx
        .insert(policies)
        .values({
          id: input.policy.id,
          subscriberDid: input.policy.subscriberDid,
          beneficiaryDid: input.policy.beneficiaryDid,
          dealSubject: input.policy.dealSubject,
          amountUsdc: input.policy.amountUsdc.toString(),
          premiumUsdc: input.policy.premiumUsdc.toString(),
          riskMultiplier: input.policy.riskMultiplier.toString(),
          reputationScore: input.policy.reputationScore,
          slaTerms: input.policy.slaTerms,
          status: input.policy.status,
          createdAt: new Date(input.policy.createdAt),
          expiresAt: new Date(input.policy.expiresAt),
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing({ target: policies.idempotencyKey })
        .returning();

      if (inserted.length === 0) {
        // Idempotent replay — fetch the existing view by idempotency key.
        const existing = await tx
          .select()
          .from(policies)
          .where(eq(policies.idempotencyKey, input.idempotencyKey))
          .limit(1);
        const row = existing[0];
        if (!row) {
          throw new PraxisError(
            ERROR_CODES.INTERNAL_ERROR,
            'idempotency conflict but row missing',
            500,
          );
        }
        const view = await this.fetchPolicyView(row.id, tx);
        if (!view) {
          throw new PraxisError(
            ERROR_CODES.INTERNAL_ERROR,
            'policy row found but view rebuild failed',
            500,
          );
        }
        return { view, idempotent: true };
      }

      // Lock the escrow.
      await tx.insert(escrowHoldings).values({
        id: input.escrowId,
        policyId: input.policy.id,
        amountUsdc: input.policy.amountUsdc.toString(),
        status: 'locked',
        lockedAt: new Date(input.policy.createdAt),
      });

      await tx.insert(escrowEvents).values({
        holdingId: input.escrowId,
        eventType: 'escrow.locked',
        payload: {
          policyId: input.policy.id,
          amountUsdc: input.policy.amountUsdc,
        },
        occurredAt: new Date(input.policy.createdAt),
      });

      const view = await this.fetchPolicyView(input.policy.id, tx);
      if (!view) {
        throw new PraxisError(ERROR_CODES.INTERNAL_ERROR, 'view rebuild failed', 500);
      }
      return { view, idempotent: false };
    });
  }

  public async submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(claims)
        .values({
          id: input.claim.id,
          policyId: input.claim.policyId,
          claimantDid: input.claim.claimantDid,
          reason: input.claim.reason,
          evidence: input.claim.evidence,
          status: input.claim.status,
          createdAt: new Date(input.claim.createdAt),
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing({
          target: [claims.policyId, claims.idempotencyKey],
        })
        .returning();
      if (inserted.length === 0) {
        // Replay — fetch the existing claim.
        const existing = await tx
          .select()
          .from(claims)
          .where(
            and(
              eq(claims.policyId, input.claim.policyId),
              eq(claims.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        const row = existing[0];
        if (!row) {
          throw new PraxisError(
            ERROR_CODES.INTERNAL_ERROR,
            'idempotency conflict but row missing',
            500,
          );
        }
        return { claim: rowToClaim(row), idempotent: true };
      }
      const row = inserted[0];
      if (!row) {
        throw new PraxisError(ERROR_CODES.INTERNAL_ERROR, 'insert returned no rows', 500);
      }
      return { claim: rowToClaim(row), idempotent: false };
    });
  }

  public async getPolicy(policyId: string): Promise<PolicyView | null> {
    return this.fetchPolicyView(policyId, this.db);
  }

  public async listPolicies(
    query: ListPoliciesQuery,
  ): Promise<{ policies: readonly PolicyView[]; total: number }> {
    const totalRow = await this.db
      .select({ count: sql<string>`COUNT(*)` })
      .from(policies)
      .where(eq(policies.subscriberDid, query.subscriberDid));
    const total = Number(totalRow[0]?.count ?? '0');

    const rows = await this.db
      .select()
      .from(policies)
      .where(eq(policies.subscriberDid, query.subscriberDid))
      .orderBy(desc(policies.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const views: PolicyView[] = [];
    for (const row of rows) {
      const view = await this.fetchPolicyView(row.id, this.db);
      if (view) {
        views.push(view);
      }
    }
    return { policies: views, total };
  }

  public async forceEscrowTransition(input: {
    holdingId: string;
    to: 'released' | 'claimed' | 'refunded';
    at: Date;
    reason?: string;
    claimId?: string;
  }): Promise<{ holding: EscrowHolding; events: readonly EscrowEvent[] }> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(escrowHoldings)
        .where(eq(escrowHoldings.id, input.holdingId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new PraxisError(
          ERROR_CODES.NOT_FOUND,
          `escrow holding ${input.holdingId} not found`,
          404,
        );
      }

      const verdict = validateTransition(row.status as EscrowStatus, input.to);
      if (verdict.kind === 'reject') {
        throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, verdict.reason, 400);
      }
      if (verdict.kind === 'noop') {
        const events = await this.fetchEscrowEvents(input.holdingId, tx);
        return { holding: rowToEscrow(row), events };
      }

      const updated = await tx
        .update(escrowHoldings)
        .set({
          status: input.to,
          ...(input.to === 'released' ? { releasedAt: input.at } : {}),
          ...(input.to === 'claimed' ? { claimedAt: input.at } : {}),
          ...(input.to === 'refunded' ? { refundedAt: input.at } : {}),
        })
        .where(eq(escrowHoldings.id, input.holdingId))
        .returning();
      const updatedRow = updated[0];
      if (!updatedRow) {
        throw new PraxisError(ERROR_CODES.INTERNAL_ERROR, 'update returned no rows', 500);
      }

      const payload: Record<string, unknown> = {};
      if (input.reason !== undefined) {
        payload.reason = input.reason;
      }
      if (input.claimId !== undefined) {
        payload.claimId = input.claimId;
      }

      await tx.insert(escrowEvents).values({
        holdingId: input.holdingId,
        eventType: `escrow.${input.to}`,
        payload,
        occurredAt: input.at,
      });

      // If this is a `claimed` transition with a linked claimId, mark the
      // claim as `paid` (payout = the policy amount) and the policy as
      // `claimed`. The escrow already holds the funds, so payout is the
      // amount that was locked.
      if (input.to === 'claimed' && input.claimId !== undefined) {
        const payoutUsdc = Number(updatedRow.amountUsdc);
        await tx
          .update(claims)
          .set({
            status: 'paid',
            decidedAt: input.at,
            payoutUsdc: payoutUsdc.toString(),
          })
          .where(and(eq(claims.id, input.claimId), eq(claims.policyId, updatedRow.policyId)));
        await tx
          .update(policies)
          .set({ status: 'claimed' })
          .where(eq(policies.id, updatedRow.policyId));
      }

      // If `released`, the policy lifecycle reaches `expired` is decoupled
      // — `released` simply means the escrow funds went back to the
      // platform. The policy status is left as-is.

      const events = await this.fetchEscrowEvents(input.holdingId, tx);
      return { holding: rowToEscrow(updatedRow), events };
    });
  }

  public async ping(): Promise<void> {
    await this.client.ping();
  }

  public async close(): Promise<void> {
    await this.client.close();
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private async fetchPolicyView(policyId: string, runner: Database): Promise<PolicyView | null> {
    const policyRows = await runner
      .select()
      .from(policies)
      .where(eq(policies.id, policyId))
      .limit(1);
    const policyRow = policyRows[0];
    if (!policyRow) {
      return null;
    }
    const escrowRows = await runner
      .select()
      .from(escrowHoldings)
      .where(eq(escrowHoldings.policyId, policyId))
      .limit(1);
    const escrowRow = escrowRows[0];
    if (!escrowRow) {
      // A policy without escrow shouldn't happen (subscribe is
      // transactional), but treat as inconsistent state and return null
      // to surface the bug rather than crash.
      return null;
    }
    const claimRows = await runner
      .select()
      .from(claims)
      .where(eq(claims.policyId, policyId))
      .orderBy(asc(claims.createdAt));

    return {
      policy: rowToPolicy(policyRow),
      escrow: rowToEscrow(escrowRow),
      claims: claimRows.map(rowToClaim),
    };
  }

  private async fetchEscrowEvents(
    holdingId: string,
    runner: Database,
  ): Promise<readonly EscrowEvent[]> {
    const rows = await runner
      .select()
      .from(escrowEvents)
      .where(eq(escrowEvents.holdingId, holdingId))
      .orderBy(asc(escrowEvents.seq))
      .limit(50);
    return rows.map(rowToEscrowEvent);
  }
}

const rowToPolicy = (row: PolicyRow): Policy => {
  const status = row.status as PolicyStatus;
  return {
    id: row.id,
    subscriberDid: row.subscriberDid,
    beneficiaryDid: row.beneficiaryDid,
    dealSubject: row.dealSubject,
    amountUsdc: Number(row.amountUsdc),
    premiumUsdc: Number(row.premiumUsdc),
    riskMultiplier: Number(row.riskMultiplier),
    reputationScore: row.reputationScore,
    slaTerms: row.slaTerms as SlaTerms,
    status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
};

const rowToEscrow = (row: EscrowRow): EscrowHolding => {
  const base: EscrowHolding = {
    id: row.id,
    policyId: row.policyId,
    amountUsdc: Number(row.amountUsdc),
    status: row.status as EscrowStatus,
    lockedAt: row.lockedAt.toISOString(),
    ...(row.releasedAt !== null ? { releasedAt: row.releasedAt.toISOString() } : {}),
    ...(row.claimedAt !== null ? { claimedAt: row.claimedAt.toISOString() } : {}),
    ...(row.refundedAt !== null ? { refundedAt: row.refundedAt.toISOString() } : {}),
  };
  return base;
};

const rowToClaim = (row: ClaimRow): Claim => ({
  id: row.id,
  policyId: row.policyId,
  claimantDid: row.claimantDid,
  reason: row.reason,
  evidence: row.evidence as Readonly<Record<string, unknown>>,
  status: row.status as ClaimStatus,
  createdAt: row.createdAt.toISOString(),
  ...(row.decidedAt !== null ? { decidedAt: row.decidedAt.toISOString() } : {}),
  ...(row.payoutUsdc !== null ? { payoutUsdc: Number(row.payoutUsdc) } : {}),
});

const rowToEscrowEvent = (row: EscrowEventRow): EscrowEvent => ({
  seq: row.seq,
  holdingId: row.holdingId,
  eventType: row.eventType as EscrowEvent['eventType'],
  payload: row.payload as Readonly<Record<string, unknown>>,
  occurredAt: row.occurredAt.toISOString(),
});
