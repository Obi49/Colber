# Praxis

> Plateforme d'infrastructure pour l'économie agentique.
> Cinq services intégrés pour agents IA autonomes : **Insurance · Reputation · Observability · Negotiation · Memory**.

Praxis se positionne comme la couche de **trust, coordination & continuity** au-dessus des rails de paiement A2A (MoonPay, Coinbase x402, Nevermined). Là où ces acteurs gèrent la transaction monétaire, Praxis fournit ce qui permet aux agents de se *faire confiance*, *négocier*, *garantir leurs livrables*, *tracer leurs interactions* et *se souvenir entre sessions*.

> Projet initialement nommé *AgentStack* (cahier des charges v1.0). Renommé **Praxis** définitivement en avril 2026.

---

## Statut

🟡 **Phase 0 — Préparation** (M0 → M2)
Mise en place de l'équipe, infrastructure de base, environnement de test β, recrutement opérateurs pilotes.

| Livrable | Statut |
|----------|--------|
| Cahier des charges fonctionnel et technique v1.0 | ✅ |
| Plan de développement (5 phases / 32 sprints) | ✅ |
| Architecture breakdown (modèle C4 + WBS) | ✅ |
| Stack Docker de test (option A — cohabitation) | ✅ |
| Monorepo Turborepo + pnpm | ⏳ en cours |
| Service `agent-identity` (DID, signatures) | ⏳ |
| Module REPUTATION (β) | À venir |
| Module MEMORY (β) | À venir |

---

## Documents de pilotage

- [Cahier des charges (v1.0)](AgentStack_Cahier_des_charges.docx) — spécifications fonctionnelles et techniques. *Document historique sous l'ancien nom AgentStack.*
- [Plan de développement](PLAN_DE_DEVELOPPEMENT.md) — découpage en 5 phases sur 18 mois, 32 sprints, lots, gates de validation, KPI.
- [Architecture breakdown](ARCHITECTURE_BREAKDOWN.md) — décomposition technique modèle C4 (Context, Container, Component) + WBS, sécurité, conformité, SLO.

---

## Stack de test (β)

Voir [`praxis-stack/`](praxis-stack/) — Docker Compose pour environnement de développement.

Services déployés sur la VM de test (Tailscale `100.83.10.125`) :
PostgreSQL · Redis · NATS JetStream · Qdrant · ClickHouse · Neo4j · Ollama (`nomic-embed-text`) · Prometheus · Grafana · Traefik.

---

## Architecture cible (résumé)

**5 modules** exposés via MCP / REST / gRPC, partageant une identité agentique unifiée (DID + signatures Ed25519/secp256k1).

| Module | Rôle | Stockage primaire |
|--------|------|-------------------|
| **REPUTATION** | Oracle de fiabilité agentique multi-dimensionnel | Neo4j + ancrage on-chain |
| **MEMORY** | Mémoire externe persistante avec recherche sémantique | Qdrant + Postgres |
| **OBSERVABILITY** | Logging/tracing distribué A2A | ClickHouse |
| **NEGOTIATION** | Broker de négociation A2A multi-parties | Event store |
| **INSURANCE** | Garantie de livrable agentique avec escrow | Postgres + smart contracts |

Détails : [ARCHITECTURE_BREAKDOWN.md](ARCHITECTURE_BREAKDOWN.md).

---

## Stack technique

| Couche | Choix | Raison |
|--------|-------|--------|
| Backend | TypeScript/Node + Rust (modules critiques) | Écosystème MCP mature en TS, perf crypto en Rust |
| Orchestration | Kubernetes managé | Standard, scalabilité |
| Bus événements | NATS JetStream | Léger, performant |
| API Gateway | Kong / Cloudflare Workers | Latence faible |
| Bases de données | Postgres, Neo4j, Qdrant, ClickHouse, Redis | Spécialisé par module |
| Blockchain | Base L2 (Coinbase) + Optimism / Arbitrum | Écosystème agentique le plus actif |
| Stablecoin | USDC | Régulation claire, adoption |
| Standards | MCP, A2A, x402, OpenTelemetry, DID, Verifiable Credentials | Interopérabilité |

---

## Auteur

Johan — Chef de projet — `dof1502.mwm27@gmail.com`
