import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * Marketing-site Button — same visual grammar as the operator-console one,
 * minus the Radix Slot dependency (the landing page only needs `<a>`/`<button>`,
 * never `asChild`). Three variants:
 *   - primary   — solid dark, the canonical CTA.
 *   - secondary — outlined, used for "second-best" actions.
 *   - ghost     — text-only, used for tertiary links and the language toggle.
 */
type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'default' | 'sm' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
  secondary:
    'border border-zinc-200 bg-transparent text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800',
  ghost:
    'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
};

const sizeClasses: Record<Size, string> = {
  default: 'h-10 px-4 py-2 text-sm',
  sm: 'h-9 px-3 text-sm',
  lg: 'h-12 px-6 text-base',
};

const baseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

interface BaseProps {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly className?: string;
}

export type ButtonProps = BaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly as?: 'button';
  };

export type LinkButtonProps = BaseProps &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly as: 'a';
    readonly href: string;
    readonly external?: boolean;
  };

const composeClasses = (
  variant: Variant | undefined,
  size: Size | undefined,
  className: string | undefined,
): string =>
  cn(baseClasses, variantClasses[variant ?? 'primary'], sizeClasses[size ?? 'default'], className);

/**
 * Renders a `<button>` or `<a>` based on `as`. External anchors get the
 * canonical `target="_blank" rel="noopener noreferrer"` triplet automatically.
 */
export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps | LinkButtonProps
>((props, ref) => {
  if (props.as === 'a') {
    const { variant, size, className, external, href, children, ...rest } = props;
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={composeClasses(variant, size, className)}
        {...(external === true ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }

  const { variant, size, className, children, ...rest } = props;
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={composeClasses(variant, size, className)}
      {...rest}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
