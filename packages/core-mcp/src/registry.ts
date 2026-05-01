import { ERROR_CODES, ColberError } from '@colber/core-types';

import type { McpToolContext, McpToolDefinition } from './tool.js';

/**
 * Simple in-memory MCP tool registry.
 * One instance per service. Registers + invokes tools with Zod-validated I/O.
 */
export class McpToolRegistry {
  private readonly tools = new Map<string, McpToolDefinition<unknown, unknown>>();

  public register<I, O>(def: McpToolDefinition<I, O>): void {
    if (this.tools.has(def.name)) {
      throw new Error(`MCP tool already registered: ${def.name}`);
    }
    this.tools.set(def.name, def as McpToolDefinition<unknown, unknown>);
  }

  public list(): readonly McpToolDefinition<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Invoke a tool by name with raw input. Validates input + output through
   * the tool's Zod schemas; throws `ColberError(VALIDATION_FAILED)` on
   * either side.
   */
  public async invoke(name: string, rawInput: unknown, ctx: McpToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ColberError(ERROR_CODES.NOT_FOUND, `MCP tool not found: ${name}`, 404, {
        tool: name,
      });
    }
    const inputResult = tool.inputSchema.safeParse(rawInput);
    if (!inputResult.success) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, `Invalid input for ${name}`, 400, {
        issues: inputResult.error.issues,
      });
    }

    const output = await tool.handler(inputResult.data, ctx);

    const outputResult = tool.outputSchema.safeParse(output);
    if (!outputResult.success) {
      // Output validation failure is a server-side bug — log + 500.
      throw new ColberError(
        ERROR_CODES.INTERNAL_ERROR,
        `Tool ${name} produced invalid output`,
        500,
        { issues: outputResult.error.issues },
      );
    }
    return outputResult.data;
  }
}
