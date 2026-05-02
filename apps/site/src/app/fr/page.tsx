import { ArchitectureDiagram } from '../../components/ArchitectureDiagram';
import { CTASection } from '../../components/CTASection';
import { EcosystemSection } from '../../components/EcosystemSection';
import { Footer } from '../../components/Footer';
import { Header } from '../../components/Header';
import { Hero } from '../../components/Hero';
import { ModulesSection } from '../../components/ModulesSection';
import { Quickstart } from '../../components/Quickstart';
import { StandardsSection } from '../../components/StandardsSection';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Colber — Confiance, coordination, continuité pour l’économie des agents',
  description:
    'Cinq services intégrés dont les agents IA ont besoin pour passer à l’échelle : réputation, mémoire, observabilité, négociation, assurance. Natif MCP.',
  alternates: {
    canonical: '/fr',
    languages: {
      en: '/',
      fr: '/fr',
    },
  },
  openGraph: {
    locale: 'fr_FR',
    alternateLocale: ['en_US'],
    url: '/fr',
  },
};

/**
 * French version of the landing page — symmetric to `app/page.tsx`. Keeping
 * a separate file (instead of a `[lang]` segment) is deliberate: with only
 * two locales the simplicity wins, and the static export contains exactly
 * the URLs we want without any pathname rewrite shenanigans.
 */
export default function HomePageFr() {
  return (
    <>
      <Header lang="fr" pathname="/fr" />
      <main id="main">
        <Hero lang="fr" />
        <ModulesSection lang="fr" />
        <Quickstart lang="fr" />
        <ArchitectureDiagram lang="fr" />
        <EcosystemSection lang="fr" />
        <StandardsSection lang="fr" />
        <CTASection lang="fr" />
      </main>
      <Footer lang="fr" />
    </>
  );
}
