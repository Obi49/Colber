import * as React from 'react';

import { t, type Lang } from '../lib/i18n';
import { Badge } from './ui/Badge';

const protocols = [
  'MCP',
  'A2A',
  'x402',
  'OpenTelemetry',
  'DID',
  'EIP-712',
  'JCS RFC 8785',
  'Verifiable Credentials',
] as const;

const frameworks = ['LangChain', 'CrewAI', 'AutoGen', 'Anthropic SDK', 'Vercel AI SDK'] as const;

interface EcosystemSectionProps {
  readonly lang: Lang;
}

export const EcosystemSection: React.FC<EcosystemSectionProps> = ({ lang }) => (
  <section
    id="ecosystem"
    aria-labelledby="ecosystem-title"
    className="border-b border-zinc-200 bg-zinc-50 py-20 dark:border-zinc-800 dark:bg-zinc-900/40 md:py-24"
  >
    <div className="mx-auto max-w-5xl px-6">
      <div className="mb-10 max-w-2xl">
        <h2
          id="ecosystem-title"
          className="text-balance text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl"
        >
          {t(lang, 'ecosystem.title')}
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t(lang, 'ecosystem.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t(lang, 'ecosystem.protocols')}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {protocols.map((p) => (
              <li key={p}>
                <Badge variant="mono">{p}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t(lang, 'ecosystem.frameworks')}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {frameworks.map((f) => (
              <li key={f}>
                <Badge variant="outline" className="font-mono">
                  {f}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
);
