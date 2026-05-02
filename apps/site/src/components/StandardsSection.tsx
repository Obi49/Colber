import * as React from 'react';

import { t, type Lang } from '../lib/i18n';
import { SPEC_URL } from '../lib/version';
import { ExternalLinkIcon } from './icons/ModuleIcons';
import { Button } from './ui/Button';

interface StandardsSectionProps {
  readonly lang: Lang;
}

export const StandardsSection: React.FC<StandardsSectionProps> = ({ lang }) => (
  <section
    id="standards"
    aria-labelledby="standards-title"
    className="border-b border-zinc-200 bg-white py-20 dark:border-zinc-800 dark:bg-zinc-950 md:py-24"
  >
    <div className="mx-auto max-w-4xl px-6 text-center">
      <h2
        id="standards-title"
        className="text-balance text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl"
      >
        {t(lang, 'standards.title')}
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        {t(lang, 'standards.body')}
      </p>
      <div className="mt-8 inline-flex">
        <Button as="a" href={SPEC_URL} external variant="secondary">
          {t(lang, 'standards.cta')}
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  </section>
);
