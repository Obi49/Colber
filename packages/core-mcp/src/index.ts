/**
 * @colber/core-mcp — Colber-internal helper for declaring MCP tools.
 *
 * This package is intentionally a thin abstraction. It does NOT replace
 * `@modelcontextprotocol/sdk` — that SDK can be plugged in later. For
 * now, services use this registry to define tools with Zod schemas and
 * expose them via an MCP-compatible JSON shape (input + output schema +
 * handler) that we can wire to either stdio or SSE transports later.
 *
 * Naming conventions (cf. ADR §0.2.3):
 *  - Tool names follow `<module>.<verb>` (e.g. `identity.register`).
 *  - Tools are versioned via the `version` field; non-breaking changes
 *    bump the minor digit, breaking changes register a new tool.
 */

export * from './registry.js';
export * from './tool.js';
