'use client';

import * as React from 'react';

import { t, type Lang } from '../lib/i18n';
import { REPO_URL } from '../lib/version';

interface ArchitectureDiagramProps {
  readonly lang: Lang;
  /** Path to the Mermaid markdown file (copied to /public by prebuild). */
  readonly source?: string;
}

/**
 * Client-only Mermaid renderer.
 *
 * - Loads `mermaid` lazily (the library is ~400 KB unminified) so the rest of
 *   the landing page is not blocked.
 * - Fetches the canonical `colber-functional.md` from /public/diagrams/, which
 *   the `scripts/copy-diagrams.mjs` prebuild step put in place.
 * - Strips the markdown wrapper and renders the inner Mermaid block.
 *
 * If anything fails (CSP, parsing, network) we degrade gracefully to an
 * "open on GitHub" link — the diagram is also rendered natively by the
 * GitHub markdown viewer.
 */
export const ArchitectureDiagram: React.FC<ArchitectureDiagramProps> = ({
  lang,
  source = '/diagrams/colber-functional.md',
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const renderId = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [{ default: mermaid }, raw] = await Promise.all([
          import('mermaid'),
          fetch(source).then((r) => {
            if (!r.ok) {
              throw new Error(`fetch failed: ${r.status}`);
            }
            return r.text();
          }),
        ]);

        // Extract the first ```mermaid ... ``` block from the markdown file.
        const match = /```mermaid\s*\n([\s\S]*?)```/m.exec(raw);
        if (match?.[1] === undefined) {
          throw new Error('no mermaid block found in source');
        }
        const code = match[1].trim();

        const isDark =
          typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          fontFamily: 'var(--font-sans)',
          securityLevel: 'strict',
        });

        const { svg } = await mermaid.render(`mermaid-${renderId}`, code);

        if (cancelled || containerRef.current === null) {
          return;
        }
        containerRef.current.innerHTML = svg;
        setStatus('ready');
      } catch (err) {
        console.error('[ArchitectureDiagram] render failed', err);
        if (!cancelled) {
          setStatus('error');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [source, renderId]);

  return (
    <section
      id="architecture"
      aria-labelledby="architecture-title"
      className="border-b border-zinc-200 bg-white py-20 dark:border-zinc-800 dark:bg-zinc-950 md:py-28"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-10 max-w-2xl">
          <h2
            id="architecture-title"
            className="text-balance text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl"
          >
            {t(lang, 'architecture.title')}
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t(lang, 'architecture.subtitle')}
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:p-6">
          {status === 'loading' ? (
            <div
              role="status"
              aria-live="polite"
              className="flex h-64 items-center justify-center text-sm text-zinc-500"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
              <span className="ml-3">Loading diagram…</span>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
              <p>{t(lang, 'architecture.fallback')}</p>
              <a
                href={`${REPO_URL}/blob/main/docs/diagrams/colber-functional.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-900 underline underline-offset-4 dark:text-zinc-50"
              >
                colber-functional.md
              </a>
            </div>
          ) : null}

          <div
            ref={containerRef}
            aria-hidden={status !== 'ready'}
            className="mermaid-container overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full [&_svg]:!h-auto"
          />
        </div>
      </div>
    </section>
  );
};
