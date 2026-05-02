import * as React from 'react';

import { t, type Lang } from '../lib/i18n';
import { CONTACT_EMAIL, MCP_URL, NPM_URL, PYPI_URL, REPO_URL, VERSION } from '../lib/version';

interface FooterProps {
  readonly lang: Lang;
}

export const Footer: React.FC<FooterProps> = ({ lang }) => {
  const links: { readonly label: string; readonly href: string; readonly external: boolean }[] = [
    { label: t(lang, 'footer.repo'), href: REPO_URL, external: true },
    { label: t(lang, 'footer.npm'), href: NPM_URL, external: true },
    { label: t(lang, 'footer.pypi'), href: PYPI_URL, external: true },
    { label: t(lang, 'footer.mcp'), href: MCP_URL, external: true },
    {
      label: `${t(lang, 'footer.license')} — Apache-2.0`,
      href: `${REPO_URL}/blob/main/LICENSE`,
      external: true,
    },
    {
      label: t(lang, 'footer.contact'),
      href: `mailto:${CONTACT_EMAIL}`,
      external: false,
    },
  ];

  return (
    <footer className="bg-white py-12 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-zinc-900 text-[10px] font-bold text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
              C
            </span>
            <span className="font-semibold">Colber</span>
            <span className="font-mono text-xs text-zinc-500">v{VERSION}</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">{t(lang, 'footer.tagline')}</p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline focus-visible:outline-none focus-visible:underline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
};
