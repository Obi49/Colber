import { ArchitectureDiagram } from '../components/ArchitectureDiagram';
import { CTASection } from '../components/CTASection';
import { EcosystemSection } from '../components/EcosystemSection';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { ModulesSection } from '../components/ModulesSection';
import { Quickstart } from '../components/Quickstart';
import { StandardsSection } from '../components/StandardsSection';

/**
 * Default (English) landing page. Mirrored at /fr/ for the French audience.
 *
 * The composition is intentionally flat: every section is a self-contained
 * component, and we keep this file readable as the "page assembly". When we
 * add /docs and /blog (Wave 2/3.3), this page will not need to change.
 */
export default function HomePage() {
  return (
    <>
      <Header lang="en" pathname="/" />
      <main id="main">
        <Hero lang="en" />
        <ModulesSection lang="en" />
        <Quickstart lang="en" />
        <ArchitectureDiagram lang="en" />
        <EcosystemSection lang="en" />
        <StandardsSection lang="en" />
        <CTASection lang="en" />
      </main>
      <Footer lang="en" />
    </>
  );
}
