import * as React from 'react';

import { cn } from '../../lib/utils';

type Variant = 'default' | 'outline' | 'success' | 'info' | 'mono';

const variantClasses: Record<Variant, string> = {
  default: 'border-transparent bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900',
  outline: 'border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300',
  success:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  info: 'border-transparent bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  mono: 'border-zinc-200 bg-zinc-50 font-mono text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly variant?: Variant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';
