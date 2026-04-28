import { fileURLToPath } from 'node:url';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ERROR_CODES, PraxisError } from '@praxis/core-types';

import {
  FileClaimRequestSchema,
  ListPoliciesQuerySchema,
  QuoteRequestSchema,
  SlaTermsSchema,
  SubscribeRequestSchema,
} from '../domain/validation.js';
import { policyViewToWire, quoteToView, claimToWire } from '../http/views.js';

import type { InsuranceService } from '../domain/insurance-service.js';
import type { ClaimWire, PolicyViewWire, QuoteWire } from '../http/views.js';
import type { Logger } from '@praxis/core-logger';

const PROTO_PATH = fileURLToPath(new URL('../../proto/insurance.proto', import.meta.url));

interface QuoteReq {
  subscriber_did: string;
  beneficiary_did: string;
  deal_subject: string;
  amount_usdc: number;
  sla_terms_json: string;
}
interface SubscribeReq extends QuoteReq {
  idempotency_key: string;
}
interface FileClaimReq {
  policy_id: string;
  claimant_did: string;
  reason: string;
  evidence_json: string;
  idempotency_key: string;
}
interface GetPolicyReq {
  policy_id: string;
}
interface ListPoliciesReq {
  subscriber_did: string;
  limit?: number;
  offset?: number;
}

interface InsuranceGrpcService extends grpc.UntypedServiceImplementation {
  Quote: grpc.handleUnaryCall<QuoteReq, unknown>;
  Subscribe: grpc.handleUnaryCall<SubscribeReq, unknown>;
  FileClaim: grpc.handleUnaryCall<FileClaimReq, unknown>;
  GetPolicy: grpc.handleUnaryCall<GetPolicyReq, unknown>;
  ListPolicies: grpc.handleUnaryCall<ListPoliciesReq, unknown>;
}

const toGrpcError = (err: unknown): grpc.ServiceError => {
  if (err instanceof PraxisError) {
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
    throw new PraxisError(
      ERROR_CODES.VALIDATION_FAILED,
      `${label} must be valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      400,
    );
  }
};

const quoteWireToProto = (q: QuoteWire): Record<string, unknown> => ({
  subscriber_did: q.subscriberDid,
  beneficiary_did: q.beneficiaryDid,
  deal_subject: q.dealSubject,
  amount_usdc: q.amountUsdc,
  premium_usdc: q.premiumUsdc,
  risk_multiplier: q.riskMultiplier,
  reputation_score: q.reputationScore,
  computed_at: q.computedAt,
  valid_until: q.validUntil,
});

const policyViewToProto = (v: PolicyViewWire): Record<string, unknown> => ({
  policy_id: v.policy.id,
  subscriber_did: v.policy.subscriberDid,
  beneficiary_did: v.policy.beneficiaryDid,
  deal_subject: v.policy.dealSubject,
  amount_usdc: v.policy.amountUsdc,
  premium_usdc: v.policy.premiumUsdc,
  risk_multiplier: v.policy.riskMultiplier,
  reputation_score: v.policy.reputationScore,
  sla_terms_json: JSON.stringify(v.policy.slaTerms),
  status: v.policy.status,
  created_at: v.policy.createdAt,
  expires_at: v.policy.expiresAt,
  escrow: {
    holding_id: v.escrow.id,
    policy_id: v.escrow.policyId,
    amount_usdc: v.escrow.amountUsdc,
    status: v.escrow.status,
    locked_at: v.escrow.lockedAt,
    released_at: v.escrow.releasedAt ?? '',
    claimed_at: v.escrow.claimedAt ?? '',
    refunded_at: v.escrow.refundedAt ?? '',
  },
  claims: v.claims.map(claimWireToProto),
});

const claimWireToProto = (c: ClaimWire): Record<string, unknown> => ({
  claim_id: c.id,
  policy_id: c.policyId,
  claimant_did: c.claimantDid,
  reason: c.reason,
  evidence_json: JSON.stringify(c.evidence),
  status: c.status,
  created_at: c.createdAt,
  decided_at: c.decidedAt ?? '',
  payout_usdc: c.payoutUsdc ?? 0,
});

export interface GrpcServerHandle {
  start(host: string, port: number): Promise<number>;
  stop(): Promise<void>;
}

export const buildGrpcServer = (service: InsuranceService, logger: Logger): GrpcServerHandle => {
  const server = new grpc.Server();

  const handlers: InsuranceGrpcService = {
    Quote: (call, callback) => {
      try {
        const r = call.request;
        const slaTerms = parseJsonOrThrow<unknown>(r.sla_terms_json, 'sla_terms_json');
        const validated = QuoteRequestSchema.parse({
          subscriberDid: r.subscriber_did,
          beneficiaryDid: r.beneficiary_did,
          dealSubject: r.deal_subject,
          amountUsdc: r.amount_usdc,
          slaTerms: SlaTermsSchema.parse(slaTerms),
        });
        service
          .quote(validated)
          .then((q) => callback(null, quoteWireToProto(quoteToView(q))))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Subscribe: (call, callback) => {
      try {
        const r = call.request;
        const slaTerms = parseJsonOrThrow<unknown>(r.sla_terms_json, 'sla_terms_json');
        const validated = SubscribeRequestSchema.parse({
          subscriberDid: r.subscriber_did,
          beneficiaryDid: r.beneficiary_did,
          dealSubject: r.deal_subject,
          amountUsdc: r.amount_usdc,
          slaTerms: SlaTermsSchema.parse(slaTerms),
          idempotencyKey: r.idempotency_key,
        });
        service
          .subscribe(validated)
          .then((res) => callback(null, policyViewToProto(policyViewToWire(res.view))))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    FileClaim: (call, callback) => {
      try {
        const r = call.request;
        const evidence = parseJsonOrThrow<unknown>(r.evidence_json, 'evidence_json');
        const validated = FileClaimRequestSchema.parse({
          policyId: r.policy_id,
          claimantDid: r.claimant_did,
          reason: r.reason,
          evidence,
          idempotencyKey: r.idempotency_key,
        });
        service
          .fileClaim(validated)
          .then((res) => callback(null, claimWireToProto(claimToWire(res.claim))))
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    GetPolicy: (call, callback) => {
      service
        .getPolicy(call.request.policy_id)
        .then((view) => callback(null, policyViewToProto(policyViewToWire(view))))
        .catch((err: unknown) => callback(toGrpcError(err)));
    },

    ListPolicies: (call, callback) => {
      try {
        const r = call.request;
        const validated = ListPoliciesQuerySchema.parse({
          subscriberDid: r.subscriber_did,
          limit: r.limit ?? 50,
          offset: r.offset ?? 0,
        });
        service
          .listPolicies(validated)
          .then((page) =>
            callback(null, {
              policies: page.policies.map((v) => policyViewToProto(policyViewToWire(v))),
              total: page.total,
            }),
          )
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
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
        praxis: {
          insurance: { v1: { InsuranceService: { service: grpc.ServiceDefinition } } };
        };
      };
      server.addService(proto.praxis.insurance.v1.InsuranceService.service, handlers);

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
