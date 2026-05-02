import * as React from 'react';

import { LanguageToggle } from './LanguageToggle';
import { t, type Lang } from '../lib/i18n';
import { REPO_URL } from '../lib/version';
import { GitHubIcon } from './icons/ModuleIcons';

interface HeaderProps {
  readonly lang: Lang;
  /** Pathname of the page rendering this header, used by the language toggle. */
  readonly pathname: string;
}

export const Header: React.FC<HeaderProps> = ({ lang, pathname }) => {
  const homeHref = lang === 'fr' ? '/fr' : '/';
  const manifestoHref = lang === 'fr' ? '/fr/manifesto' : '/manifesto';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a
          href={homeHref}
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-50"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-xs font-bold text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
            C
          </span>
          Colber
        </a>

        <nav aria-label="Primary" className="flex items-center gap-1">
          <a
            href={manifestoHref}
            className="hidden h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 sm:inline-flex"
          >
            {t(lang, 'nav.manifesto')}
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            aria-label={t(lang, 'nav.github')}
          >
            <GitHubIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t(lang, 'nav.github')}</span>
          </a>
          <LanguageToggle lang={lang} pathname={pathname} />
        </nav>
      </div>
    </header>
  );
};
