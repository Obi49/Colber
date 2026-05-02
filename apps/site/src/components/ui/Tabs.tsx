'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * Headless, fully accessible tab pattern.
 *
 * The operator-console uses Radix Tabs; we deliberately avoid that dependency
 * here so the static export bundle stays small (the landing page ships as
 * little JS as possible). The implementation respects WAI-ARIA Tabs:
 *   - role="tablist" / role="tab" / role="tabpanel"
 *   - aria-controls / aria-selected
 *   - keyboard: Arrow Left/Right cycles, Home/End jump
 */

interface TabsContextValue<T extends string> {
  readonly value: T;
  readonly setValue: (next: T) => void;
  readonly idBase: string;
  readonly orientation: 'horizontal' | 'vertical';
}

const TabsContext = React.createContext<TabsContextValue<string> | null>(null);

const useTabs = (): TabsContextValue<string> => {
  const ctx = React.useContext(TabsContext);
  if (ctx === null) {
    throw new Error('Tabs.* components must be used inside <Tabs>.');
  }
  return ctx;
};

interface TabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (next: T) => void;
  readonly children: React.ReactNode;
  readonly idBase?: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly className?: string;
}

export function Tabs<T extends string>({
  value,
  onValueChange,
  children,
  idBase,
  orientation = 'horizontal',
  className,
}: TabsProps<T>) {
  const reactId = React.useId();
  const ctx = React.useMemo<TabsContextValue<string>>(
    () => ({
      value,
      setValue: (next) => onValueChange(next as T),
      idBase: idBase ?? reactId,
      orientation,
    }),
    [value, onValueChange, idBase, reactId, orientation],
  );
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { orientation } = useTabs();
    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation={orientation}
        className={cn(
          'inline-flex items-center gap-1 rounded-md bg-zinc-100 p-1 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TabsList.displayName = 'TabsList';

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly value: string;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value: triggerValue, children, ...props }, ref) => {
    const { value, setValue, idBase } = useTabs();
    const selected = value === triggerValue;

    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const list = e.currentTarget.parentElement;
      if (list === null) {
        return;
      }
      const triggers = Array.from(
        list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
      );
      const index = triggers.indexOf(e.currentTarget);
      if (index === -1) {
        return;
      }
      let next: HTMLButtonElement | undefined;
      if (e.key === 'ArrowRight') {
        next = triggers[(index + 1) % triggers.length];
      } else if (e.key === 'ArrowLeft') {
        next = triggers[(index - 1 + triggers.length) % triggers.length];
      } else if (e.key === 'Home') {
        next = triggers[0];
      } else if (e.key === 'End') {
        next = triggers[triggers.length - 1];
      }
      if (next !== undefined) {
        e.preventDefault();
        next.focus();
        next.click();
      }
    };

    return (
      <button
        ref={ref}
        role="tab"
        type="button"
        id={`${idBase}-trigger-${triggerValue}`}
        aria-controls={`${idBase}-content-${triggerValue}`}
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        data-state={selected ? 'active' : 'inactive'}
        onClick={() => {
          setValue(triggerValue);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-zinc-950 data-[state=active]:shadow-sm dark:data-[state=active]:bg-zinc-950 dark:data-[state=active]:text-zinc-50',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value: contentValue, children, ...props }, ref) => {
    const { value, idBase } = useTabs();
    const active = value === contentValue;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${idBase}-content-${contentValue}`}
        aria-labelledby={`${idBase}-trigger-${contentValue}`}
        hidden={!active}
        tabIndex={0}
        className={cn(
          'mt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
          className,
        )}
        {...props}
      >
        {active ? children : null}
      </div>
    );
  },
);
TabsContent.displayName = 'TabsContent';
