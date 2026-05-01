/**
 * Internal tool registry used by `@colber/mcp`.
 *
 * Each Colber module (identity, reputation, …) registers its tools onto a
 * single `ToolRegistry` instance. The registry stores zod input schemas
 * plus async handlers; the transport layer (stdio / http) wires the
 * registry into the MCP `Server` via `setRequestHandler(...)` for the
 * `tools/list` and `tools/call` requests.
 *
 * Why a thin in-house registry instead of `@colber/core-mcp` ? The internal
 * package targets per-service in-process registration; here we need to map
 * to the wire-level MCP `tools/list` / `tools/call` shape, validate input
 * with zod, and surface errors as `isError: true` content. Lighter to do it
 * in one place than to bridge two registries.
 */

import { toMcpErrorResult } from '../errors.js';

import type { Logger } from '../logger.js';
import type { ZodSchema, ZodTypeAny } from 'zod';

export interface McpToolHandlerContext {
  readonly logger: Logger;
}

export interface McpToolDefinition<TInput> {
  /** Tool name, prefixed `colber_<module>_<verb>`. */
  readonly name: string;
  /** Human-readable description shown to LLM clients. */
  readonly description: string;
  /** Zod schema validating the tool input. */
  readonly inputSchema: ZodSchema<TInput>;
  /** The actual implementation. Receives validated input. */
  readonly handler: (input: TInput, ctx: McpToolHandlerContext) => Promise<unknown>;
}

export interface McpContent {
  readonly type: 'text';
  readonly text: string;
}

export interface McpCallToolResult {
  readonly content: readonly McpContent[];
  readonly isError?: boolean;
}

export interface McpToolListing {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/**
 * Stub `zodToJsonSchema` — minimal, dependency-free conversion sufficient
 * for what the MCP `tools/list` response needs (the LLM client consumes
 * it as a JSON Schema for prompt construction). It walks the zod tree
 * and emits `type`/`properties`/`required`/`items`/`enum`. For exotic
 * shapes (unions, intersections, refines) we fall back to a permissive
 * `{ type: 'object' }`.
 *
 * In production we'd pull `zod-to-json-schema` from npm; this lightweight
 * implementation keeps the MCP package's dependency surface tight.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call --
 * zod's introspection API (`_def`, `.shape`, `.isOptional`) isn't typed. Opt out for this fn. */
export const zodToJsonSchema = (schema: ZodTypeAny): Record<string, unknown> => {
  // Defer to a (very) small recursive walker. zod doesn't give us a stable
  // public introspection API, so we read `_def` carefully.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def as { typeName?: string };
  switch (def.typeName) {
    case 'ZodObject': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shape = (schema as any).shape as Record<string, ZodTypeAny>;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(value as any).isOptional?.()) {
          required.push(key);
        }
      }
      return required.length > 0
        ? { type: 'object', properties, required }
        : { type: 'object', properties };
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (schema as any)._def.type as ZodTypeAny;
      return { type: 'array', items: zodToJsonSchema(inner) };
    }
    case 'ZodEnum': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = (schema as any)._def.values as readonly string[];
      return { type: 'string', enum: [...values] };
    }
    case 'ZodOptional':
    case 'ZodDefault':
    case 'ZodNullable': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (schema as any)._def.innerType as ZodTypeAny;
      return zodToJsonSchema(inner);
    }
    case 'ZodEffects': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (schema as any)._def.schema as ZodTypeAny;
      return zodToJsonSchema(inner);
    }
    case 'ZodRecord':
      return { type: 'object', additionalProperties: true };
    case 'ZodLiteral': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (schema as any)._def.value as unknown;
      return { type: typeof value, enum: [value] };
    }
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
    case 'ZodIntersection':
      // Unions/intersections are too complex to render safely without the
      // full zod-to-json-schema lib; emit a permissive shape that still
      // preserves the LLM-friendly description on the MCP tool itself.
      return { type: 'object', additionalProperties: true };
    default:
      return { type: 'object' };
  }
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

export class ToolRegistry {
  private readonly tools = new Map<string, McpToolDefinition<unknown>>();

  public register<TInput>(def: McpToolDefinition<TInput>): void {
    if (this.tools.has(def.name)) {
      throw new Error(`MCP tool already registered: ${def.name}`);
    }
    this.tools.set(def.name, def as McpToolDefinition<unknown>);
  }

  public list(): readonly McpToolListing[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    }));
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public size(): number {
    return this.tools.size;
  }

  public names(): readonly string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Invoke a tool by name. Always returns an MCP-shaped `CallToolResult`,
   * never throws — errors are converted to `isError: true` content.
   */
  public async call(
    name: string,
    rawInput: unknown,
    ctx: McpToolHandlerContext,
  ): Promise<McpCallToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return toMcpErrorResult(new Error(`unknown tool: ${name}`), { toolName: name });
    }
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toMcpErrorResult(parsed.error, { toolName: name });
    }
    try {
      const output = await tool.handler(parsed.data, ctx);
      return {
        content: [
          {
            type: 'text',
            text: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
          },
        ],
      };
    } catch (err) {
      ctx.logger.error({ err, tool: name }, 'tool handler failed');
      return toMcpErrorResult(err, { toolName: name });
    }
  }
}
