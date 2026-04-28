# Déploiement de la stack Praxis (β / option A)

Ce dossier contient la stack Docker Compose pour la phase β, conçue pour
**cohabiter** avec les services existants sur la VM (option A).

## Pré-requis

- Docker Engine ≥ 25 + Docker Compose v2.30+.
- Node 22+ (uniquement pour générer les clés cryptographiques).
- Accès SSH ou local à la VM cible.

## Topologie

| Couche     | Compose                       | Contenu                                                                                                     |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Données    | `docker-compose.yml`          | Postgres, Redis, NATS, Qdrant, ClickHouse, Neo4j, Ollama (`nomic-embed-text`), Prometheus, Grafana, Traefik |
| Applicatif | `docker-compose.services.yml` | `agent-identity`, `reputation`, `memory`                                                                    |

Les services applicatifs **rejoignent le réseau `praxis_net`** défini dans le compose data et résolvent les datastores via leurs hostnames internes (`postgres`, `redis`, `neo4j`, `qdrant`, `ollama`).

## Ports exposés sur l'hôte

| Service          | HTTP    | gRPC    |
| ---------------- | ------- | ------- |
| `agent-identity` | `14001` | `14002` |
| `reputation`     | `14011` | `14012` |
| `memory`         | `14021` | `14022` |

## Mise en route

```bash
# 1. Cloner le repo et entrer dans la stack
cd /home/<user>/Praxis/praxis-stack

# 2. Générer les secrets (à faire UNE FOIS par environnement)
node -e "
const c = require('crypto');
const { publicKey, privateKey } = c.generateKeyPairSync('ed25519');
const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).slice(-32);
const pub = publicKey.export({ format: 'der', type: 'spki' }).slice(-32);
console.log('REPUTATION_PLATFORM_PRIVATE_KEY=' + priv.toString('base64'));
console.log('REPUTATION_PLATFORM_PUBLIC_KEY=' + pub.toString('base64'));
console.log('MEMORY_ENCRYPTION_KEY=' + c.randomBytes(32).toString('base64'));
" > services.env
chmod 600 services.env

# 3. Démarrer la couche données + applicative
docker compose -f docker-compose.yml -f docker-compose.services.yml up -d

# 4. Vérifier
docker compose -f docker-compose.yml -f docker-compose.services.yml ps

# 5. Smoke E2E (depuis n'importe quel poste avec accès Tailscale)
PRAXIS_VM=100.83.10.125 python ../.tools/e2e_smoke.py
```

## Migrations

Chaque service Node lance `node dist/db/migrate.js && node dist/server.js`
au démarrage. Les migrations Drizzle sont **idempotentes** et embarquées
dans l'image. Pas d'étape manuelle.

Pour Neo4j (REPUTATION), les contraintes sont créées au démarrage du
service via `bootstrapSchema()` (cf. `apps/reputation/src/neo4j/client.ts`).

Pour Qdrant (MEMORY), la collection `praxis_memories` est créée à la
demande au premier `memory.store`.

## Logs et observabilité

```bash
# Suivre les 3 services en direct
docker compose -f docker-compose.services.yml logs -f agent-identity reputation memory

# Métriques Prometheus
curl http://100.83.10.125:14001/metrics | head
curl http://100.83.10.125:14011/metrics | head
curl http://100.83.10.125:14021/metrics | head

# Dashboard Grafana
open http://100.83.10.125:13000   # admin / praxis_dev
```

## Rollback

```bash
# Arrêt sans perte
docker compose -f docker-compose.yml -f docker-compose.services.yml stop

# Wipe complet (volumes inclus)
docker compose -p praxis down -v
docker network rm praxis_net 2>/dev/null
```

## Sécurité — checklist avant tout passage hors β

- [ ] Régénérer `services.env` (clés Ed25519 + AES) avec un KMS ou Vault.
- [ ] Exposer les ports applicatifs derrière Traefik avec TLS, **pas** directement.
- [ ] Restreindre les CORS / origines autorisées dans chaque service.
- [ ] Activer les signatures cryptographiques sur tous les endpoints (actuellement
      `callerDid`/`queryDid` en clair sur memory v1 — voir issue ouverte).
- [ ] Audit Postgres : `agentstack`/`praxis` user → user dédié par service avec privilèges minimaux.
- [ ] Backups quotidiens Postgres + Neo4j + Qdrant.
- [ ] Bug bounty + SAST/SCA en CI.

## Diagnostic

| Symptôme                 | Investigation                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Service `unhealthy`      | `docker logs praxis-<service>` ; vérifier que la DB/queue dépendante est `healthy`         |
| `address already in use` | Conflit de port — vérifier `ss -tulnp` sur l'hôte                                          |
| Embedding `503`          | `docker exec praxis-ollama ollama list` — le modèle a-t-il été pullé ?                     |
| Erreur signature         | Vérifier l'horodatage `signedAt` (skew) et que la clé publique du DID matche le signataire |
