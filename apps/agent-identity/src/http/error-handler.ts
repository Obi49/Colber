import { ERROR_CODES, ColberError, type ApiError } from '@colber/core-types';
import { ZodError } from 'zod';

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Centralised error handler for the REST layer.
 * Maps domain errors to a stable wire format (`ApiError`) and an HTTP status.
 */
export const errorHandler = (err: FastifyError, req: FastifyRequest, reply: FastifyReply): void => {
  const traceId = req.id;

  if (err instanceof ColberError) {
    req.log.warn(
      { code: err.code, statusCode: err.statusCode, details: err.details, traceId },
      err.message,
    );
    const body: ApiError = {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
      traceId,
    };
    reply.code(err.statusCode).send({ ok: false, error: body });
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiError = {
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Request body failed validation',
      details: { issues: err.issues },
      traceId,
    };
    reply.code(400).send({ ok: false, error: body });
    return;
  }

  // Fastify built-in validation errors expose `validation` and a 400 statusCode.
  if (err.validation) {
    const body: ApiError = {
      code: ERROR_CODES.VALIDATION_FAILED,
      message: err.message,
      details: { validation: err.validation },
      traceId,
    };
    reply.code(err.statusCode ?? 400).send({ ok: false, error: body });
    return;
  }

  req.log.error({ err, traceId }, 'unhandled error');
  const body: ApiError = {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Internal server error',
    traceId,
  };
  reply.code(500).send({ ok: false, error: body });
};
