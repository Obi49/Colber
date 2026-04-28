# STATUS — Praxis (snapshot pause)

**Date** : 2026-04-28
**Phase** : transition P1 → P2
**Branche active** : `main`
**Dernier commit pushé** : `a5396ab`

---

## TL;DR

3 modules livrés, déployés, testés en bout en bout sur la VM β `100.83.10.125`. Pipeline CI propre (build / typecheck / test / lint tous verts). Prêt à enchaîner sur OBSERVABILITY après pause.

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

### 1.3 `memory` ✅ (P1 sprints 4-7)

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

### 2.2 Stack Docker — 13 conteneurs (`docker compose -p praxis ps`)

| Conteneur               | Image                                       | Rôle                                | Port hôte       |
| ----------------------- | ------------------------------------------- | ----------------------------------- | --------------- |
| `praxis-postgres`       | `postgres:16-alpine`                        | Métadonnées des 3 services          | `15432`         |
| `praxis-redis`          | `redis:7-alpine`                            | Cache scoring                       | `16379`         |
| `praxis-nats`           | `nats:2.10-alpine`                          | Bus événements (réservé futur)      | `14222`/`18222` |
| `praxis-qdrant`         | `qdrant/qdrant:v1.15.4`                     | Vecteurs MEMORY                     | `16333`/`16334` |
| `praxis-clickhouse`     | `clickhouse/clickhouse-server:24.10-alpine` | Logs/traces (réservé OBSERVABILITY) | `18123`/`19000` |
| `praxis-neo4j`          | `neo4j:5-community`                         | Graphe REPUTATION                   | `17474`/`17687` |
| `praxis-ollama`         | `ollama/ollama:0.4.7`                       | Embeddings (nomic-embed-text 768d)  | `11434`         |
| `praxis-prometheus`     | `prom/prometheus:v2.55.1`                   | Métriques                           | `19090`         |
| `praxis-grafana`        | `grafana/grafana:11.3.0`                    | Dashboards (admin/praxis_dev)       | `13000`         |
| `praxis-traefik`        | `traefik:v3.2`                              | Reverse proxy interne               | `18000`/`18080` |
| `praxis-agent-identity` | `praxis/agent-identity:dev`                 | Service applicatif                  | `14001`/`14002` |
| `praxis-reputation`     | `praxis/reputation:dev`                     | Service applicatif                  | `14011`/`14012` |
| `praxis-memory`         | `praxis/memory:dev`                         | Service applicatif                  | `14021`/`14022` |

> **Note traefik** : flapping observé en fin de session (Up + Restarting). Pas bloquant car les services sont exposés directement sur leurs ports décalés. À diagnostiquer en P2.

### 2.3 Bases Postgres

| DB                  | Service        | Tables                                                                          |
| ------------------- | -------------- | ------------------------------------------------------------------------------- |
| `praxis_identity`   | agent-identity | agents                                                                          |
| `praxis_reputation` | reputation     | score_snapshots, feedback_log, merkle_anchors, \_\_drizzle_migrations           |
| `praxis_memory`     | memory         | memories, memory_versions, memory_shares, memory_quotas, \_\_drizzle_migrations |
| `praxis`            | (legacy)       | obsolète, à supprimer                                                           |

---

## 3. Tests automatisés

### 3.1 Tests internes (locaux, FULL TURBO)

```
pnpm build     →  8 packages, all green
pnpm typecheck → 13 packages, all green
pnpm test      → 161 tests passing, 1 skipped (live testcontainers placeholder)
pnpm lint      →  0 errors, 0 warnings
```

### 3.2 Tests E2E sur VM β (`PRAXIS_VM=100.83.10.125 python .tools/e2e_smoke.py`)

```
=== Healthchecks ===                  3/3 OK
=== Register agent A and B ===         ✓ A, ✓ B (DIDs Ed25519)
=== Resolve agent A ===                OK
=== Verify signature via identity ===  valid: true
=== Submit signed feedback A → B ===   201
=== Read score B ===                   510 (= 500 base + 10 tx réussie)
                                       avec attestation Ed25519 sur JCS
=== Memory store + search ===          3 hits, score cosine 0.687
                                       ("fast PDF delivery" ↔ "PDF reports 24h")
ALL E2E STEPS PASSED
```

---

## 4. Historique Git (10 commits sur `main`)

```
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

| #   | Décision                                                                  | Justification                                                                          |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Monorepo Turborepo + pnpm workspaces                                      | Standard 2025, build cache, supporte SDK + services + console                          |
| 2   | TypeScript strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess | Sécurité types maximale dès l'origine                                                  |
| 3   | Fastify v5 (non Express)                                                  | Performance + écosystème zod + DX                                                      |
| 4   | drizzle-orm + postgres-js (NON prisma)                                    | Léger, typé, migrations versionnées, pas de runtime client lourd                       |
| 5   | DID method `did:key` (Ed25519) en MVP                                     | Self-resolvable, pas d'infra externe ; `did:web`/`did:ethr` plus tard                  |
| 6   | Embeddings self-hosted (Ollama + nomic-embed-text)                        | Pas de dépendance OpenAI, gratuit, autonomie tests, cohérent avec positionnement trust |
| 7   | 3 DBs Postgres séparées par service                                       | Migrations Drizzle indépendantes, isolation logique forte                              |
| 8   | Cohabitation isolée avec ShowWeb3 (option A)                              | Zéro impact sur projet existant, ports décalés, volumes nommés Praxis                  |
| 9   | Qdrant 1.15+ (et non 1.12)                                                | Compat client `@qdrant/js-client-rest@1.17`                                            |

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

### 6.3 Module OBSERVABILITY (à reprendre)

Tâche commencée : agent backend-architect lancé avec un brief complet (cf. log précédent). **Coupure usage limit reset 13:30 Paris**. Brief disponible : voir prompt original incluant logs+spans ClickHouse + alertes Postgres + 4 endpoints MCP. Après la reprise :

1. Relancer l'agent backend-architect avec le même brief.
2. Workflow identique aux modules précédents : build/test/lint → commit → push → docker build sur VM → up → E2E.
3. Créer `praxis_observability` DB côté Postgres avant up.
4. Ajouter le service au `docker-compose.services.yml`.

---

## 7. Fichiers et chemins clés

### Documents de pilotage

- `AgentStack_Cahier_des_charges.docx` — CDC v1.0 (figé, ancien nom).
- `PLAN_DE_DEVELOPPEMENT.md` — 5 phases, 32 sprints, gates, KPI.
- `ARCHITECTURE_BREAKDOWN.md` — modèle C4 + WBS + SLO.
- `STATUS.md` — ce document (snapshot état projet).
- `praxis-stack/DEPLOY.md` — runbook déploiement VM.

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
