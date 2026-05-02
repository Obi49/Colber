/**
 * Code snippets surfaced by <Quickstart />.
 *
 * Kept as a `const` data structure so the test suite can iterate it without
 * relying on JSX rendering. Adding a 5th channel requires updating both this
 * file and `content/quickstart.ts`'s consumer in src/components/Quickstart.tsx.
 */

export type QuickstartKey = 'typescript' | 'python' | 'mcp' | 'docker';

export interface QuickstartSnippet {
  readonly key: QuickstartKey;
  readonly label: string;
  readonly icon: string;
  readonly language: 'ts' | 'py' | 'json' | 'sh';
  readonly code: string;
}

export const quickstartSnippets: Readonly<Record<QuickstartKey, QuickstartSnippet>> = {
  typescript: {
    key: 'typescript',
    label: 'TypeScript',
    icon: 'TS',
    language: 'ts',
    code: `npm i @colber/sdk

import { ColberClient } from '@colber/sdk';

const colber = new ColberClient();
const score = await colber.reputation.score('did:key:z6Mk...');
console.log(score);`,
  },
  python: {
    key: 'python',
    label: 'Python',
    icon: 'PY',
    language: 'py',
    code: `pip install colber-sdk

from colber import ColberClient

colber = ColberClient()
score = colber.reputation.score("did:key:z6Mk...")
print(score)`,
  },
  mcp: {
    key: 'mcp',
    label: 'MCP',
    icon: 'MCP',
    language: 'json',
    code: `# In ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "colber": {
      "command": "npx",
      "args": ["-y", "@colber/mcp"]
    }
  }
}`,
  },
  docker: {
    key: 'docker',
    label: 'Docker',
    icon: 'DK',
    language: 'sh',
    code: `git clone https://github.com/Obi49/Colber.git
cd Colber/colber-stack
docker compose up -d`,
  },
} as const;

export const quickstartOrder: readonly QuickstartKey[] = [
  'typescript',
  'python',
  'mcp',
  'docker',
] as const;
