import { type z, type ZodSchema } from 'zod';

/**
 * Description of an MCP tool exposed by a Colber service.
 */
export interface McpToolDefinition<I, O> {
  /** Tool name, formatted `<module>.<verb>` (e.g. `identity.register`). */
  readonly name: string;
  /** Semver of the tool contract. Bump on any breaking input/output change. */
  readonly version: string;
  /** Human-readable description shown to LLM clients. */
  readonly description: string;
  /** Zod schema validating the tool input. */
  readonly inputSchema: ZodSchema<I>;
  /** Zod schema validating the tool output. */
  readonly outputSchema: ZodSchema<O>;
  /** The actual implementation. Receives validated input. */
  readonly handler: (input: I, ctx: McpToolContext) => Promise<O>;
}

/**
 * Per-invocation context handed to the tool handler.
 * Services extend this via module augmentation if they need extra fields.
 */
export interface McpToolContext {
  /** Correlation id (mirrors HTTP `traceparent` / `x-request-id`). */
  readonly traceId: string;
}

/** Convenience type helpers for inferring I/O from a definition. */
export type InferToolInput<T> = T extends McpToolDefinition<infer I, infer _O> ? I : never;
export type InferToolOutput<T> = T extends McpToolDefinition<infer _I, infer O> ? O : never;

/** Helper to build a tool with full type inference. */
export const defineMcpTool = <I, O>(def: McpToolDefinition<I, O>): McpToolDefinition<I, O> => def;

/** Re-export Zod for convenience at the call site. */
export type { z };
