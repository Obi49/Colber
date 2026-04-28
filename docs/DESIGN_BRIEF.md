# DESIGN BRIEF — Schémas Praxis pour Claude Design

> **À copier/coller intégralement dans Claude Design pour qu'il produise les schémas demandés.**
> Le brief est self-contained : Claude Design n'a pas besoin de lire d'autres fichiers du repo.

---

## Prompt à coller dans Claude Design

```
Tu es chargé de produire deux schémas visuels pour Praxis — une plateforme
d'infrastructure logicielle pour l'économie agentique (agents IA autonomes
qui transactent entre eux). Les schémas serviront à la fois pour la
communication produit (pitch, site, slides) et la documentation technique
(README, onboarding développeur).

Format de sortie attendu : SVG vectoriel propre, optimisé pour le web et
l'impression. Si SVG impossible, PNG @2x (haute densité) en alternative.
Style : clean, professionnel, lisible, moderne. Inspiration : la
documentation Stripe / Vercel / Linear (dense, factuel, pas de fioritures).
Pas d'emojis dans les schémas. Pas de gradient agressif.

Palette suggérée (à respecter) :
- Couleur primaire : bleu profond (#1E3A8A ou équivalent) pour l'accent
- Neutres : gris froid (#0F172A texte, #475569 secondaire, #E2E8F0
  séparateurs, #F8FAFC fond)
- Accent réussite : vert (#059669) pour les flux validés
- Accent attention : ambre (#D97706) pour les états en transition
- Pas de rouge (sauf erreur critique)

Typo : sans-serif moderne (Inter, ou équivalent), tailles hiérarchiques
claires, gras pour les titres et noms de modules, regular pour les libellés.

# Le projet Praxis en 4 phrases

Praxis est une plateforme d'infrastructure pour l'économie agentique :
des agents IA autonomes peuvent y transacter entre eux avec confiance,
mémoire et garantie. La plateforme expose 5 modules intégrés
(Reputation, Memory, Observability, Negotiation, Insurance), tous
accessibles via MCP, REST et gRPC. Chaque agent dispose d'une identité
décentralisée (DID:key Ed25519) délivrée par le service support
agent-identity. Les modules sont commercialisables séparément mais
gagnent en valeur quand on les utilise ensemble (effet de plateforme).

# 5 modules + 1 service support

| Module             | Rôle (1 phrase)                                                    | Couleur suggérée |
|--------------------|--------------------------------------------------------------------|------------------|
| **REPUTATION**     | Oracle de fiabilité agentique avec attestations cryptographiques    | Bleu (#1E3A8A)   |
| **MEMORY**         | Mémoire externe persistante avec recherche sémantique vectorielle   | Violet (#7C3AED) |
| **OBSERVABILITY**  | Logging et tracing distribué pour les interactions agent-to-agent   | Cyan (#0891B2)   |
| **NEGOTIATION**    | Broker de négociation A2A multi-parties (auctions, multi-criteria)  | Orange (#EA580C) |
| **INSURANCE**      | Garantie de livrable agentique avec pricing et escrow               | Vert (#059669)   |
| `agent-identity`   | Bootstrap cryptographique (DID:key) — service support transverse    | Gris (#475569)   |

# ───────── SCHÉMA #1 : SCHÉMA FONCTIONNEL ─────────

OBJECTIF : montrer EN UN COUP D'ŒIL ce qu'est Praxis, qui sont les
acteurs, et comment les 5 modules s'articulent autour de l'identité
agentique. Cible : pitch deck / site web / slide hero.

LAYOUT :
- Format paysage 16:9, ~1920×1080 pour une lecture confortable.
- 3 zones horizontales superposées :

  Zone 1 (haut) — ACTEURS / UTILISATEURS PRIMAIRES
  ─────────────────────────────────────────────
    • Agents IA autonomes (utilisateurs primaires) — icône robot/agent
    • Opérateurs humains (utilisateurs secondaires) — icône personne
    • Développeurs tiers (intégrateurs) — icône code

  Zone 2 (centre) — PRAXIS PLATFORM
  ─────────────────────────────────────────────
    Encadré "Praxis" avec :
    • Au centre : agent-identity (DID Ed25519) — pilier transverse
    • Autour : 5 modules en pétales / cercle / hexagone autour de
      l'identité, chaque module avec son icône + son nom + sa baseline
    • Sous chaque module : 3-4 verbes-clés (les endpoints MCP)
        REPUTATION   : reputation.score / history / verify / feedback
        MEMORY       : memory.store / retrieve / update / share
        OBSERVABILITY: observability.log / trace / query / alert
        NEGOTIATION  : negotiation.start / propose / counter / settle
        INSURANCE    : insurance.quote / subscribe / claim / status
    • En haut de l'encadré : les 3 protocoles d'accès — MCP · REST · gRPC
    • Mention discrete : "MCP-native" en badge

  Zone 3 (bas) — SYSTÈMES EXTERNES (consommés ou intégrés)
  ─────────────────────────────────────────────
    • Coinbase x402 + USDC (paiement A2A) — picto monnaie
    • Base L2 / Optimism / Arbitrum (escrow, ancrage on-chain — P3) —
      picto blockchain
    • LLM providers (Claude, GPT, Mistral) — picto étincelle/cerveau
    • Embedding providers (Ollama, OpenAI, Voyage, Cohere) — picto vecteur
    • Datadog / Honeycomb / Jaeger (export OTel) — picto monitoring
    • Plateformes A2A externes (AgenticTrade, MCP Registries) — picto réseau

CONNEXIONS :
- Flèches simples des acteurs vers les protocoles MCP/REST/gRPC.
- Lignes pointillées de Praxis vers les systèmes externes (intégrations).
- Marqueur "P3" discret sur les liens vers les blockchains réelles
  (escrow on-chain INSURANCE prévu en P3 mais pas encore actif —
  l'escrow v1 est simulé en Postgres).

DIFFÉRENCIATION (à mettre en bas du schéma, en petit texte) :
"Effet de plateforme : 5 modules intégrés vs concurrents focalisés sur
un seul (MoonPay/x402 = paiement, Mem0/Letta/Zep = mémoire,
Datadog = observability humaine)."

# ───────── SCHÉMA #2 : SCHÉMA DE WORKFLOW (Diagramme de séquence A2A) ─────────

OBJECTIF : montrer concrètement comment les 5 modules collaborent dans
un flux de transaction A2A typique. Cible : documentation technique,
slide d'explication, onboarding développeur.

CAS D'USAGE ILLUSTRÉ : Agent A souhaite confier une tâche d'extraction
de données (data-extraction-job) à Agent B. La tâche doit être livrée
en CSV UTF-8, ≤ 5 MB, sous 24h.

LAYOUT : diagramme de séquence vertical UML-like, mais stylisé propre
(pas d'UML brut). Format portrait 16:9 inversé OU format A4 portrait.

ACTEURS (en colonnes verticales, de gauche à droite) :
1. **Agent A** (initiateur)
2. **REPUTATION**
3. **NEGOTIATION**
4. **INSURANCE**
5. **MEMORY**
6. **OBSERVABILITY** (en arrière-plan vertical, capte tous les
   échanges — barre verticale traversante en cyan transparent)
7. **Agent B** (prestataire)

SÉQUENCE (de haut en bas, ~12 étapes numérotées) :

  ① Agent A → REPUTATION : reputation.score(B)
     ◦ Réponse : score=510, scoreVersion=v1.0, attestation Ed25519
     ◦ Annotation : "score décide si A engage la suite"

  ② Agent A → NEGOTIATION : negotiation.start(parties=[A,B], terms,
     strategy=ascending-auction, deadline=+24h)
     ◦ Réponse : negotiationId, status=open

  ③ Agent A → NEGOTIATION : negotiation.propose(amount=100 USDC, sig)
     ◦ Réponse : status=negotiating, currentBest=A

  ④ Agent B → NEGOTIATION : negotiation.counter(amount=150 USDC, sig)
     ◦ Réponse : currentBest=B

  ⑤ Agent A → NEGOTIATION : negotiation.settle(winningProposalId,
     signatures multi-parties Ed25519+JCS sur {negoId, winId})
     ◦ Réponse : status=settled

  ⑥ Agent A → INSURANCE : insurance.quote(amount=150, slaTerms=...)
     ◦ INSURANCE → REPUTATION (HTTP) : score lookup B (cache 60s)
     ◦ Réponse : premium=3.0 USDC (= 150 × 2% × multiplier(score))

  ⑦ Agent A → INSURANCE : insurance.subscribe(idempotencyKey)
     ◦ Postgres : policy + escrow LOCKED (150 USDC bloqués)
     ◦ Annotation : "v1 = escrow simulé Postgres ; P3 = Base L2 Solidity"

  ⑧ [Agent B exécute la tâche pendant 23h]
     ◦ OBSERVABILITY collecte les logs+traces des deux agents en continu

  ⑨ Agent B → MEMORY : memory.store(deal_outcome, embedding, ACL=shared)
     ◦ Qdrant : vecteur 768d via Ollama nomic-embed-text

  ⑩ Agent A → MEMORY : memory.search("data-extraction quality")
     ◦ Réponse : 3 hits dont l'outcome de B (cosine 0.87)

  ⑪ Agent A → REPUTATION : reputation.feedback(toDid=B, rating=5,
     dimensions={delivery:5, quality:5, communication:4}, sig)
     ◦ Neo4j : (A)-[RATED]->(B) ; Postgres : score_snapshots

  ⑫ Agent A → INSURANCE : (cas livré OK) admin transition escrow=released
     ◦ Escrow déverrouillé, policy passe à expired/honoured
     ◦ Si tâche non livrée : insurance.claim → admin transition claimed
       → payout au bénéficiaire

ÉLÉMENTS VISUELS :
- Barre verticale cyan transparente derrière toute la séquence pour
  signifier qu'OBSERVABILITY trace tout en continu (icône d'œil ou de
  télescope en haut de la colonne).
- Les flèches → sont colorées par module destinataire (REPUTATION
  bleu, MEMORY violet, NEGOTIATION orange, INSURANCE vert).
- Les signatures cryptographiques (étapes ⑤ et ⑪) sont marquées d'une
  petite icône cadenas Ed25519 + JCS.
- Les étapes critiques (③④⑤⑦⑪) sont sur fond légèrement teinté pour
  les distinguer.
- En bas du schéma, légende compacte : flèches/couleurs/icônes.

ANNOTATION GLOBALE (en pied de schéma) :
"Tous les échanges A → modules sont signés Ed25519 + JCS RFC 8785.
Idempotency via UUID v4 sur start, subscribe, claim. Aucun appel
on-chain en v1 (mode simulation). Ancrage Base L2 et signatures
EIP-712 prévus en P3 après audit Trail of Bits/OpenZeppelin."

# Livrables attendus

Pour CHAQUE schéma, fournir :
1. Le SVG vectoriel optimisé (priorité 1).
2. Une version PNG @2x en cas de besoin (priorité 2).
3. Les sources éditables (Figma, draw.io, ou code SVG commenté) si
   possible.

Si Claude Design ne peut produire qu'un seul format à la fois,
prioriser dans l'ordre : Schéma #1 (fonctionnel) puis Schéma #2
(workflow).

# Contraintes techniques pour la livraison

- Pas de texte vectorisé (toutes les chaînes restent sélectionnables
  pour traduction/édition future).
- ViewBox SVG strict, sans dimensions hardcodées px (préférer 100%
  responsive).
- Polices : utiliser Inter (Google Fonts) ou fallback sans-serif
  système. Embarquer la font ou prévoir un fallback `system-ui`.
- Accessibilité : contraste WCAG AA minimum entre texte et fond.
  Titre `<title>` sur chaque SVG. Description courte en `<desc>`.
- Optimisation : SVG passé par SVGO (sans casser la sémantique des
  groupes nommés).

# Notes de style

- Ne pas surcharger : préférer un seul schéma très clair plutôt que
  beaucoup d'éléments confus.
- Utiliser des arrondis doux (radius 8-12 px) sur les encadrés.
- Espace généreux entre les éléments (le whitespace est ton allié).
- Si un schéma déborde sur une seule page, prévoir une version
  "découpée" en 2 (overview + zoom).

# Si tu as des questions

Avant de produire, tu peux demander des précisions sur :
- Le contexte de présentation (deck investisseur vs doc dev vs site
  web — chacun mérite une variante).
- Les contraintes de branding (logo officiel ? marque ? typo
  imposée ?).
- La langue cible (français principalement, anglais possible pour
  l'export international).
- Le nombre de variantes attendues (light/dark mode ? noir & blanc
  pour impression ?).

Sinon, va-y avec les choix par défaut indiqués ci-dessus.
```

---

## Notes pour le CdP — quoi attendre de Claude Design

### Ce que tu vas recevoir

- 2 SVG (ou PNG @2x si SVG impossible) prêts à l'emploi.
- Idéalement les sources éditables.
- Possiblement des questions de précision avant production (vois "Si tu as des questions" dans le prompt).

### Comment intégrer les schémas dans le repo

Crée un dossier `docs/diagrams/` à la racine et place-y :

- `docs/diagrams/praxis-functional.svg` (schéma #1 fonctionnel)
- `docs/diagrams/praxis-workflow-a2a.svg` (schéma #2 workflow)
- `docs/diagrams/praxis-functional@2x.png` (fallback PNG)
- `docs/diagrams/praxis-workflow-a2a@2x.png` (fallback PNG)

Puis update [`../README.md`](../README.md) (section "Vision et architecture") et [`ARCHITECTURE_BREAKDOWN.md`](ARCHITECTURE_BREAKDOWN.md) (§1.3 et §3) pour intégrer les schémas. Depuis le README à la racine, utilise `![Praxis fonctionnel](docs/diagrams/praxis-functional.svg)`. Depuis les fichiers de docs/, utilise `![Praxis fonctionnel](diagrams/praxis-functional.svg)`.

### Variantes à demander en suivi (optionnel)

- **Variante "investor pitch deck"** du schéma #1 — plus aérée, moins de texte technique, focus valeur business.
- **Variante "developer doc"** du schéma #2 — plus dense, types de payloads visibles, codes HTTP.
- **Variante "noir & blanc"** des deux schémas pour impression / fax / fallback couleur.
- **Schéma #3 — Architecture C2** (containers/runtimes K8s + datastores + flux d'événements internes), basé sur ARCHITECTURE_BREAKDOWN.md §2-§3, à demander quand tu auras besoin d'onboarder un développeur tiers.
