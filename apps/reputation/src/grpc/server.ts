import { fileURLToPath } from 'node:url';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ERROR_CODES, PraxisError } from '@praxis/core-types';

import type { ReputationService } from '../domain/reputation-service.js';
import type { Logger } from '@praxis/core-logger';

const PROTO_PATH = fileURLToPath(new URL('../../proto/reputation.proto', import.meta.url));

interface ScoreReq {
  agent_did: string;
}
interface HistoryReq {
  agent_did: string;
  limit?: number;
  cursor?: string;
}
interface VerifyReq {
  score: {
    did: string;
    score: number;
    score_version: string;
    computed_at: string;
  };
  attestation: string;
}
interface FeedbackReq {
  feedback_id: string;
  from_did: string;
  to_did: string;
  tx_id: string;
  rating: number;
  dimensions: { delivery: number; quality: number; communication: number };
  comment?: string;
  signed_at: string;
  signature: string;
}

interface ReputationGrpcService extends grpc.UntypedServiceImplementation {
  Score: grpc.handleUnaryCall<ScoreReq, unknown>;
  History: grpc.handleUnaryCall<HistoryReq, unknown>;
  Verify: grpc.handleUnaryCall<VerifyReq, unknown>;
  Feedback: grpc.handleUnaryCall<FeedbackReq, unknown>;
}

const toGrpcError = (err: unknown): grpc.ServiceError => {
  if (err instanceof PraxisError) {
    const code =
      err.statusCode === 404
        ? grpc.status.NOT_FOUND
        : err.statusCode === 409
          ? grpc.status.ALREADY_EXISTS
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

export interface GrpcServerHandle {
  start(host: string, port: number): Promise<number>;
  stop(): Promise<void>;
}

export const buildGrpcServer = (service: ReputationService, logger: Logger): GrpcServerHandle => {
  const server = new grpc.Server();

  const handlers: ReputationGrpcService = {
    Score: (call, callback) => {
      service
        .getScore(call.request.agent_did)
        .then((env) =>
          callback(null, {
            did: env.did,
            score: env.score,
            score_version: env.scoreVersion,
            computed_at: env.computedAt,
            attestation: env.attestation,
          }),
        )
        .catch((err: unknown) => callback(toGrpcError(err)));
    },
    History: (call, callback) => {
      const limit = call.request.limit && call.request.limit > 0 ? call.request.limit : 50;
      const cursor =
        call.request.cursor && call.request.cursor.length > 0 ? call.request.cursor : null;
      service
        .getHistory(call.request.agent_did, { limit, cursor })
        .then((page) =>
          callback(null, {
            did: call.request.agent_did,
            transactions: page.transactions.map((t) => ({
              tx_id: t.txId,
              counterparty_did: t.counterpartyDid,
              role: t.role,
              amount: t.amount,
              currency: t.currency,
              status: t.status,
              completed_at: t.completedAt.toISOString(),
            })),
            feedbacks_received: page.feedbacksReceived.map((f) => ({
              feedback_id: f.feedbackId,
              from_did: f.fromDid,
              tx_id: f.txId,
              rating: f.rating,
              signed_at: f.signedAt.toISOString(),
              comment: f.comment ?? '',
            })),
            feedbacks_issued: page.feedbacksIssued.map((f) => ({
              feedback_id: f.feedbackId,
              from_did: f.fromDid,
              to_did: f.toDid,
              tx_id: f.txId,
              rating: f.rating,
              signed_at: f.signedAt.toISOString(),
              comment: f.comment ?? '',
            })),
            next_cursor: page.nextCursor ?? '',
          }),
        )
        .catch((err: unknown) => callback(toGrpcError(err)));
    },
    Verify: (call, callback) => {
      service
        .verify({
          did: call.request.score.did,
          score: call.request.score.score,
          scoreVersion: call.request.score.score_version,
          computedAt: call.request.score.computed_at,
          attestation: call.request.attestation,
        })
        .then((res) => callback(null, { valid: res.valid, reason: res.reason ?? '' }))
        .catch((err: unknown) => callback(toGrpcError(err)));
    },
    Feedback: (call, callback) => {
      const req = call.request;
      service
        .submitFeedback({
          feedbackId: req.feedback_id,
          fromDid: req.from_did,
          toDid: req.to_did,
          txId: req.tx_id,
          rating: req.rating,
          dimensions: req.dimensions,
          ...(req.comment && req.comment.length > 0 ? { comment: req.comment } : {}),
          signedAt: req.signed_at,
          signature: req.signature,
        })
        .then((res) =>
          callback(null, {
            accepted: res.accepted,
            idempotent: res.idempotent,
            feedback_id: res.feedbackId,
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
        praxis: { reputation: { v1: { ReputationService: { service: grpc.ServiceDefinition } } } };
      };
      server.addService(proto.praxis.reputation.v1.ReputationService.service, handlers);

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
