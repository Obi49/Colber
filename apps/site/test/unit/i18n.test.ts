import { describe, expect, it } from 'vitest';

import { dictionary, detectLang, swapLang } from '../../src/lib/i18n';

describe('i18n dictionary', () => {
  it('declares the same set of keys in EN and FR', () => {
    const enKeys = Object.keys(dictionary.en).sort();
    const frKeys = Object.keys(dictionary.fr).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('has no empty translation', () => {
    for (const lang of ['en', 'fr'] as const) {
      const dict = dictionary[lang];
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `dictionary.${lang}.${key} is empty`).toBeTruthy();
      }
    }
  });
});

describe('detectLang', () => {
  it('returns "en" for the default home', () => {
    expect(detectLang('/')).toBe('en');
    expect(detectLang('/manifesto')).toBe('en');
  });

  it('returns "fr" for /fr and its sub-paths', () => {
    expect(detectLang('/fr')).toBe('fr');
    expect(detectLang('/fr/manifesto')).toBe('fr');
  });
});

describe('swapLang', () => {
  it('toggles between root pages', () => {
    expect(swapLang('/', 'en')).toBe('/fr');
    expect(swapLang('/fr', 'fr')).toBe('/');
  });

  it('toggles sub-pages', () => {
    expect(swapLang('/manifesto', 'en')).toBe('/fr/manifesto');
    expect(swapLang('/fr/manifesto', 'fr')).toBe('/manifesto');
  });
});
