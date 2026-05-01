/**
 * Tiny shared helpers for the MCP tool test suites.
 */

import { createLogger } from '@colber/core-logger';

import { ToolRegistry } from '../src/tools/registry.js';

import type { McpToolHandlerContext } from '../src/tools/registry.js';

/** A logger that writes nowhere (silent). Uses pino under the hood via core-logger. */
export const silentLogger = (): McpToolHandlerContext['logger'] =>
  createLogger({ serviceName: 'colber-mcp-test', level: 'silent' });

export const newCtx = (): McpToolHandlerContext => ({ logger: silentLogger() });

export const newRegistry = (): ToolRegistry => new ToolRegistry();

/**
 * Extract the first text content from an MCP tool result and JSON-parse it.
 * Throws if the result is an `isError` shape.
 */
export const parseOk = (result: {
  readonly content: readonly { readonly text: string }[];
  readonly isError?: boolean;
}): unknown => {
  if (result.isError === true) {
    throw new Error(`expected success, got error: ${result.content[0]?.text ?? 'no body'}`);
  }
  const text = result.content[0]?.text;
  if (text === undefined) {
    throw new Error('result has no content');
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** Same shape, but for `isError: true` results. Returns the parsed payload. */
export const parseError = (result: {
  readonly content: readonly { readonly text: string }[];
  readonly isError?: boolean;
}): { readonly tool: string; readonly code: string; readonly message: string } => {
  if (result.isError !== true) {
    throw new Error(`expected error, got success: ${result.content[0]?.text ?? ''}`);
  }
  const text = result.content[0]?.text ?? '{}';
  return JSON.parse(text) as { tool: string; code: string; message: string };
};
