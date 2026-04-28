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

# ⚠️ RÈGLES D'AMÉLIORATION POUR LE SCHÉMA #1 (CRITIQUE)

Le premier rendu du schéma fonctionnel est correct dans la structure
(3 zones acteurs / plateforme / externes) mais souffre de plusieurs
problèmes de lisibilité et de mise en valeur. À corriger sur le
prochain rendu :

## 1. Direction des flux — distinguer INBOUND vs OUTBOUND

Sur le premier rendu, toutes les flèches sont représentées avec le
même style (pointillé descendant), alors que les flux ont des sens
sémantiquement différents :

- **Acteurs → Praxis (INBOUND)** : flèche **pleine** descendante,
  épaisseur 2 px, tête triangle plein, couleur primaire (bleu
  `#1E3A8A`). Label discret en italique : "consomme via MCP/REST/gRPC".
- **Praxis → Systèmes externes (OUTBOUND)** : flèche **pleine
  descendante** également, mais couleur GRIS désaturé (`#94A3B8`),
  pour signifier "intégration" plutôt que "consommation primaire".
  Label en italique sous chaque flèche : "intègre" / "exporte vers" /
  "consomme".
- **Pas de pointillé sur les liens "actifs"**. Le pointillé est
  RÉSERVÉ aux liens **non encore actifs en v1** (typiquement les
  intégrations on-chain prévues en P3) — voir règle #5.

L'œil doit comprendre en 2 secondes : "les acteurs en haut consomment
Praxis, et Praxis intègre les systèmes en bas". Pas de flèches
multidirectionnelles : la direction de chaque ligne est sans ambiguïté.

## 2. Pilier `agent-identity` — agrandir et mettre en valeur

Sur le premier rendu, `agent-identity` apparaît comme un petit cercle
discret au centre, alors qu'il est le pilier transverse qui alimente
les 5 modules (chaque DID y est délivré). À corriger :

- Cercle d'**au moins le même diamètre** que les boîtes des 5 modules
  (~140 px de diamètre minimum), centré dans la zone Praxis Platform.
- Fond gris clair (`#F1F5F9`) avec bordure 2 px gris foncé (`#475569`).
- Titre `agent-identity` en gras + sous-titre : "Pilier identité —
  DID:key Ed25519".
- **Lignes radiales** (rayons) qui partent du cercle vers chacun des
  5 modules : trait fin (1 px) gris (`#CBD5E1`), label `delivers DID`
  ou simplement un picto clé. Ces rayons signalent visuellement que
  TOUS les modules dépendent d'`agent-identity`.

## 3. Synergies inter-modules — petites flèches courbes

Sur le premier rendu, les 5 modules sont des îles isolées. Pour
matérialiser l'effet de plateforme, ajouter **3-4 flèches courbes
fines** (1.5 px) entre modules, chacune labellisée :

- **REPUTATION → INSURANCE** : `score lookup (pricing)` — call HTTP
  interne déjà actif en v1.
- **NEGOTIATION → INSURANCE** : `auto-subscribe deal (P3)` — futur,
  marqué P3 en pointillé.
- **NEGOTIATION → REPUTATION** : `feedback post-deal (v1.1)` —
  futur, marqué v1.1 en pointillé.
- **OBSERVABILITY ← tous** : `traces continues` — symbolisé par une
  fine bande horizontale qui passe DERRIÈRE les 5 modules (au plan
  arrière), couleur cyan transparente 10% opacité.

Ces flèches sont **fines et discrètes** : elles enrichissent sans
encombrer. Si une seule devait être gardée pour un rendu minimaliste,
prioriser `REPUTATION → INSURANCE` (la seule active en v1).

## 4. Code couleur cohérent avec le schéma #2

Chaque module a une **couleur d'identité unique** qui doit être
identique dans tous les schémas de la documentation Praxis :

| Module          | Couleur primaire | Hex       |
| --------------- | ---------------- | --------- |
| REPUTATION      | Bleu             | `#1E3A8A` |
| MEMORY          | Violet           | `#7C3AED` |
| OBSERVABILITY   | Cyan             | `#0891B2` |
| NEGOTIATION     | Orange           | `#EA580C` |
| INSURANCE       | Vert             | `#059669` |
| `agent-identity`| Gris (neutre)    | `#475569` |

Sur le schéma fonctionnel : la **bordure gauche colorée** (déjà
présente sur le premier rendu) est OK. Ajouter en plus :

- Le **nom du module** en gras dans la couleur primaire du module.
- Le **picto** (icône) tinté dans la même couleur.
- Une **petite légende couleurs** en pied du schéma, juste avant la
  bande "Effet de plateforme" : "Couleur = identité du module
  dans toute la documentation Praxis".

## 5. Marqueurs `v1` / `P3` explicites — pas seulement discrets

Sur le premier rendu, le marqueur "P3" sur Base/Optimism/Arbitrum est
quasi invisible. À renforcer :

- **Badge `P3` ambré** (`#D97706` fond, blanc texte, pill ~22 px) en
  coin supérieur droit de chaque case "système externe non encore
  actif" : Base · Optimism · Arbitrum (escrow on-chain), x402+USDC
  (paiement A2A non implémenté en v1).
- **Badge `v1`** vert (`#059669`) en coin supérieur droit des cases
  ACTIVES en v1 : LLM providers (Claude/GPT/Mistral via futurs
  appels MEDIATOR — toujours v1.1, donc plutôt P3 ici), Embeddings
  (Ollama nomic-embed-text, ACTIF v1), Datadog/Honeycomb/Jaeger
  (export OTel = v1.1, donc P2). Adapter au cas par cas.
- **Bande de séparation** entre la zone Praxis Platform et la zone
  Systèmes externes avec le label : "Intégrations actives en v1 |
  prévues en P2/P3" — pour que le lecteur comprenne d'un coup d'œil.

## 6. Densité de texte — alléger sous les acteurs

Sur le premier rendu, sous chaque carte d'acteur on lit :

- Agents IA autonomes : "Utilisateurs primaires · DID:key Ed25519 ·
  MCP clients"
- Opérateurs humains : "Utilisateurs secondaires · Console ·
  supervision · admin"
- Développeurs tiers : "Intégrateurs · SDK · REST · gRPC"

Or "DID:key Ed25519" et "MCP clients" et "REST · gRPC" sont déjà dans
la bande "Protocoles d'accès" juste en dessous. Réduire à :

- Agents IA autonomes : "Utilisateurs primaires"
- Opérateurs humains : "Utilisateurs secondaires"
- Développeurs tiers : "Intégrateurs / SDK"

C'est le moment de faire confiance au lecteur. Le whitespace gagné
sert la lisibilité.

## 7. Bandeau `MCP-native` — intégrer dans la bande protocoles

Sur le premier rendu, le badge "MCP-native" est isolé en haut à
droite et on ne sait pas exactement à quoi il se rattache. L'intégrer
DANS la bande "Protocoles d'accès" comme premier élément, par exemple :

  ┌──────────────────────────────────────────────────────────────┐
  │  PROTOCOLES D'ACCÈS  │  [MCP-native]  MCP · REST · gRPC      │
  │                      │  Auth: DID:key Ed25519 + JCS RFC 8785 │
  └──────────────────────────────────────────────────────────────┘

Le badge n'est plus un orphelin — il qualifie clairement la nature
du protocole MCP comme étant la voie native de Praxis (vs REST/gRPC
qui sont des transports complémentaires).

## 8. Effet de plateforme — visualisation comparative

Sur le premier rendu, l'effet de plateforme est uniquement une phrase
en bas. Le RENFORCER avec une petite visualisation comparative à
gauche de la bande noire :

  ┌─────────────────────┐  ┌──────────────────────────────────┐
  │ CONCURRENT          │  │ PRAXIS                           │
  │ ┌────┐              │  │ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐         │
  │ │ X  │ (1 silo,     │  │ │R │ │M │ │O │ │N │ │I │         │
  │ └────┘  monolithe)  │  │ └─┬┘ └─┬┘ └─┬┘ └─┬┘ └─┬┘         │
  │                     │  │   └────┴────┴────┴────┘          │
  │                     │  │   (5 modules connectés)          │
  └─────────────────────┘  └──────────────────────────────────┘

Texte en pied : "5 modules intégrés gagnent en valeur composée à
chaque ajout. Chaque module reste autonome et commercialisable
séparément."

## 9. Format final recommandé

- **Format paysage 16:9, 1920×1080 minimum** (déjà dans le brief
  d'origine) — préserver pour les slides hero.
- **Marges intérieures généreuses** : 60 px haut/bas, 80 px
  gauche/droite. La zone Praxis Platform doit utiliser 70-80% de la
  largeur visible (vs ~60% sur le premier rendu).
- Test de lisibilité à **50% d'échelle** : tous les libellés des
  modules et leurs endpoints doivent rester déchiffrables. Si non,
  augmenter la taille du texte (pas la peine d'avoir 4 endpoints
  par module si on ne peut pas les lire — préférer 3 endpoints en
  taille suffisante).

## Variante "Schéma #1-bis — hub & spoke radial"

Si le layout grille 2×3 du premier rendu reste plat, produire en
plus une variante **hub & spoke** :

- `agent-identity` au centre dans un grand cercle (pilier).
- Les 5 modules en pétales radiaux autour, chacun à 72° d'écart
  (cercle complet 360° / 5).
- Connexions visibles entre `agent-identity` et chaque module.
- Synergies inter-modules visibles en arcs de cercle légers entre
  pétales adjacents.

C'est la variante la plus "marketable" — idéale pour la slide hero
d'un pitch deck. Le layout grille reste meilleur pour la doc
technique car il aligne les endpoints proprement.

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

# ⚠️ RÈGLES DE LISIBILITÉ DU SENS DES FLÈCHES (CRITIQUE)

Sur le premier rendu produit, le SENS des flèches (qui appelle qui)
n'était PAS lisible au premier coup d'œil. À corriger absolument avec
les conventions strictes ci-dessous :

## Convention requête vs réponse

- **Flèche REQUÊTE (call)** : trait PLEIN, épaisseur **2 px minimum**
  (idéalement 2.5 px), tête de flèche TRIANGLE PLEIN d'au moins 10×10
  px, couleur saturée (la couleur du module destinataire). Label en
  texte regular au-dessus de la flèche.
- **Flèche RÉPONSE (return)** : trait POINTILLÉ (dash 4-2), épaisseur
  **1.5 px**, tête de flèche TRIANGLE OUVERT (contour seulement) ou
  petite chevron `‹`, couleur dans la même teinte mais désaturée
  (40-50% opacité). Label en italique sous la flèche, préfixé `↩`.

L'œil doit pouvoir distinguer requête vs réponse à 1 mètre de
distance. Si on hésite, c'est que la convention n'est pas assez
contrastée.

## Indicateur d'origine de chaque étape

À GAUCHE du numéro de l'étape (le cercle ①②③…), ajouter un PETIT
PASTILLE colorée indiquant l'INITIATEUR de l'étape :

- **Pastille noire/bleu foncé "A"** quand Agent A initie (étapes
  ①②③⑤⑥⑦⑩⑪⑫).
- **Pastille gris clair "B"** quand Agent B initie (étapes ④⑨).
- **Pastille bandée "AB"** quand l'étape est initiée par les deux
  parties simultanément (aucune dans cette séquence — réservé
  futur).

Cette pastille permet de voir **d'un seul coup d'œil** qui démarre
chaque étape sans avoir à suivre la flèche jusqu'à son origine.

## Bande horizontale par initiateur

L'arrière-plan de chaque étape est une bande horizontale très
légèrement teintée selon l'initiateur :

- Étape initiée par Agent A → bande `#F0F4FF` (bleu très clair, 5%
  opacité).
- Étape initiée par Agent B → bande `#F8F8F8` (gris très clair).
- Bande haute de 4-6 px maximum, juste pour donner du rythme — pas un
  rectangle pleine hauteur qui mangerait les autres éléments.

## Espacement vertical entre étapes

Au minimum **80 px** entre la fin d'une étape (réponse incluse) et le
début de la suivante. La cause principale d'illisibilité est le
chevauchement des flèches successives. **Ne pas comprimer** pour
faire tenir sur une seule page : préférer un schéma plus long
(format A4 portrait OU format A3 portrait si nécessaire).

## Numérotation visible

Le cercle numéroté (①②③…) doit être :
- À l'extérieur GAUCHE du diagramme (avant la colonne Agent A), pas
  noyé dans la zone des flèches.
- Diamètre minimum 24 px, fond coloré selon le module dominant de
  l'étape, texte blanc gras, taille ≥ 14 px.

## Légende OBLIGATOIRE en haut du schéma

En-tête fixe à 60-80 px avant la première étape :

  ┌──────────────────────────────────────────────────────────────┐
  │  Légende :                                                   │
  │  ──────► requête (call)         ‹ ─ ─ ─ réponse (return)    │
  │  🅰 = initié par Agent A         🅱 = initié par Agent B     │
  │  🔒 Ed25519 + JCS               👁 OBSERVABILITY trace en    │
  │                                    continu (colonne cyan)    │
  └──────────────────────────────────────────────────────────────┘

## Direction explicite sur les self-calls et calls internes

L'étape ⑥ contient un call interne `INSURANCE → REPUTATION` (lookup
score). Pour ce genre de call interne, utiliser une flèche COURBE
(pas droite) qui part de la colonne INSURANCE et revient à la même
colonne après être passée par REPUTATION. Label `(internal call,
HTTP, cache 60s)`.

## Format final recommandé

- **Format A4 portrait**, 210 × 297 mm équivalent, 96 dpi base.
- **Hauteur SVG indicative** : 1400-1800 px pour les 12 étapes.
- **Largeur** : 900-1100 px (7 colonnes × ~140 px chacune).
- **Marges** : 60 px haut/bas, 40 px gauche/droite.
- Si la version A4 est trop dense malgré les règles ci-dessus,
  produire une version sur **2 pages** : étapes ①-⑥ sur la première,
  ⑦-⑫ sur la seconde, avec une bande de continuité visuelle
  (pointillé descendant) en bas de la première et haut de la
  seconde.

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
- **Schéma #2-bis — Workflow horizontal "phases"** (alternative au sequence diagram) — voir ci-dessous.

### Variante "Workflow horizontal par phases" (alternative au sequence diagram)

Si la séquence verticale reste compliquée à lire malgré les règles strictes du §"Lisibilité", produire une variante **flow horizontal** :

**Layout** : paysage 16:9, 4 phases en bandes verticales de gauche à droite :

```
┌──────────────┬───────────────┬──────────────┬──────────────────┐
│ 1. DÉCOUVERTE│ 2. NÉGOCIATION│ 3. GARANTIE  │ 4. LIVRAISON     │
│              │               │              │ + FEEDBACK       │
│ ① score B    │ ② start       │ ⑥ quote      │ ⑧ exécution      │
│              │ ③ propose A   │ ⑦ subscribe  │ ⑨ memory.store   │
│              │ ④ counter B   │              │ ⑩ memory.search  │
│              │ ⑤ settle      │              │ ⑪ feedback       │
│              │               │              │ ⑫ release escrow │
│              │               │              │                  │
│ Module       │ Module        │ Module       │ Modules          │
│ REPUTATION   │ NEGOTIATION   │ INSURANCE    │ MEMORY +         │
│              │               │              │ REPUTATION +     │
│              │               │              │ INSURANCE        │
└──────────────┴───────────────┴──────────────┴──────────────────┘
```

Au-dessus, une grosse flèche horizontale traversante avec dégradé subtil indique le **temps qui passe** (gauche → droite). En dessous, une barre cyan transparente symbolise OBSERVABILITY qui trace tout en continu.

Avantages : un coup d'œil suffit à comprendre la séquence et le rôle de chaque module ; pas de risque de confusion sur le sens des flèches puisqu'il n'y a qu'**une seule direction globale**. Inconvénient : moins de détail sur les payloads et signatures — réservé aux slides synthétiques et aux pages d'accueil. Le diagramme de séquence détaillé reste la référence pour la doc technique.
