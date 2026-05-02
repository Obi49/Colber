import { Footer } from '../../components/Footer';
import { Header } from '../../components/Header';
import { ArrowRightIcon } from '../../components/icons/ModuleIcons';
import { Button } from '../../components/ui/Button';
import { t } from '../../lib/i18n';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Why Colber — Manifesto',
  description:
    'Why we are building Colber: trust, coordination and continuity primitives that the agentic economy needs but no existing player ships as a single platform.',
  alternates: {
    canonical: '/manifesto',
    languages: {
      en: '/manifesto',
      fr: '/fr/manifesto',
    },
  },
};

export default function ManifestoPage() {
  return (
    <>
      <Header lang="en" pathname="/manifesto" />
      <main id="main" className="bg-white dark:bg-zinc-950">
        <article className="mx-auto max-w-3xl px-6 py-20 md:py-28">
          <header className="mb-12">
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-zinc-500">
              Manifesto · 2026
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
              {t('en', 'manifesto.title')}
            </h1>
          </header>

          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-6 text-pretty leading-relaxed text-zinc-700 dark:text-zinc-300">
            <p className="text-xl leading-relaxed">
              Autonomous agents are about to transact with each other at a scale and a frequency
              humans cannot supervise in the loop. Payment rails are getting good — MoonPay,
              Coinbase x402, Nevermined are all converging on programmable money for agents. But
              money alone is not commerce.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              The missing layer
            </h2>
            <p>
              Before two agents can transact, they need to <strong>trust each other</strong> (will
              the counterparty deliver?), <strong>coordinate</strong> (what are we agreeing on,
              exactly?), and <strong>persist context</strong> (do they remember the last
              interaction?). On top of that, the operator behind the agent needs{' '}
              <strong>observability</strong> — a true record of who did what, signed and verifiable.
            </p>
            <p>
              These are not theoretical concerns. They are the same primitives that took web
              commerce two decades to consolidate: reputation (Stripe Radar, Trustpilot),
              negotiation (Stripe Checkout, OpenTable), insurance (Stripe Climate, BoostUp), memory
              (Algolia, Pinecone), observability (Datadog, Honeycomb). Today no platform ships them
              as a single, agent-native bundle.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Five primitives, one identity
            </h2>
            <p>
              Colber ships five integrated services — reputation, memory, observability,
              negotiation, insurance — wired around a common DID:key Ed25519 identity. Each is
              consumable on its own; together they compose a platform effect that no single-purpose
              competitor can match.
            </p>
            <p>
              We chose MCP as the native interface so that any modern agent runtime can use Colber
              without a custom integration. We chose Apache-2.0 because the protocol of trust for
              autonomous agents must be open, auditable, and forkable. Vendor lock-in is the worst
              possible outcome at the layer that decides who can transact with whom.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              On-chain, eventually
            </h2>
            <p>
              The v1 platform runs entirely off-chain. Insurance escrow is simulated in Postgres and
              reputation is anchored to a private append-only log. This is deliberate: we ship value
              first, then move the trust-critical primitives on-chain (Base L2, USDC) once they are
              battle-tested off-chain — and only after a third-party security audit (Trail of Bits
              or OpenZeppelin) approves the contracts.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              What we ask
            </h2>
            <p>
              If you are building agents and wish payment rails alone were enough, please try
              Colber. If they are not enough — and you find yourself reinventing trust, negotiation
              or observability — open a Discussion. The protocol is yours to shape.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Button as="a" href="/" variant="secondary">
              <ArrowRightIcon className="h-4 w-4 rotate-180" />
              {t('en', 'manifesto.back')}
            </Button>
          </div>
        </article>
      </main>
      <Footer lang="en" />
    </>
  );
}
