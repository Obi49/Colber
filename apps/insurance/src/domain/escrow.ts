// TODO P3: replace with Solidity escrow + viem (étape 7b — on-chain insurance).
// v1 MVP is a simulation: the escrow lifecycle lives entirely in Postgres
// (escrow_holdings + escrow_events). No chain RPC, no Solidity, no viem.
import { ERROR_CODES, PraxisError } from '@praxis/core-types';

import type { EscrowEvent, EscrowHolding, EscrowStatus } from './types.js';

/**
 * Escrow state machine:
 *
 *   locked → released
 *   locked → claimed
 *   locked → refunded
 *
 * No skipping states: a `released` holding cannot be `claimed`, etc. Every
 * legal transition appends a row to `escrow_events` in the same transaction
 * as the holding update. Idempotent transitions (re-calling `release` on a
 * `released` holding, etc.) are no-ops.
 *
 * The `EscrowRepository` interface is the persistence boundary — the
 * Postgres adapter (`db/escrow-repository.ts`) implements it for prod, and
 * the in-memory fake (`test/fakes/in-memory-escrow-repository.ts`) for
 * tests.
 */

export interface EscrowRepository {
  /** Create a new holding in `locked` state and append `escrow.locked`. */
  lock(input: { policyId: string; amountUsdc: number; at: Date }): Promise<EscrowHolding>;

  /** Read a holding + its last 50 events. Returns `null` if not found. */
  getByPolicy(policyId: string): Promise<{
    holding: EscrowHolding;
    events: readonly EscrowEvent[];
  } | null>;

  /** Read a holding by id. Returns `null` if not found. */
  getById(id: string): Promise<EscrowHolding | null>;

  /** Sum of `amount_usdc` across holdings in the `locked` state. */
  sumLockedExposure(): Promise<number>;

  /**
   * Atomically transition `locked → released | claimed | refunded`. Appends
   * an `escrow.<status>` event in the same transaction. Idempotent: calling
   * `release` on a `released` holding returns the holding unchanged. Throws
   * `VALIDATION_FAILED` for an illegal transition.
   */
  transition(input: {
    holdingId: string;
    to: EscrowStatus;
    at: Date;
    payload?: Readonly<Record<string, unknown>>;
  }): Promise<EscrowHolding>;
}

const TERMINAL_STATES: ReadonlySet<EscrowStatus> = new Set(['released', 'claimed', 'refunded']);

/**
 * Validates a target state transition. Used by both the Postgres adapter
 * and the in-memory fake to keep semantics identical.
 *
 * Returns:
 *   - `{ kind: 'noop' }` if `current === to` (idempotent).
 *   - `{ kind: 'transition' }` if `locked → to`.
 *   - `{ kind: 'reject', reason }` otherwise.
 */
export const validateTransition = (
  current: EscrowStatus,
  to: EscrowStatus,
): { kind: 'noop' } | { kind: 'transition' } | { kind: 'reject'; reason: string } => {
  if (current === to) {
    return { kind: 'noop' };
  }
  if (current !== 'locked') {
    return {
      kind: 'reject',
      reason: `cannot transition from terminal state '${current}' to '${to}'`,
    };
  }
  if (!TERMINAL_STATES.has(to)) {
    return { kind: 'reject', reason: `target state '${to}' is not a valid escrow target` };
  }
  return { kind: 'transition' };
};

export class EscrowService {
  constructor(
    private readonly repo: EscrowRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async lock(policyId: string, amountUsdc: number): Promise<EscrowHolding> {
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, 'amountUsdc must be > 0', 400);
    }
    return this.repo.lock({ policyId, amountUsdc, at: this.now() });
  }

  public async release(holdingId: string): Promise<EscrowHolding> {
    return this.repo.transition({
      holdingId,
      to: 'released',
      at: this.now(),
    });
  }

  public async claim(holdingId: string, claimId: string): Promise<EscrowHolding> {
    return this.repo.transition({
      holdingId,
      to: 'claimed',
      at: this.now(),
      payload: { claimId },
    });
  }

  public async refund(holdingId: string, reason: string): Promise<EscrowHolding> {
    return this.repo.transition({
      holdingId,
      to: 'refunded',
      at: this.now(),
      payload: { reason },
    });
  }

  public async getByPolicy(
    policyId: string,
  ): Promise<{ holding: EscrowHolding; events: readonly EscrowEvent[] } | null> {
    return this.repo.getByPolicy(policyId);
  }

  public async getById(id: string): Promise<EscrowHolding | null> {
    return this.repo.getById(id);
  }
}
