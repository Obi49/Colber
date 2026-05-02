import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn(...)` — the canonical shadcn/ui className utility. Composes class
 * names via `clsx` and resolves Tailwind conflicts via `tailwind-merge`,
 * keeping the operator-console and the landing site on the same primitive.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
