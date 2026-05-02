import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { quickstartOrder, quickstartSnippets } from '../../content/quickstart';
import { Quickstart } from '../../src/components/Quickstart';

describe('<Quickstart />', () => {
  it('renders one tab trigger per snippet (TypeScript / Python / MCP / Docker)', () => {
    render(<Quickstart lang="en" />);
    for (const key of quickstartOrder) {
      const label = quickstartSnippets[key].label;
      expect(screen.getByRole('tab', { name: new RegExp(label, 'i') })).toBeDefined();
    }
    expect(screen.getAllByRole('tab').length).toBe(4);
  });

  it('shows the TypeScript snippet by default and switches on click', async () => {
    const user = userEvent.setup();
    render(<Quickstart lang="en" />);

    // Default panel renders the TS snippet's first line.
    expect(screen.getByText(/npm i @colber\/sdk/)).toBeDefined();

    // Click the Python tab → Python snippet appears.
    await user.click(screen.getByRole('tab', { name: /python/i }));
    expect(screen.getByText(/pip install colber-sdk/)).toBeDefined();
  });

  it('exposes a copy button on the active panel', () => {
    render(<Quickstart lang="en" />);
    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    // At least one copy button must be visible (the one on the active panel).
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);
  });
});
