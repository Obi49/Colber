import { Inter, JetBrains_Mono } from 'next/font/google';

import { organizationLd, serializeJsonLd, webSiteLd } from '../lib/seo';
import { SITE_URL } from '../lib/version';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

/**
 * Variable web fonts loaded via `next/font/google` — values are inlined into
 * the static export at build time, which means zero FOUT and a single
 * round-trip per font file. The CSS variables are referenced by `globals.css`
 * (`--font-sans` / `--font-mono`).
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

const description =
  'Trust, coordination & continuity infrastructure for the agentic economy. Five integrated services agents need to operate at scale: reputation, memory, observability, negotiation, insurance.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Colber — Trust, coordination & continuity for the agent economy',
    template: '%s · Colber',
  },
  description,
  applicationName: 'Colber',
  keywords: [
    'AI agents',
    'agentic economy',
    'reputation',
    'memory',
    'observability',
    'negotiation',
    'insurance',
    'MCP',
    'A2A',
    'x402',
    'DID',
    'Ed25519',
    'TypeScript',
    'open source',
  ],
  authors: [{ name: 'Johan' }],
  creator: 'Johan',
  publisher: 'Colber',
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      fr: '/fr',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['fr_FR'],
    url: SITE_URL,
    title: 'Colber — Trust, coordination & continuity for the agent economy',
    description,
    siteName: 'Colber',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Colber — Trust, coordination & continuity for the agent economy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Colber — Trust, coordination & continuity for the agent economy',
    description,
    images: ['/og-image.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          // JSON-LD is intentionally inlined as a string — React would otherwise
          // escape the JSON quotes and break the schema.org parser.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(webSiteLd) }}
        />
      </head>
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
