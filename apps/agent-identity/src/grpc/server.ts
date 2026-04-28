import { fileURLToPath } from 'node:url';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

import { ERROR_CODES, PraxisError } from '@praxis/core-types';
import type { Logger } from '@praxis/core-logger';

import type { IdentityService } from '../domain/identity-service.js';

const PROTO_PATH = fileURLToPath(new URL('../../proto/identity.proto', import.meta.url));

interface RegisterReq {
  public_key: string;
  owner_operator_id: string;
}
interface ResolveReq {
  did: string;
}
interface VerifyReq {
  did: string;
  message: string;
  signature: string;
}

interface IdentityGrpcService {
  Register: grpc.handleUnaryCall<RegisterReq, unknown>;
  Resolve: grpc.handleUnaryCall<ResolveReq, unknown>;
  Verify: grpc.handleUnaryCall<VerifyReq, unknown>;
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
    }) as grpc.ServiceError;
  }
  return Object.assign(new Error('Internal error'), {
    code: grpc.status.INTERNAL,
    details: ERROR_CODES.INTERNAL_ERROR,
    metadata: new grpc.Metadata(),
    name: 'ServiceError',
  }) as grpc.ServiceError;
};

export interface GrpcServerHandle {
  start(host: string, port: number): Promise<number>;
  stop(): Promise<void>;
}

/**
 * Builds (but does not start) the gRPC server. The transport is wired,
 * but the actual proto file is loaded lazily on `start()` to keep test
 * boot fast.
 */
export const buildGrpcServer = (
  service: IdentityService,
  logger: Logger,
): GrpcServerHandle => {
  const server = new grpc.Server();

  const handlers: IdentityGrpcService = {
    Register: (call, callback) => {
      service
        .register({
          publicKeyBase64: call.request.public_key,
          ownerOperatorId: call.request.owner_operator_id,
        })
        .then((id) =>
          callback(null, {
            did: id.did,
            agent_id: id.agentId,
            registered_at: id.registeredAt,
          }),
        )
        .catch((err: unknown) => callback(toGrpcError(err)));
    },
    Resolve: (call, callback) => {
      service
        .resolve(call.request.did)
        .then((id) =>
          callback(null, {
            did: id.did,
            agent_id: id.agentId,
            public_key: id.publicKey,
            signature_scheme: id.signatureScheme,
            owner_operator_id: id.ownerOperatorId,
            registered_at: id.registeredAt,
            revoked_at: id.revokedAt ?? '',
          }),
        )
        .catch((err: unknown) => callback(toGrpcError(err)));
    },
    Verify: (call, callback) => {
      service
        .verify({
          did: call.request.did,
          messageBase64: call.request.message,
          signatureBase64: call.request.signature,
        })
        .then((res) => callback(null, { valid: res.valid, reason: res.reason ?? '' }))
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
        praxis: { identity: { v1: { IdentityService: { service: grpc.ServiceDefinition } } } };
      };
      server.addService(proto.praxis.identity.v1.IdentityService.service, handlers);

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
