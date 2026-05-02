/**
 * Tiny in-house i18n helper.
 *
 * The site only needs two languages (EN default + FR) and four static pages.
 * Pulling next-intl/i18next would be overkill: a frozen dictionary indexed by
 * `Lang × key` is enough, and gives us full TS autocompletion.
 *
 * Parity between the EN and FR maps is enforced by `test/unit/i18n.test.ts`.
 */

export type Lang = 'en' | 'fr';

export const SUPPORTED_LANGS: readonly Lang[] = ['en', 'fr'] as const;

export const dictionary = {
  en: {
    'nav.docs': 'Docs',
    'nav.github': 'GitHub',
    'nav.manifesto': 'Manifesto',
    'nav.language': 'Français',

    'hero.eyebrow': 'v1 shipped — 23/23 E2E green · Apache-2.0',
    'hero.title': 'Trust, coordination & continuity — for the agent economy.',
    'hero.subtitle':
      'Five integrated services agents need to operate at scale: reputation, memory, observability, negotiation, insurance. MCP-native. Ed25519 signatures. Event-sourced negotiation. Cryptographic attestations.',
    'hero.cta.primary': 'Get started',
    'hero.cta.secondary': 'View on GitHub',
    'hero.cta.tertiary': 'Read the spec',

    'modules.title': 'Five services. One identity layer. One platform.',
    'modules.subtitle':
      'Each module is consumable on its own — but they compose. Reputation feeds insurance pricing; negotiation feeds reputation back. agent-identity is the trust pillar wired into every endpoint.',

    'quickstart.title': 'Quickstart',
    'quickstart.subtitle': 'Pick your stack. Copy. Ship.',
    'quickstart.copy': 'Copy',
    'quickstart.copied': 'Copied',

    'architecture.title': 'Architecture at a glance',
    'architecture.subtitle':
      'Three protocols (MCP · REST · gRPC) on top of five modules and one identity pillar. Rendered live from the canonical Mermaid source.',
    'architecture.fallback':
      'Open the architecture diagram on GitHub if Mermaid fails to load in your browser.',

    'ecosystem.title': 'Speaks the standards your agents already use',
    'ecosystem.subtitle':
      'Drop Colber in front of any agent runtime: it talks the same wire format your stack already understands.',
    'ecosystem.protocols': 'Protocols',
    'ecosystem.frameworks': 'Frameworks (plugins on the roadmap)',

    'standards.title': 'Open by design',
    'standards.body':
      'We are publishing the Agent Reputation Protocol as an open RFC. No vendor lock-in, no closed standard.',
    'standards.cta': 'Read the draft',

    'cta.build.title': 'Build with Colber',
    'cta.build.body': 'Clone, install, and ship your first signed call in minutes.',
    'cta.build.action': 'Open the repo',
    'cta.read.title': 'Read the spec',
    'cta.read.body': 'C4 architecture, SLOs, threat model, every decision documented.',
    'cta.read.action': 'Architecture breakdown',
    'cta.talk.title': 'Talk to us',
    'cta.talk.body': 'Open a Discussion, drop an issue, or email the maintainer.',
    'cta.talk.action': 'GitHub Discussions',

    'footer.tagline': 'Apache-2.0 · Built in 🇫🇷 · Crafted for autonomous agents.',
    'footer.repo': 'Repo',
    'footer.npm': 'npm @colber/sdk',
    'footer.pypi': 'PyPI colber-sdk',
    'footer.mcp': 'MCP @colber/mcp',
    'footer.license': 'License',
    'footer.contact': 'Contact',

    'manifesto.title': 'Why Colber',
    'manifesto.back': 'Back to home',
  },
  fr: {
    'nav.docs': 'Docs',
    'nav.github': 'GitHub',
    'nav.manifesto': 'Manifeste',
    'nav.language': 'English',

    'hero.eyebrow': 'v1 livrée — 23/23 E2E verts · Apache-2.0',
    'hero.title': 'Confiance, coordination, continuité — pour l’économie des agents.',
    'hero.subtitle':
      'Cinq services intégrés dont les agents IA ont besoin pour passer à l’échelle : réputation, mémoire, observabilité, négociation, assurance. Natif MCP. Signatures Ed25519. Négociation event-sourced. Attestations cryptographiques.',
    'hero.cta.primary': 'Commencer',
    'hero.cta.secondary': 'Voir sur GitHub',
    'hero.cta.tertiary': 'Lire la spec',

    'modules.title': 'Cinq services. Une couche d’identité. Une plateforme.',
    'modules.subtitle':
      'Chaque module est utilisable seul — mais ils se composent. La réputation alimente le pricing d’assurance ; la négociation alimente la réputation. agent-identity est le pilier de confiance câblé dans chaque endpoint.',

    'quickstart.title': 'Démarrage rapide',
    'quickstart.subtitle': 'Choisissez votre stack. Copiez. Lancez.',
    'quickstart.copy': 'Copier',
    'quickstart.copied': 'Copié',

    'architecture.title': 'Architecture en un coup d’œil',
    'architecture.subtitle':
      'Trois protocoles (MCP · REST · gRPC) au-dessus de cinq modules et un pilier d’identité. Rendu en direct depuis la source Mermaid canonique.',
    'architecture.fallback':
      'Ouvrez le schéma sur GitHub si Mermaid ne s’affiche pas dans votre navigateur.',

    'ecosystem.title': 'Parle les standards que vos agents utilisent déjà',
    'ecosystem.subtitle':
      'Branchez Colber devant n’importe quel runtime d’agent : le format de fil correspond à ce que votre stack comprend déjà.',
    'ecosystem.protocols': 'Protocoles',
    'ecosystem.frameworks': 'Frameworks (plugins sur la roadmap)',

    'standards.title': 'Ouvert par conception',
    'standards.body':
      'Nous publions le protocole de réputation agentique en RFC ouverte. Pas de vendor lock-in, pas de standard fermé.',
    'standards.cta': 'Lire le brouillon',

    'cta.build.title': 'Construire avec Colber',
    'cta.build.body': 'Cloner, installer, livrer votre premier appel signé en quelques minutes.',
    'cta.build.action': 'Ouvrir le repo',
    'cta.read.title': 'Lire la spec',
    'cta.read.body': 'Architecture C4, SLO, threat model, chaque décision documentée.',
    'cta.read.action': 'Architecture breakdown',
    'cta.talk.title': 'Échanger avec nous',
    'cta.talk.body': 'Ouvrir une Discussion, poster une issue, ou écrire au mainteneur.',
    'cta.talk.action': 'GitHub Discussions',

    'footer.tagline': 'Apache-2.0 · Conçu en 🇫🇷 · Pour les agents autonomes.',
    'footer.repo': 'Repo',
    'footer.npm': 'npm @colber/sdk',
    'footer.pypi': 'PyPI colber-sdk',
    'footer.mcp': 'MCP @colber/mcp',
    'footer.license': 'Licence',
    'footer.contact': 'Contact',

    'manifesto.title': 'Pourquoi Colber',
    'manifesto.back': 'Retour à l’accueil',
  },
} as const;

export type DictionaryKey = keyof (typeof dictionary)['en'];

/**
 * Look up a translation. Returns the EN value as a fallback if a key is
 * accidentally absent from the FR dictionary (the unit test prevents this
 * from ever shipping, but defensive defaults keep the build from crashing
 * if a contributor forgets a translation).
 */
export const t = (lang: Lang, key: DictionaryKey): string => {
  const dict = dictionary[lang];
  return dict[key] ?? dictionary.en[key];
};

/** True if `pathname` starts with the `/fr` segment. Used by <LanguageToggle />. */
export const detectLang = (pathname: string): Lang =>
  pathname === '/fr' || pathname.startsWith('/fr/') ? 'fr' : 'en';

/** Swap the lang prefix on a pathname for the toggle button. */
export const swapLang = (pathname: string, current: Lang): string => {
  if (current === 'fr') {
    if (pathname === '/fr') return '/';
    if (pathname.startsWith('/fr/')) return pathname.slice(3);
    return '/';
  }
  if (pathname === '/') return '/fr';
  return `/fr${pathname}`;
};
