/**
 * Source-of-truth data for the 5 Colber modules + the agent-identity pillar.
 *
 * Used by:
 *   - <ModulesSection /> on the landing page (EN + FR variants)
 *   - test/unit/modules.test.ts (sanity check on cardinality and i18n parity)
 *   - SEO JSON-LD generators (lib/seo.ts)
 *
 * `accent` matches the brand-* utility classes declared in `globals.css`.
 * Do NOT introduce a 6th module here without also updating the test fixture.
 */

export type ModuleSlug = 'reputation' | 'memory' | 'observability' | 'negotiation' | 'insurance';

export interface ModuleEntry {
  readonly slug: ModuleSlug;
  readonly iconKey: 'shield' | 'brain' | 'eye' | 'scale' | 'umbrella';
  readonly accent: 'reputation' | 'memory' | 'observability' | 'negotiation' | 'insurance';
  readonly title: { readonly en: string; readonly fr: string };
  readonly tagline: { readonly en: string; readonly fr: string };
  readonly description: { readonly en: string; readonly fr: string };
  readonly keywords: readonly string[];
  readonly link: string;
}

const REPO = 'https://github.com/Obi49/Colber';

export const modules: readonly ModuleEntry[] = [
  {
    slug: 'reputation',
    iconKey: 'shield',
    accent: 'reputation',
    title: { en: 'Reputation', fr: 'Réputation' },
    tagline: {
      en: 'Cryptographic reputation oracle for autonomous agents.',
      fr: 'Oracle de réputation cryptographique pour agents autonomes.',
    },
    description: {
      en: 'Ed25519-signed attestations stored in Neo4j and Postgres. Score, history, verify and feedback endpoints. Anti-Sybil graph analysis on the v2 roadmap.',
      fr: 'Attestations signées Ed25519, stockées dans Neo4j + Postgres. Endpoints score, history, verify, feedback. Analyse anti-Sybil prévue en v2.',
    },
    keywords: ['Ed25519', 'JCS RFC 8785', 'Neo4j', 'Postgres'],
    link: `${REPO}/tree/main/apps/reputation`,
  },
  {
    slug: 'memory',
    iconKey: 'brain',
    accent: 'memory',
    title: { en: 'Memory', fr: 'Mémoire' },
    tagline: {
      en: 'Persistent external memory with semantic search.',
      fr: 'Mémoire externe persistante avec recherche sémantique.',
    },
    description: {
      en: 'Vector-backed store (Qdrant 1.15, 768d Ollama embeddings) with permissions, versioning and cross-agent sharing. Built for agents that survive restarts.',
      fr: 'Store vectoriel (Qdrant 1.15, embeddings Ollama 768d) avec permissions, versioning et partage inter-agents. Pensé pour des agents qui survivent aux redémarrages.',
    },
    keywords: ['Qdrant', 'Ollama', 'nomic-embed-text', 'Permissions'],
    link: `${REPO}/tree/main/apps/memory`,
  },
  {
    slug: 'observability',
    iconKey: 'eye',
    accent: 'observability',
    title: { en: 'Observability', fr: 'Observabilité' },
    tagline: {
      en: 'Distributed tracing tuned for agent-to-agent calls.',
      fr: 'Tracing distribué pensé pour les appels A2A.',
    },
    description: {
      en: 'Logs and spans landed in ClickHouse + Postgres with TTL retention, query API and alerts. OpenTelemetry OTLP export on the P2 roadmap.',
      fr: 'Logs et spans dans ClickHouse + Postgres, rétention configurable, API de requête et alertes. Export OTLP OpenTelemetry prévu en P2.',
    },
    keywords: ['ClickHouse', 'OpenTelemetry', 'Spans', 'Alerts'],
    link: `${REPO}/tree/main/apps/observability`,
  },
  {
    slug: 'negotiation',
    iconKey: 'scale',
    accent: 'negotiation',
    title: { en: 'Negotiation', fr: 'Négociation' },
    tagline: {
      en: 'Event-sourced multi-party A2A negotiation broker.',
      fr: 'Broker de négociation A2A multi-parties event-sourced.',
    },
    description: {
      en: 'Postgres event store + projections for start, propose, counter and settle. Up to 16 parties, 200 proposals per negotiation, deadline-based sweepers.',
      fr: 'Event store + projections Postgres pour start, propose, counter, settle. Jusqu’à 16 parties, 200 propositions par négociation, sweepers de deadline.',
    },
    keywords: ['Event Sourcing', 'CQRS', 'Postgres', 'Multi-party'],
    link: `${REPO}/tree/main/apps/negotiation`,
  },
  {
    slug: 'insurance',
    iconKey: 'umbrella',
    accent: 'insurance',
    title: { en: 'Insurance', fr: 'Assurance' },
    tagline: {
      en: 'Deliverable guarantees with simulated escrow (v1).',
      fr: 'Garantie de livrable avec escrow simulé (v1).',
    },
    description: {
      en: 'Reputation-based pricing, quote / subscribe / claim flow, exposure caps. On-chain escrow on Base L2 ships in P3 (audit Trail of Bits before mainnet).',
      fr: 'Pricing basé sur la réputation, flux quote / subscribe / claim, plafonds d’exposition. Escrow on-chain Base L2 livré en P3 (audit Trail of Bits avant mainnet).',
    },
    keywords: ['Pricing', 'Escrow', 'USDC', 'Base L2 (P3)'],
    link: `${REPO}/tree/main/apps/insurance`,
  },
] as const;

export const identityPillar = {
  slug: 'agent-identity',
  iconKey: 'shield',
  title: { en: 'agent-identity', fr: 'agent-identity' },
  tagline: {
    en: 'DID:key Ed25519 — the trust pillar wired into every module.',
    fr: 'DID:key Ed25519 — le pilier d’identité injecté dans tous les modules.',
  },
} as const;
