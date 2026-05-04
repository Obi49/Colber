import { defineConfig } from 'tsup';

/**
 * Build config for `@colber/mcp` — official MCP server CLI.
 *
 * This is a leaf application bundled into a single self-contained file.
 * Unlike `@colber/sdk` (a library), the MCP server is consumed via
 * `npx -y @colber/mcp` so end users get a CLI tool, not a library to import.
 *
 * Bundling decisions:
 *   - Internal `@colber/*` workspace packages are inlined via `noExternal`,
 *     so the published package has zero workspace deps.
 *   - Real npm packages (`@modelcontextprotocol/sdk`, `pino`, `zod`) stay
 *     external so users can pin/upgrade them independently.
 *   - ESM-only output (Node ≥20 supports it natively, MCP ecosystem is ESM).
 */
export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  dts: false, // not a library — no public API surface to consume
  clean: true,
  sourcemap: true,
  target: 'node20',
  platform: 'node',
  // Inline internal workspace packages so the published mcp server is
  // self-contained — users only need `@modelcontextprotocol/sdk`, `pino`,
  // `zod`, `dotenv` from npm; everything Colber-specific is baked in.
  noExternal: [/^@colber\//],
  // `dotenv` reaches us transitively through `@colber/core-config` (which
  // is inlined via noExternal). It is CJS, and bundling it into our ESM
  // output crashes Node 22 at startup with "Dynamic require of 'fs' is
  // not supported" via tsup's `__require2` shim. Keeping it external
  // (and a runtime dep — see package.json) lets Node's native CJS↔ESM
  // interop resolve it from node_modules at load time.
  external: ['dotenv'],
  // Shebang so `npx -y @colber/mcp` runs the entry without `node ` prefix.
  banner: { js: '#!/usr/bin/env node' },
});
