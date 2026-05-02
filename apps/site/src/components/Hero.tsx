import * as React from 'react';

import { t, type Lang } from '../lib/i18n';
import { REPO_URL, SPEC_URL } from '../lib/version';
import { ArrowRightIcon, ExternalLinkIcon, GitHubIcon } from './icons/ModuleIcons';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface HeroProps {
  readonly lang: Lang;
}

export const Hero: React.FC<HeroProps> = ({ lang }) => (
  <section
    aria-labelledby="hero-title"
    className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800"
  >
    {/* Subtle gradient background — mirror of the OG image. */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-zinc-50 to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-100/60 via-violet-100/40 to-emerald-100/30 blur-3xl dark:from-blue-900/30 dark:via-violet-900/20 dark:to-emerald-900/20"
    />

    <div className="relative mx-auto flex max-w-5xl flex-col items-start gap-6 px-6 py-20 md:py-28 lg:py-32">
      <Badge variant="outline" className="font-mono text-[11px] tracking-tight">
        {t(lang, 'hero.eyebrow')}
      </Badge>

      <h1
        id="hero-title"
        className="max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl lg:text-6xl"
      >
        {t(lang, 'hero.title')}
      </h1>

      <p className="max-w-2xl text-pretty text-lg leading-relaxed text-zinc-600 dark:text-zinc-400 md:text-xl">
        {t(lang, 'hero.subtitle')}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button as="a" href="#quickstart" variant="primary" size="lg">
          {t(lang, 'hero.cta.primary')}
          <ArrowRightIcon className="h-4 w-4" />
        </Button>
        <Button as="a" href={REPO_URL} external variant="secondary" size="lg">
          <GitHubIcon className="h-4 w-4" />
          {t(lang, 'hero.cta.secondary')}
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </Button>
        <Button as="a" href={SPEC_URL} external variant="ghost" size="lg">
          {t(lang, 'hero.cta.tertiary')}
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  </section>
);
