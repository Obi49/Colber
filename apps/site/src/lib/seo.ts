/**
 * JSON-LD generators for the landing site.
 *
 * Embedded into <RootLayout /> via a `<script type="application/ld+json">`
 * tag. Two top-level entities are advertised:
 *   - Organization (Colber)
 *   - WebSite (colber.dev with sitelinks search action stub)
 */

import { SITE_URL } from './version';

export interface OrganizationLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Organization';
  readonly name: string;
  readonly url: string;
  readonly logo: string;
  readonly sameAs: readonly string[];
  readonly description: string;
}

export interface WebSiteLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'WebSite';
  readonly name: string;
  readonly url: string;
  readonly inLanguage: readonly string[];
}

export const organizationLd: OrganizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Colber',
  url: SITE_URL,
  logo: `${SITE_URL}/colber-logo.svg`,
  sameAs: ['https://github.com/Obi49/Colber'],
  description:
    'Trust, coordination & continuity infrastructure for the agentic economy. Five integrated services: reputation, memory, observability, negotiation, insurance.',
};

export const webSiteLd: WebSiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Colber',
  url: SITE_URL,
  inLanguage: ['en', 'fr'],
};

export const serializeJsonLd = (data: object): string => JSON.stringify(data);
