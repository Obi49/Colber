import { describe, expect, it } from 'vitest';

import { registerInsuranceTools } from '../../src/tools/insurance.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { newCtx, newRegistry, parseError, parseOk } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

const setup = (): { registry: ReturnType<typeof newRegistry>; sdk: FakeSdkClient } => {
  const sdk = new FakeSdkClient();
  const registry = newRegistry();
  registerInsuranceTools(registry, sdk as unknown as ColberClient);
  return { registry, sdk };
};

const validQuoteBody = (): Record<string, unknown> => ({
  subscriberDid: 'did:key:zSub',
  beneficiaryDid: 'did:key:zBen',
  dealSubject: 'shipment-x',
  amountUsdc: 1_000,
  slaTerms: { deliveryWindowHours: 24 },
});

describe('insurance MCP tools', () => {
  it('registers 4 tools (quote, subscribe, claim, status)', () => {
    const { registry } = setup();
    expect(registry.size()).toBe(4);
    expect(registry.names()).toEqual(
      expect.arrayContaining([
        'colber_insurance_quote',
        'colber_insurance_subscribe',
        'colber_insurance_claim',
        'colber_insurance_status',
      ]),
    );
  });

  it('quote: forwards body and returns the quote', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call('colber_insurance_quote', validQuoteBody(), newCtx());
    const body = parseOk(result) as { premiumUsdc: number };
    expect(body.premiumUsdc).toBe(2);
    expect(sdk.insurance.state.lastCall?.method).toBe('quote');
  });

  it('quote: rejects amountUsdc <= 0', async () => {
    const { registry } = setup();
    const result = await registry.call(
      'colber_insurance_quote',
      { ...validQuoteBody(), amountUsdc: 0 },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('subscribe: separates body from idempotencyKey', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_insurance_subscribe',
      { ...validQuoteBody(), idempotencyKey: 'sub-key-1' },
      newCtx(),
    );
    parseOk(result);
    const [body, opts] = sdk.insurance.state.lastCall?.args as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect('idempotencyKey' in body).toBe(false);
    expect(opts.idempotencyKey).toBe('sub-key-1');
  });

  it('claim: separates body from idempotencyKey', async () => {
    const { registry, sdk } = setup();
    const result = await registry.call(
      'colber_insurance_claim',
      {
        policyId: '77777777-7777-4777-8777-777777777777',
        claimantDid: 'did:key:zSub',
        reason: 'late delivery',
        evidence: { trackingId: 'TRK-123' },
        idempotencyKey: 'claim-1',
      },
      newCtx(),
    );
    const body = parseOk(result) as { status: string };
    expect(body.status).toBe('open');
    const [callBody, opts] = sdk.insurance.state.lastCall?.args as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect('idempotencyKey' in callBody).toBe(false);
    expect(opts.idempotencyKey).toBe('claim-1');
  });

  it('status: forwards policyId', async () => {
    const { registry, sdk } = setup();
    const id = '77777777-7777-4777-8777-777777777777';
    const result = await registry.call('colber_insurance_status', { policyId: id }, newCtx());
    parseOk(result);
    expect(sdk.insurance.state.lastCall?.args[0]).toBe(id);
  });

  it('status: maps NOT_FOUND', async () => {
    const { registry, sdk } = setup();
    sdk.insurance.state.nextError = { kind: 'api', status: 404, code: 'NOT_FOUND' };
    const result = await registry.call(
      'colber_insurance_status',
      { policyId: '77777777-7777-4777-8777-777777777777' },
      newCtx(),
    );
    const err = parseError(result);
    expect(err.code).toBe('NOT_FOUND');
  });
});
