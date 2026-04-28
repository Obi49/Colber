# STATUS — Praxis (snapshot pause)

**Date** : 2026-04-28 (soir)
**Phase** : **v1 PLATFORM COMPLÈTE — 5/5 modules**
**Branche active** : `main`
**Dernier commit pushé** : `4c72638` (fonctionnel) — finalisation docs en cours

---

## TL;DR

🎉 **v1 atteinte : 5/5 modules livrés** (REPUTATION, MEMORY, OBSERVABILITY, NEGOTIATION, INSURANCE) + agent-identity. Déployés, testés en bout en bout sur la VM β `100.83.10.125` : **23/23 steps E2E verts**. Pipeline CI propre (build / typecheck / test / lint tous verts, **385 tests passing, 4 skipped**). INSURANCE livrée en mode simulation (pas d'on-chain réel — validé CdP) ; la version Solidity + Base Sepolia + audit est l'étape 7b (P3).

---

## 1. Modules livrés

### 1.1 `agent-identity` ✅ (P1 sprints 1-3)

Bootstrap cryptographique de la plateforme. Tout DID provient de ce service.

- **Endpoints** :
  - REST : `POST /v1/identity/register`, `GET /v1/identity/:did`, `POST /v1/identity/verify`
  - gRPC : `praxis.identity.v1.IdentityService`
  - MCP : `identity.register`, `identity.resolve`, `identity.verify`
- **Crypto** : Ed25519 (`@noble/ed25519` v2.3), DID method `did:key` (W3C, multibase z6Mk… encoding hand-rolled).
- **Storage** : Postgres `praxis_identity`, table `agents (did, public_key, signature_scheme, owner_operator_id, registered_at, revoked_at)`.
- **Tests** : 21 (unit + integration via fastify.inject).
- **Image Docker** : `praxis/agent-identity:dev` (294 MB, Alpine multi-stage).

### 1.2 `reputation` ✅ (P1 sprints 3-6)

Oracle de fiabilité agentique avec attestations cryptographiques.

- **Endpoints** :
  - REST : `GET /v1/reputation/score/:did`, `GET /v1/reputation/history/:did`, `POST /v1/reputation/feedback`, `POST /v1/reputation/verify`
  - gRPC : `praxis.reputation.v1.ReputationService`
  - MCP : `reputation.score`, `history`, `verify`, `feedback`
- **Modèle de données** :
  - Neo4j : `(Agent)-[PARTICIPATED_IN]->(Transaction)`, `(Agent)-[RATED]->(Agent)`
  - Postgres : `score_snapshots`, `feedback_log` (idempotence par feedbackId, unicité `(fromDid, toDid, txId)`), `merkle_anchors` (placeholder pour ancrage on-chain).
- **Scoring v1** : 0..1000, base 500, +10 par tx réussie, −40 par feedback négatif, decay × 0.5 après 90 jours. Cache Redis TTL 60s.
- **Attestations** : Ed25519 sur JCS RFC 8785 du payload `{did, score, scoreVersion, computedAt}`. Vérifiables hors-ligne avec la clé publique platform.
- **Tests** : 62 (unit scoring + JCS + attestation + service + integration).
- **Image Docker** : `praxis/reputation:dev` (317 MB).

### 1.3 `observability` ✅ (P2 sprints 9-11)

Logging + tracing distribué pour les interactions agent-to-agent (A2A).

- **Endpoints** :
  - REST : `POST /v1/observability/logs`, `POST /v1/observability/traces`, `POST /v1/observability/query`, CRUD `GET/POST/PATCH/DELETE /v1/observability/alerts/...`
  - gRPC : `praxis.observability.v1.ObservabilityService` (logs / traces / query + CRUD alerts)
  - MCP : `observability.log`, `observability.trace`, `observability.query`, `observability.alert`
- **Storage** :
  - ClickHouse 24.10 : 2 tables (`praxis_logs`, `praxis_spans`) auto-créées au démarrage, partitionnement par jour, ORDER BY `(timestamp, traceId, spanId)`, TTL 30 jours configurable.
  - Postgres `praxis_observability` (migration drizzle 0000) : table `alert_rules` (id, ownerOperatorId, name, scope, condition jsonb, cooldownSeconds, notification jsonb).
- **DSL filtres** (`condition`) : zod-validé, opérateurs `eq/neq/in/gt/gte/lt/lte/contains/matches`, allowlist de fields par scope (logs : service/level/agentDid/operatorId/traceId/spanId/parentSpanId/message/`attributes.<key>` ; spans : + kind/status/statusMessage/name/durationMs).
- **Ingestion** : batcher in-memory flush à 1000 ms ou 500 events. `OBSERVABILITY_MAX_EVENTS_PER_REQUEST=1000`. Conversion ISO → format ClickHouse (`YYYY-MM-DD HH:MM:SS.sss`) au moment de l'insert.
- **Out of scope v1** (renvoyés en v1.1, sprint 12-13) : ML anomaly detection, tiering S3 chaud/tiède/froid, exporter OTLP, evaluation engine des règles d'alerte.
- **Tests** : 32 unit (telemetry-validation, query-builder, batcher), fakes `InMemoryClickHouseClient` + `InMemoryAlertRepository`. 1 placeholder live test gated `PRAXIS_LIVE_TESTS=1`.
- **Image Docker** : `praxis/observability:dev` (Alpine multi-stage).

### 1.4 `negotiation` ✅ (P3 sprints 18-23, partiel)

Broker de négociation A2A event-sourced. Livré hors-séquence (avant INSURANCE) car pas de bloquant on-chain.

- **Endpoints** :
  - REST : `POST /v1/negotiation`, `GET /v1/negotiation/:id`, `GET /v1/negotiation/:id/history`, `POST /v1/negotiation/:id/{propose,counter,settle}`
  - gRPC : `praxis.negotiation.v1.NegotiationService` (6 RPCs)
  - MCP : `negotiation.start`, `negotiation.propose`, `negotiation.counter`, `negotiation.settle`
- **État machine** : `open` → `negotiating` → `settled` | `cancelled` | `expired`.
- **Stratégies** :
  - `ascending-auction` : strict-beat, no-overbid-self, reservePrice enforced, tie-by-earliest.
  - `multi-criteria` : weighted-sum, full-criterion-coverage required, counter-from-same-party replaces prior.
- **Signatures** : Ed25519 + JCS RFC 8785 (mirror reputation). `negotiation.settle` exige les signatures de TOUTES les parties sur `{negotiationId, winningProposalId}`. **Pas d'on-chain en v1** (EIP-712 / Base Sepolia → P3, validé CdP 2026-04-28).
- **Storage** : Postgres `praxis_negotiation` (drizzle 0000) :
  - `negotiation_events` (BIGSERIAL append-only, `(negotiation_id, event_type, idempotency_key)` UNIQUE).
  - `negotiation_state` (UPSERT projection en transaction unique avec l'event ; rebuildable depuis l'event log).
- **Idempotency** : `negotiation.start` pré-check `findStartedByIdempotencyKey()` car l'UUID est généré server-side. Replay → 200 + même négociation.
- **Out of scope v1** : cancellation/expiration REST endpoints + sweeper deadline (v1.1), public-key resolution via agent-identity (v1.1, aujourd'hui inline), LLM mediator (v2), insurance-bridge (v2), reputation-bridge (v2), snapshots / S3 cold archive (P2).
- **Tests** : 61 unit + integration (strategies × 2, projection rebuild, state machine, JCS+signing, REST lifecycle full via fastify.inject, idempotency replay). 1 placeholder live test gated `PRAXIS_LIVE_TESTS=1`.
- **Image Docker** : `praxis/negotiation:dev` (Alpine multi-stage).

### 1.5 `insurance` ✅ (P3 sprints 17-22, MVP simulation)

Garantie de livrable agentique : pricing, escrow simulé, claims. **Mode simulation pure en v1** : pas de Solidity, pas de Foundry, pas de viem, pas de Base Sepolia. La version on-chain réelle est l'étape 7b (P3, après audit).

- **Endpoints** :
  - REST : `POST /v1/insurance/{quote,subscribe,claims}`, `GET /v1/insurance/policies/:id`, `GET /v1/insurance/policies?subscriberDid=...`, `POST /v1/insurance/admin/escrow/:id/transition` (gated `INSURANCE_ADMIN_ENABLED`).
  - gRPC : `praxis.insurance.v1.InsuranceService` (5 RPCs).
  - MCP : `insurance.quote`, `insurance.subscribe`, `insurance.claim`, `insurance.status`.
- **Pricing engine** : `prime = amount × baseRateBps / 10_000 × multiplier(score)`. Multiplier brackets : 700+ → 0.8, 500-699 → 1.0, 300-499 → 1.4, <300 → 2.0. Lookup réputation via HTTP avec cache 60s (fallback score=500 sur erreur, warn log).
- **Escrow simulé** : table `escrow_holdings` avec état machine `locked` → `released` | `claimed` | `refunded`. Transitions append à `escrow_events` (BIGSERIAL audit trail). Comment `// TODO P3: Solidity + viem` explicite.
- **Plafond global** : `INSURANCE_MAX_GLOBAL_EXPOSURE_USDC` (défaut 100 000) vérifié dans la transaction de subscribe (sum des holdings status=locked).
- **Idempotency** : `subscribe` (UNIQUE `idempotency_key` global) et `claim` (UNIQUE `(policy_id, idempotency_key)`). Replay → 200 + même ressource.
- **Storage** : Postgres `praxis_insurance` (drizzle 0000) :
  - `policies` (NUMERIC(18,6) USDC precision, sla_terms jsonb, idempotency_key UNIQUE).
  - `escrow_holdings` (FK policy 1:1, status, locked_at/released_at/claimed_at/refunded_at).
  - `escrow_events` (BIGSERIAL append-only).
  - `claims` (FK policy, status, evidence jsonb, payout_usdc, UNIQUE(policy_id, idempotency_key)).
- **Out of scope v1** (étape 7b) : Solidity contracts, Foundry, viem, Base Sepolia/mainnet, audit Trail of Bits/OpenZeppelin, Safe multisig + AWS KMS, claim arbitrator avec oracles, reinsurer-adapter, circuit-breaker dynamique, SLA evaluator automatique.
- **Tests** : 54 unit + integration verts (pricing 16, escrow 15, exposure 4, reputation-client 7, REST integration 12). 1 placeholder live test gated `PRAXIS_LIVE_TESTS=1`.
- **Image Docker** : `praxis/insurance:dev` (Alpine multi-stage).

### 1.6 `memory` ✅ (P1 sprints 4-7)

Mémoire externe persistante avec recherche sémantique via embeddings.

- **Endpoints** :
  - REST : `POST /v1/memory`, `POST /v1/memory/search`, `GET /v1/memory/:id`, `PATCH /v1/memory/:id`, `POST /v1/memory/:id/share`
  - gRPC : `praxis.memory.v1.MemoryService`
  - MCP : `memory.store`, `retrieve`, `update`, `share`
- **Storage** :
  - Qdrant 1.15.4 : collection `praxis_memories`, vecteurs 768-dim (`nomic-embed-text` via Ollama self-hosted), filtres ACL server-side.
  - Postgres `praxis_memory` : `memories`, `memory_versions`, `memory_shares`, `memory_quotas`.
- **Embeddings** : abstraction `EmbeddingProvider` avec deux implémentations (`OllamaEmbeddingProvider` prod, `DeterministicStubProvider` tests).
- **Permissions** : `private` / `operator` / `shared` / `public` (filtres défense en profondeur Qdrant + Postgres).
- **Encryption** : AES-256-GCM opt-in (placeholder `MEMORY_ENCRYPTION_KEY`, à remplacer par KMS).
- **Versionnement** : audit trail dans `memory_versions`, prune > 100 versions/mémoire.
- **Tests** : 78 (unit + integration). Coverage 89.3% lines.
- **Image Docker** : `praxis/memory:dev` (298 MB).

---

## 2. Infrastructure de test (β)

### 2.1 VM hôte

- **Adresse Tailscale** : `100.83.10.125`
- **Hostname** : `showweb3` (Debian 13 Trixie, 4 vCPU, 5.8 Go RAM)
- **Co-locataire** : projet `ShowWeb3` (séparé, intact, namespace Docker indépendant)
- **Docker** : 29.2.1 + Compose v5.1.0
- **Tailscale** : actif (PID 675), ne JAMAIS toucher

### 2.2 Stack Docker — 16 conteneurs (`docker compose -p praxis ps`)

| Conteneur               | Image                                       | Rôle                               | Port hôte       |
| ----------------------- | ------------------------------------------- | ---------------------------------- | --------------- |
| `praxis-postgres`       | `postgres:16-alpine`                        | Métadonnées des 4 services         | `15432`         |
| `praxis-redis`          | `redis:7-alpine`                            | Cache scoring                      | `16379`         |
| `praxis-nats`           | `nats:2.10-alpine`                          | Bus événements (réservé futur)     | `14222`/`18222` |
| `praxis-qdrant`         | `qdrant/qdrant:v1.15.4`                     | Vecteurs MEMORY                    | `16333`/`16334` |
| `praxis-clickhouse`     | `clickhouse/clickhouse-server:24.10-alpine` | Logs/traces OBSERVABILITY          | `18123`/`19000` |
| `praxis-neo4j`          | `neo4j:5-community`                         | Graphe REPUTATION                  | `17474`/`17687` |
| `praxis-ollama`         | `ollama/ollama:0.4.7`                       | Embeddings (nomic-embed-text 768d) | `11434`         |
| `praxis-prometheus`     | `prom/prometheus:v2.55.1`                   | Métriques                          | `19090`         |
| `praxis-grafana`        | `grafana/grafana:11.3.0`                    | Dashboards (admin/praxis_dev)      | `13000`         |
| `praxis-traefik`        | `traefik:v3.2`                              | Reverse proxy interne              | `18000`/`18080` |
| `praxis-agent-identity` | `praxis/agent-identity:dev`                 | Service applicatif                 | `14001`/`14002` |
| `praxis-reputation`     | `praxis/reputation:dev`                     | Service applicatif                 | `14011`/`14012` |
| `praxis-memory`         | `praxis/memory:dev`                         | Service applicatif                 | `14021`/`14022` |
| `praxis-observability`  | `praxis/observability:dev`                  | Service applicatif                 | `14031`/`14032` |
| `praxis-negotiation`    | `praxis/negotiation:dev`                    | Service applicatif                 | `14041`/`14042` |
| `praxis-insurance`      | `praxis/insurance:dev`                      | Service applicatif                 | `14051`/`14052` |

> **Note traefik** : flapping observé en fin de session (Up + Restarting). Pas bloquant car les services sont exposés directement sur leurs ports décalés. À diagnostiquer en P2.

### 2.3 Bases Postgres

| DB                       | Service        | Tables                                                                          |
| ------------------------ | -------------- | ------------------------------------------------------------------------------- |
| `praxis_identity`        | agent-identity | agents                                                                          |
| `praxis_reputation`      | reputation     | score_snapshots, feedback_log, merkle_anchors, \_\_drizzle_migrations           |
| `praxis_memory`          | memory         | memories, memory_versions, memory_shares, memory_quotas, \_\_drizzle_migrations |
| `praxis_observability`   | observability  | alert_rules, \_\_drizzle_migrations                                             |
| `praxis_negotiation`     | negotiation    | negotiation_events, negotiation_state, \_\_drizzle_migrations                   |
| `praxis_insurance`       | insurance      | policies, escrow_holdings, escrow_events, claims, \_\_drizzle_migrations        |
| `praxis` (ClickHouse DB) | observability  | praxis_logs, praxis_spans (DateTime64 UTC, partitions par jour, TTL 30j)        |
| `praxis` (legacy)        | (legacy)       | obsolète, à supprimer                                                           |

---

## 3. Tests automatisés

### 3.1 Tests internes (locaux, FULL TURBO)

```
pnpm build     → 11 packages, all green
pnpm typecheck → 16 packages, all green
pnpm test      → 385 tests passing, 4 skipped (live testcontainers placeholders)
pnpm lint      →  0 errors, 0 warnings
```

### 3.2 Tests E2E sur VM β (`PRAXIS_VM=100.83.10.125 python .tools/e2e_smoke.py`)

```
=== Healthchecks ===                       6/6 OK (incl. insurance)
=== Register agent A and B ===              ✓ A, ✓ B (DIDs Ed25519)
=== Resolve agent A ===                     OK
=== Verify signature via identity ===       valid: true
=== Submit signed feedback A → B ===        201
=== Read score B ===                        510 (= 500 base + 10 tx réussie)
                                            avec attestation Ed25519 sur JCS
=== Memory store + search ===               3 hits, score cosine 0.687
=== Observability ingest logs + query ===   202 → 2 rows queried back
=== Observability ingest spans + query ===  202 → 1 row queried back
=== Observability CRUD alert ===            create→get→patch→list→delete→404
=== Negotiation lifecycle ===               start → idempotent replay (same id)
                                            → propose A=100 → counter B=150 (best=B)
                                            → settle (sigs A+B JCS) → history 4 events
=== Insurance lifecycle ===                 quote A→B amount=1000 → premium=20 (score 510)
                                            → subscribe (escrow=locked) → idempotent replay
                                            → claim B (ticket OPS-1234, status=open)
                                            → admin transition escrow=claimed (avec claimId)
                                              → policy=claimed, claim=paid, payout=1000
                                            → status final cohérent
ALL E2E STEPS PASSED
```

---

## 4. Historique Git (21 commits sur `main`)

```
4c72638 chore(deploy): insurance service dans le compose + e2e_smoke étendu
a6489e6 feat(insurance): module INSURANCE v1 MVP — pricing + escrow simulé (sans on-chain)
f26c6b3 docs: STATUS + ROADMAP — NEGOTIATION v1 livrée (E2E 17/17), reste INSURANCE
c16cc78 fix(e2e): proposals.amount en int (et non float) pour matcher la canon JS
6dd93e1 chore(deploy): negotiation service dans le compose + e2e_smoke étendu
4283555 feat(negotiation): module NEGOTIATION v1 — event-sourced auction broker
a80c42b docs: STATUS + ROADMAP — OBSERVABILITY v1 livrée (E2E 11/11)
0976383 fix(observability): timestamps ISO → format ClickHouse au moment de l'insert
dbe1827 chore(deploy): observability service dans le compose + e2e_smoke étendu
391e82f feat(observability): module OBSERVABILITY v1 — logs, traces, query, alerts
a81f8c8 docs: snapshot pause — STATUS, ROADMAP, README à jour
a5396ab chore: ignore Claude Code scheduled_tasks.lock
3edb036 chore(deploy): script smoke E2E + guide DEPLOY.md (7/7 verts sur VM)
c490be7 chore(deploy): séparer DBs Postgres par service + bump Qdrant 1.15.4
66aabb2 fix(memory): nested Qdrant boolean filters as bare Condition objects
a177417 chore(deploy): docker-compose.services.yml
854b476 feat(memory): module MEMORY v1 — store, retrieve, update, share
5f874e2 feat(reputation): module REPUTATION v1 — score, history, verify, feedback
d2081b5 fix(monorepo): green build, typecheck, test, lint after scaffold
76afe5c feat: scaffold monorepo Turborepo + service agent-identity
b4cf39f chore: bootstrap pilotage projet Praxis et stack de test conteneurisée
```

Repo : https://github.com/Obi49/Praxis

---

## 5. Décisions architecturales prises

| #   | Décision                                                                              | Justification                                                                          |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Monorepo Turborepo + pnpm workspaces                                                  | Standard 2025, build cache, supporte SDK + services + console                          |
| 2   | TypeScript strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess             | Sécurité types maximale dès l'origine                                                  |
| 3   | Fastify v5 (non Express)                                                              | Performance + écosystème zod + DX                                                      |
| 4   | drizzle-orm + postgres-js (NON prisma)                                                | Léger, typé, migrations versionnées, pas de runtime client lourd                       |
| 5   | DID method `did:key` (Ed25519) en MVP                                                 | Self-resolvable, pas d'infra externe ; `did:web`/`did:ethr` plus tard                  |
| 6   | Embeddings self-hosted (Ollama + nomic-embed-text)                                    | Pas de dépendance OpenAI, gratuit, autonomie tests, cohérent avec positionnement trust |
| 7   | 3 DBs Postgres séparées par service                                                   | Migrations Drizzle indépendantes, isolation logique forte                              |
| 8   | Cohabitation isolée avec ShowWeb3 (option A)                                          | Zéro impact sur projet existant, ports décalés, volumes nommés Praxis                  |
| 9   | Qdrant 1.15+ (et non 1.12)                                                            | Compat client `@qdrant/js-client-rest@1.17`                                            |
| 10  | OBSERVABILITY : ClickHouse via HTTP (pas natif)                                       | Portabilité, pas de protocole binaire, suffisant pour le throughput attendu            |
| 11  | OBSERVABILITY : ingestion via parallel arrays (pas JSON type)                         | Compatible toutes versions ClickHouse, pas besoin du flag expérimental                 |
| 12  | OBSERVABILITY : timestamps convertis ISO → format CH au moment de l'insert            | DateTime64 JSONEachRow refuse le `T`/`Z` ISO ; conversion explicite côté repository    |
| 13  | NEGOTIATION : event sourcing pur (event store + projection UPSERT en transaction)     | Audit trail intégral + rebuild idempotent ; idempotency via UNIQUE constraint trio     |
| 14  | NEGOTIATION : signatures Ed25519+JCS (et non EIP-712) en v1                           | Pas de chain réelle pour le moment (validé CdP) ; EIP-712 reporté en P3                |
| 15  | NEGOTIATION : public keys inline dans le body (pas de lookup agent-identity)          | Friction inutile en MVP ; lookup + cache prévu en v1.1                                 |
| 16  | INSURANCE : mode simulation pure en v1 (pas d'on-chain réel)                          | Validé CdP "pas de réel chain pour le moment" ; on-chain → étape 7b après audit        |
| 17  | INSURANCE : pricing brackets simples (4 paliers de score) en v1                       | Lisible, prévisible, débogeable ; pricing v2 avec dim+historique → après REPUTATION v2 |
| 18  | INSURANCE : exposure cap = aggregate `SUM(...) WHERE status='locked'` sans FOR UPDATE | Soft circuit-breaker MVP ; advisory lock prévu si concurrence forte observée           |

ADRs formels à produire en P0.2 (Lot 0.2 du plan).

---

## 6. Points d'attention pour la reprise

### 6.1 Sécurité

- 🔴 **PAT GitHub `ghp_lzGq...` exposé en chat** — à révoquer (https://github.com/settings/tokens) et remplacer par un fine-grained PAT scopé `Obi49/Praxis` uniquement.
- 🟡 Clés Ed25519 platform et clé AES `MEMORY_ENCRYPTION_KEY` sur la VM dans `/home/claude/Praxis/praxis-stack/services.env` — fixtures de DEV, à régénérer pour tout autre environnement.
- 🟡 Auth des endpoints memory v1 : `callerDid`/`queryDid` en clair (pas de signature). À durcir en P2.

### 6.2 Bugs / dette technique connue

- 🟡 **Traefik flapping** (status Restarting) sur la VM. À diagnostiquer.
- 🟡 **Score caching invalidation** : reputation v1 ne purge pas le cache Redis sur `submitFeedback` ; staleness window 60s.
- 🟡 **History pagination** reputation : cursor par timestamp seul, pas de tie-breaking. À renforcer en v2.
- 🟡 **`SignatureProvider`** dans `core-crypto` n'expose pas `derivePublicKey` ; reputation a importé `@noble/ed25519` directement. Refactor possible.
- 🟡 **Live test placeholder** dans chaque service (testcontainers non installé). Activable via `PRAXIS_LIVE_TESTS=1`.

### 6.3 Modules livrés en cette session (2026-04-28 PM)

**OBSERVABILITY v1** : récupéré depuis la branche `feature/observability-wip` (scaffold partiel `86a4f05` qui ne buildait pas), réparé via délégation à `backend-architect` (TS strict readonly, exactOptionalPropertyTypes, 89 problèmes lint), 32 tests passent. Déployé sur la VM ; deux bugs trouvés en E2E et corrigés (`0976383`) : (a) timestamps ISO refusés en JSONEachRow par ClickHouse `DateTime64`, (b) e2e_smoke envoyait `Content-Type: application/json` sur DELETE sans body et Fastify v5 répondait 500. E2E final 11/11 verts.

**NEGOTIATION v1** (livré hors-séquence avant INSURANCE) : délégué à `backend-architect` from scratch (45 fichiers, 61 tests). Event sourcing strict Postgres (event store + projection UPSERT en même transaction). Stratégies ascending-auction et multi-criteria. Signatures Ed25519+JCS pour proposals et settlement multi-parties. Pas d'on-chain en v1 (validé CdP). Déployé sur la VM (build ~10 min) ; 1 bug e2e trouvé et corrigé (`c16cc78`) : différence de sérialisation des floats Python (`100.0` → `"100.0"`) vs JS (`100.0` → `"100"`) cassait la canonicalisation JCS et donc la vérification de signature. E2E 17/17 verts.

**INSURANCE v1 MVP** (5ᵉ et dernier module — **v1 atteinte 🎯**) : délégué à `backend-architect` from scratch (41 fichiers, 54 tests). Mode simulation pure : pricing engine basé sur les brackets de score réputation (lookup HTTP avec cache 60s + fallback score=500 sur erreur), escrow simulé avec audit trail Postgres (locked → released | claimed | refunded), claims workflow simulé via endpoint admin (`INSURANCE_ADMIN_ENABLED=true` côté VM), plafond global d'engagement statique. Pas d'on-chain réel (étape 7b en P3 après audit). Déployé sans bug — premier run e2e tout vert. E2E final **23/23 verts**.

### 6.4 Bilan v1 et prochaines étapes

**v1 atteinte** : 6 services applicatifs Praxis sur la VM β (agent-identity + REPUTATION + MEMORY + OBSERVABILITY + NEGOTIATION + INSURANCE), tous testés en bout en bout. 16 conteneurs Docker isolés sur la VM `100.83.10.125` (cohabitation propre avec ShowWeb3). 21 commits sur `main`.

**Prochaines étapes possibles** (cf. [ROADMAP.md](ROADMAP.md) — pas d'ordre imposé, à arbitrer selon priorités business) :

- **Étape 2** : OBSERVABILITY v1.1 (anomalies ML + tiering S3 + exporter OTLP).
- **Étape 3** : REPUTATION v2 (multi-dim + anti-Sybil + contestation feedback).
- **Étape 4** : Plugins frameworks (LangChain + CrewAI + Autogen).
- **Étape 5** : Console opérateur web (Next.js 15).
- **Étape 6** : SDK officiels (TS sur npm + Python sur PyPI).
- **Étape 7b** : INSURANCE on-chain réel (Solidity + Foundry + Base Sepolia + audit Trail of Bits).
- **Étape 8b** : NEGOTIATION v1.1 (cancellation + sweeper + LLM mediator + EIP-712 + bridges).
- **Étape 9** : GA publique (bug bounty + audit + self-service).
- **Étape 10** : P4 industrialisation (multi-région + enterprise + standardisation).

---

## 7. Fichiers et chemins clés

### Documents de pilotage

Tous les documents sont dans `docs/` à la racine du repo.

- `docs/AgentStack_Cahier_des_charges.docx` — CDC v1.0 (figé, ancien nom).
- `docs/PLAN_DE_DEVELOPPEMENT.md` — 5 phases, 32 sprints, gates, KPI.
- `docs/ARCHITECTURE_BREAKDOWN.md` — modèle C4 + WBS + SLO.
- `docs/STATUS.md` — ce document (snapshot état projet).
- `docs/ROADMAP.md` — plan d'attaque opérationnel + briefs.
- `docs/ONBOARDING.md` — guide reprise de session.
- `docs/DEPLOY.md` — runbook déploiement VM.
- `docs/DESIGN_BRIEF.md` — prompt Claude Design pour les schémas.
- `README.md` (racine) — point d'entrée GitHub.

### Code

- `apps/agent-identity/` — service identité.
- `apps/reputation/` — module REPUTATION.
- `apps/memory/` — module MEMORY.
- `packages/core-{types,crypto,config,logger,mcp}/` — utilitaires partagés.
- `tooling/{tsconfig,eslint-config}/` — configs centralisées.

### Tooling local

- `.tools/ssh_run.py` — runner SSH paramiko (sudo via stdin password).
- `.tools/ssh_push.py` — SFTP push avec mkdir tree.
- `.tools/e2e_smoke.py` — script E2E des 3 services.

### Secrets locaux (NE JAMAIS COMMIT)

- `.env.local` — PAT GitHub.
- `praxis-stack/services.env` (sur la VM uniquement) — clés platform + KMS.

---

## 8. Commandes utiles pour reprendre

```bash
# Sanity check local
pnpm install && pnpm typecheck && pnpm test && pnpm lint

# Push une étape
TOKEN=$(grep ^GITHUB_TOKEN= .env.local | cut -d= -f2)
git push "https://x-access-token:${TOKEN}@github.com/Obi49/Praxis.git" main

# Tester la VM
PRAXIS_VM=100.83.10.125 python .tools/e2e_smoke.py

# Inspecter la VM
python .tools/ssh_run.py --sudo "docker compose -p praxis ps"

# Logs d'un service
python .tools/ssh_run.py --sudo "docker logs --tail=50 praxis-reputation"

# Pull du repo + rebuild un service
python .tools/ssh_run.py "cd /home/claude/Praxis && git pull --rebase https://x-access-token:${TOKEN}@github.com/Obi49/Praxis.git main"
python .tools/ssh_run.py --sudo "cd /home/claude/Praxis/praxis-stack && docker compose -f docker-compose.yml -f docker-compose.services.yml build <service> && docker compose ... up -d --force-recreate <service>"
```

---

— _Fin du snapshot._
