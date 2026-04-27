# Praxis — Stack de test (option A)

Stack Docker Compose **isolée** pour la phase β du projet Praxis.
Coexiste avec les services existants sur la VM `showweb3` (100.83.10.125).

## Ports exposés (tous décalés)

| Service | Port externe | Interne | Auth |
|---------|--------------|---------|------|
| Postgres | 15432 | 5432 | `praxis` / `praxis_dev` |
| Redis | 16379 | 6379 | — |
| NATS client | 14222 | 4222 | — |
| NATS monitoring | 18222 | 8222 | — |
| Qdrant HTTP | 16333 | 6333 | — |
| Qdrant gRPC | 16334 | 6334 | — |
| ClickHouse HTTP | 18123 | 8123 | `praxis` / `praxis_dev` |
| ClickHouse native | 19000 | 9000 | idem |
| Neo4j HTTP | 17474 | 7474 | `neo4j` / `praxis_dev` |
| Neo4j Bolt | 17687 | 7687 | idem |
| Ollama (embeddings) | 11434 | 11434 | — (modèle: `nomic-embed-text`) |
| Prometheus | 19090 | 9090 | — |
| Grafana | 13000 | 3000 | `admin` / `praxis_dev` |
| Traefik HTTP | 18000 | 80 | — |
| Traefik dashboard | 18080 | 8080 | — |

## Commandes

```bash
# Démarrage
docker compose up -d

# Logs
docker compose logs -f

# Healthcheck global
docker compose ps

# Arrêt sans perte de données
docker compose stop

# Arrêt avec destruction des volumes (⚠️ wipe complet Praxis)
docker compose down -v
```

## Réseau

Tous les services partagent le réseau bridge `praxis_net`.
Les microservices Praxis qui seront déployés ensuite rejoindront ce réseau.

## Volumes

Volumes nommés `praxis_*` (pg_data, redis_data, etc.).
**Aucun chevauchement** avec les volumes ShowWeb3.

## Rollback complet

```bash
docker compose -p praxis down -v
docker network rm praxis_net 2>/dev/null
```
