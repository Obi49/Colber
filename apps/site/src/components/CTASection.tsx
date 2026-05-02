import * as React from 'react';

import { t, type Lang } from '../lib/i18n';
import { ARCHITECTURE_DOC_URL, DISCUSSIONS_URL, REPO_URL } from '../lib/version';
import { ArrowRightIcon, ExternalLinkIcon, GitHubIcon } from './icons/ModuleIcons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';

interface CTASectionProps {
  readonly lang: Lang;
}

export const CTASection: React.FC<CTASectionProps> = ({ lang }) => {
  const items = [
    {
      key: 'build' as const,
      title: t(lang, 'cta.build.title'),
      body: t(lang, 'cta.build.body'),
      action: t(lang, 'cta.build.action'),
      href: REPO_URL,
      icon: <GitHubIcon className="h-5 w-5" />,
    },
    {
      key: 'read' as const,
      title: t(lang, 'cta.read.title'),
      body: t(lang, 'cta.read.body'),
      action: t(lang, 'cta.read.action'),
      href: ARCHITECTURE_DOC_URL,
      icon: <ArrowRightIcon className="h-5 w-5" />,
    },
    {
      key: 'talk' as const,
      title: t(lang, 'cta.talk.title'),
      body: t(lang, 'cta.talk.body'),
      action: t(lang, 'cta.talk.action'),
      href: DISCUSSIONS_URL,
      icon: <ExternalLinkIcon className="h-5 w-5" />,
    },
  ];

  return (
    <section
      id="cta"
      aria-label="Get involved"
      className="border-b border-zinc-200 bg-zinc-50 py-20 dark:border-zinc-800 dark:bg-zinc-900/40 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {items.map((item) => (
            <li key={item.key}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
              >
                <Card className="flex h-full flex-col transition-colors group-hover:border-zinc-400 dark:group-hover:border-zinc-600">
                  <CardHeader>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {item.icon}
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.body}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {item.action}
                      <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </CardContent>
                </Card>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
