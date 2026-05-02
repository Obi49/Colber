import * as React from 'react';

import { swapLang, t, type Lang } from '../lib/i18n';

interface LanguageToggleProps {
  /** Lang of the page rendering this toggle, known at build time. */
  readonly lang: Lang;
  /** Pathname of the page rendering this toggle, known at build time. */
  readonly pathname: string;
}

/**
 * Static, JS-free language toggle. Each page passes its known `lang` and
 * `pathname` (both compile-time constants in the App Router) so the anchor
 * can target the opposite locale's URL without any client-side computation.
 *
 * Works with JS disabled: the static export keeps two real pages, and the
 * anchor is a plain `<a>` to the other one.
 */
export const LanguageToggle: React.FC<LanguageToggleProps> = ({ lang, pathname }) => {
  const target = swapLang(pathname, lang);
  const otherLang: Lang = lang === 'fr' ? 'en' : 'fr';
  const label = t(lang, 'nav.language');

  return (
    <a
      href={target}
      hrefLang={otherLang}
      lang={otherLang}
      className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
      aria-label={`Switch language to ${label}`}
    >
      {label}
    </a>
  );
};
