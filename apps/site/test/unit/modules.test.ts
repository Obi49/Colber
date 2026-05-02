import { describe, expect, it } from 'vitest';

import { modules } from '../../content/modules';

const expectedSlugs = [
  'reputation',
  'memory',
  'observability',
  'negotiation',
  'insurance',
] as const;

describe('content/modules', () => {
  it('declares exactly the 5 v1 modules', () => {
    expect(modules.length).toBe(5);
    const slugs = modules.map((m) => m.slug).sort();
    expect(slugs).toEqual([...expectedSlugs].sort());
  });

  it('every module ships an EN and FR title + description', () => {
    for (const m of modules) {
      expect(m.title.en, `${m.slug}.title.en`).toBeTruthy();
      expect(m.title.fr, `${m.slug}.title.fr`).toBeTruthy();
      expect(m.tagline.en, `${m.slug}.tagline.en`).toBeTruthy();
      expect(m.tagline.fr, `${m.slug}.tagline.fr`).toBeTruthy();
      expect(m.description.en, `${m.slug}.description.en`).toBeTruthy();
      expect(m.description.fr, `${m.slug}.description.fr`).toBeTruthy();
    }
  });

  it('every module has at least one keyword and a repo link', () => {
    for (const m of modules) {
      expect(m.keywords.length, `${m.slug}.keywords`).toBeGreaterThan(0);
      expect(m.link.startsWith('https://'), `${m.slug}.link`).toBe(true);
    }
  });
});
