# Colber — schémas

> Versions Mermaid (`.md`) prêtes à l'emploi : rendues nativement par GitHub, éditables sans outil externe.
> Pour les versions SVG vectorielles produites par Claude Design, voir le brief [../DESIGN_BRIEF.md](../DESIGN_BRIEF.md).

## Index

| Schéma                                                 | Type                                 | Cible                                   |
| ------------------------------------------------------ | ------------------------------------ | --------------------------------------- |
| [colber-functional.md](colber-functional.md)           | Mermaid `flowchart TB` (grille)      | Doc technique, README, onboarding       |
| [colber-functional-hub.md](colber-functional-hub.md)   | Mermaid `flowchart TB` (hub & spoke) | Slide hero, pitch deck, page d'accueil  |
| [colber-workflow-a2a.md](colber-workflow-a2a.md)       | Mermaid `sequenceDiagram`            | Doc technique détaillée, onboarding dev |
| [colber-workflow-phases.md](colber-workflow-phases.md) | Mermaid `flowchart LR` (4 phases)    | Slide synthétique, page d'accueil       |

## Code couleur Colber

Couleurs cohérentes dans tous les schémas et la documentation :

| Module           | Couleur primaire | Hex       | Fond clair |
| ---------------- | ---------------- | --------- | ---------- |
| REPUTATION       | Bleu profond     | `#1E3A8A` | `#EFF4FF`  |
| MEMORY           | Violet           | `#7C3AED` | `#F5EFFF`  |
| OBSERVABILITY    | Cyan             | `#0891B2` | `#ECFAFE`  |
| NEGOTIATION      | Orange           | `#EA580C` | `#FFF1E6`  |
| INSURANCE        | Vert             | `#059669` | `#E8F8F0`  |
| `agent-identity` | Gris (neutre)    | `#475569` | `#F1F5F9`  |

## Conventions

- **Endpoints MCP** sont nommés en `module.verb` (ex: `reputation.score`, `negotiation.settle`).
- **Signatures cryptographiques** sont marquées 🔒 (Ed25519 + JCS RFC 8785).
- **Marqueurs de phase** : `v1` actif, `v1.1` proche futur, `P2` après v1, `P3` post-audit on-chain.

## Édition

Les schémas Mermaid sont du DSL textuel. Pour éditer :

1. Ouvre le `.md` correspondant.
2. Modifie le bloc entre ` ```mermaid ` et ` ``` `.
3. Prévisualise avec [Mermaid Live Editor](https://mermaid.live) ou directement sur GitHub (rendu auto).
4. Push — GitHub re-rend automatiquement.

## Référence brief Claude Design

Pour les versions vectorielles SVG (à demander à Claude Design ou un graphiste) avec les règles strictes de lisibilité :

- [DESIGN_BRIEF.md §"Schéma #1 fonctionnel"](../DESIGN_BRIEF.md) — règles d'amélioration spécifiques.
- [DESIGN_BRIEF.md §"Schéma #2 workflow"](../DESIGN_BRIEF.md) — règles strictes sur le sens des flèches.
