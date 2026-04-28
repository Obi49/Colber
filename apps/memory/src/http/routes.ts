import {
  GetMemoryParamsSchema,
  GetMemoryQuerySchema,
  MemoryRecordSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  ShareParamsSchema,
  ShareRequestSchema,
  ShareResponseSchema,
  StoreRequestSchema,
  StoreResponseSchema,
  UpdateParamsSchema,
  UpdateRequestSchema,
  UpdateResponseSchema,
  type MemoryRecord,
  type SearchResponse,
  type ShareResponse,
  type StoreResponse,
  type UpdateResponse,
} from './schemas.js';

import type { MemoryService } from '../domain/memory-service.js';
import type { FastifyInstance } from 'fastify';

/**
 * Wires the REST endpoints under `/v1/memory*`:
 *
 *   POST   /v1/memory                     → memory.store
 *   POST   /v1/memory/search              → memory.retrieve
 *   GET    /v1/memory/:id                 → fetch full record
 *   PATCH  /v1/memory/:id                 → memory.update
 *   POST   /v1/memory/:id/share           → memory.share
 *
 * All responses follow the `{ ok, data | error }` envelope from
 * `@praxis/core-types`.
 *
 * Auth is intentionally weak in v1 — the caller's DID is supplied via the
 * request body or query string. Production will replace this with a signed
 * request envelope (see `agent-identity` Sprint 2 spec).
 */
export const registerMemoryRoutes = (app: FastifyInstance, service: MemoryService): void => {
  // -----------------------------------------------------------------
  // POST /v1/memory  → memory.store
  // -----------------------------------------------------------------
  app.post('/v1/memory', async (req, reply) => {
    const body = StoreRequestSchema.parse(req.body);
    const result = await service.store({
      ownerDid: body.ownerDid,
      type: body.type,
      text: body.text,
      ...(body.payload !== undefined ? { payload: body.payload } : {}),
      permissions: {
        visibility: body.permissions.visibility,
        ...(body.permissions.sharedWith !== undefined
          ? { sharedWith: body.permissions.sharedWith }
          : {}),
      },
      ...(body.encryption !== undefined ? { encryption: body.encryption } : {}),
    });
    const response: StoreResponse = StoreResponseSchema.parse(result);
    return reply.code(201).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // POST /v1/memory/search  → memory.retrieve
  // -----------------------------------------------------------------
  app.post('/v1/memory/search', async (req, reply) => {
    const body = SearchRequestSchema.parse(req.body);
    const filters =
      body.filters !== undefined
        ? {
            ...(body.filters.type !== undefined ? { type: body.filters.type } : {}),
            ...(body.filters.ownerDid !== undefined ? { ownerDid: body.filters.ownerDid } : {}),
            ...(body.filters.visibility !== undefined
              ? { visibility: body.filters.visibility }
              : {}),
          }
        : undefined;
    const hits = await service.retrieve({
      queryDid: body.queryDid,
      queryText: body.queryText,
      topK: body.topK,
      ...(filters !== undefined ? { filters } : {}),
    });
    const response: SearchResponse = SearchResponseSchema.parse({ hits });
    return reply.code(200).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // GET /v1/memory/:id?callerDid=...
  // -----------------------------------------------------------------
  app.get<{ Params: { id: string }; Querystring: { callerDid?: string } }>(
    '/v1/memory/:id',
    async (req, reply) => {
      const { id } = GetMemoryParamsSchema.parse(req.params);
      const { callerDid } = GetMemoryQuerySchema.parse(req.query);
      const record = await service.get(id, callerDid);
      const response: MemoryRecord = MemoryRecordSchema.parse({
        id: record.id,
        ownerDid: record.ownerDid,
        type: record.type,
        text: record.text,
        payload: record.payload,
        permissions: {
          visibility: record.permissions.visibility,
          sharedWith: [...record.permissions.sharedWith],
        },
        encryption: record.encryption,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        version: record.version,
        embedding: record.embedding,
      });
      return reply.code(200).send({ ok: true, data: response });
    },
  );

  // -----------------------------------------------------------------
  // PATCH /v1/memory/:id  → memory.update
  // -----------------------------------------------------------------
  app.patch<{ Params: { id: string } }>('/v1/memory/:id', async (req, reply) => {
    const { id } = UpdateParamsSchema.parse(req.params);
    const body = UpdateRequestSchema.parse(req.body);
    const result = await service.update({
      id,
      callerDid: body.callerDid,
      ...(body.text !== undefined ? { text: body.text } : {}),
      ...(body.payload !== undefined ? { payload: body.payload } : {}),
    });
    const response: UpdateResponse = UpdateResponseSchema.parse(result);
    return reply.code(200).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // POST /v1/memory/:id/share  → memory.share
  // -----------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/v1/memory/:id/share', async (req, reply) => {
    const { id } = ShareParamsSchema.parse(req.params);
    const body = ShareRequestSchema.parse(req.body);
    const result = await service.share({
      id,
      callerDid: body.callerDid,
      shareWith: body.shareWith,
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
    });
    const response: ShareResponse = ShareResponseSchema.parse(result);
    return reply.code(200).send({ ok: true, data: response });
  });
};
