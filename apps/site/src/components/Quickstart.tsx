'use client';

import * as React from 'react';

import { quickstartOrder, quickstartSnippets, type QuickstartKey } from '../../content/quickstart';
import { t, type Lang } from '../lib/i18n';
import { CodeBlock } from './ui/CodeBlock';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';

interface QuickstartProps {
  readonly lang: Lang;
}

export const Quickstart: React.FC<QuickstartProps> = ({ lang }) => {
  const [active, setActive] = React.useState<QuickstartKey>('typescript');

  return (
    <section
      id="quickstart"
      aria-labelledby="quickstart-title"
      className="border-b border-zinc-200 bg-zinc-50 py-20 dark:border-zinc-800 dark:bg-zinc-900/40 md:py-28"
    >
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-10 max-w-2xl">
          <h2
            id="quickstart-title"
            className="text-balance text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl"
          >
            {t(lang, 'quickstart.title')}
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t(lang, 'quickstart.subtitle')}
          </p>
        </div>

        <Tabs<QuickstartKey>
          value={active}
          onValueChange={setActive}
          idBase="quickstart"
          className="w-full"
        >
          <TabsList aria-label={t(lang, 'quickstart.title')}>
            {quickstartOrder.map((key) => {
              const snippet = quickstartSnippets[key];
              return (
                <TabsTrigger key={key} value={key}>
                  <span
                    aria-hidden
                    className="inline-flex h-5 min-w-[28px] items-center justify-center rounded bg-zinc-200/70 px-1 font-mono text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {snippet.icon}
                  </span>
                  {snippet.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {quickstartOrder.map((key) => {
            const snippet = quickstartSnippets[key];
            return (
              <TabsContent key={key} value={key}>
                <CodeBlock
                  code={snippet.code}
                  language={snippet.language}
                  copyLabel={t(lang, 'quickstart.copy')}
                  copiedLabel={t(lang, 'quickstart.copied')}
                  ariaLabel={`${t(lang, 'quickstart.copy')} — ${snippet.label}`}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </section>
  );
};
