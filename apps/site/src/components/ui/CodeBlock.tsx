'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

interface CodeBlockProps {
  readonly code: string;
  readonly language?: 'ts' | 'py' | 'json' | 'sh' | 'plain';
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
  readonly className?: string;
  /** A11y label for the copy button (`aria-label`). */
  readonly ariaLabel?: string;
}

/**
 * Static code block with a "copy" affordance.
 *
 * No syntax highlighting library is loaded — the snippets are short and the
 * landing page targets a small JS budget. The `language` prop just attaches
 * a `data-language` attribute so a future highlighter (Shiki, Prism) can be
 * swapped in without changing the call sites.
 *
 * Uses the modern `navigator.clipboard.writeText` API. Falls back to a
 * temporary `<textarea>` + `document.execCommand` only on browsers that do
 * not expose the async API (extremely rare today, but cheap insurance).
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'plain',
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  className,
  ariaLabel,
}) => {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(code);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (err) {
      console.error('[CodeBlock] copy failed', err);
    }
  };

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
      data-language={language}
    >
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        aria-label={ariaLabel ?? copyLabel}
        className="absolute right-3 top-3 inline-flex h-7 items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 opacity-0 shadow-sm transition-all hover:bg-zinc-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 group-hover:opacity-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {copied ? copiedLabel : copyLabel}
      </button>
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-[13px] leading-6 text-zinc-800 dark:text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
};
