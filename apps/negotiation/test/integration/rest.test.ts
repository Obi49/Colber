/**
 * REST integration tests using fastify's `inject` (no real HTTP socket needed).
 * Uses the in-memory `EventStore` fake — no real Postgres connection.
 */
import { getSignatureProvider, toBase64 } from '@colber/core-crypto';
import { createLogger, type Logger } from '@colber/core-logger';
import { v4 as uuidv4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canonicalizeBytes } from '../../src/domain/canonical-json.js';
import { NegotiationService } from '../../src/domain/negotiation-service.js';
import { buildApp } from '../../src/http/app.js';
import { InMemoryEventStore } from '../fakes/in-memory-event-store.js';

import type { DbClient, Database } from '../../src/db/client.js';
import type { NegotiationView } from '../../src/http/views.js';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';

interface OkEnvelope<T> {
  ok: true;
  data: T;
}
interface ErrEnvelope {
  ok: false;
  error: { code: string; message: string };
}
type Envelope<T> = OkEnvelope<T> | ErrEnvelope;

const fakeDbClient = (alive = true): DbClient => ({
  db: {} as unknown as Database,
  sql: {} as unknown as Sql,
  close: () => Promise.resolve(),
  ping: () => (alive ? Promise.resolve() : Promise.reject(new Error('db down'))),
});

const ed = getSignatureProvider('Ed25519');

interface Party {
  did: string;
  privateKey: Uint8Array;
  publicKeyB64: string;
}

const makeParty = async (didSuffix: string): Promise<Party> => {
  const kp = await ed.generateKeyPair();
  return {
    did: `did:key:test-${didSuffix}`,
    privateKey: kp.privateKey,
    publicKeyB64: toBase64(kp.publicKey),
  };
};

const signProposal = async (
  party: Party,
  partial: {
    proposalId: string;
    amount?: number;
    scores?: Record<string, number>;
    proposedAt: string;
  },
): Promise<{ signature: string }> => {
  const canonical: Record<string, unknown> = {
    proposalId: partial.proposalId,
    fromDid: party.did,
    proposedAt: partial.proposedAt,
    ...(partial.amount !== undefined ? { amount: partial.amount } : {}),
    ...(partial.scores !== undefined ? { scores: partial.scores } : {}),
  };
  const sig = await ed.sign(canonicalizeBytes(canonical), party.privateKey);
  return { signature: toBase64(sig) };
};

const signSettlement = async (
  party: Party,
  payload: { negotiationId: string; winningProposalId: string },
): Promise<string> => {
  const sig = await ed.sign(canonicalizeBytes(payload), party.privateKey);
  return toBase64(sig);
};

describe('REST /v1/negotiation/*', () => {
  let app: FastifyInstance;
  let logger: Logger;
  let store: InMemoryEventStore;
  let alice: Party;
  let bob: Party;

  beforeEach(async () => {
    store = new InMemoryEventStore();
    const service = new NegotiationService(store, {
      maxProposalsPerNegotiation: 200,
      maxParties: 16,
      defaultDeadlineHours: 24,
    });
    logger = createLogger({ serviceName: 'negotiation-test', level: 'silent' });
    app = await buildApp({
      logger,
      dbClient: fakeDbClient(),
      negotiation: service,
    });
    await app.ready();
    alice = await makeParty('alice');
    bob = await makeParty('bob');
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /healthz returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz returns 200 when Postgres is healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready', checks: { database: 'ok' } });
  });

  it('GET /metrics exposes Prometheus metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/^# HELP/m);
  });

  it('runs a full ascending-auction lifecycle: start → 2 proposals → counter → settle', async () => {
    // 1. start
    const idempotencyKey = uuidv4();
    const start = await app.inject({
      method: 'POST',
      url: '/v1/negotiation',
      payload: {
        terms: {
          subject: 'data-extraction-job',
          strategy: 'ascending-auction',
          constraints: {},
          partyDids: [alice.did, bob.did],
          deadline: '2099-01-01T00:00:00.000Z',
          reservePrice: 100,
          currency: 'USDC',
        },
        createdBy: alice.did,
        idempotencyKey,
      },
    });
    expect(start.statusCode).toBe(201);
    const startBody = start.json<Envelope<NegotiationView>>();
    if (!startBody.ok) {
      throw new Error('expected ok envelope');
    }
    const negotiationId = startBody.data.negotiationId;

    // 2. propose (alice)
    const proposal1Id = uuidv4();
    const proposal1At = '2026-04-28T10:01:00.000Z';
    const sig1 = await signProposal(alice, {
      proposalId: proposal1Id,
      amount: 200,
      proposedAt: proposal1At,
    });
    const propose1 = await app.inject({
      method: 'POST',
      url: `/v1/negotiation/${negotiationId}/propose`,
      payload: {
        proposal: {
          proposalId: proposal1Id,
          fromDid: alice.did,
          amount: 200,
          signature: sig1.signature,
          proposedAt: proposal1At,
        },
        publicKey: alice.publicKeyB64,
      },
    });
    expect(propose1.statusCode).toBe(200);

    // 3. propose (bob, beats alice)
    const proposal2Id = uuidv4();
    const proposal2At = '2026-04-28T10:02:00.000Z';
    const sig2 = await signProposal(bob, {
      proposalId: proposal2Id,
      amount: 250,
      proposedAt: proposal2At,
    });
    const propose2 = await app.inject({
      method: 'POST',
      url: `/v1/negotiation/${negotiationId}/propose`,
      payload: {
        proposal: {
          proposalId: proposal2Id,
          fromDid: bob.did,
          amount: 250,
          signature: sig2.signature,
          proposedAt: proposal2At,
        },
        publicKey: bob.publicKeyB64,
      },
    });
    expect(propose2.statusCode).toBe(200);

    // 4. counter (alice counters bob's bid with a higher amount)
    const counterId = uuidv4();
    const counterAt = '2026-04-28T10:03:00.000Z';
    const counterSig = await signProposal(alice, {
      proposalId: counterId,
      amount: 300,
      proposedAt: counterAt,
    });
    const counter = await app.inject({
      method: 'POST',
      url: `/v1/negotiation/${negotiationId}/counter`,
      payload: {
        counterTo: proposal2Id,
        proposal: {
          proposalId: counterId,
          fromDid: alice.did,
          amount: 300,
          signature: counterSig.signature,
          proposedAt: counterAt,
        },
        publicKey: alice.publicKeyB64,
      },
    });
    expect(counter.statusCode).toBe(200);
    const counterBody = counter.json<Envelope<NegotiationView>>();
    if (!counterBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(counterBody.data.currentBestProposalId).toBe(counterId);

    // 5. settle — both parties sign over `{negotiationId, winningProposalId}`
    const aliceSettle = await signSettlement(alice, {
      negotiationId,
      winningProposalId: counterId,
    });
    const bobSettle = await signSettlement(bob, {
      negotiationId,
      winningProposalId: counterId,
    });
    const settle = await app.inject({
      method: 'POST',
      url: `/v1/negotiation/${negotiationId}/settle`,
      payload: {
        winningProposalId: counterId,
        signatures: [
          { did: alice.did, signature: aliceSettle },
          { did: bob.did, signature: bobSettle },
        ],
        publicKeys: [
          { did: alice.did, publicKey: alice.publicKeyB64 },
          { did: bob.did, publicKey: bob.publicKeyB64 },
        ],
      },
    });
    expect(settle.statusCode).toBe(200);
    const settleBody = settle.json<Envelope<NegotiationView>>();
    if (!settleBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(settleBody.data.status).toBe('settled');
    expect(settleBody.data.winningProposalId).toBe(counterId);
    expect(settleBody.data.settlementSignatures).toHaveLength(2);

    // 6. history endpoint
    const history = await app.inject({
      method: 'GET',
      url: `/v1/negotiation/${negotiationId}/history?limit=100`,
    });
    expect(history.statusCode).toBe(200);
    interface HistoryData {
      events: { seq: number; event: { type: string } }[];
      nextCursor: number | null;
    }
    const historyBody = history.json<Envelope<HistoryData>>();
    if (!historyBody.ok) {
      throw new Error('expected ok envelope');
    }
    expect(historyBody.data.events).toHaveLength(5); // started + 2 proposals + counter + settled
    expect(historyBody.data.events[0]?.event.type).toBe('negotiation.started');
  });

  it('returns 200 on idempotent replay of POST /v1/negotiation', async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      terms: {
        subject: 'idem-test',
        strategy: 'ascending-auction' as const,
        constraints: {},
        partyDids: [alice.did, bob.did],
        deadline: '2099-01-01T00:00:00.000Z',
        reservePrice: 100,
      },
      createdBy: alice.did,
      idempotencyKey,
    };
    const first = await app.inject({ method: 'POST', url: '/v1/negotiation', payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/v1/negotiation', payload });
    expect(second.statusCode).toBe(200);
  });

  it('rejects propose against an expired deadline', async () => {
    // start with a deadline in the past — `start` fails fast, so we have to
    // build the state directly via the in-memory store to test propose.
    const start = await app.inject({
      method: 'POST',
      url: '/v1/negotiation',
      payload: {
        terms: {
          subject: 'expiring',
          strategy: 'ascending-auction',
          constraints: {},
          partyDids: [alice.did, bob.did],
          deadline: '2099-01-01T00:00:00.000Z',
          reservePrice: 100,
        },
        createdBy: alice.did,
        idempotencyKey: uuidv4(),
      },
    });
    const startBody = start.json<Envelope<NegotiationView>>();
    if (!startBody.ok) {
      throw new Error('expected ok envelope');
    }
    const negotiationId = startBody.data.negotiationId;

    // Mutate the projection's expiresAt to a past date.
    const current = await store.getState(negotiationId);
    if (!current) {
      throw new Error('projection missing');
    }
    const expired = { ...current, expiresAt: '2020-01-01T00:00:00.000Z' };
    await store.append({
      negotiationId,
      idempotencyKey: 'force-expire',
      event: {
        type: 'negotiation.expired',
        negotiationId,
        at: '2020-01-01T00:00:00.000Z',
      },
      projection: { ...expired, status: 'expired' },
    });

    const proposalId = uuidv4();
    const proposalAt = new Date().toISOString();
    const sig = await signProposal(alice, {
      proposalId,
      amount: 200,
      proposedAt: proposalAt,
    });
    const propose = await app.inject({
      method: 'POST',
      url: `/v1/negotiation/${negotiationId}/propose`,
      payload: {
        proposal: {
          proposalId,
          fromDid: alice.did,
          amount: 200,
          signature: sig.signature,
          proposedAt: proposalAt,
        },
        publicKey: alice.publicKeyB64,
      },
    });
    expect(propose.statusCode).toBe(400);
  });

  it('returns 404 on GET /v1/negotiation/:id when not found', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/negotiation/${uuidv4()}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 on POST /v1/negotiation with an invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/negotiation',
      payload: { not: 'valid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a proposal with a tampered signature', async () => {
    const start = await app.inject({
      method: 'POST',
      url: '/v1/negotiation',
      payload: {
        terms: {
          subject: 'tamper-test',
          strategy: 'ascending-auction',
          constraints: {},
          partyDids: [alice.did, bob.did],
          deadline: '2099-01-01T00:00:00.000Z',
          reservePrice: 100,
        },
        createdBy: alice.did,
        idempotencyKey: uuidv4(),
      },
    });
    const startBody = start.json<Envelope<NegotiationView>>();
    if (!startBody.ok) {
      throw new Error('expected ok envelope');
    }
    const negotiationId = startBody.data.negotiationId;

    const proposalId = uuidv4();
    const proposalAt = '2026-04-28T10:01:00.000Z';
    const sig = await signProposal(alice, {
      proposalId,
      amount: 200,
      proposedAt: proposalAt,
    });
    // Tamper: change amount after signing.
    const propose = await app.inject({
      method: 'POST',
      url: `/v1/negotiation/${negotiationId}/propose`,
      payload: {
        proposal: {
          proposalId,
          fromDid: alice.did,
          amount: 999, // mismatched with what was signed
          signature: sig.signature,
          proposedAt: proposalAt,
        },
        publicKey: alice.publicKeyB64,
      },
    });
    expect(propose.statusCode).toBe(400);
  });
});
