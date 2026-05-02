import { Footer } from '../../../components/Footer';
import { Header } from '../../../components/Header';
import { ArrowRightIcon } from '../../../components/icons/ModuleIcons';
import { Button } from '../../../components/ui/Button';
import { t } from '../../../lib/i18n';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pourquoi Colber — Manifeste',
  description:
    'Pourquoi nous construisons Colber : les primitives de confiance, coordination et continuité dont l’économie agentique a besoin et qu’aucun acteur existant n’assemble.',
  alternates: {
    canonical: '/fr/manifesto',
    languages: {
      en: '/manifesto',
      fr: '/fr/manifesto',
    },
  },
};

export default function ManifestoPageFr() {
  return (
    <>
      <Header lang="fr" pathname="/fr/manifesto" />
      <main id="main" className="bg-white dark:bg-zinc-950">
        <article className="mx-auto max-w-3xl px-6 py-20 md:py-28">
          <header className="mb-12">
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-zinc-500">
              Manifeste · 2026
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
              {t('fr', 'manifesto.title')}
            </h1>
          </header>

          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-6 text-pretty leading-relaxed text-zinc-700 dark:text-zinc-300">
            <p className="text-xl leading-relaxed">
              Les agents autonomes vont bientôt transacter entre eux à une échelle et à une
              fréquence qu’aucun humain ne pourra superviser en boucle. Les rails de paiement
              progressent — MoonPay, Coinbase x402, Nevermined convergent vers une monnaie
              programmable pour agents. Mais l’argent seul ne fait pas le commerce.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              La couche manquante
            </h2>
            <p>
              Avant que deux agents transactent, ils doivent <strong>se faire confiance</strong> (la
              contrepartie va-t-elle livrer ?), <strong>se coordonner</strong> (sur quoi sommes-nous
              d’accord exactement ?), et <strong>persister un contexte</strong> (se souviennent-ils
              de la dernière interaction ?). En plus, l’opérateur derrière l’agent a besoin{' '}
              <strong>d’observabilité</strong> — un vrai journal de qui a fait quoi, signé et
              vérifiable.
            </p>
            <p>
              Ce ne sont pas des préoccupations théoriques. Ce sont les primitives qu’il a fallu
              vingt ans au commerce web pour consolider : réputation (Stripe Radar, Trustpilot),
              négociation (Stripe Checkout, OpenTable), assurance (Stripe Climate, BoostUp), mémoire
              (Algolia, Pinecone), observabilité (Datadog, Honeycomb). Aujourd’hui, aucune
              plateforme ne les livre comme un bundle natif pour agents.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Cinq primitives, une identité
            </h2>
            <p>
              Colber livre cinq services intégrés — réputation, mémoire, observabilité, négociation,
              assurance — câblés autour d’une identité commune DID:key Ed25519. Chacun est
              consommable seul ; ensemble, ils forment un effet de plateforme qu’aucun concurrent
              mono-fonction ne peut égaler.
            </p>
            <p>
              Nous avons choisi MCP comme interface native pour qu’un runtime d’agent moderne puisse
              utiliser Colber sans intégration sur mesure. Nous avons choisi Apache-2.0 parce que le
              protocole de confiance des agents autonomes doit être ouvert, auditable et forkable.
              Le vendor lock-in est le pire scénario possible à la couche qui décide qui peut
              transacter avec qui.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              On-chain, à terme
            </h2>
            <p>
              La plateforme v1 tourne entièrement off-chain. L’escrow d’assurance est simulé en
              Postgres, la réputation est ancrée dans un journal append-only privé. Choix délibéré :
              livrer la valeur d’abord, puis migrer les primitives critiques on-chain (Base L2,
              USDC) une fois qu’elles ont été éprouvées off-chain — et seulement après qu’un audit
              tiers (Trail of Bits ou OpenZeppelin) ait validé les contrats.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Ce que nous demandons
            </h2>
            <p>
              Si vous construisez des agents et trouvez que les rails de paiement seuls ne suffisent
              pas, essayez Colber. Si vous vous retrouvez à réinventer la confiance, la négociation
              ou l’observabilité, ouvrez une Discussion. Le protocole est à vous de forger.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Button as="a" href="/fr" variant="secondary">
              <ArrowRightIcon className="h-4 w-4 rotate-180" />
              {t('fr', 'manifesto.back')}
            </Button>
          </div>
        </article>
      </main>
      <Footer lang="fr" />
    </>
  );
}
