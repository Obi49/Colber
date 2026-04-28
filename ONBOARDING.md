# ONBOARDING — Reprendre Praxis sans perte de contexte

> Guide unique pour reprendre le projet — humain ou agent IA arrivant en session vierge. Lis ce document avant tout autre.

**Date du dernier état** : 2026-04-28 (soir) · **Phase** : v1 atteinte (5/5 modules)

---

## 0. TL;DR — où on en est

✅ **v1 livrée** : 5 modules + agent-identity déployés et testés en bout en bout sur la VM β `100.83.10.125`.

- Pipeline local : 16/16 typecheck/test/lint/build, **385 tests passing**, FULL TURBO.
- VM β : 16 conteneurs Docker, tous healthy, `python .tools/e2e_smoke.py` → **23/23 verts**.
- Repo : <https://github.com/Obi49/Praxis>, branche `main`, dernier commit `77612f6`.

**Aucune urgence**. Aucun bug bloquant. La v1 est consolidée. Les prochaines étapes sont des enrichissements optionnels — voir §6.

---

## 1. Lecture obligatoire (dans l'ordre, ~30 minutes)

| #   | Document                                                                 | Quoi y trouver                                                                                                          | Durée     |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | [README.md](README.md)                                                   | Vue d'ensemble + statut + quick start                                                                                   | 5 min     |
| 2   | **[STATUS.md](STATUS.md)**                                               | **État projet à l'instant T** : modules livrés, infra VM, DBs, tests, décisions archi (18), points d'attention sécurité | 10 min    |
| 3   | **[ROADMAP.md](ROADMAP.md)**                                             | **Plan d'attaque opérationnel** + **briefs prêts à coller** dans des agents dev pour chaque étape future                | 10 min    |
| 4   | [PLAN_DE_DEVELOPPEMENT.md](PLAN_DE_DEVELOPPEMENT.md)                     | Plan canonique 18 mois (5 phases, 32 sprints, gates, KPI, risques)                                                      | parcourir |
| 5   | [ARCHITECTURE_BREAKDOWN.md](ARCHITECTURE_BREAKDOWN.md)                   | Modèle C4 + WBS + SLO + sécurité/conformité                                                                             | parcourir |
| 6   | [AgentStack_Cahier_des_charges.docx](AgentStack_Cahier_des_charges.docx) | CDC v1.0 figé (sous l'ancien nom AgentStack — contenu valide)                                                           | référence |

> Ne saute pas STATUS et ROADMAP. Les autres docs sont des références ; STATUS+ROADMAP sont **mis à jour à chaque pause** et reflètent l'état exact.

---

## 2. Vérifier que la stack β tourne toujours

Depuis la racine du repo (Windows / git-bash) :

```bash
# Tests locaux (depuis un clone à jour)
pnpm install                           # ~20 s
pnpm typecheck && pnpm test && pnpm lint && pnpm build
# Attendu : 16/16 typecheck/test/lint, 11/11 build, FULL TURBO

# Santé de la VM (Tailscale 100.83.10.125)
python .tools/ssh_run.py --sudo "docker compose -p praxis ps"
# Attendu : 16 conteneurs (15 healthy + traefik en flapping connu, non bloquant)

# E2E complet contre la VM
PRAXIS_VM=100.83.10.125 python .tools/e2e_smoke.py
# Attendu : 23/23 ALL E2E STEPS PASSED
```

Si tout est vert → tu peux passer à §3 (choisir une étape).
Si quelque chose casse → §7 (diagnostic).

---

## 3. Rôles et conventions

### Posture chef de projet (CdP)

Johan est CdP. Il **délègue l'implémentation** à un agent dev pour les modules code-intensifs et garde le pilotage. Pour toute implémentation > 20 fichiers ou > 1 h, **délégation obligatoire**.

Mode de collaboration attendu pour les agents IA :

- **Réponses en français**.
- Posture chef de projet : pilotage par phases/sprints, gestion des risques, KPI, gates.
- Niveau de détail : exhaustif et professionnel sur les livrables structurants.
- Push à chaque grosse étape (pas juste à la fin de session).

### Doctrine immuable

1. **Jamais de `--no-verify`**. Si le hook échoue, fixer la cause racine.
2. **Pas de bypass des hooks Husky**. Si lint-staged casse, patcher la config ESLint, pas contourner.
3. **Push à chaque livrable significatif** : un module fini OU un fix qui débloque → commit + push immédiat avec Conventional Commits + co-author Claude.
4. **Documentation avant pause** : à toute demande de pause, mettre à jour `STATUS.md` + `ROADMAP.md` + mémoire (au moins `project_agentstack.md` + `project_artifacts.md`) + commit + push.
5. **PAT GitHub jamais persisté** dans `.git/config`. Toujours via URL one-shot avec token. Le stocker dans `.env.local` (gitignored) seulement. **Le PAT actuel est considéré compromis — à révoquer + régénérer en fine-grained scopé `Obi49/Praxis` avant tout push sensible.**
6. **Cohabitation VM** : la VM β héberge ShowWeb3 (autre projet). Tous les conteneurs Praxis sont préfixés `praxis-*`, ports décalés `14xxx`/`16xxx`/`17xxx`/`18xxx`/`19xxx`. **Ne jamais toucher** ShowWeb3, Tailscale, `/home/showweb3`, `/home/claude/ShowWeb3`, `/home/claude/WebBot`. Ne jamais faire `docker compose down -v` sans `-p praxis`.

### Workflow validé pour livrer un module

```
1. Le CdP rédige un brief complet pour un agent backend-architect
   ↳ contraintes hard + lecture obligatoire de fichiers existants à mirrorer
   ↳ scope précis + format de sortie attendu
   (cf. ROADMAP.md pour les briefs prêts à coller)

2. L'agent code → produit ~30-50 fichiers cohérents en ~30 min

3. Le CdP vérifie en local
   pnpm build && pnpm typecheck && pnpm test && pnpm lint

4. Commit + push (Conventional Commits + co-author Claude)
   git push https://x-access-token:${TOKEN}@github.com/Obi49/Praxis.git HEAD:main

5. Déploiement VM
   - SSH pull du repo
   - Création de la DB Postgres si applicable
   - Ajout du bloc compose dans praxis-stack/docker-compose.services.yml
   - docker compose -p praxis build <service> && up -d <service>
   - Attendre healthcheck "healthy"

6. E2E
   - Étendre .tools/e2e_smoke.py avec un bloc lifecycle pour le module
   - PRAXIS_VM=100.83.10.125 python .tools/e2e_smoke.py
   - Tout vert attendu

7. Pause
   - Update STATUS.md (section module + tests + commits + décisions archi)
   - Update ROADMAP.md (étape marquée ✅ livrée)
   - Update mémoire si applicable
   - Commit + push final
```

### Convention de commits

Conventional Commits + co-author Claude. Exemple :

```
feat(observability): module OBSERVABILITY v1 — logs, traces, query, alerts

<corps détaillé>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## 4. Inventaire VM β

**Adresse Tailscale** : `100.83.10.125` · **Hostname** : `showweb3` (Debian 13 Trixie) · **Co-locataire** : projet `ShowWeb3` (séparé, intact, namespace Docker indépendant).

### 16 conteneurs Docker (`docker compose -p praxis ps`)

| Catégorie      | Conteneur               | Image                                       | Ports hôte      |
| -------------- | ----------------------- | ------------------------------------------- | --------------- |
| **Datastore**  | `praxis-postgres`       | `postgres:16-alpine`                        | `15432`         |
|                | `praxis-redis`          | `redis:7-alpine`                            | `16379`         |
|                | `praxis-qdrant`         | `qdrant/qdrant:v1.15.4`                     | `16333`/`16334` |
|                | `praxis-clickhouse`     | `clickhouse/clickhouse-server:24.10-alpine` | `18123`/`19000` |
|                | `praxis-neo4j`          | `neo4j:5-community`                         | `17474`/`17687` |
| **Bus**        | `praxis-nats`           | `nats:2.10-alpine`                          | `14222`/`18222` |
| **Embeddings** | `praxis-ollama`         | `ollama/ollama:0.4.7`                       | `11434`         |
| **Métriques**  | `praxis-prometheus`     | `prom/prometheus:v2.55.1`                   | `19090`         |
|                | `praxis-grafana`        | `grafana/grafana:11.3.0`                    | `13000`         |
| **Edge**       | `praxis-traefik`        | `traefik:v3.2`                              | `18000`/`18080` |
| **Apps**       | `praxis-agent-identity` | `praxis/agent-identity:dev`                 | `14001`/`14002` |
|                | `praxis-reputation`     | `praxis/reputation:dev`                     | `14011`/`14012` |
|                | `praxis-memory`         | `praxis/memory:dev`                         | `14021`/`14022` |
|                | `praxis-observability`  | `praxis/observability:dev`                  | `14031`/`14032` |
|                | `praxis-negotiation`    | `praxis/negotiation:dev`                    | `14041`/`14042` |
|                | `praxis-insurance`      | `praxis/insurance:dev`                      | `14051`/`14052` |

### Bases Postgres (sur `praxis-postgres`)

| DB                     | Service        | Tables principales                                                   |
| ---------------------- | -------------- | -------------------------------------------------------------------- |
| `praxis_identity`      | agent-identity | `agents`                                                             |
| `praxis_reputation`    | reputation     | `score_snapshots`, `feedback_log`, `merkle_anchors`                  |
| `praxis_memory`        | memory         | `memories`, `memory_versions`, `memory_shares`, `memory_quotas`      |
| `praxis_observability` | observability  | `alert_rules`                                                        |
| `praxis_negotiation`   | negotiation    | `negotiation_events` (event store), `negotiation_state` (projection) |
| `praxis_insurance`     | insurance      | `policies`, `escrow_holdings`, `escrow_events`, `claims`             |

### Autres datastores

- **ClickHouse `praxis`** : `praxis_logs`, `praxis_spans` (DateTime64 UTC, partitions/jour, TTL 30j).
- **Qdrant** : collection `praxis_memories` (vecteurs 768d nomic-embed-text).
- **Neo4j** : graphe REPUTATION `(Agent)-[PARTICIPATED_IN]->(Transaction)`, `(Agent)-[RATED]->(Agent)`.
- **Redis** : cache scoring REPUTATION (TTL 60s).

---

## 5. Commandes utiles

### Pipeline local

```bash
pnpm install                                # 20-30 s
pnpm typecheck                              # ~150 ms FULL TURBO si cache
pnpm test                                   # ~150 ms FULL TURBO si cache
pnpm lint
pnpm build
pnpm --filter @praxis/<module> <script>     # Cibler un module
```

### Push GitHub

```bash
TOKEN=$(grep -E '^GITHUB_TOKEN=' .env.local | cut -d= -f2-)
git push "https://x-access-token:${TOKEN}@github.com/Obi49/Praxis.git" HEAD:main
```

### Inspection VM

```bash
# État conteneurs
python .tools/ssh_run.py --sudo "docker compose -p praxis ps"

# Logs d'un service
python .tools/ssh_run.py --sudo "docker logs --tail=50 praxis-<service>"

# Pull repo + rebuild + up un service
TOKEN=$(grep -E '^GITHUB_TOKEN=' .env.local | cut -d= -f2-)
python .tools/ssh_run.py "cd /home/claude/Praxis && git pull --rebase https://x-access-token:${TOKEN}@github.com/Obi49/Praxis.git main"
python .tools/ssh_run.py --sudo "cd /home/claude/Praxis/praxis-stack && docker compose -p praxis -f docker-compose.yml -f docker-compose.services.yml build <service> && docker compose -p praxis -f docker-compose.yml -f docker-compose.services.yml up -d --force-recreate <service>"

# Création d'une nouvelle DB pour un futur module
python .tools/ssh_run.py --sudo "docker exec praxis-postgres psql -U praxis -d postgres -c 'CREATE DATABASE praxis_<module> OWNER praxis;'"
```

### E2E

```bash
PRAXIS_VM=100.83.10.125 python .tools/e2e_smoke.py
```

### Tests live (testcontainers, optionnel)

```bash
PRAXIS_LIVE_TESTS=1 pnpm --filter @praxis/<module> test
```

---

## 6. Choisir une prochaine étape

Aucune étape n'est urgente. Pose les bonnes questions au CdP si l'orientation n'est pas explicite. Toutes les étapes ont des **briefs prêts à coller** dans [ROADMAP.md](ROADMAP.md).

| Étape | Module / Lot                                                                 | Effort       | Impact business                                        | Bloquants externes                                                                |
| ----- | ---------------------------------------------------------------------------- | ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 2     | OBSERVABILITY v1.1 (anomalies ML + tiering + OTLP)                           | 1 session    | Moyen — value pour opérateurs avec dashboards externes | Aucun                                                                             |
| 3     | REPUTATION v2 (multi-dim + anti-Sybil + contestation)                        | 1-2 sessions | Élevé — fondation pour pricing INSURANCE v2            | Aucun (s'appuie sur OBSERVABILITY)                                                |
| 4     | Plugins frameworks (LangChain + CrewAI + Autogen)                            | 1 session    | Élevé — adoption marché                                | Aucun                                                                             |
| 5     | Console opérateur web (Next.js 15)                                           | 1-2 sessions | Élevé — self-service                                   | Aucun                                                                             |
| 6     | SDK officiels (TS sur npm + Python sur PyPI)                                 | 1 session    | Élevé — listage AgenticTrade                           | Aucun                                                                             |
| 7b    | INSURANCE on-chain réel (Solidity + audit)                                   | 2-3 sessions | Critique pour GA                                       | **Audit Trail of Bits/OpenZeppelin obligatoire avant prod** ; KMS + Safe multisig |
| 8b    | NEGOTIATION v1.1 (cancellation + sweeper + LLM mediator + EIP-712 + bridges) | 1-2 sessions | Moyen                                                  | Étape 7b si on veut le bridge insurance                                           |
| 9     | GA publique (bug bounty + audit + self-service)                              | 1 session    | Critique                                               | Étapes 7b-8b                                                                      |
| 10    | P4 industrialisation (multi-région + enterprise + standardisation)           | 4-8 sessions | Critique pour ARR cible                                | Étape 9                                                                           |

**Recommandation par défaut** si pas d'orientation explicite : **Étape 4 (plugins)** ou **Étape 6 (SDK)** — peu de friction, forte valeur d'adoption.

---

## 7. Diagnostic rapide

### Le pipeline local ne passe pas

```bash
# Reset propre
rm -rf node_modules
pnpm install
pnpm clean       # si défini
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

Si le hook Husky lint-staged échoue : `pnpm exec lint-staged` direct pour voir l'erreur. Patcher la config ESLint, **ne pas** bypasser.

### La VM ne répond plus

```bash
# Tailscale up ?
python .tools/ssh_run.py "tailscale status | head -5"

# Docker daemon up ?
python .tools/ssh_run.py --sudo "docker ps | head -5"

# Conteneurs healthy ?
python .tools/ssh_run.py --sudo "docker compose -p praxis ps"
```

### Un service Praxis spécifique fail

```bash
# Logs
python .tools/ssh_run.py --sudo "docker logs --tail=100 praxis-<service>"

# Healthcheck manuel
curl -s http://100.83.10.125:140<XX>/healthz | head

# Restart
python .tools/ssh_run.py --sudo "docker compose -p praxis -f docker-compose.yml -f docker-compose.services.yml up -d --force-recreate <service>"
```

### E2E qui échoue après une mise à jour

Vérifier qu'il y a bien un `git pull` côté VM **avant** le rebuild :

```bash
TOKEN=$(grep -E '^GITHUB_TOKEN=' .env.local | cut -d= -f2-)
python .tools/ssh_run.py "cd /home/claude/Praxis && git pull --rebase https://x-access-token:${TOKEN}@github.com/Obi49/Praxis.git main"
```

### Bugs E2E historiques connus (résolus mais à connaître)

1. **OBSERVABILITY** : ClickHouse `DateTime64` JSONEachRow refuse l'ISO `2026-04-28T12:53:36.163Z` → conversion explicite vers `2026-04-28 12:53:36.163` (cf. [apps/observability/src/clickhouse/client.ts:51](apps/observability/src/clickhouse/client.ts:51)).
2. **OBSERVABILITY** : Fastify v5 répond 500 sur `DELETE` avec `Content-Type: application/json` sans body → e2e n'envoie plus l'header quand le body est vide.
3. **NEGOTIATION** : Python `json.dumps(100.0)` → `"100.0"` vs JS `JSON.stringify(100.0)` → `"100"` cassait la canonicalisation JCS et donc la signature → utiliser des entiers Python (`int`) côté client.

### Traefik en flapping

Connu, non bloquant. Les services applicatifs sont exposés directement sur leurs ports décalés. À diagnostiquer en P2 — pas urgent.

---

## 8. Points d'attention sécurité (à traiter avant GA)

🔴 **Critique**

- **PAT GitHub `ghp_lzGq…` exposé** en chat lors d'une session précédente → à révoquer (<https://github.com/settings/tokens>) et remplacer par un fine-grained PAT scopé `Obi49/Praxis` uniquement.

🟡 **À durcir**

- **Clés Ed25519 platform** + **clé AES MEMORY_ENCRYPTION_KEY** stockées dans `praxis-stack/services.env` sur la VM uniquement. Fixtures de DEV — à régénérer + stocker dans un KMS pour tout autre environnement.
- **Auth endpoints memory v1** : `callerDid`/`queryDid` en clair (pas de signature). À durcir en P2.
- **Score caching invalidation** : reputation v1 ne purge pas le cache Redis sur `submitFeedback` ; staleness window 60 s.
- **History pagination reputation** : cursor par timestamp seul, pas de tie-breaking. À renforcer en v2.
- **`SignatureProvider`** dans `core-crypto` n'expose pas `derivePublicKey` ; reputation a importé `@noble/ed25519` directement.
- **Live test placeholder** dans chaque service (testcontainers non installé). Activable via `PRAXIS_LIVE_TESTS=1`.
- **INSURANCE admin endpoint** ouvert sur le réseau si `INSURANCE_ADMIN_ENABLED=true` (cas de la VM β). Aucune auth → ajouter shared secret ou mTLS en v1.1.

---

## 9. Si tu es un agent IA reprenant le projet

1. Lis ce document **en entier** avant de toucher au code.
2. Lis ensuite [STATUS.md](STATUS.md) puis [ROADMAP.md](ROADMAP.md).
3. Avant toute action structurante, valide avec le CdP (Johan).
4. **Ne push jamais sans confirmation explicite**, sauf si tu suis un workflow validé sur une étape déjà cadrée.
5. Pour toute implémentation > 20 fichiers ou > 1 h, **délègue** à un sous-agent `backend-development:backend-architect` avec un brief complet inspiré de ceux dans [ROADMAP.md](ROADMAP.md).
6. À la fin de toute session : update STATUS + ROADMAP + mémoire + commit + push, **toujours dans cet ordre**.
7. Réponse en français. Posture chef de projet sur les livrables structurants.

---

— _Fin du guide. Bon retour dans Praxis._
