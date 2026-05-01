/**
 * Aggregate registration of every Colber MCP tool.
 *
 * Final tool count exposed by `@colber/mcp`:
 *   - identity        : 3
 *   - reputation      : 4
 *   - memory          : 4
 *   - observability   : 8 (3 ingest/query + 5 alert CRUD)
 *   - negotiation     : 4
 *   - insurance       : 4
 *   --------------------
 *   total             : 27
 *
 * The brief mentions "26 tools" — the 27th is `colber_insurance_status`,
 * which is part of `apps/insurance/src/mcp/tools.ts` and exposed by the SDK.
 * The brief explicitly authorises adding it: "si tu trouves dans
 * apps/<svc>/src/mcp/tools.ts un tool de plus que dans cette liste (par
 * exemple insurance.status), ajoute-le."
 */

import { registerIdentityTools } from './identity.js';
import { registerInsuranceTools } from './insurance.js';
import { registerMemoryTools } from './memory.js';
import { registerNegotiationTools } from './negotiation.js';
import { registerObservabilityTools } from './observability.js';
import { ToolRegistry } from './registry.js';
import { registerReputationTools } from './reputation.js';

import type { ColberClient } from '@colber/sdk';

export { ToolRegistry } from './registry.js';
export type { McpToolDefinition, McpCallToolResult, McpToolListing } from './registry.js';

export const buildToolRegistry = (sdk: ColberClient): ToolRegistry => {
  const registry = new ToolRegistry();
  registerIdentityTools(registry, sdk);
  registerReputationTools(registry, sdk);
  registerMemoryTools(registry, sdk);
  registerObservabilityTools(registry, sdk);
  registerNegotiationTools(registry, sdk);
  registerInsuranceTools(registry, sdk);
  return registry;
};
