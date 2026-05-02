import * as React from 'react';

import { modules, type ModuleEntry } from '../../content/modules';
import { t, type Lang } from '../lib/i18n';
import { cn } from '../lib/utils';
import { ArrowRightIcon, ExternalLinkIcon, ModuleIcon } from './icons/ModuleIcons';
import { Badge } from './ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';

const accentRing: Record<ModuleEntry['accent'], string> = {
  reputation: 'group-hover:border-[#1E3A8A]/40 group-hover:shadow-[0_0_0_1px_#1E3A8A33]',
  memory: 'group-hover:border-[#7C3AED]/40 group-hover:shadow-[0_0_0_1px_#7C3AED33]',
  observability: 'group-hover:border-[#0891B2]/40 group-hover:shadow-[0_0_0_1px_#0891B233]',
  negotiation: 'group-hover:border-[#EA580C]/40 group-hover:shadow-[0_0_0_1px_#EA580C33]',
  insurance: 'group-hover:border-[#059669]/40 group-hover:shadow-[0_0_0_1px_#05966933]',
};

const accentText: Record<ModuleEntry['accent'], string> = {
  reputation: 'text-[#1E3A8A] dark:text-[#7DA3FF]',
  memory: 'text-[#7C3AED] dark:text-[#C4B5FD]',
  observability: 'text-[#0891B2] dark:text-[#67E8F9]',
  negotiation: 'text-[#EA580C] dark:text-[#FDBA74]',
  insurance: 'text-[#059669] dark:text-[#6EE7B7]',
};

const accentBg: Record<ModuleEntry['accent'], string> = {
  reputation: 'bg-[#EFF4FF] dark:bg-[#1E3A8A]/20',
  memory: 'bg-[#F5EFFF] dark:bg-[#7C3AED]/20',
  observability: 'bg-[#ECFAFE] dark:bg-[#0891B2]/20',
  negotiation: 'bg-[#FFF1E6] dark:bg-[#EA580C]/20',
  insurance: 'bg-[#E8F8F0] dark:bg-[#059669]/20',
};

interface ModulesSectionProps {
  readonly lang: Lang;
}

export const ModulesSection: React.FC<ModulesSectionProps> = ({ lang }) => (
  <section
    id="modules"
    aria-labelledby="modules-title"
    className="border-b border-zinc-200 bg-white py-20 dark:border-zinc-800 dark:bg-zinc-950 md:py-28"
  >
    <div className="mx-auto max-w-6xl px-6">
      <div className="mb-12 max-w-3xl">
        <h2
          id="modules-title"
          className="text-balance text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl"
        >
          {t(lang, 'modules.title')}
        </h2>
        <p className="mt-4 text-pretty text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t(lang, 'modules.subtitle')}
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <li key={m.slug}>
            <a
              href={m.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
              aria-labelledby={`module-${m.slug}-title`}
            >
              <Card
                className={cn(
                  'flex h-full flex-col transition-all duration-200',
                  accentRing[m.accent],
                )}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div
                      className={cn(
                        'inline-flex h-10 w-10 items-center justify-center rounded-md',
                        accentBg[m.accent],
                        accentText[m.accent],
                      )}
                    >
                      <ModuleIcon iconKey={m.iconKey} className="h-5 w-5" />
                    </div>
                    <ExternalLinkIcon className="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-zinc-700 dark:group-hover:text-zinc-300" />
                  </div>
                  <CardTitle id={`module-${m.slug}-title`} className="flex items-baseline gap-2">
                    <span className={accentText[m.accent]}>{m.title[lang]}</span>
                  </CardTitle>
                  <CardDescription className="font-medium text-zinc-700 dark:text-zinc-300">
                    {m.tagline[lang]}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {m.description[lang]}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {m.keywords.map((kw) => (
                      <Badge key={kw} variant="mono">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                  <div
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100',
                      accentText[m.accent],
                    )}
                  >
                    {lang === 'fr' ? 'Voir le code' : 'View code'}
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </div>
                </CardContent>
              </Card>
            </a>
          </li>
        ))}
      </ul>
    </div>
  </section>
);
