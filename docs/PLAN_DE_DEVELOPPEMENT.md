# PLAN DE DÉVELOPPEMENT — COLBER

> **Note de rebrand (avril 2026)** : projet initialement nommé _AgentStack_ dans le cahier des charges v1.0 (`AgentStack_Cahier_des_charges.docx`), renommé **Colber** — nom de marque définitif. Contenu fonctionnel et technique inchangé.

**Document de pilotage projet — v1.0**
**Auteur : Johan (Chef de projet) — Avril 2026**
**Référence : `AgentStack_Cahier_des_charges.docx` v1.0 (à renommer en `Colber_Cahier_des_charges.docx` lors d'une révision ultérieure)**

---

## 0. Synthèse exécutive

Colber est une plateforme d'infrastructure pour l'économie agentique regroupant **5 modules** : INSURANCE, REPUTATION, OBSERVABILITY, NEGOTIATION, MEMORY.

Le plan de développement est structuré en **5 phases** sur **18 mois (M0 → M18)**, avec une priorisation différenciante sur REPUTATION + MEMORY (modules les moins concurrencés et utilisables dès aujourd'hui).

| Phase                    | Période   | Modules livrés                 | Objectif business              |
| ------------------------ | --------- | ------------------------------ | ------------------------------ |
| **P0** Préparation       | M0 → M2   | Aucun (setup)                  | Équipe + 10 op. pilotes        |
| **P1** MVP               | M2 → M6   | REPUTATION + MEMORY (β fermée) | 500 agents, 20 op. payants     |
| **P2** Observability     | M6 → M10  | OBSERVABILITY + scoring v2     | 3 000 agents, 150 op. payants  |
| **P3** Trust Layer       | M10 → M14 | INSURANCE + NEGOTIATION        | Sortie β, GA self-service      |
| **P4** Industrialisation | M14 → M18 | Multi-région + Enterprise      | 10 000 agents, 600 op. payants |

---

## 1. Méthodologie de pilotage

### 1.1 Cadre agile retenu

- **Sprints de 2 semaines** (cf. § 7.3 du CDC).
- **Releases continues** sur services internes ; **releases versionnées (semver)** sur API publiques.
- **Rétention API ≥ 90 jours** pour préserver les agents tiers.

### 1.2 Cérémonies

| Cérémonie          | Fréquence          | Participants    | Output                 |
| ------------------ | ------------------ | --------------- | ---------------------- |
| Daily stand-up     | Quotidien (15 min) | Équipe tech     | Blockers identifiés    |
| Sprint planning    | Bi-hebdo (2h)      | Équipe complète | Backlog sprint figé    |
| Sprint review/démo | Bi-hebdo (1h)      | + op. pilotes   | Validation incrément   |
| Rétrospective      | Bi-hebdo (45 min)  | Équipe tech     | Actions d'amélioration |
| Comité technique   | Hebdo (1h)         | Tech leads      | Choix architecture     |
| Comité produit     | Bi-mensuel         | + op. pilotes   | Priorisation backlog   |
| Advisory board     | Trimestriel        | Conseillers     | Cap stratégique        |

### 1.3 Definition of Ready (DoR) — entrée backlog

- Critères d'acceptation rédigés (Gherkin de préférence).
- Estimation Story Points par planning poker.
- Dépendances inter-modules identifiées.
- Maquettes UX si concerné par la console opérateur.
- Schéma d'API ou de contrat MCP rédigé.

### 1.4 Definition of Done (DoD) — sortie backlog

- Code reviewé (≥ 1 reviewer) et mergé sur `main`.
- Tests unitaires ≥ 80 % de couverture (cf. § 9.2 CDC).
- Tests d'intégration verts.
- Documentation API à jour (OpenAPI + MCP schema).
- Métriques Prometheus exposées.
- Logs structurés JSON présents.
- Pas de vulnérabilité critique au scan SAST/SCA.
- Démo validée par PO.

### 1.5 Politique de branches & CI/CD

- **Trunk-based development** + branches courtes feature/\*.
- PR obligatoire, blocage merge si CI rouge.
- Pipeline : lint → tests unit → tests intégration → build → SAST → image scan → deploy staging → tests E2E → deploy prod (gated).
- **Feature flags** (LaunchDarkly ou OSS équivalent) pour toggles métier.

---

## 2. Découpage en phases, lots et sprints

### 2.1 PHASE 0 — Préparation (M0 → M2 / 4 sprints)

#### Lot 0.1 — Constitution équipe et juridique

- **S0.1.1** : Recrutement co-fondateur tech senior + DevRel.
- **S0.1.2** : Choix juridiction (France / Estonie / Delaware / Suisse) — _question ouverte CDC §10.4_.
- **S0.1.3** : Création entité, ouverture comptes, KYB.
- **S0.1.4** : CGU agentiques v1, DPA RGPD v1, politique modération.

#### Lot 0.2 — Architecture de référence et choix techniques

- **S0.2.1** : Validation du stack (TypeScript/Node + Rust modules critiques, K8s, NATS, Postgres, Qdrant, ClickHouse, Base L2).
- **S0.2.2** : Spécification du protocole d'identité agentique (DID + Ed25519/secp256k1).
- **S0.2.3** : Définition du schéma MCP global (conventions de naming, versioning, error model).
- **S0.2.4** : ADR (Architecture Decision Records) pour 10 décisions structurantes.

#### Lot 0.3 — Socle infrastructure

- **S0.3.1** : Setup multi-comptes cloud (AWS ou GCP) + Terraform IaC initial.
- **S0.3.2** : Cluster K8s managé (GKE ou EKS) — 1 région (eu-west).
- **S0.3.3** : Pipeline CI/CD (GitHub Actions) avec staging environments.
- **S0.3.4** : Stack observabilité interne (Prometheus, Grafana, Loki, OTel collector).
- **S0.3.5** : Vault/Secrets Manager + politique de gestion des clés cryptographiques.

#### Lot 0.4 — Acquisition pilotes & communication

- **S0.4.1** : Site vitrine + landing page early access.
- **S0.4.2** : Recrutement 10 opérateurs pilotes (LangChain, CrewAI, Autogen communities).
- **S0.4.3** : Documentation publique de vision + RFC ouvert sur le protocole de réputation.
- **S0.4.4** : Présence forums (Reddit r/AI_Agents, Discord MCP, HN).

#### Jalons P0

- ✅ **M2-J1** : Équipe constituée (3 personnes), entité légale active.
- ✅ **M2-J2** : Stack & infra de base prêts à recevoir les premiers services.
- ✅ **M2-J3** : 10 opérateurs pilotes engagés par lettre d'intention.

---

### 2.2 PHASE 1 — MVP REPUTATION + MEMORY (M2 → M6 / 8 sprints)

> **Stratégie** : livrer en β fermée les deux modules les plus différenciants. Ils servent de tête de pont et alimentent la base d'identité partagée.

#### Lot 1.1 — Plateforme transverse (sprints 1 → 3)

| Sprint       | Items                                                           | Livrables                                      |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------- |
| **Sprint 1** | Service `agent-identity` (DID, clé publique, signature Ed25519) | Endpoint `auth.register`, `auth.verify`        |
| **Sprint 1** | Service `operator-console` v0 (Next.js, auth opérateur, KYB)    | Login, gestion agents, API keys                |
| **Sprint 2** | API Gateway (Kong ou Cloudflare Workers) + rate limiting        | Routage, throttling par agent                  |
| **Sprint 2** | Wallet de plateforme + intégration x402 (testnet Base)          | Paiement par appel fonctionnel                 |
| **Sprint 3** | Bus d'événements NATS JetStream + topics globaux                | `agent.created`, `transaction.completed`, etc. |
| **Sprint 3** | Module facturation USDC (free tier + débit auto)                | Compteurs quota, débit on-chain                |

#### Lot 1.2 — Module REPUTATION v1 (sprints 3 → 6)

| Sprint       | Items                                                               |
| ------------ | ------------------------------------------------------------------- |
| **Sprint 3** | Modèle de données graphe (Neo4j) : agents, transactions, feedbacks  |
| **Sprint 4** | Endpoints `reputation.score` + `reputation.history` (lecture)       |
| **Sprint 4** | Endpoint `reputation.feedback` (écriture signée post-tx)            |
| **Sprint 5** | Algorithme de scoring v1 mono-dimensionnel (fiabilité technique)    |
| **Sprint 5** | Endpoint `reputation.verify` (vérif crypto attestations)            |
| **Sprint 6** | Ancrage on-chain périodique (Merkle root sur Base, batch quotidien) |
| **Sprint 6** | Quota free tier (1000 req/mois/agent) + métering                    |

#### Lot 1.3 — Module MEMORY v1 (sprints 4 → 7)

| Sprint       | Items                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| **Sprint 4** | Déploiement Qdrant managé + schéma de mémoire (faits/événements/relations) |
| **Sprint 5** | Endpoint `memory.store` + génération embeddings (OpenAI ou self-host)      |
| **Sprint 5** | Endpoint `memory.retrieve` (recherche sémantique top-k)                    |
| **Sprint 6** | Endpoint `memory.update` + versionnement                                   |
| **Sprint 6** | Permissions privées/partagées entre agents d'un même opérateur             |
| **Sprint 7** | Endpoint `memory.share` + chiffrement at-rest (KMS)                        |
| **Sprint 7** | Quota free tier (100 Mo + 5000 req/mois)                                   |

#### Lot 1.4 — Console opérateur, SDK et go-to-market (sprints 6 → 8)

| Sprint       | Items                                                       |
| ------------ | ----------------------------------------------------------- |
| **Sprint 6** | Console v1 : dashboards usage, billing, gestion agents/keys |
| **Sprint 7** | SDK TypeScript officiel (publication npm)                   |
| **Sprint 7** | SDK Python officiel (publication PyPI)                      |
| **Sprint 7** | Documentation publique (Mintlify ou Docusaurus)             |
| **Sprint 8** | Listage AgenticTrade + MCP Registries publics               |
| **Sprint 8** | Tests de charge (k6) — cible 1k RPS soutenu                 |
| **Sprint 8** | Audit de sécurité externe (préliminaire)                    |

#### Jalons P1

- ✅ **M4** : β interne fonctionnelle — REPUTATION + MEMORY appelables via MCP par les opérateurs pilotes.
- ✅ **M5** : Premiers paiements x402 sur testnet, quotas free tier opérationnels.
- ✅ **M6** : 500 agents actifs mensuels, 20 opérateurs payants, ARR ≈ 80 K€.

---

### 2.3 PHASE 2 — OBSERVABILITY + scoring v2 (M6 → M10 / 8 sprints)

#### Lot 2.1 — Module OBSERVABILITY (sprints 9 → 13)

| Sprint        | Items                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| **Sprint 9**  | Déploiement ClickHouse + schéma logs/traces                                |
| **Sprint 9**  | Endpoint `observability.log` + ingestion à haut débit (10k events/s/pod)   |
| **Sprint 10** | Endpoint `observability.trace` + propagation OpenTelemetry W3C             |
| **Sprint 10** | Endpoint `observability.query` (langage de query simplifié, type Lucene)   |
| **Sprint 11** | Visualisation cha­îne d'appels A2A multi-niveaux (Grafana + plugin custom) |
| **Sprint 11** | Endpoint `observability.alert` (règles déclaratives)                       |
| **Sprint 12** | Détection d'anomalies ML (latence, échecs en cascade, dépassement budget)  |
| **Sprint 12** | Tiering stockage chaud/tiède/froid (S3 Glacier policy)                     |
| **Sprint 13** | Export OpenTelemetry conforme (vers Datadog, Honeycomb, etc.)              |

#### Lot 2.2 — REPUTATION v2 (sprints 11 → 14)

| Sprint        | Items                                                                 |
| ------------- | --------------------------------------------------------------------- |
| **Sprint 11** | Scoring multi-dimensionnel (fiabilité, SLA, qualité, comportement tx) |
| **Sprint 12** | Détection sybil & collusion (clustering, graph analysis)              |
| **Sprint 13** | Mécanisme de contestation feedback (workflow opérateur)               |
| **Sprint 14** | API publique tarifée par niveau de granularité                        |

#### Lot 2.3 — Intégrations frameworks d'agents (sprints 13 → 16)

| Sprint        | Items                                                              |
| ------------- | ------------------------------------------------------------------ |
| **Sprint 13** | Plugin LangChain (callback handler observability + memory backend) |
| **Sprint 14** | Plugin CrewAI                                                      |
| **Sprint 15** | Plugin Autogen                                                     |
| **Sprint 16** | Programme de partenariat A2A tiers (Google A2A, AgenticTrade)      |

#### Jalons P2

- ✅ **M8** : OBSERVABILITY en β publique, premier client enterprise sur le module.
- ✅ **M10** : 3 000 agents actifs, 150 opérateurs payants, ARR ≈ 450 K€, taux multi-modules ≥ 30 %.

---

### 2.4 PHASE 3 — INSURANCE + NEGOTIATION (M10 → M14 / 8 sprints)

#### Lot 3.1 — Module INSURANCE (sprints 17 → 22)

| Sprint        | Items                                                                                |
| ------------- | ------------------------------------------------------------------------------------ |
| **Sprint 17** | Modèle de pricing (entrées : montant, réputation vendeur, type livrable, historique) |
| **Sprint 17** | Endpoint `insurance.quote` (devis temps réel)                                        |
| **Sprint 18** | Définition formelle du SLA contractuel (schéma JSON + signatures)                    |
| **Sprint 18** | Endpoint `insurance.subscribe` (souscription + escrow)                               |
| **Sprint 19** | Réserve de liquidité on-chain (smart contract sur Base)                              |
| **Sprint 19** | Partenariat assurantiel ou DAO de couverture — _question ouverte CDC §10.4_          |
| **Sprint 20** | Endpoint `insurance.claim` + workflow de réclamation                                 |
| **Sprint 20** | Système d'arbitrage automatisé (oracles configurables)                               |
| **Sprint 21** | Endpoint `insurance.status` + reporting opérateur                                    |
| **Sprint 22** | Plafond global d'engagement + circuit-breakers anti-pertes                           |

#### Lot 3.2 — Module NEGOTIATION (sprints 18 → 23)

| Sprint        | Items                                                                 |
| ------------- | --------------------------------------------------------------------- |
| **Sprint 18** | Event store dédié (Postgres + projections)                            |
| **Sprint 19** | Modélisation contraintes / BATNA / critères acceptables               |
| **Sprint 20** | Endpoint `negotiation.start` + algorithme enchères ascendantes        |
| **Sprint 20** | Endpoint `negotiation.propose` + `negotiation.counter`                |
| **Sprint 21** | Algorithme négociation multi-critères (vote pondéré)                  |
| **Sprint 22** | Médiation automatisée (LLM spécialisé pour propositions de compromis) |
| **Sprint 22** | Endpoint `negotiation.settle` + signature crypto multi-parties        |
| **Sprint 23** | Support N parties (au-delà de 2)                                      |

#### Lot 3.3 — Synergie inter-modules & GA (sprints 21 → 24)

| Sprint        | Items                                                         |
| ------------- | ------------------------------------------------------------- |
| **Sprint 21** | Couverture automatique d'un contrat NEGOTIATION par INSURANCE |
| **Sprint 22** | Alimentation de REPUTATION par les issues négociation         |
| **Sprint 23** | Smart contracts on-chain pour signature de contrats négociés  |
| **Sprint 23** | Audit de sécurité tiers complet (cf. CDC §4.2 et §9.3)        |
| **Sprint 24** | Sortie β publique + ouverture self-service                    |
| **Sprint 24** | Bug bounty programme officiel (Immunefi ou HackerOne)         |

#### Jalons P3

- ✅ **M12** : INSURANCE en α privée avec partenaire assurantiel.
- ✅ **M13** : NEGOTIATION fonctionnel sur deals à 2 parties, intégré INSURANCE + REPUTATION.
- ✅ **M14** : **GA publique** — les 5 modules accessibles en self-service avec SLA contractuel.

---

### 2.5 PHASE 4 — Industrialisation & expansion (M14 → M18 / 8 sprints)

#### Lot 4.1 — Multi-région & résilience (sprints 25 → 28)

| Sprint        | Items                                                              |
| ------------- | ------------------------------------------------------------------ |
| **Sprint 25** | Déploiement région US (us-east-1)                                  |
| **Sprint 26** | Déploiement région APAC (ap-southeast-1)                           |
| **Sprint 27** | Réplication multi-région des bases (sharding par région/opérateur) |
| **Sprint 28** | DR / Plan de continuité testé (RTO 1h, RPO 5 min)                  |

#### Lot 4.2 — Enterprise (sprints 26 → 30)

| Sprint        | Items                                                           |
| ------------- | --------------------------------------------------------------- |
| **Sprint 26** | Tier opérateur enterprise : SSO SAML, SCIM, audit logs étendus  |
| **Sprint 27** | Contrats MSA + DPA dédiés grands comptes                        |
| **Sprint 28** | API d'intégration enterprise (webhooks signés, batch ingestion) |
| **Sprint 29** | SLA 99,95 % contractualisé                                      |
| **Sprint 30** | Console opérateur multi-langue (anglais + français + espagnol)  |

#### Lot 4.3 — Standardisation & écosystème (sprints 29 → 32)

| Sprint        | Items                                                              |
| ------------- | ------------------------------------------------------------------ |
| **Sprint 29** | Ouverture du protocole de réputation (RFC + référence open-source) |
| **Sprint 30** | Adhésion par 3+ plateformes tierces du standard de réputation      |
| **Sprint 31** | SDK communautaires Go et Rust (sponsoring contributeurs)           |
| **Sprint 32** | Préparation Série A (data room, deck, due diligence tech)          |

#### Jalons P4

- ✅ **M16** : Disponibilité multi-région effective (US + EU + APAC).
- ✅ **M18** : 10 000 MAA, 600 opérateurs payants, ARR ≈ 1,8 M€, standard réputation adopté.

---

## 3. Plan de charge & dimensionnement équipe

### 3.1 Croissance équipe par phase

| Phase        | Tech | Produit | DevRel | Ops/Sécu | Business | Total  |
| ------------ | ---- | ------- | ------ | -------- | -------- | ------ |
| P0 (M0-M2)   | 2    | 1       | 1      | 0        | 0        | **4**  |
| P1 (M2-M6)   | 4    | 1       | 1      | 1        | 1        | **8**  |
| P2 (M6-M10)  | 6    | 1       | 2      | 1        | 2        | **12** |
| P3 (M10-M14) | 9    | 2       | 2      | 2        | 3        | **18** |
| P4 (M14-M18) | 12   | 2       | 3      | 3        | 4        | **24** |

### 3.2 Profils tech-clés à recruter

- **2× backend senior TypeScript/Node** (P0-P1).
- **1× backend senior Rust** (P1, modules crypto critiques).
- **1× SRE/DevOps senior K8s** (P1).
- **1× Smart contract developer Solidity/Foundry** (P3).
- **1× Data engineer ClickHouse** (P2).
- **1× ML engineer** (P2 anti-fraud, P3 médiation).
- **1× Frontend senior React/Next.js** (P1).

---

## 4. Gestion des risques projet (vue PMP)

Risques projet en complément de l'analyse business du CDC §8 :

| #   | Risque projet                                    | P   | I   | Mitigation                                                                     |
| --- | ------------------------------------------------ | --- | --- | ------------------------------------------------------------------------------ |
| R1  | Dépendance forte au standard MCP en évolution    | M   | É   | Layer d'abstraction interne, suivi RFC MCP, contributions amont                |
| R2  | Non-recrutement profils Rust/Crypto en France    | É   | M   | Sourcing international remote, partenariat école 42, freelance senior bridge   |
| R3  | Coût infra cloud explosif sur OBSERVABILITY      | M   | É   | ClickHouse self-hosted, tiering agressif, FinOps dès M3                        |
| R4  | Bug critique sur smart contracts INSURANCE       | F   | C   | Audit Trail of Bits ou OpenZeppelin avant prod, plafonds bas au lancement      |
| R5  | Dépendance Base L2 (Coinbase)                    | M   | M   | Multi-chain dès P3 (Optimism + Arbitrum), abstraction wallet                   |
| R6  | Lock-in OpenAI sur embeddings MEMORY             | M   | M   | Support multi-providers (Voyage, Cohere, self-hosted Nomic) dès v1             |
| R7  | Dérive de scope produit (5 modules en parallèle) | É   | É   | Strict respect roadmap, comité produit bi-mensuel, kill-switch fonctionnalités |

**Échelle** : F=Faible, M=Moyen, É=Élevé, C=Critique.

---

## 5. Métriques de pilotage et tableau de bord

### 5.1 KPI projet (suivi hebdomadaire)

- Vélocité (story points livrés / sprint).
- Burn-down sprint.
- Lead time PR (commit → merge).
- Taux d'échec déploiement.
- Couverture de test (cible ≥ 80 %).

### 5.2 KPI produit (suivi mensuel — cf. CDC §7.4)

- MAA (Monthly Active Agents).
- NRR (Net Revenue Retention) par opérateur.
- Taux d'adoption multi-modules (cible 50 % à M+12).
- Latence p95 par module (cible 200 ms lecture, 500 ms écriture).
- Taux d'erreur par module (cible < 0,1 %).
- Nombre d'intégrations tierces actives.

### 5.3 KPI business (suivi mensuel)

- ARR mensuel.
- CAC opérateur.
- Burn rate / runway.
- Pipeline opérateurs entreprise.

### 5.4 Outillage

- **Jira** ou **Linear** : backlog + sprints.
- **Notion** ou **Confluence** : ADR, specs, RFC.
- **GitHub** : code, PR, releases, projects.
- **Grafana** : dashboards opérationnels et produit.
- **Mixpanel** ou **PostHog** : analytics produit.
- **Slack** + intégrations CI/CD/incidents.

---

## 6. Critères de validation par phase (gates)

Aucune phase ne peut être déclarée terminée sans que **tous** les critères soient validés (cf. CDC §9.4).

### Gate fin de P0

- [ ] Équipe core constituée (≥ 3 personnes).
- [ ] Stack technique figé et documenté (10 ADR signés).
- [ ] Infra de base déployée (1 cluster K8s + CI/CD).
- [ ] 10 opérateurs pilotes engagés.
- [ ] Entité légale opérationnelle.

### Gate fin de P1

- [ ] REPUTATION + MEMORY déployés en prod accessibles via MCP.
- [ ] SDK TS et Python publiés et testés par 5+ opérateurs.
- [ ] Quota free tier + facturation x402 fonctionnels bout en bout.
- [ ] 500 MAA atteints sur 30 jours glissants.
- [ ] Couverture tests ≥ 80 %.
- [ ] Latence p95 conforme aux SLO (200 ms lecture).

### Gate fin de P2

- [ ] OBSERVABILITY ingère 10 000 events/s en prod.
- [ ] Plugins LangChain + CrewAI + Autogen publiés.
- [ ] Scoring v2 multi-dimensionnel déployé.
- [ ] 3 000 MAA, 150 opérateurs payants.
- [ ] NPS opérateurs pilotes > 30.

### Gate fin de P3 (GA)

- [ ] INSURANCE et NEGOTIATION accessibles en self-service.
- [ ] Audit de sécurité tiers réussi sans CVE critique.
- [ ] Smart contracts INSURANCE audités (Trail of Bits / OpenZeppelin).
- [ ] Bug bounty actif.
- [ ] SLO 99,9 % tenu sur 90 jours consécutifs.
- [ ] Disaster recovery testé et validé.

### Gate fin de P4

- [ ] Disponibilité multi-région effective (US + EU + APAC).
- [ ] SLA 99,95 % atteint sur 90 jours consécutifs.
- [ ] Standard réputation publié et adopté par 3+ tiers.
- [ ] 10 000 MAA atteints.
- [ ] Documentation conformité MiCA validée par juriste.

---

## 7. Points d'arbitrage à trancher (questions ouvertes CDC §10.4)

À traiter par le comité technique et l'advisory board en P0 :

| #   | Question                                                         | Échéance | Responsable          |
| --- | ---------------------------------------------------------------- | -------- | -------------------- |
| Q1  | Juridiction d'incorporation (FR / EE / US-DE / CH)               | M1       | CEO + avocat         |
| Q2  | Stratégie financement (bootstrapping / BA / VC crypto-AI)        | M2       | CEO + advisory       |
| Q3  | Open source du protocole réputation (lancement vs traction)      | M6       | CTO + comité produit |
| Q4  | Partenariat assurantiel INSURANCE (assureur traditionnel vs DAO) | M9       | CEO + business       |
| Q5  | Embedding provider MEMORY (managed vs self-hosted)               | M3       | CTO                  |
| Q6  | Déclencheur kill-switch d'un module sous-performant              | M10      | Comité produit       |

---

## 8. Annexes

### 8.1 Légende sprints

- **Sprint** = 2 semaines ouvrées.
- **Sprint 1** = première itération de P1 (donc M2 + 2 semaines).
- Numérotation continue P1 → P4 (Sprint 1 à Sprint 32).

### 8.2 Documents de référence liés

- `AgentStack_Cahier_des_charges.docx` — spécifications fonctionnelles et techniques (v1.0, ancien nom du projet).
- `ARCHITECTURE_BREAKDOWN.md` — décomposition technique détaillée (ce dépôt).
- ADRs (à produire en P0).
- Documents juridiques (CGU, DPA, MSA) — à produire en P0.

— **Fin du plan de développement v1.0** —
