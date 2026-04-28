import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { InsuranceService } from '../../src/domain/insurance-service.js';
import { PricingEngine } from '../../src/domain/pricing.js';
import { InMemoryPolicyStore } from '../fakes/in-memory-policy-store.js';
import { InMemoryReputationClient } from '../fakes/in-memory-reputation-client.js';

const buildService = (cap: number): { service: InsuranceService; store: InMemoryPolicyStore } => {
  const store = new InMemoryPolicyStore();
  const rep = new InMemoryReputationClient(new Map([['did:key:alice', 600]]));
  const pricing = new PricingEngine(rep, { baseRateBps: 200, quoteValiditySeconds: 300 });
  const service = new InsuranceService(pricing, store, {
    defaultPolicyDurationHours: 168,
    maxGlobalExposureUsdc: cap,
  });
  return { service, store };
};

describe('exposure cap', () => {
  it('admits a subscription that fits under the cap', async () => {
    const { service } = buildService(10_000);
    const result = await service.subscribe({
      subscriberDid: 'did:key:alice',
      beneficiaryDid: 'did:key:bob',
      dealSubject: 'job-1',
      amountUsdc: 1_000,
      slaTerms: { deliveryWindowHours: 24 },
      idempotencyKey: uuidv4(),
    });
    expect(result.view.policy.amountUsdc).toBe(1_000);
    expect(result.view.escrow.status).toBe('locked');
  });

  it('rejects a subscription that would push total exposure past the cap', async () => {
    const { service, store } = buildService(1_500);
    store.seedLocked({ policyId: 'seeded-1', amountUsdc: 1_000 });
    await expect(
      service.subscribe({
        subscriberDid: 'did:key:alice',
        beneficiaryDid: 'did:key:bob',
        dealSubject: 'job-2',
        amountUsdc: 600, // 1000 + 600 > 1500
        slaTerms: { deliveryWindowHours: 24 },
        idempotencyKey: uuidv4(),
      }),
    ).rejects.toThrow(/exposure cap/u);
  });

  it('admits a subscription that lands EXACTLY on the cap', async () => {
    const { service, store } = buildService(2_000);
    store.seedLocked({ policyId: 'seeded-2', amountUsdc: 1_500 });
    const ok = await service.subscribe({
      subscriberDid: 'did:key:alice',
      beneficiaryDid: 'did:key:bob',
      dealSubject: 'job-3',
      amountUsdc: 500,
      slaTerms: { deliveryWindowHours: 24 },
      idempotencyKey: uuidv4(),
    });
    expect(ok.view.policy.amountUsdc).toBe(500);
  });

  it('only counts holdings in `locked` status when summing exposure', async () => {
    const { service, store } = buildService(1_500);
    const seeded = store.seedLocked({ policyId: 'seeded-3', amountUsdc: 1_000 });
    // Force the seeded holding into `released` — it should no longer count.
    await store.forceEscrowTransition({
      holdingId: seeded.id,
      to: 'released',
      at: new Date(),
    });
    const result = await service.subscribe({
      subscriberDid: 'did:key:alice',
      beneficiaryDid: 'did:key:bob',
      dealSubject: 'job-4',
      amountUsdc: 1_500, // would exceed cap if released holding still counted
      slaTerms: { deliveryWindowHours: 24 },
      idempotencyKey: uuidv4(),
    });
    expect(result.view.policy.amountUsdc).toBe(1_500);
  });
});
