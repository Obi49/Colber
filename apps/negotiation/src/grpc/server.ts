import { fileURLToPath } from 'node:url';

import { ERROR_CODES, ColberError } from '@colber/core-types';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

import {
  CounterRequestSchema,
  ProposeRequestSchema,
  SettleRequestSchema,
  StartNegotiationRequestSchema,
} from '../domain/validation.js';
import { stateToView } from '../http/views.js';

import type { NegotiationService } from '../domain/negotiation-service.js';
import type { NegotiationView } from '../http/views.js';
import type { Logger } from '@colber/core-logger';

const PROTO_PATH = fileURLToPath(new URL('../../proto/negotiation.proto', import.meta.url));

interface StartReq {
  terms_json: string;
  created_by: string;
  idempotency_key: string;
}
interface ProposeReq {
  negotiation_id: string;
  proposal_json: string;
  public_key: string;
}
interface CounterReq {
  negotiation_id: string;
  counter_to: string;
  proposal_json: string;
  public_key: string;
}
interface SettleSigMsg {
  did: string;
  signature: string;
}
interface SettlePkMsg {
  did: string;
  public_key: string;
}
interface SettleReq {
  negotiation_id: string;
  winning_proposal_id?: string;
  signatures?: SettleSigMsg[];
  public_keys?: SettlePkMsg[];
}
interface GetReq {
  negotiation_id: string;
}
interface HistoryReq {
  negotiation_id: string;
  cursor?: number;
  limit?: number;
}

interface NegotiationGrpcService extends grpc.UntypedServiceImplementation {
  Start: grpc.handleUnaryCall<StartReq, unknown>;
  Propose: grpc.handleUnaryCall<ProposeReq, unknown>;
  Counter: grpc.handleUnaryCall<CounterReq, unknown>;
  Settle: grpc.handleUnaryCall<SettleReq, unknown>;
  Get: grpc.handleUnaryCall<GetReq, unknown>;
  History: grpc.handleUnaryCall<HistoryReq, unknown>;
}

const toGrpcError = (err: unknown): grpc.ServiceError => {
  if (err instanceof ColberError) {
    const code =
      err.statusCode === 404
        ? grpc.status.NOT_FOUND
        : err.statusCode === 409
          ? grpc.status.ALREADY_EXISTS
          : err.statusCode === 403
            ? grpc.status.PERMISSION_DENIED
            : err.statusCode === 410
              ? grpc.status.FAILED_PRECONDITION
              : err.statusCode >= 400 && err.statusCode < 500
                ? grpc.status.INVALID_ARGUMENT
                : grpc.status.INTERNAL;
    return Object.assign(new Error(err.message), {
      code,
      details: err.code,
      metadata: new grpc.Metadata(),
      name: 'ServiceError',
    });
  }
  return Object.assign(new Error('Internal error'), {
    code: grpc.status.INTERNAL,
    details: ERROR_CODES.INTERNAL_ERROR,
    metadata: new grpc.Metadata(),
    name: 'ServiceError',
  });
};

const parseJsonOrThrow = <T>(raw: string, label: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new ColberError(
      ERROR_CODES.VALIDATION_FAILED,
      `${label} must be valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      400,
    );
  }
};

const viewToProto = (view: NegotiationView): Record<string, unknown> => ({
  negotiation_id: view.negotiationId,
  status: view.status,
  strategy: view.strategy,
  terms_json: JSON.stringify(view.terms),
  party_dids: view.partyDids,
  proposals_json: JSON.stringify(view.proposals),
  current_best_proposal_id: view.currentBestProposalId ?? '',
  winning_proposal_id: view.winningProposalId ?? '',
  settlement_signatures_json: JSON.stringify(view.settlementSignatures ?? []),
  created_at: view.createdAt,
  updated_at: view.updatedAt,
  expires_at: view.expiresAt,
});

export interface GrpcServerHandle {
  start(host: string, port: number): Promise<number>;
  stop(): Promise<void>;
}

export const buildGrpcServer = (service: NegotiationService, logger: Logger): GrpcServerHandle => {
  const server = new grpc.Server();

  const handlers: NegotiationGrpcService = {
    Start: (call, callback) => {
      try {
        const r = call.request;
        const terms = parseJsonOrThrow<unknown>(r.terms_json, 'terms_json');
        const validated = StartNegotiationRequestSchema.parse({
          terms,
          createdBy: r.created_by,
          idempotencyKey: r.idempotency_key,
        });
        service
          .start({
            terms: validated.terms,
            createdBy: validated.createdBy,
            idempotencyKey: validated.idempotencyKey,
          })
          .then((res) => callback(null, viewToProto(stateToView(res.state))))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Propose: (call, callback) => {
      try {
        const r = call.request;
        const proposal = parseJsonOrThrow<unknown>(r.proposal_json, 'proposal_json');
        const validated = ProposeRequestSchema.parse({ proposal, publicKey: r.public_key });
        service
          .propose({
            negotiationId: r.negotiation_id,
            proposal: validated.proposal,
            publicKey: validated.publicKey,
          })
          .then((state) => callback(null, viewToProto(stateToView(state))))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Counter: (call, callback) => {
      try {
        const r = call.request;
        const proposal = parseJsonOrThrow<unknown>(r.proposal_json, 'proposal_json');
        const validated = CounterRequestSchema.parse({
          counterTo: r.counter_to,
          proposal,
          publicKey: r.public_key,
        });
        service
          .counter({
            negotiationId: r.negotiation_id,
            counterTo: validated.counterTo,
            proposal: validated.proposal,
            publicKey: validated.publicKey,
          })
          .then((state) => callback(null, viewToProto(stateToView(state))))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Settle: (call, callback) => {
      try {
        const r = call.request;
        const validated = SettleRequestSchema.parse({
          ...(r.winning_proposal_id && r.winning_proposal_id.length > 0
            ? { winningProposalId: r.winning_proposal_id }
            : {}),
          signatures: (r.signatures ?? []).map((s) => ({ did: s.did, signature: s.signature })),
          publicKeys: (r.public_keys ?? []).map((p) => ({
            did: p.did,
            publicKey: p.public_key,
          })),
        });
        const publicKeys = new Map<string, string>();
        for (const entry of validated.publicKeys) {
          publicKeys.set(entry.did, entry.publicKey);
        }
        service
          .settle({
            negotiationId: r.negotiation_id,
            ...(validated.winningProposalId !== undefined
              ? { winningProposalId: validated.winningProposalId }
              : {}),
            signatures: validated.signatures.map((s) => ({
              did: s.did,
              signature: s.signature,
            })),
            publicKeys,
          })
          .then((state) => callback(null, viewToProto(stateToView(state))))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Get: (call, callback) => {
      service
        .getState(call.request.negotiation_id)
        .then((state) => callback(null, viewToProto(stateToView(state))))
        .catch((err: unknown) => callback(toGrpcError(err)));
    },

    History: (call, callback) => {
      const cursor = call.request.cursor ?? 0;
      const limit = call.request.limit ?? 100;
      service
        .history(call.request.negotiation_id, cursor === 0 ? null : cursor, limit)
        .then((page) =>
          callback(null, {
            events: page.events.map((e) => ({
              seq: e.seq,
              event_json: JSON.stringify(e.event),
            })),
            next_cursor: page.nextCursor ?? 0,
          }),
        )
        .catch((err: unknown) => callback(toGrpcError(err)));
    },
  };

  return {
    async start(host, port) {
      const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      const proto = grpc.loadPackageDefinition(packageDef) as unknown as {
        colber: {
          negotiation: { v1: { NegotiationService: { service: grpc.ServiceDefinition } } };
        };
      };
      server.addService(proto.colber.negotiation.v1.NegotiationService.service, handlers);

      return new Promise<number>((resolve, reject) => {
        server.bindAsync(
          `${host}:${port}`,
          grpc.ServerCredentials.createInsecure(),
          (err, boundPort) => {
            if (err) {
              reject(err);
              return;
            }
            logger.info({ host, port: boundPort }, 'gRPC server listening');
            resolve(boundPort);
          },
        );
      });
    },
    async stop() {
      await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
    },
  };
};
