# Praxis

> Plateforme d'infrastructure pour l'économie agentique.
> Cinq services intégrés pour agents IA autonomes : **Insurance · Reputation · Observability · Negotiation · Memory**.

Praxis se positionne comme la couche de **trust, coordination & continuity** au-dessus des rails de paiement A2A (MoonPay, Coinbase x402, Nevermined). Là où ces acteurs gèrent la transaction monétaire, Praxis fournit ce qui permet aux agents de se _faire confiance_, _négocier_, _garantir leurs livrables_, _tracer leurs interactions_ et _se souvenir entre sessions_.

> Projet initialement nommé _AgentStack_ (cahier des charges v1.0). Renommé **Praxis** définitivement en avril 2026.

---

## Statut — snapshot

🟢 **Phase 1 (P1) — MVP REPUTATION + MEMORY** : 3 services livrés et déployés β.
🟡 **Phase 2 (P2) — OBSERVABILITY** : prochaine étape.

> État détaillé : [STATUS.md](STATUS.md).

### Livrables P0 (Préparation) — terminés

| Livrable                                         | Statut |
| ------------------------------------------------ | ------ |
| Cahier des charges fonctionnel et technique v1.0 | ✅     |
| Plan de développement (5 phases / 32 sprints)    | ✅     |
| Architecture breakdown (modèle C4 + WBS)         | ✅     |
| Stack Docker de test (option A — cohabitation)   | ✅     |
| Repo GitHub `Obi49/Praxis` initialisé            | ✅     |

### Livrables P1 — partiellement terminés

| Livrable                              | Statut | Détails                                                     |
| ------------------------------------- | ------ | ----------------------------------------------------------- |
| Monorepo Turborepo + pnpm             | ✅     | 5 packages partagés, ESLint v9, Vitest, Husky               |
| Service `agent-identity`              | ✅     | DID:key Ed25519, REST + gRPC + MCP, déployé sur VM          |
| Module **REPUTATION** v1              | ✅     | Neo4j + scoring + attestations Ed25519, déployé             |
| Module **MEMORY** v1                  | ✅     | Qdrant + Ollama embeddings (nomic-embed-text 768d), déployé |
| SDK TS / Python officiels             | ⏳     | À venir P1.7                                                |
| Console opérateur web                 | ⏳     | À venir P1.6                                                |
| Listage AgenticTrade / MCP Registries | ⏳     | À venir P1.8                                                |

### Livrables P2 → P4 — à venir

| Module / Lot                                        | Phase | Sprint |
| --------------------------------------------------- | ----- | ------ |
| Module OBSERVABILITY (logs, traces, query, alerts)  | P2    | 9-13   |
| REPUTATION v2 (multi-dim, anti-Sybil, contestation) | P2    | 11-14  |
| Plugins LangChain / CrewAI / Autogen                | P2    | 13-16  |
| Module INSURANCE (pricing, escrow on-chain)         | P3    | 17-22  |
| Module NEGOTIATION (auctions, médiation LLM)        | P3    | 18-23  |
| Multi-région + Enterprise + GA                      | P4    | 25-32  |

### Tests et qualité (au moment de la pause)

- **161 tests verts** (78 memory + 62 reputation + 21 agent-identity + packages partagés).
- **Build / Typecheck / Lint** : tous FULL TURBO green.
- **E2E sur VM β** : 7/7 verts (register, resolve, verify, feedback signé, score+attestation, memory store, recherche sémantique).

---

## Documents de pilotage

- [Cahier des charges (v1.0)](AgentStack_Cahier_des_charges.docx) — spécifications fonctionnelles et techniques. _Document historique sous l'ancien nom AgentStack._
- [Plan de développement](PLAN_DE_DEVELOPPEMENT.md) — découpage en 5 phases sur 18 mois, 32 sprints, lots, gates de validation, KPI.
- [Architecture breakdown](ARCHITECTURE_BREAKDOWN.md) — décomposition technique modèle C4 (Context, Container, Component) + WBS, sécurité, conformité, SLO.

---

## Stack de test (β)

Voir [`praxis-stack/`](praxis-stack/) — Docker Compose pour environnement de développement, et [praxis-stack/DEPLOY.md](praxis-stack/DEPLOY.md) pour le runbook complet.

**Datastores et infra** déployés sur la VM β (Tailscale `100.83.10.125`) :
PostgreSQL · Redis · NATS JetStream · Qdrant 1.15.4 · ClickHouse · Neo4j · Ollama (`nomic-embed-text`) · Prometheus · Grafana · Traefik.

**Services applicatifs Praxis** déployés et healthy :
| Service | HTTP | gRPC | DB Postgres |
|---------|------|------|-------------|
| `praxis-agent-identity` | 14001 | 14002 | `praxis_identity` |
| `praxis-reputation` | 14011 | 14012 | `praxis_reputation` |
| `praxis-memory` | 14021 | 14022 | `praxis_memory` |

Smoke E2E : `PRAXIS_VM=100.83.10.125 python .tools/e2e_smoke.py`

---

## Architecture cible (résumé)

**5 modules** exposés via MCP / REST / gRPC, partageant une identité agentique unifiée (DID + signatures Ed25519/secp256k1).

| Module            | Rôle                                                  | Stockage primaire          |
| ----------------- | ----------------------------------------------------- | -------------------------- |
| **REPUTATION**    | Oracle de fiabilité agentique multi-dimensionnel      | Neo4j + ancrage on-chain   |
| **MEMORY**        | Mémoire externe persistante avec recherche sémantique | Qdrant + Postgres          |
| **OBSERVABILITY** | Logging/tracing distribué A2A                         | ClickHouse                 |
| **NEGOTIATION**   | Broker de négociation A2A multi-parties               | Event store                |
| **INSURANCE**     | Garantie de livrable agentique avec escrow            | Postgres + smart contracts |

Détails : [ARCHITECTURE_BREAKDOWN.md](ARCHITECTURE_BREAKDOWN.md).

---

## Stack technique

| Couche           | Choix                                                      | Raison                                           |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Backend          | TypeScript/Node + Rust (modules critiques)                 | Écosystème MCP mature en TS, perf crypto en Rust |
| Orchestration    | Kubernetes managé                                          | Standard, scalabilité                            |
| Bus événements   | NATS JetStream                                             | Léger, performant                                |
| API Gateway      | Kong / Cloudflare Workers                                  | Latence faible                                   |
| Bases de données | Postgres, Neo4j, Qdrant, ClickHouse, Redis                 | Spécialisé par module                            |
| Blockchain       | Base L2 (Coinbase) + Optimism / Arbitrum                   | Écosystème agentique le plus actif               |
| Stablecoin       | USDC                                                       | Régulation claire, adoption                      |
| Standards        | MCP, A2A, x402, OpenTelemetry, DID, Verifiable Credentials | Interopérabilité                                 |

---

## Auteur

Johan — Chef de projet — `dof1502.mwm27@gmail.com`
