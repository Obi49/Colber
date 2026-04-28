# ROADMAP — Praxis (reprise après pause)

**Référence** : `PLAN_DE_DEVELOPPEMENT.md` (plan canonique 18 mois) — ce document est le **plan d'attaque opérationnel pour les sessions suivantes** avec les briefs prêts à coller dans les agents dev.

**Date de la dernière mise à jour** : 2026-04-28 (soir)
**État courant** : voir [STATUS.md](STATUS.md). **4/5 modules livrés** (REPUTATION, MEMORY, OBSERVABILITY, NEGOTIATION) + agent-identity. E2E 17/17 verts sur VM β. **Reste INSURANCE pour la v1 complète.**

---

## Ordre de bataille recommandé

| Étape  | Module / Lot                                                                 | Effort estimé | Dépendances            | Bloquant pour        |
| ------ | ---------------------------------------------------------------------------- | ------------- | ---------------------- | -------------------- |
| ~~1~~  | ✅ ~~OBSERVABILITY (sprints 9-11)~~ — **livré 2026-04-28**, E2E 11/11        | —             | —                      | —                    |
| **2**  | OBSERVABILITY v1.1 (sprints 12-13 — anomalies ML + tiering + export OTel)    | 1 session     | étape 1                | rien                 |
| **3**  | REPUTATION v2 (sprints 11-14 — multi-dim + anti-Sybil + contestation)        | 1-2 sessions  | étape 1 (logs)         | INSURANCE pricing v2 |
| **4**  | Plugins frameworks (LangChain + CrewAI + Autogen)                            | 1 session     | aucune                 | adoption marché      |
| **5**  | Console opérateur web (Next.js 15)                                           | 1-2 sessions  | aucune                 | self-service P3      |
| **6**  | SDK officiels (TS sur npm + Python sur PyPI)                                 | 1 session     | aucune                 | listage AgenticTrade |
| **7**  | **INSURANCE v1 MVP** (mode simulation, sans on-chain) — _prochaine session_  | 1 session     | aucune                 | **v1 complète 5/5**  |
| ~~8~~  | ✅ ~~NEGOTIATION (sprints 18-23)~~ — **livré 2026-04-28**, E2E 17/17         | —             | —                      | —                    |
| **7b** | INSURANCE on-chain réel (Solidity + Foundry + audit Base Sepolia → mainnet)  | 2-3 sessions  | étape 7, REPUTATION v2 | GA publique          |
| **8b** | NEGOTIATION v1.1 (cancellation + sweeper + LLM mediator + EIP-712 + bridges) | 1-2 sessions  | étape 7b               | rien                 |
| **9**  | GA publique (sprint 24 — bug bounty, audit sécu tiers, self-service)         | 1 session     | étapes 7b-8b           | P4                   |
| **10** | P4 industrialisation (multi-région, enterprise, standardisation)             | 4-8 sessions  | étape 9                | levée Série A        |

> Une "session" ≈ 1-2 heures de travail intensif avec des agents dev sub-traités.

---

## Étape 1 — OBSERVABILITY ✅ LIVRÉE (2026-04-28)

### Résumé livraison

- Scaffold initial repris depuis `feature/observability-wip` (commit `86a4f05` "ne build pas").
- Délégation à `backend-architect` pour le fix-up TS strict + lint (10 fichiers modifiés, 32 tests verts en local).
- Commit `391e82f` (scaffold + fix), `dbe1827` (compose + e2e étendu), `0976383` (fix timestamps ClickHouse + DELETE sans Content-Type).
- VM : `praxis-observability` healthy, ports `14031`/`14032`, DB `praxis_observability` + ClickHouse tables `praxis_logs`/`praxis_spans` (DateTime64 UTC, partitions/jour, TTL 30j).
- E2E `.tools/e2e_smoke.py` : 11/11 verts (4 healthchecks + 7 steps métier).

### Contexte historique (avant livraison)

Module **interrompu** lors de la session précédente par le rate limit de l'agent (reset 13:30 Paris). Le brief est prêt à recoller à l'identique dans un agent `backend-development:backend-architect`.

### Brief prêt à l'emploi (à coller dans l'agent dev)

```
You are implementing the OBSERVABILITY module of the Praxis project — distributed
logging and tracing for agent-to-agent (A2A) interactions. It's the 4th service
after agent-identity, reputation, and memory.

Working dir: C:\Users\johan\Nouveau dossier\Invest\Codes\Saas_Agents

REQUIRED READING:
- README.md, STATUS.md (current state)
- ARCHITECTURE_BREAKDOWN.md §3.3 (OBSERVABILITY layout), §1.3 (A2A flow), §4.5, §4.6
- PLAN_DE_DEVELOPPEMENT.md — Lot 2.1 sprints 9-13. Out of scope this session:
  ML anomaly detection (sprint 12), tiering (sprint 12), OTel exporter (sprint 13).
- apps/agent-identity, apps/reputation, apps/memory — mirror their structure.

SCOPE: build apps/observability/ exposing 4 MCP tools + REST + gRPC:
- observability.log → POST /v1/observability/logs (batch ingestion)
- observability.trace → POST /v1/observability/traces (batch ingestion)
- observability.query → POST /v1/observability/query (logs OR spans, filters + time)
- observability.alert → CRUD on /v1/observability/alerts (config storage only,
  evaluation engine OUT OF SCOPE)

DATA MODEL:
- LogEvent: { timestamp, traceId(32hex), spanId(16hex), parentSpanId?, service,
  agentDid?, operatorId?, level, message, attributes?, resource? }
- Span: { traceId, spanId, parentSpanId?, name, kind, service, agentDid?,
  operatorId?, startTimestamp, endTimestamp, durationMs, status, attributes?,
  events? }

STORAGE:
- ClickHouse: 2 tables (praxis_logs, praxis_spans) created at startup with
  CREATE TABLE IF NOT EXISTS, partitioned by day, ORDER BY (timestamp, traceId,
  spanId), TTL 30 days (env var OBSERVABILITY_LOG_TTL_DAYS).
  Use @clickhouse/client (HTTP). Insert via JSONEachRow. Batch up to
  OBSERVABILITY_FLUSH_INTERVAL_MS=1000 OR OBSERVABILITY_FLUSH_BATCH=500.
  attributes/resource columns: pick JSON type or parallel arrays
  (attributes_keys/values/types) — document the choice.
- Postgres praxis_observability: alert_rules table via drizzle-orm
  (id, ownerOperatorId, name, description, enabled, scope, condition jsonb,
  cooldownSeconds, notification jsonb, createdAt, updatedAt).
  Migration drizzle/0000_init.sql.

CONDITION DSL (zod-validated):
{
  operator: 'and'|'or',
  filters: Array<{ field, op: 'eq'|'in'|'gt'|...|'matches', value }>,
  windowSeconds: number,
  threshold: number,
}

ENDPOINTS (mirror Fastify v5 patterns from apps/memory):
- POST /v1/observability/logs    body: { events: LogEvent[] }, max 1000/req
- POST /v1/observability/traces  body: { spans: Span[] }, max 1000/req
- POST /v1/observability/query   body: { scope, filters, timeRange, limit, offset }
- GET/POST/PATCH/DELETE /v1/observability/alerts/...
- /healthz, /readyz (Postgres+ClickHouse), /metrics

TESTS (mirror memory):
- Vitest unit + integration via app.inject()
- InMemoryClickHouseClient + InMemoryAlertRepository fakes
- 1 placeholder live test gated PRAXIS_LIVE_TESTS=1
- Coverage ≥ 80% on domain/

PACKAGING: mirror apps/memory exactly. tsconfig strict, ESLint v9 flat,
Vitest, Husky. Multi-stage Dockerfile.

HARD CONSTRAINTS:
- Don't touch root configs, other apps/, or packages/core-* (except adding
  net-new exports).
- Don't push to git.
- Don't implement evaluation, anomaly ML, tiering, OTel exporter — out of scope.
- Don't modify praxis-stack/docker-compose*.yml — human will update those.
- drizzle-orm only.

VALIDATE: pnpm build, typecheck, test, lint must all be green.
OUTPUT: list of files, last 5 lines of each pnpm command, deviations + open Qs.
```

### Workflow post-agent (par le PM)

1. Vérifier la sortie : `pnpm build && pnpm typecheck && pnpm test && pnpm lint`.
2. Commit + push.
3. Sur la VM :

   ```bash
   # Créer la 4e DB
   docker exec praxis-postgres psql -U praxis -d postgres -c \
     'CREATE DATABASE praxis_observability OWNER praxis;'

   # Pull, ajouter le service au compose, build
   git pull --rebase https://x-access-token:${TOKEN}@github.com/Obi49/Praxis.git main
   ```

4. Mettre à jour `praxis-stack/docker-compose.services.yml` avec le bloc `observability` (ports `14031`/`14032`, env `CLICKHOUSE_URL=http://clickhouse:8123`, `CLICKHOUSE_USER=praxis`, `CLICKHOUSE_PASSWORD=praxis_dev`, `CLICKHOUSE_DATABASE=praxis`, `DATABASE_URL=postgresql://praxis:praxis_dev@postgres:5432/praxis_observability`, depends_on postgres+clickhouse).
5. Build + up :
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.services.yml build observability
   docker compose -f docker-compose.yml -f docker-compose.services.yml up -d observability
   ```
6. Étendre `.tools/e2e_smoke.py` avec : ingest log → query → ingest span → query → CRUD alert.
7. Push final.

### Acceptation (gate pour passer à l'étape 2)

- [ ] `pnpm test` ≥ 50 nouveaux tests verts pour observability.
- [ ] Service `praxis-observability` healthy sur la VM.
- [ ] E2E ingestion log + query → 200 avec données récupérées.
- [ ] CRUD alert → 200 sur les 4 méthodes.

---

## Étape 2 — OBSERVABILITY v1.1 (sprints 12-13)

### Périmètre

1. **Anomaly detection ML** (sprint 12) : détection de patterns inhabituels (latence p95 > seuil dynamique, taux d'erreur en cascade, dépassement de budget agent).
2. **Tiering chaud / tiède / froid** (sprint 12) : ClickHouse `MergeTree` part move policy + S3 (ou MinIO local) pour les archives > 30j.
3. **Export OpenTelemetry** (sprint 13) : OTLP exporter → Datadog / Honeycomb / Jaeger pour intégration aux outils existants des opérateurs.

### Brief résumé (à étoffer en session)

Étendre `apps/observability/`. ML anomalie : commencer simple — IQR + EWMA sur latence par service, Z-score par compteur d'erreurs. Pas de modèle entraîné. Archive policy déclarative dans la config. Export OTel : OTLP gRPC client, route opérateur-controlée par `alert_rules.notification.exportConfig`.

---

## Étape 3 — REPUTATION v2 (sprints 11-14)

### Périmètre

- **Scoring multi-dimensionnel** : utiliser les `dimensions {delivery, quality, communication}` déjà collectées par feedbacks v1 (aujourd'hui ignorées par le calcul).
- **Anti-Sybil** : graph clustering (algo de Louvain ou Leiden via Neo4j GDS), détection de sous-graphes denses faiblement connectés.
- **Détection collusion** : analyse temporelle des paires `RATED` (volume/timing/réciprocité).
- **Contestation feedback** : workflow opérateur via REST + état machine (open → reviewing → resolved/rejected).

### Brief résumé (à étoffer en session)

Mode dégradé compatible v1 : si scoring config = "v2", nouvelle formule pondérée par dimensions ; sinon v1. Migration progressive `scoreVersion`. Anti-Sybil en async worker (sprint 12). Contestation : nouvelle table Postgres `feedback_disputes`, endpoint `POST /v1/reputation/dispute`.

### Dépendance

Étape 1 (OBSERVABILITY) doit être faite — les détecteurs anti-fraude doivent loger leurs décisions dans `praxis_logs`.

---

## Étape 4 — Plugins frameworks d'agents

### Périmètre

3 plugins distribués sur npm sous `@praxis/*-plugin` :

1. **`@praxis/langchain-plugin`** — callback handler observability (logs auto sur `BaseCallbackHandler` events) + `MemoryBackend` adapter.
2. **`@praxis/crewai-plugin`** — pareil pour CrewAI (Python, package séparé sur PyPI).
3. **`@praxis/autogen-plugin`** — pareil pour Autogen.

### Brief résumé

Pour chaque framework : un `apps/plugins/<framework>/` avec son propre cycle de release. SDK = thin wrapper sur les API REST + gRPC + MCP. Tests d'intégration mockés. Publier en alpha (`0.0.1-alpha.0`) sur les registries.

---

## Étape 5 — Console opérateur web

### Périmètre

Application Next.js 15 (App Router) pour les opérateurs humains :

- Dashboard usage (par module) avec graphiques Grafana embedded.
- Gestion des agents : création, révocation, métadonnées, transfert.
- Billing : factures USDC, exports, configuration paiement.
- Configuration : alertes, webhooks, tokens API, invite opérateurs.
- Inspection : logs, traces, scores, mémoires.

### Stack

- Next.js 15 App Router (server components + actions).
- React 19.
- Tailwind v4 + design tokens.
- Auth opérateur via OAuth 2.1 (provider TBD : Auth0, Clerk, ou self-hosted).
- API consumée via SDK TypeScript (étape 6).

### Brief résumé

Créer `apps/operator-console/` à plat. UX inspirée des consoles Stripe/Vercel (dense, factuel, pas de fioritures). Audit + perf Lighthouse ≥ 95 / 100.

---

## Étape 6 — SDK officiels

### Périmètre

- **`@praxis/sdk` (TypeScript, npm)** : wrapper unifié des 4 modules + helpers crypto (sign payload, verify, gen DID:key).
- **`praxis-sdk` (Python, PyPI)** : équivalent.

### Brief résumé

SDK = clients HTTP/gRPC typés générés depuis les `.proto` + REST OpenAPI (à exposer côté services via `@fastify/swagger`). Versionner les SDK semver. Documentation Mintlify.

---

## Étape 7 — INSURANCE v1 MVP (REPRENDRE ICI — prochaine session)

### Périmètre v1 (validé CdP 2026-04-28 : "pas de réel chain pour le moment")

Le 5ᵉ et dernier module pour atteindre la v1 complète. Mode **simulation pure** : APIs métier réalistes, pricing engine, escrow simulé en Postgres. Pas de Solidity, pas de Foundry, pas de viem, pas de Base Sepolia, pas de KMS. Le but est d'avoir 5/5 modules sur la VM β avec les bonnes formes d'API ; la version on-chain réelle est l'étape 7b.

### Endpoints MCP

- `insurance.quote` → `POST /v1/insurance/quote` — calcul de prime sans engagement.
- `insurance.subscribe` → `POST /v1/insurance/subscribe` — création police + escrow simulé.
- `insurance.claim` → `POST /v1/insurance/claims` — déclenchement réclamation + workflow d'arbitrage simulé.
- `insurance.status` → `GET /v1/insurance/policies/:id` — état police + escrow + sinistres.

### Pricing engine

`prime = base_rate × montant × risk_multiplier(score_réputation, type_livrable, historique)`.

- `base_rate` configurable via env (`INSURANCE_BASE_RATE_BPS=200` → 2%).
- `risk_multiplier` : table de mapping score → multiplier (700+ → 0.8, 500-700 → 1.0, 300-500 → 1.4, < 300 → 2.0). Lookup réputation via HTTP vers le service `reputation` (cache 60s).
- Plafond global d'engagement : `INSURANCE_MAX_GLOBAL_EXPOSURE_USDC=100_000`. Refus de souscription si dépassement.

### Escrow simulé

Table `escrow_holdings (id, policy_id, amount_usdc, status, locked_at, released_at, claimed_at)`.

- États : `locked` → `released` | `claimed` | `refunded`.
- Les transitions sont des opérations Postgres + audit trail dans `escrow_events` (append-only).
- Endpoint admin/debug (gated env `INSURANCE_ADMIN_ENABLED=false` par défaut) pour forcer une transition en dev.
- Comment marqué clairement : "TODO P3 : remplacer par smart contract Solidity sur Base Sepolia + viem".

### Storage Postgres `praxis_insurance`

- `policies (id, subscriber_did, beneficiary_did, deal_subject, amount_usdc, premium_usdc, risk_multiplier, sla_terms jsonb, status, created_at, expires_at)`.
- `escrow_holdings (id, policy_id UNIQUE, amount_usdc, status, locked_at, released_at, claimed_at)`.
- `escrow_events (seq, holding_id, event_type, payload jsonb, occurred_at)`.
- `claims (id, policy_id, claimant_did, reason, evidence jsonb, status, decided_at, payout_usdc)`.

### Out of scope v1 (étape 7b)

- Smart contracts Solidity 0.8.x, Foundry, viem.
- Audit Trail of Bits / OpenZeppelin (mandatory avant mainnet).
- Safe multisig + AWS KMS pour la wallet platform.
- Claim arbitrator avec oracles externes.
- Reinsurer-adapter (CDC §10.4).
- Circuit-breaker dynamique avancé (juste plafond statique en v1).

### Workflow post-agent (par le PM)

1. Délégation à `backend-architect` (mirror du brief NEGOTIATION).
2. Vérifier la sortie : `pnpm build && pnpm typecheck && pnpm test && pnpm lint`.
3. Commit + push.
4. Sur la VM :
   ```bash
   docker exec praxis-postgres psql -U praxis -d postgres -c \
     'CREATE DATABASE praxis_insurance OWNER praxis;'
   ```
5. Ajouter le bloc `insurance` au `praxis-stack/docker-compose.services.yml` (ports `14051`/`14052`, dépendance postgres + reputation pour le lookup réputation).
6. Build + up.
7. Étendre `.tools/e2e_smoke.py` : quote → subscribe → claim → status.
8. Push final + STATUS/ROADMAP update.

### Contexte historique (avant v1 simplifiée)

## Étape 7b — INSURANCE on-chain (sprints 17-22 originaux)

### Périmètre

Module avec **smart contracts on-chain**, donc le plus critique côté sécurité.

- Pricing engine : `prime = f(montant, réputation vendeur, type livrable, historique paire)`.
- Souscription : `POST /v1/insurance/subscribe` → escrow on-chain Base L2.
- Réclamation : `POST /v1/insurance/claim` + workflow d'arbitrage (oracles).
- Réserve liquidité on-chain : smart contract en Solidity 0.8.x.
- Plafond global d'engagement : circuit-breaker pour limiter pertes.

### Stack ajoutée

- **Foundry** (Forge + Cast + Anvil) pour smart contracts.
- **viem** pour les interactions client TS.
- **Audit Trail of Bits ou OpenZeppelin AVANT prod** (mandatory).

### Dépendances

- REPUTATION v2 (pricing dépend du scoring multi-dim).
- OBSERVABILITY v1 (logs sinistres).
- Wallet platform (Safe multisig + AWS KMS).

### Brief résumé

Phase 1 : pricing + escrow on testnet Base Sepolia, plafonds bas. Phase 2 : claim workflow. Phase 3 : audit + mainnet Base. Pas de souscription mainnet sans audit.

---

## Étape 8 — NEGOTIATION ✅ LIVRÉE (2026-04-28)

### Résumé livraison

- 5ᵉ service Praxis livré hors-séquence (avant INSURANCE) — pas de bloquant on-chain en v1, donc jouable directement.
- Délégation à `backend-architect` from scratch (45 fichiers, 61 tests, ≥80% coverage). Mirror reputation pour signatures Ed25519+JCS et observability pour packaging/Dockerfile/tests.
- Commit `4283555` (module), `6dd93e1` (compose + e2e étendu), `c16cc78` (fix Python int vs float dans la canonicalisation JCS).
- VM : `praxis-negotiation` healthy, ports `14041`/`14042`, DB `praxis_negotiation` (event store + projection UPSERT en transaction unique).
- E2E `.tools/e2e_smoke.py` : 17/17 verts (5 healthchecks + lifecycle complet : start, idempotent replay same-id, propose A=100, counter B=150 best=B, settle avec sigs A+B sur JCS{negoId, winId}, history events=4).

### Out of scope v1 → étape 8b

Cancellation/expiration REST endpoints + sweeper deadline, public-key resolution via agent-identity (aujourd'hui inline), LLM mediator, insurance-bridge auto, reputation-bridge auto, snapshots S3, EIP-712 + on-chain anchoring Base Sepolia.

### Contexte historique du brief original (sprints 18-23)

### Périmètre

- Stratégies : enchères ascendantes/descendantes, multi-critères, vote pondéré.
- Médiation : LLM spécialisé (Claude ou GPT-4) propose un compromis sur impasse.
- Signature multi-parties : EIP-712 typed data sur Base.
- Synergie : `INSURANCE.subscribe(deal)` auto-déclenchée à la signature.
- Event sourcing pur : event store dédié (Postgres append-only) + projections matérialisées.

### Dépendances

- INSURANCE (couverture du contrat).
- REPUTATION (alimentation feedback post-deal).

### Brief résumé

Implémentation event-sourced classique : domain events typés, projections rebuilt au démarrage, snapshots tous les N events. LLM call protégé derrière un budget par négociation (cap coût).

---

## Étape 9 — GA publique (sprint 24)

### Sortie de β

- Bug bounty Immunefi (smart contracts) + HackerOne (web/API).
- Audit sécurité tiers complet (cf. CDC §4.2 et §9.3).
- Self-service ouvert (registration opérateur sans liste blanche).
- Documentation publique stable (versions API gelées avec deprecation policy).
- Statut page (status.praxis.dev ?) avec uptime et incidents.

### Critères go/no-go (cf. PLAN §6 gates)

- Audit sans CVE critique.
- SLO 99.9% tenu sur 90 jours.
- DR testé et validé.
- 5 opérateurs pilotes en production avec NPS ≥ 30.

---

## Étape 10 — P4 industrialisation (M14-M18)

### Multi-région

- Déploiement US (`us-east-1`) puis APAC (`ap-southeast-1`).
- Réplication multi-région des bases (Postgres + Neo4j + ClickHouse + Qdrant).
- Sharding par opérateur ou par région.

### Enterprise

- SSO SAML, SCIM provisioning.
- MSA + DPA dédiés grands comptes.
- API d'intégration enterprise (webhooks signés, batch ingestion).
- SLA 99.95% contractualisé.

### Standardisation

- Ouverture du protocole de réputation (RFC public + référence open-source).
- Adhésion par 3+ plateformes tierces du standard.

### Levée

- Série A si traction confirmée (10 000 MAA, 600 op. payants, ARR 1.8 M€).

---

## Notes pratiques pour la prochaine session

### Premières actions à faire

1. **Vérifier la santé de la VM** : `python .tools/ssh_run.py --sudo "docker compose -p praxis ps"`. Si traefik est encore en boucle ou un autre service en panne, diagnostiquer avant de continuer.
2. **Vérifier le repo** : `git pull` + `pnpm install` + `pnpm test`.
3. **Vérifier le PAT GitHub** : si toujours valide, OK ; sinon, demander à l'utilisateur d'en générer un nouveau.
4. **Lire** : [STATUS.md](STATUS.md) (snapshot) puis ce document.

### Style de collaboration validé

- Posture chef de projet : briefer un agent dev (`backend-development:backend-architect` ou autre selon besoin) avec un prompt **complet, contraint et explicite**.
- Workflow : agent code → vérification PM (build/test/lint) → commit → push → déploiement VM → tests E2E → push final.
- Push à chaque grosse étape (consigne utilisateur).
- Doctrine : **jamais de `--no-verify`**, jamais de bypass des hooks, fixer la cause racine.

### Outils prêts dans `.tools/`

- `ssh_run.py` — exécution SSH sur la VM (avec `--sudo` pour les commandes docker).
- `ssh_push.py` — SFTP push.
- `e2e_smoke.py` — tests E2E des 3 services actuels (à étendre avec OBSERVABILITY).

### Secrets

- `.env.local` (local) : `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_USER`. **À régénérer si compromis.**
- `praxis-stack/services.env` (sur la VM) : clés Ed25519 platform + AES memory. **Fixtures dev.**

### Convention de commits

Conventional Commits + co-author Claude. Exemple :

```
feat(observability): module OBSERVABILITY v1 — logs, traces, query, alerts

<corps>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

— _Fin de la roadmap. Bon repos._
