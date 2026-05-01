/**
 * Map SDK / handler errors to MCP `CallToolResult` error responses.
 *
 * The MCP spec for `tools/call` returns a structured result with an
 * `isError: true` flag plus a `content` array containing user-facing text.
 * We never throw out of a tool handler — every error is converted to that
 * shape so the LLM client can surface a clean message instead of a 500.
 *
 * Stack traces are NEVER included in the response. They go to the logger
 * via the `traceId` correlation id only.
 */

import {
  ColberApiError,
  ColberError,
  ColberNetworkError,
  ColberValidationError,
} from '@colber/sdk';
import { ZodError } from 'zod';

export interface McpToolErrorResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly isError: true;
}

export interface McpToolErrorContext {
  readonly toolName: string;
  readonly traceId?: string;
}

/**
 * Convert any thrown value to an MCP error result.
 * The returned object is safe to JSON-stringify and ship to the client.
 */
export const toMcpErrorResult = (err: unknown, ctx: McpToolErrorContext): McpToolErrorResult => {
  const payload = describeError(err, ctx);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
};

interface ErrorPayload {
  readonly tool: string;
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  readonly details?: unknown;
  readonly traceId?: string;
}

const describeError = (err: unknown, ctx: McpToolErrorContext): ErrorPayload => {
  if (err instanceof ColberApiError) {
    // ctx.traceId wins over err.traceId when both are set (caller knows the
    // request-level correlation id). Fall back to the SDK-supplied one.
    const traceId = ctx.traceId ?? err.traceId;
    return {
      tool: ctx.toolName,
      code: err.code,
      message: err.message,
      status: err.status,
      ...(err.details !== undefined ? { details: err.details } : {}),
      ...(traceId !== undefined ? { traceId } : {}),
    };
  }
  if (err instanceof ColberValidationError) {
    return {
      tool: ctx.toolName,
      code: 'VALIDATION_FAILED',
      message: err.message,
      ...(err.path !== undefined ? { details: { path: err.path } } : {}),
      ...(ctx.traceId !== undefined ? { traceId: ctx.traceId } : {}),
    };
  }
  if (err instanceof ColberNetworkError) {
    return {
      tool: ctx.toolName,
      code: err.code,
      message: err.message,
      ...(ctx.traceId !== undefined ? { traceId: ctx.traceId } : {}),
    };
  }
  if (err instanceof ZodError) {
    return {
      tool: ctx.toolName,
      code: 'VALIDATION_FAILED',
      message: 'Invalid tool input',
      details: { issues: err.issues },
      ...(ctx.traceId !== undefined ? { traceId: ctx.traceId } : {}),
    };
  }
  if (err instanceof ColberError) {
    return {
      tool: ctx.toolName,
      code: 'COLBER_ERROR',
      message: err.message,
      ...(ctx.traceId !== undefined ? { traceId: ctx.traceId } : {}),
    };
  }
  if (err instanceof Error) {
    return {
      tool: ctx.toolName,
      code: 'INTERNAL_ERROR',
      message: err.message,
      ...(ctx.traceId !== undefined ? { traceId: ctx.traceId } : {}),
    };
  }
  return {
    tool: ctx.toolName,
    code: 'INTERNAL_ERROR',
    message: typeof err === 'string' ? err : 'unknown error',
    ...(ctx.traceId !== undefined ? { traceId: ctx.traceId } : {}),
  };
};
