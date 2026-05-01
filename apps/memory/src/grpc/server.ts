import { fileURLToPath } from 'node:url';

import { ERROR_CODES, ColberError } from '@colber/core-types';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

import type { MemoryService, MemoryType } from '../domain/memory-service.js';
import type { Visibility } from '../domain/permissions.js';
import type { Logger } from '@colber/core-logger';

const PROTO_PATH = fileURLToPath(new URL('../../proto/memory.proto', import.meta.url));

interface PermissionsMsg {
  visibility: string;
  shared_with?: string[];
}
interface EncryptionMsg {
  enabled: boolean;
  algorithm?: string;
  key_id?: string;
}

interface StoreReq {
  owner_did: string;
  type: string;
  text: string;
  payload_json?: string;
  permissions: PermissionsMsg;
  encryption?: EncryptionMsg;
}
interface RetrieveReq {
  query_did: string;
  query_text: string;
  top_k?: number;
  filters?: { type?: string; owner_did?: string; visibility?: string };
}
interface UpdateReq {
  id: string;
  caller_did: string;
  text?: string;
  payload_json?: string;
}
interface ShareReq {
  id: string;
  caller_did: string;
  share_with: string[];
  expires_at?: string;
}
interface GetReq {
  id: string;
  caller_did: string;
}

interface MemoryGrpcService extends grpc.UntypedServiceImplementation {
  Store: grpc.handleUnaryCall<StoreReq, unknown>;
  Retrieve: grpc.handleUnaryCall<RetrieveReq, unknown>;
  Update: grpc.handleUnaryCall<UpdateReq, unknown>;
  Share: grpc.handleUnaryCall<ShareReq, unknown>;
  Get: grpc.handleUnaryCall<GetReq, unknown>;
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

const parsePayloadJson = (raw: string | undefined): Record<string, unknown> | undefined => {
  if (!raw || raw.length === 0) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'payload_json must be a JSON object', 400);
  } catch (cause) {
    if (cause instanceof ColberError) {
      throw cause;
    }
    throw new ColberError(
      ERROR_CODES.VALIDATION_FAILED,
      `payload_json must be valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      400,
    );
  }
};

const isMemoryType = (v: string): v is MemoryType =>
  v === 'fact' || v === 'event' || v === 'preference' || v === 'relation';

const isVisibility = (v: string): v is Visibility =>
  v === 'private' || v === 'operator' || v === 'shared' || v === 'public';

const requireVisibility = (v: string): Visibility => {
  if (!isVisibility(v)) {
    throw new ColberError(ERROR_CODES.VALIDATION_FAILED, `unknown visibility: ${v}`, 400);
  }
  return v;
};

const requireMemoryType = (v: string): MemoryType => {
  if (!isMemoryType(v)) {
    throw new ColberError(ERROR_CODES.VALIDATION_FAILED, `unknown memory type: ${v}`, 400);
  }
  return v;
};

export interface GrpcServerHandle {
  start(host: string, port: number): Promise<number>;
  stop(): Promise<void>;
}

export const buildGrpcServer = (service: MemoryService, logger: Logger): GrpcServerHandle => {
  const server = new grpc.Server();

  const handlers: MemoryGrpcService = {
    Store: (call, callback) => {
      const req = call.request;
      try {
        const payload = parsePayloadJson(req.payload_json);
        const sharedWith = req.permissions.shared_with ?? [];
        const visibility = requireVisibility(req.permissions.visibility);
        const type = requireMemoryType(req.type);
        service
          .store({
            ownerDid: req.owner_did,
            type,
            text: req.text,
            ...(payload !== undefined ? { payload } : {}),
            permissions: {
              visibility,
              ...(sharedWith.length > 0 ? { sharedWith } : {}),
            },
            ...(req.encryption ? { encryption: { enabled: req.encryption.enabled } } : {}),
          })
          .then((res) => {
            callback(null, {
              id: res.id,
              embedding: { model: res.embedding.model, dim: res.embedding.dim },
            });
          })
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Retrieve: (call, callback) => {
      const req = call.request;
      const topK = req.top_k && req.top_k > 0 ? req.top_k : 10;
      try {
        const filters = req.filters
          ? {
              ...(req.filters.type && req.filters.type.length > 0
                ? { type: requireMemoryType(req.filters.type) }
                : {}),
              ...(req.filters.owner_did && req.filters.owner_did.length > 0
                ? { ownerDid: req.filters.owner_did }
                : {}),
              ...(req.filters.visibility && req.filters.visibility.length > 0
                ? { visibility: requireVisibility(req.filters.visibility) }
                : {}),
            }
          : undefined;
        service
          .retrieve({
            queryDid: req.query_did,
            queryText: req.query_text,
            topK,
            ...(filters !== undefined ? { filters } : {}),
          })
          .then((hits) =>
            callback(null, {
              hits: hits.map((h) => ({
                id: h.id,
                owner_did: h.ownerDid,
                type: h.type,
                snippet: h.snippet,
                score: h.score,
              })),
            }),
          )
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Update: (call, callback) => {
      const req = call.request;
      try {
        const payload = parsePayloadJson(req.payload_json);
        const text = req.text && req.text.length > 0 ? req.text : undefined;
        service
          .update({
            id: req.id,
            callerDid: req.caller_did,
            ...(text !== undefined ? { text } : {}),
            ...(payload !== undefined ? { payload } : {}),
          })
          .then((res) =>
            callback(null, {
              id: res.id,
              version: res.version,
              embedding: { model: res.embedding.model, dim: res.embedding.dim },
            }),
          )
          .catch((err: unknown) => callback(toGrpcError(err)));
      } catch (err) {
        callback(toGrpcError(err));
      }
    },

    Share: (call, callback) => {
      const req = call.request;
      const expiresAt = req.expires_at && req.expires_at.length > 0 ? req.expires_at : undefined;
      service
        .share({
          id: req.id,
          callerDid: req.caller_did,
          shareWith: req.share_with,
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        })
        .then((res) => callback(null, { id: res.id, shared_with: [...res.sharedWith] }))
        .catch((err: unknown) => callback(toGrpcError(err)));
    },

    Get: (call, callback) => {
      service
        .get(call.request.id, call.request.caller_did)
        .then((rec) =>
          callback(null, {
            id: rec.id,
            owner_did: rec.ownerDid,
            type: rec.type,
            text: rec.text,
            payload_json: JSON.stringify(rec.payload),
            permissions: {
              visibility: rec.permissions.visibility,
              shared_with: [...rec.permissions.sharedWith],
            },
            encryption: {
              enabled: rec.encryption.enabled,
              algorithm: rec.encryption.algorithm,
              key_id: rec.encryption.keyId,
            },
            created_at: rec.createdAt.toISOString(),
            updated_at: rec.updatedAt.toISOString(),
            version: rec.version,
            embedding: { model: rec.embedding.model, dim: rec.embedding.dim },
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
        colber: { memory: { v1: { MemoryService: { service: grpc.ServiceDefinition } } } };
      };
      server.addService(proto.colber.memory.v1.MemoryService.service, handlers);

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
