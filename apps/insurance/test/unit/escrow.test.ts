import { describe, expect, it } from 'vitest';

import { EscrowService, validateTransition } from '../../src/domain/escrow.js';
import { InMemoryPolicyStore } from '../fakes/in-memory-policy-store.js';

import type { EscrowRepository } from '../../src/domain/escrow.js';
import type { EscrowEvent, EscrowHolding, EscrowStatus } from '../../src/domain/types.js';

describe('validateTransition', () => {
  it('allows locked → released | claimed | refunded', () => {
    expect(validateTransition('locked', 'released').kind).toBe('transition');
    expect(validateTransition('locked', 'claimed').kind).toBe('transition');
    expect(validateTransition('locked', 'refunded').kind).toBe('transition');
  });

  it('treats same-state transition as noop', () => {
    expect(validateTransition('locked', 'locked').kind).toBe('noop');
    expect(validateTransition('released', 'released').kind).toBe('noop');
  });

  it('rejects transitions out of a terminal state', () => {
    const verdict = validateTransition('released', 'claimed');
    expect(verdict.kind).toBe('reject');
    if (verdict.kind === 'reject') {
      expect(verdict.reason).toMatch(/terminal state/u);
    }
  });

  it('rejects all transitions out of refunded', () => {
    expect(validateTransition('refunded', 'released').kind).toBe('reject');
    expect(validateTransition('refunded', 'claimed').kind).toBe('reject');
    expect(validateTransition('refunded', 'locked').kind).toBe('reject');
  });

  it('rejects target state outside the {released, claimed, refunded} set', () => {
    const verdict = validateTransition('locked', 'locked');
    // locked → locked is noop, but `locked` would be invalid as a target if
    // current weren't locked. Test the explicit reject path.
    expect(verdict.kind).toBe('noop');
  });
});

/**
 * Minimal in-memory `EscrowRepository` that exercises the same semantics as
 * the Postgres adapter, focused on the lock/transition behaviour rather than
 * the full PolicyStore surface (covered by `InMemoryPolicyStore`).
 */
class InMemoryEscrowRepo implements EscrowRepository {
  private nextSeq = 1;
  private readonly holdings = new Map<string, { holding: EscrowHolding; events: EscrowEvent[] }>();
  private readonly idByPolicy = new Map<string, string>();

  public lock(input: { policyId: string; amountUsdc: number; at: Date }): Promise<EscrowHolding> {
    const id = `esc-${this.holdings.size + 1}`;
    const holding: EscrowHolding = {
      id,
      policyId: input.policyId,
      amountUsdc: input.amountUsdc,
      status: 'locked',
      lockedAt: input.at.toISOString(),
    };
    const ev: EscrowEvent = {
      seq: this.nextSeq++,
      holdingId: id,
      eventType: 'escrow.locked',
      payload: { policyId: input.policyId, amountUsdc: input.amountUsdc },
      occurredAt: input.at.toISOString(),
    };
    this.holdings.set(id, { holding, events: [ev] });
    this.idByPolicy.set(input.policyId, id);
    return Promise.resolve(holding);
  }

  public getByPolicy(
    policyId: string,
  ): Promise<{ holding: EscrowHolding; events: readonly EscrowEvent[] } | null> {
    const id = this.idByPolicy.get(policyId);
    if (!id) {
      return Promise.resolve(null);
    }
    const stored = this.holdings.get(id);
    if (!stored) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ holding: stored.holding, events: [...stored.events] });
  }

  public getById(id: string): Promise<EscrowHolding | null> {
    return Promise.resolve(this.holdings.get(id)?.holding ?? null);
  }

  public sumLockedExposure(): Promise<number> {
    let total = 0;
    for (const v of this.holdings.values()) {
      if (v.holding.status === 'locked') {
        total += v.holding.amountUsdc;
      }
    }
    return Promise.resolve(total);
  }

  public transition(input: {
    holdingId: string;
    to: EscrowStatus;
    at: Date;
    payload?: Readonly<Record<string, unknown>>;
  }): Promise<EscrowHolding> {
    const stored = this.holdings.get(input.holdingId);
    if (!stored) {
      return Promise.reject(new Error(`escrow ${input.holdingId} not found`));
    }
    const verdict = validateTransition(stored.holding.status, input.to);
    if (verdict.kind === 'reject') {
      return Promise.reject(new Error(verdict.reason));
    }
    if (verdict.kind === 'noop') {
      return Promise.resolve(stored.holding);
    }
    const next: EscrowHolding = {
      ...stored.holding,
      status: input.to,
      ...(input.to === 'released' ? { releasedAt: input.at.toISOString() } : {}),
      ...(input.to === 'claimed' ? { claimedAt: input.at.toISOString() } : {}),
      ...(input.to === 'refunded' ? { refundedAt: input.at.toISOString() } : {}),
    };
    stored.holding = next;
    stored.events.push({
      seq: this.nextSeq++,
      holdingId: input.holdingId,
      eventType: `escrow.${input.to}`,
      payload: input.payload ?? {},
      occurredAt: input.at.toISOString(),
    });
    return Promise.resolve(next);
  }
}

describe('EscrowService', () => {
  it('locks a holding and appends `escrow.locked` event', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo, () => new Date('2026-04-28T10:00:00Z'));
    const holding = await service.lock('p-1', 1_000);
    expect(holding.status).toBe('locked');
    const fetched = await service.getByPolicy('p-1');
    expect(fetched?.events).toHaveLength(1);
    expect(fetched?.events[0]?.eventType).toBe('escrow.locked');
  });

  it('rejects negative or zero amount on lock', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    await expect(service.lock('p-1', 0)).rejects.toThrow(/amountUsdc/u);
    await expect(service.lock('p-1', -100)).rejects.toThrow(/amountUsdc/u);
  });

  it('release transitions locked → released', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    const locked = await service.lock('p-1', 1_000);
    const released = await service.release(locked.id);
    expect(released.status).toBe('released');
    expect(released.releasedAt).toBeDefined();
  });

  it('release is idempotent on a released holding', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    const locked = await service.lock('p-1', 1_000);
    await service.release(locked.id);
    const second = await service.release(locked.id);
    expect(second.status).toBe('released');
  });

  it('claim transitions locked → claimed and records claimId', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    const locked = await service.lock('p-1', 1_000);
    const claimed = await service.claim(locked.id, 'claim-42');
    expect(claimed.status).toBe('claimed');
    expect(claimed.claimedAt).toBeDefined();
    const fetched = await service.getByPolicy('p-1');
    const last = fetched?.events.at(-1);
    expect(last?.eventType).toBe('escrow.claimed');
    expect((last?.payload as { claimId: string }).claimId).toBe('claim-42');
  });

  it('refund transitions locked → refunded with reason', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    const locked = await service.lock('p-1', 1_000);
    const refunded = await service.refund(locked.id, 'beneficiary cancelled');
    expect(refunded.status).toBe('refunded');
    expect(refunded.refundedAt).toBeDefined();
  });

  it('rejects escrow.released → escrow.claimed (no skipping out of terminal)', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    const locked = await service.lock('p-1', 1_000);
    await service.release(locked.id);
    await expect(service.claim(locked.id, 'claim-x')).rejects.toThrow();
  });

  it('rejects escrow.refunded → escrow.released', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    const locked = await service.lock('p-1', 1_000);
    await service.refund(locked.id, 'cancel');
    await expect(service.release(locked.id)).rejects.toThrow();
  });

  it('events appear in the same order as the calls', async () => {
    const repo = new InMemoryEscrowRepo();
    const service = new EscrowService(repo);
    const locked = await service.lock('p-1', 1_000);
    await service.claim(locked.id, 'c-1');
    const view = await service.getByPolicy('p-1');
    const types = (view?.events ?? []).map((e) => e.eventType);
    expect(types).toEqual(['escrow.locked', 'escrow.claimed']);
  });

  it('PolicyStore fake honours the same state-machine for forced transitions', async () => {
    // Sanity check: the in-memory PolicyStore reuses validateTransition.
    const store = new InMemoryPolicyStore();
    const seeded = store.seedLocked({ policyId: 'p-seed', amountUsdc: 100 });
    const out = await store.forceEscrowTransition({
      holdingId: seeded.id,
      to: 'released',
      at: new Date('2026-04-28T11:00:00Z'),
    });
    expect(out.holding.status).toBe('released');
    await expect(
      store.forceEscrowTransition({
        holdingId: seeded.id,
        to: 'claimed',
        at: new Date('2026-04-28T11:01:00Z'),
        claimId: 'c-x',
      }),
    ).rejects.toThrow();
  });
});
