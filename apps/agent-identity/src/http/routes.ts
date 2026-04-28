import {
  RegisterRequestSchema,
  ResolveResponseSchema,
  VerifyRequestSchema,
  type RegisterResponse,
  type ResolveResponse,
  type VerifyResponse,
} from './schemas.js';

import type { IdentityService } from '../domain/identity-service.js';
import type { FastifyInstance } from 'fastify';

/**
 * Wires the three REST endpoints under `/v1/identity/*`.
 * Schema validation uses Zod via the standard `body`/`params` parsing.
 *
 * Note: response shapes mirror the Zod schemas in `./schemas.ts` so
 * OpenAPI generation (TODO) can use the same source of truth.
 */
export const registerIdentityRoutes = (app: FastifyInstance, service: IdentityService): void => {
  app.post('/v1/identity/register', async (req, reply) => {
    const body = RegisterRequestSchema.parse(req.body);
    const identity = await service.register({
      publicKeyBase64: body.publicKey,
      ownerOperatorId: body.ownerOperatorId,
    });
    const response: RegisterResponse = {
      did: identity.did,
      agentId: identity.agentId,
      registeredAt: identity.registeredAt,
    };
    return reply.code(201).send({ ok: true, data: response });
  });

  app.get<{ Params: { did: string } }>('/v1/identity/:did', async (req, reply) => {
    const did = decodeURIComponent(req.params.did);
    const identity = await service.resolve(did);
    const response: ResolveResponse = ResolveResponseSchema.parse(identity);
    return reply.code(200).send({ ok: true, data: response });
  });

  app.post('/v1/identity/verify', async (req, reply) => {
    const body = VerifyRequestSchema.parse(req.body);
    const result = await service.verify({
      did: body.did,
      messageBase64: body.message,
      signatureBase64: body.signature,
    });
    const response: VerifyResponse = result;
    return reply.code(200).send({ ok: true, data: response });
  });
};
