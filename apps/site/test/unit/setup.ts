import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Global Vitest setup. RTL's `cleanup()` after each test prevents DOM leaks
 * between assertions (the React 19 + RTL combo does NOT auto-cleanup yet).
 */
afterEach(() => {
  cleanup();
});

// Stub the clipboard API so the CodeBlock tests do not crash on jsdom (which
// only exposes a partial implementation).
if (typeof navigator !== 'undefined' && navigator.clipboard === undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: () => Promise.resolve(),
    },
  });
}
