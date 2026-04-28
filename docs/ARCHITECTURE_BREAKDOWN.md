# ARCHITECTURE BREAKDOWN — PRAXIS

> **Note de rebrand (avril 2026)** : projet initialement nommé _AgentStack_, renommé **Praxis**.

**Document de décomposition technique — v1.0**
**Auteur : Johan (Chef de projet) — Avril 2026**
**Référence : `AgentStack_Cahier_des_charges.docx` v1.0 (§3 Architecture technique)**

---

## 0. Lecture du document

Ce document décompose l'architecture Praxis à 4 niveaux :

1. **Vue système (C1)** — contexte, acteurs, flux externes.
2. **Vue conteneurs (C2)** — couches techniques et runtimes principaux.
3. **Vue composants (C3)** — services, modules et stockages internes.
4. **Vue transverse** — sécurité, données, déploiement, observabilité.

Inspiré du modèle **C4 (Simon Brown)** + WBS (Work Breakdown Structure).

---

## 1. VUE SYSTÈME (C1) — Contexte global

### 1.1 Acteurs

| Acteur                      | Type                   | Mode d'interaction                           |
| --------------------------- | ---------------------- | -------------------------------------------- |
| **Agent IA autonome**       | Utilisateur primaire   | MCP, REST, gRPC, signature crypto            |
| **Opérateur humain**        | Utilisateur secondaire | Console web, API admin                       |
| **Développeur tiers**       | Intégrateur            | SDK TS/Python/Go/Rust, plugins frameworks    |
| **Plateforme A2A externe**  | Système                | API publiques, standard de réputation ouvert |
| **Smart contract on-chain** | Système                | RPC Ethereum L2 (Base, Optimism, Arbitrum)   |
| **Régulateur / DPA**        | Compliance             | Exports RGPD, audit logs                     |

### 1.2 Systèmes externes consommés

| Système                                                    | Usage                                                        | Criticité |
| ---------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| **Coinbase x402**                                          | Paiement HTTP natif par appel                                | Haute     |
| **Base L2 (Coinbase)**                                     | Ancrage réputation, escrow INSURANCE, signatures NEGOTIATION | Haute     |
| **Optimism / Arbitrum**                                    | Multi-chain, fallback                                        | Moyenne   |
| **USDC issuer (Circle)**                                   | Stablecoin de référence                                      | Haute     |
| **Embedding providers** (OpenAI, Voyage, Cohere, Nomic)    | Vectorisation MEMORY                                         | Haute     |
| **LLM providers** (Claude, GPT, Mistral)                   | Médiation NEGOTIATION, scoring sémantique                    | Moyenne   |
| **DID method registries** (did:key, did:web, did:ethr)     | Identité décentralisée                                       | Haute     |
| **OpenTelemetry collectors externes** (Datadog, Honeycomb) | Export observability                                         | Faible    |

### 1.3 Flux principal — transaction A2A typique

```
Agent A ──┐
          │ 1. reputation.score(agent_B)            ──► REPUTATION
          │ 2. negotiation.start(agent_B, terms)    ──► NEGOTIATION
          │ 3. insurance.quote(deal)                ──► INSURANCE
          │ 4. insurance.subscribe()                ──► INSURANCE → wallet escrow
          │ 5. observability.trace(...)             ──► OBSERVABILITY (en continu)
          │ 6. memory.store(deal_outcome)           ──► MEMORY
          ▼
Agent B (mêmes endpoints, autre identité agentique)
```

---

## 2. VUE CONTENEURS (C2) — Couches techniques

Conformément au CDC §3.2, la plateforme est organisée en **4 couches**.

```
┌─────────────────────────────────────────────────────────────┐
│ Couche 1 — EDGE & AUTHENTIFICATION                          │
│  • API Gateway (Kong / Cloudflare Workers)                  │
│  • Auth crypto (Ed25519, ECDSA secp256k1)                   │
│  • Rate limiting, blacklist dynamique, WAF                  │
│  • MCP Registry & service discovery                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ Couche 2 — SERVICES APPLICATIFS (microservices K8s)         │
│  ┌──────────┬───────────┬────────────┬───────────┬────────┐ │
│  │INSURANCE │REPUTATION │OBSERVABILITY│NEGOTIATION│ MEMORY │ │
│  └────┬─────┴─────┬─────┴──────┬─────┴─────┬─────┴────┬───┘ │
│       │           │            │           │          │     │
│  ┌────▼───────────▼────────────▼───────────▼──────────▼───┐ │
│  │  SERVICES TRANSVERSES                                  │ │
│  │  • agent-identity   • billing      • notifications     │ │
│  │  • wallet-platform  • metering     • audit-log         │ │
│  └──────────────────────┬─────────────────────────────────┘ │
│                         │                                   │
│   Bus d'événements : NATS JetStream (gRPC interne)          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│ Couche 3 — DONNÉES                                          │
│  • PostgreSQL (transactionnel)                              │
│  • Neo4j / DGraph (graphe REPUTATION)                       │
│  • Qdrant (vecteurs MEMORY)                                 │
│  • ClickHouse (logs/traces OBSERVABILITY)                   │
│  • Redis (cache, rate limit, session)                       │
│  • Object storage S3 (archives, blobs)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│ Couche 4 — BLOCKCHAIN & PAIEMENTS                           │
│  • Wallet de plateforme (chaud) + cold storage              │
│  • Smart contracts ancrage (réputation Merkle root)         │
│  • Smart contracts INSURANCE (escrow, claim, slashing)      │
│  • Smart contracts NEGOTIATION (signature multi-parties)    │
│  • Intégration x402 (HTTP 402 Payment Required)             │
│  • Multi-chain : Base (priorité), Optimism, Arbitrum        │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Détail Couche 1 — Edge & Authentification

| Composant        | Techno                                    | Responsabilité                                         |
| ---------------- | ----------------------------------------- | ------------------------------------------------------ |
| **API Gateway**  | Kong (auto-hébergé) ou Cloudflare Workers | Routage, TLS termination, rate limit, WAF              |
| **MCP Registry** | Kong MCP plugin / OSS custom              | Découverte des outils MCP exposés                      |
| **Auth service** | Rust (perf crypto)                        | Vérification signatures Ed25519/ECDSA, JWT short-lived |
| **DID resolver** | TS + caches                               | Résolution did:key, did:web, did:ethr                  |
| **Anti-abuse**   | Redis + ML                                | Détection patterns abusifs, blacklist dynamique        |
| **CDN/Edge**     | Cloudflare                                | Latence < 100 ms mondial (CDC §3.2)                    |

### 2.2 Détail Couche 2 — Microservices

Chaque module est un **bounded context** au sens DDD, avec :

- son propre dépôt (monorepo Turborepo ou polyrepo).
- son propre schéma de base de données.
- ses propres endpoints MCP, REST, gRPC.
- son propre quota et SLA.
- une équipe owner identifiée.

**Communication inter-services** :

- **Synchrone** : gRPC (Protobuf) sur le service mesh interne (Linkerd ou Istio).
- **Asynchrone** : NATS JetStream avec topics versionnés (`v1.agent.created`, `v1.transaction.completed`).
- **Event sourcing** sur NEGOTIATION (event store dédié — voir §3.4).

### 2.3 Détail Couche 3 — Données

| Stockage                                | Modules consommateurs                                              | Pattern                              |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| **PostgreSQL** (managed RDS / CloudSQL) | identity, billing, INSURANCE polices, NEGOTIATION snapshots, audit | OLTP, multi-tenant par schéma        |
| **Neo4j** (Aura ou self-hosted)         | REPUTATION (graphe agents/tx/feedbacks)                            | Graph queries, Cypher                |
| **Qdrant** (managed ou self)            | MEMORY (vecteurs + payload)                                        | Recherche sémantique top-k, filtrage |
| **ClickHouse**                          | OBSERVABILITY (logs, traces, metrics)                              | OLAP, ingestion massive              |
| **Redis**                               | Tous (cache, rate limit, sessions)                                 | KV, Pub/Sub, scripts Lua             |
| **S3 / GCS**                            | OBSERVABILITY archives, MEMORY exports, smart contract artifacts   | Object store, lifecycle policies     |

### 2.4 Détail Couche 4 — Blockchain & paiements

| Composant                       | Techno                           | Rôle                                            |
| ------------------------------- | -------------------------------- | ----------------------------------------------- |
| **Wallet platform**             | Safe (Gnosis) multisig + AWS KMS | Détention fonds INSURANCE, paiements opérateurs |
| **Wallet hot/cold split**       | 5 % hot / 95 % cold              | Sécurité (CDC §8 R7)                            |
| **Smart contracts REPUTATION**  | Solidity 0.8.x + Foundry         | Ancrage Merkle root quotidien                   |
| **Smart contracts INSURANCE**   | Solidity + audits ToB/OZ         | Escrow, claim, slashing                         |
| **Smart contracts NEGOTIATION** | Solidity                         | Signatures multi-parties EIP-712                |
| **x402 client**                 | TS SDK                           | Réception paiements HTTP 402                    |
| **RPC providers**               | Alchemy + Infura (HA)            | Connectivité L2                                 |
| **Indexer**                     | The Graph ou Ponder self-hosted  | Indexation events on-chain                      |

---

## 3. VUE COMPOSANTS (C3) — Décomposition par module

### 3.1 Module REPUTATION

```
reputation/
├── api/
│   ├── grpc-server          # gRPC interne
│   ├── rest-handler         # /v1/reputation/*
│   └── mcp-handler          # reputation.score, history, verify, feedback
├── domain/
│   ├── scoring-engine       # algos multi-dimensionnels
│   ├── feedback-validator   # vérif signature, anti-spam
│   ├── sybil-detector       # graph clustering, ML
│   └── attestation-builder  # signature des scores
├── persistence/
│   ├── neo4j-repository     # CRUD graphe agents/tx/feedbacks
│   └── postgres-repository  # configuration, opérateurs
├── on-chain/
│   ├── merkle-anchorer      # batch quotidien sur Base
│   └── verifier             # vérification de proofs
└── workers/
    ├── score-recomputer     # recalcul périodique (cron)
    └── fraud-scanner        # détection anomalies
```

**Endpoints MCP** (CDC §2.2) :

- `reputation.score` → lecture, p95 < 200 ms.
- `reputation.history` → lecture paginée.
- `reputation.verify` → vérification cryptographique d'attestation.
- `reputation.feedback` → écriture signée post-tx.

**Données** :

- Graphe : nodes `Agent`, `Transaction`, `Feedback`. Edges : `PARTICIPATED_IN`, `RATED`, `OWNS`.
- Tables Postgres : `operators`, `agent_keys`, `merkle_anchors`.

### 3.2 Module MEMORY

```
memory/
├── api/
│   ├── grpc-server
│   ├── rest-handler         # /v1/memory/*
│   └── mcp-handler          # memory.store, retrieve, update, share
├── domain/
│   ├── memory-classifier    # fait / événement / préférence / relation
│   ├── compressor           # compression sémantique mémoires anciennes
│   ├── permission-engine    # privé / opérateur / public
│   └── encryption-service   # chiffrement E2E (libsodium)
├── persistence/
│   ├── qdrant-repository    # vecteurs + payload
│   ├── postgres-repository  # métadonnées, versions, ACL
│   └── s3-repository        # exports, blobs >256KB
└── workers/
    ├── embedder             # batch embeddings (multi-providers)
    └── compactor            # compression mémoires inactives
```

**Endpoints MCP** (CDC §2.5) :

- `memory.store` → écriture, génération embedding, ACL.
- `memory.retrieve` → recherche sémantique avec scoring.
- `memory.update` → versionnement, audit trail.
- `memory.share` → partage signé entre agents.

**Données** :

- Qdrant : collections par opérateur, payload structuré.
- Postgres : `memories_meta`, `memory_versions`, `memory_shares`, `memory_quotas`.

### 3.3 Module OBSERVABILITY

```
observability/
├── ingestion/
│   ├── otlp-receiver        # OpenTelemetry OTLP gRPC + HTTP
│   ├── log-receiver         # endpoint custom
│   └── batcher              # mise en lots ClickHouse
├── api/
│   ├── query-handler        # langage simplifié type Lucene
│   ├── alert-handler        # règles déclaratives
│   └── mcp-handler          # observability.log, trace, query, alert
├── domain/
│   ├── trace-context-prop   # W3C Trace Context, A2A custom headers
│   ├── anomaly-detector     # ML latence, échecs cascade, budget
│   └── alert-engine         # évaluation règles, déclenchement
├── persistence/
│   ├── clickhouse-repo      # logs, traces (table partitionnée par jour)
│   └── tiering-manager      # chaud → tiède → S3 Glacier
└── exporters/
    ├── otel-exporter        # vers Datadog, Honeycomb, Jaeger
    └── grafana-datasource   # plugin custom
```

**Endpoints MCP** (CDC §2.3) :

- `observability.log` → ingestion event.
- `observability.trace` → démarrage / propagation trace.
- `observability.query` → recherche logs/traces.
- `observability.alert` → configuration alerte programmatique.

### 3.4 Module NEGOTIATION

```
negotiation/
├── api/
│   ├── grpc-server
│   ├── rest-handler
│   └── mcp-handler          # negotiation.start, propose, counter, settle
├── domain/
│   ├── strategies/
│   │   ├── ascending-auction
│   │   ├── descending-auction
│   │   ├── multi-criteria
│   │   └── weighted-vote
│   ├── batna-evaluator      # évaluation contraintes / BATNA
│   ├── mediator             # LLM spécialisé pour propositions impasse
│   └── contract-signer      # EIP-712 multi-parties
├── persistence/
│   ├── event-store          # source of truth (append-only)
│   ├── snapshots-postgres   # projections matérialisées
│   └── archived-deals       # S3 cold
└── integrations/
    ├── insurance-bridge     # auto-coverage du contrat
    └── reputation-bridge    # alimentation feedback post-deal
```

**Endpoints MCP** (CDC §2.4) :

- `negotiation.start`, `negotiation.propose`, `negotiation.counter`, `negotiation.settle`.

**Pattern** : event sourcing strict, projections rebuildables, snapshots tous les N events.

### 3.5 Module INSURANCE

```
insurance/
├── api/
│   ├── grpc-server
│   ├── rest-handler
│   └── mcp-handler          # insurance.quote, subscribe, claim, status
├── domain/
│   ├── pricing-engine       # prime = f(montant, réputation, livrable, historique)
│   ├── sla-evaluator        # vérification respect SLA
│   ├── claim-arbitrator     # oracles configurables, automatisation
│   ├── liquidity-manager    # réserve on-chain, capacité résiduelle
│   └── circuit-breaker      # plafond global engagement
├── persistence/
│   ├── postgres-repo        # polices, sinistres, primes
│   └── redis-cache          # devis temps réel
├── on-chain/
│   ├── escrow-manager       # smart contract escrow
│   ├── claim-executor       # paiement automatique sinistre
│   └── reserve-monitor      # surveillance réserve
└── partners/
    └── reinsurer-adapter    # partenaire assurantiel ou DAO (CDC §10.4)
```

**Endpoints MCP** (CDC §2.1) :

- `insurance.quote`, `insurance.subscribe`, `insurance.claim`, `insurance.status`.

### 3.6 Services transverses

#### 3.6.1 `agent-identity`

- Enregistrement DID + clé publique.
- Vérification signatures.
- Émission JWT court-vie pour calls authentifiés.
- Issuance Verifiable Credentials.

#### 3.6.2 `wallet-platform`

- Wallets délégués pour agents (smart wallet style ERC-4337 ou custodial light).
- Multisig pour fonds plateforme.
- Connecteurs RPC multi-chain.

#### 3.6.3 `billing`

- Métering par module.
- Calcul facture mensuelle (USD / EUR / USDC).
- Débit auto via x402 ou via wallet opérateur.
- Reporting opérateur.

#### 3.6.4 `metering`

- Compteurs Prometheus + ClickHouse pour audit.
- Quotas free tier appliqués en gateway et en service.

#### 3.6.5 `notifications`

- Webhooks signés.
- Email/Slack pour opérateurs humains.

#### 3.6.6 `audit-log`

- Log append-only de toute action sensible (RGPD, sécu).
- Stockage S3 WORM (Object Lock).

---

## 4. VUE TRANSVERSE

### 4.1 Sécurité

| Domaine             | Implémentation                                             |
| ------------------- | ---------------------------------------------------------- |
| **Auth agents**     | Signature Ed25519 ou ECDSA secp256k1 par appel             |
| **Auth opérateurs** | OAuth 2.1 + MFA, SSO SAML enterprise (P4)                  |
| **Transport**       | TLS 1.3 minimum (CDC §4.2)                                 |
| **At-rest**         | AES-256-GCM via KMS (AWS KMS / GCP KMS)                    |
| **E2E**             | libsodium pour mémoires sensibles                          |
| **Secrets**         | HashiCorp Vault + dynamic secrets                          |
| **Multi-tenancy**   | Row-Level Security Postgres + isolation Qdrant collections |
| **SAST/SCA**        | Semgrep + Snyk dans CI                                     |
| **Image scan**      | Trivy + Cosign signature                                   |
| **Smart contracts** | Audit Trail of Bits / OpenZeppelin avant prod (P3)         |
| **Bug bounty**      | Immunefi (smart contracts) + HackerOne (web/API) — P3      |
| **Threat model**    | STRIDE par module, mise à jour à chaque release majeure    |

### 4.2 Conformité (CDC §4.3)

| Exigence                | Implémentation                                                                |
| ----------------------- | ----------------------------------------------------------------------------- |
| **RGPD**                | DPA opérateurs UE, registre traitements, DPIA, droit à l'oubli automatisé     |
| **Pseudonymisation**    | Agents = identifiants cryptographiques sans lien direct avec opérateur humain |
| **MiCA**                | Conformité stablecoin USDC en Europe, KYB opérateurs                          |
| **AI Act anticipation** | Logging décisions automatisées, traçabilité INSURANCE et NEGOTIATION          |
| **Data residency**      | Sharding par région (P4), routage strict EU pour données européennes          |

### 4.3 Multi-tenancy

| Niveau      | Isolation                                             |
| ----------- | ----------------------------------------------------- |
| **Logique** | Row-Level Security par `operator_id`                  |
| **Données** | Schémas Postgres séparés pour gros opérateurs         |
| **Réseau**  | NetworkPolicy K8s entre namespaces sensibles          |
| **Quota**   | Cloudflare/Kong rate limit par opérateur ET par agent |
| **Crypto**  | Clés KMS par opérateur sur tier enterprise            |

### 4.4 Déploiement

```
Régions : eu-west-1 (P1), us-east-1 (P4), ap-southeast-1 (P4)

┌────────────────────────────────────────────────────────────┐
│  Cluster K8s (managed EKS / GKE)                           │
│   ├─ namespace: edge       (gateway, auth)                 │
│   ├─ namespace: core       (services transverses)          │
│   ├─ namespace: reputation                                 │
│   ├─ namespace: memory                                     │
│   ├─ namespace: observability                              │
│   ├─ namespace: negotiation                                │
│   ├─ namespace: insurance                                  │
│   ├─ namespace: data       (NATS, Redis, ClickHouse)       │
│   └─ namespace: monitoring (Prometheus, Grafana, Loki)     │
└────────────────────────────────────────────────────────────┘
```

| Aspect           | Choix                                                               |
| ---------------- | ------------------------------------------------------------------- |
| **IaC**          | Terraform + Helm                                                    |
| **Service mesh** | Linkerd (légèreté)                                                  |
| **GitOps**       | ArgoCD                                                              |
| **Releases**     | Progressive delivery (Argo Rollouts) — canary 5/25/100%             |
| **DR**           | Backup quotidien Postgres + Velero pour K8s, RTO 1h, RPO 5 min (P4) |
| **Autoscaling**  | HPA (CPU/RPS) + KEDA (NATS lag) + Cluster Autoscaler                |

### 4.5 Observabilité interne (CDC §4.5)

| Pilier           | Outil                                       |
| ---------------- | ------------------------------------------- |
| **Métriques**    | Prometheus + Thanos (long terme)            |
| **Logs**         | Loki (compactes) + ClickHouse (analytique)  |
| **Traces**       | OpenTelemetry → Jaeger ou self-hosted Tempo |
| **Dashboards**   | Grafana (par module, par SLO)               |
| **Alerting**     | Alertmanager → PagerDuty + Slack            |
| **SLO tracking** | Sloth (générateur SLO Prometheus)           |

### 4.6 SLO contractualisés

| Module              | Lecture p95 | Écriture p95         | Disponibilité |
| ------------------- | ----------- | -------------------- | ------------- |
| REPUTATION.score    | 200 ms      | —                    | 99,9 %        |
| REPUTATION.feedback | —           | 500 ms               | 99,9 %        |
| MEMORY.retrieve     | 200 ms      | —                    | 99,9 %        |
| MEMORY.store        | —           | 500 ms               | 99,9 %        |
| OBSERVABILITY.log   | —           | 100 ms (P95 d'ack)   | 99,95 %       |
| NEGOTIATION.\*      | 300 ms      | 500 ms               | 99,9 %        |
| INSURANCE.quote     | 300 ms      | —                    | 99,9 %        |
| INSURANCE.subscribe | —           | 1 s (incl. on-chain) | 99,9 %        |

Conformément à CDC §4.1 — cible globale 99,9 % an 1, 99,95 % an 2.

### 4.7 Capacity planning

| Charge                 | Cible   | Burst   | Méthode                                  |
| ---------------------- | ------- | ------- | ---------------------------------------- |
| RPS global             | 10 000  | 50 000  | HPA + KEDA, autoscaling 5 min (CDC §4.4) |
| Events OBSERVABILITY/s | 100 000 | 500 000 | ClickHouse cluster, batching agressif    |
| MAA (M+24)             | 10 000  | 30 000  | Sharding par opérateur (P4)              |

---

## 5. WBS — Work Breakdown Structure

### Niveau 0 : PRAXIS

- **1. Plateforme transverse**
  - 1.1 agent-identity
  - 1.2 wallet-platform
  - 1.3 billing & metering
  - 1.4 notifications & audit-log
  - 1.5 console opérateur
  - 1.6 SDK (TS, Python, Go, Rust)
- **2. Module REPUTATION**
  - 2.1 API (REST, gRPC, MCP)
  - 2.2 Scoring engine
  - 2.3 Anti-fraude
  - 2.4 Ancrage on-chain
- **3. Module MEMORY**
  - 3.1 API (REST, gRPC, MCP)
  - 3.2 Embeddings & retrieval
  - 3.3 Permissions & chiffrement
  - 3.4 Compression sémantique
- **4. Module OBSERVABILITY**
  - 4.1 Ingestion (OTLP)
  - 4.2 Query API
  - 4.3 Alerting & anomaly
  - 4.4 Tiering & exports
- **5. Module NEGOTIATION**
  - 5.1 API (REST, gRPC, MCP)
  - 5.2 Stratégies (auctions, multi-critères)
  - 5.3 Médiation LLM
  - 5.4 Signature contractuelle on-chain
- **6. Module INSURANCE**
  - 6.1 API (REST, gRPC, MCP)
  - 6.2 Pricing engine
  - 6.3 Smart contracts escrow/claim
  - 6.4 Partenariat assurantiel
- **7. Infrastructure**
  - 7.1 Cluster K8s + IaC Terraform
  - 7.2 CI/CD GitHub Actions + ArgoCD
  - 7.3 Service mesh + observabilité interne
  - 7.4 Multi-région (P4)
  - 7.5 DR & backups
- **8. Sécurité & conformité**
  - 8.1 Auth crypto + Vault
  - 8.2 Audits SAST/SCA/pentest
  - 8.3 RGPD / DPA / DPIA
  - 8.4 MiCA + AI Act
  - 8.5 Bug bounty
- **9. Go-to-market & écosystème**
  - 9.1 Documentation publique
  - 9.2 Plugins frameworks (LangChain, CrewAI, Autogen)
  - 9.3 Programme partenaires
  - 9.4 Standard ouvert réputation

---

## 6. Matrice de dépendances inter-modules

| ▼ Dépend de … / Module ▶ | identity | wallet | billing | REPUTATION | MEMORY | OBSERV. | NEGOT. | INSUR. |
| ------------------------ | -------- | ------ | ------- | ---------- | ------ | ------- | ------ | ------ |
| **identity**             | —        |        |         |            |        |         |        |        |
| **wallet**               | ✅       | —      |         |            |        |         |        |        |
| **billing**              | ✅       | ✅     | —       |            |        |         |        |        |
| **REPUTATION**           | ✅       |        | ✅      | —          |        |         |        |        |
| **MEMORY**               | ✅       |        | ✅      |            | —      |         |        |        |
| **OBSERVABILITY**        | ✅       |        | ✅      |            |        | —       |        |        |
| **NEGOTIATION**          | ✅       | ✅     | ✅      | ✅         |        | ✅      | —      |        |
| **INSURANCE**            | ✅       | ✅     | ✅      | ✅         |        | ✅      | ✅     | —      |

**Lecture** : INSURANCE consomme REPUTATION (pricing), wallet (escrow), NEGOTIATION (couverture du contrat), OBSERVABILITY (logs sinistres), identity et billing (transverses).

---

## 7. Choix techniques figés vs ouverts

### 7.1 Figés (cf. CDC §3.4 et décisions équipe)

- ✅ Backend principal **TypeScript/Node** + **Rust** pour modules critiques.
- ✅ **Kubernetes managé** (EKS ou GKE).
- ✅ Bus **NATS JetStream**.
- ✅ Base **PostgreSQL** managée.
- ✅ Vecteurs **Qdrant**.
- ✅ Logs **ClickHouse**.
- ✅ L2 prioritaire **Base** (Coinbase).
- ✅ Stablecoin **USDC**.
- ✅ Standards **MCP**, **A2A**, **x402**, **OpenTelemetry**, **DID**, **Verifiable Credentials**.

### 7.2 Ouverts (à arbitrer en P0)

- ❓ **AWS vs GCP** — analyse coûts + équipe (M1).
- ❓ **Kong vs Cloudflare Workers** pour gateway (M2).
- ❓ **Neo4j vs DGraph** pour REPUTATION (POC à mener M2).
- ❓ **Embedding provider par défaut** (OpenAI vs Voyage vs Nomic self-hosted) — M3.
- ❓ **Custodial vs ERC-4337 smart wallets** pour agents — M3.
- ❓ **Linkerd vs Istio** pour service mesh (Linkerd recommandé pour simplicité).
- ❓ **Monorepo Turborepo vs polyrepo** — décision M1.

---

## 8. Stratégie de versionning et compatibilité

### 8.1 API publiques

- **Semver strict** sur API publiques (REST, MCP, gRPC).
- Préfixe URL `/v1/`, `/v2/`, etc.
- **Rétention 90 jours minimum** pour anciennes versions (CDC §7.3).
- Annonce dépréciation 60 jours avant retrait.

### 8.2 Schémas MCP

- Versioning des outils MCP (`reputation.score@v1`, `reputation.score@v2`).
- Auto-discovery via MCP Registry avec versions multiples coexistantes.

### 8.3 Smart contracts

- **Immuables** par défaut, upgradeables uniquement via proxy UUPS pour INSURANCE et REPUTATION anchors.
- Multisig 3/5 pour upgrades (équipe + advisor).
- Timelock 48h sur upgrades.

### 8.4 Schémas de données

- Migrations Postgres versionnées (Flyway ou Atlas).
- Compatibilité **forward** assurée 2 versions, **backward** 1 version.
- Évolutions ClickHouse via materialized views non destructives.

---

## 9. Annexes

### 9.1 Glossaire technique complémentaire

- **DID** : Decentralized Identifier (W3C standard).
- **MCP** : Model Context Protocol (Anthropic).
- **A2A** : Agent-to-Agent (interaction inter-agents).
- **x402** : protocole HTTP 402 Payment Required (Coinbase).
- **EIP-712** : standard Ethereum pour signatures structurées.
- **ERC-4337** : standard Ethereum pour smart wallets (account abstraction).
- **OTLP** : OpenTelemetry Protocol.
- **WORM** : Write-Once-Read-Many (immutabilité audit logs).
- **BATNA** : Best Alternative To a Negotiated Agreement.

### 9.2 Documents liés

- `AgentStack_Cahier_des_charges.docx` — spécifications fonctionnelles et techniques (ancien nom du projet).
- `PLAN_DE_DEVELOPPEMENT.md` — plan de développement par phases.
- ADRs (à produire en P0).

### 9.3 Diagrammes à produire en P0

- [ ] **C4 Context** — diagramme système global.
- [ ] **C4 Container** — diagramme conteneurs.
- [ ] **C4 Component** — un diagramme par module (5 modules).
- [ ] **Diagramme de séquence** — transaction A2A typique (cf. §1.3).
- [ ] **Diagramme de déploiement** — Kubernetes multi-namespace.
- [ ] **Diagramme ERD** — schémas Postgres par module.
- [ ] **Schéma graphe REPUTATION** — modèle Neo4j.

— **Fin de l'architecture breakdown v1.0** —
