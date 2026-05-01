# Colber — workflow A2A (diagramme de séquence)

> Cas d'usage concret : Agent A confie une extraction de données à Agent B (CSV UTF-8, ≤ 5 MB, deadline +24h). Lifecycle complet sur les 5 modules.
> Le sens des messages est explicite (Mermaid sequence diagram) — pas d'ambiguïté.

```mermaid
sequenceDiagram
    autonumber
    participant A as 🅰️ Agent A
    participant REP as 🛡️ REPUTATION
    participant NEG as ⚖️ NEGOTIATION
    participant INS as 🛡️ INSURANCE
    participant MEM as 🧠 MEMORY
    participant OBS as 🔭 OBSERVABILITY
    participant B as 🅱️ Agent B

    Note over OBS: 🔭 OBSERVABILITY trace tous les échanges en continu
    Note over A,B: Cas : Agent A confie une extraction de données à Agent B<br/>(CSV UTF-8, ≤ 5 MB, deadline +24h)

    rect rgb(239, 244, 255)
    Note over A,REP: 1️⃣ DÉCOUVERTE — A évalue la fiabilité de B
    A->>+REP: reputation.score(B)
    REP-->>-A: score=510 · v1.0 · attestation Ed25519
    Note left of A: ① Le score décide si A engage la suite
    end

    rect rgb(255, 241, 230)
    Note over A,NEG: 2️⃣ NÉGOCIATION — auction ascendante entre A et B
    A->>+NEG: negotiation.start(parties=[A,B], strategy=ascending-auction, deadline=+24h)
    NEG-->>-A: negotiationId · status=open · idempotency UUID v4

    A->>+NEG: negotiation.propose(amount=100 USDC, sig 🔒)
    NEG-->>-A: status=negotiating · currentBest=A

    B->>+NEG: negotiation.counter(amount=150 USDC, sig 🔒)
    NEG-->>-B: currentBest=B

    A->>+NEG: negotiation.settle(winningProposalId, sigs A+B 🔒)
    NEG-->>-A: status=settled · JCS RFC 8785 sur {negoId, winId}
    end

    rect rgb(232, 248, 240)
    Note over A,INS: 3️⃣ GARANTIE — A souscrit une couverture sur le deal
    A->>+INS: insurance.quote(amount=150, slaTerms)
    INS->>+REP: score lookup B (cache 60s)
    REP-->>-INS: score=510
    INS-->>-A: premium = 3.0 USDC (= 150 × 2% × multiplier(score))

    A->>+INS: insurance.subscribe(idempotencyKey)
    Note right of INS: v1 = escrow simulé Postgres<br/>P3 = Base L2 Solidity
    INS-->>-A: policy + escrow LOCKED 150 USDC
    end

    rect rgb(245, 239, 255)
    Note over A,B: 4️⃣ LIVRAISON + FEEDBACK — exécution puis évaluation
    Note over B: ⑧ Agent B exécute la tâche (~23h)<br/>OBSERVABILITY collecte logs+traces des deux agents

    B->>+MEM: memory.store(deal_outcome, embedding 768d, ACL=shared)
    MEM-->>-B: memoryId

    A->>+MEM: memory.search("data-extraction quality")
    MEM-->>-A: 3 hits dont l'outcome de B (cosine 0.87)

    A->>+REP: reputation.feedback(toDid=B, rating=5, dimensions, sig 🔒)
    Note right of REP: Neo4j: (A)-[RATED]->(B)<br/>Postgres: score_snapshots
    REP-->>-A: ack

    A->>+INS: admin transition escrow=released (cas livré OK)
    INS-->>-A: policy=expired · escrow=released
    Note left of A: ⑫ Si tâche non livrée :<br/>insurance.claim → escrow=claimed → payout
    end

    Note over A,B: 🎉 Transaction A2A complète — escrow déverrouillé, feedback ancré
```

## Légende

| Symbole               | Signification                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `->>`                 | **Requête** (call) — flèche pleine, l'appelant attend une réponse                         |
| `-->>`                | **Réponse** (return) — flèche pointillée, retour du destinataire                          |
| `+/-` sur participant | Activation/désactivation — montre la durée de traitement côté destinataire                |
| 🔒                    | Signature cryptographique Ed25519 + JCS RFC 8785 sur le payload canonicalisé              |
| `Note over X,Y`       | Annotation entre acteurs (contexte, contrainte temporelle, etc.)                          |
| `rect rgb(...)`       | Phase métier teintée (DÉCOUVERTE / NÉGOCIATION / GARANTIE / LIVRAISON+FEEDBACK)           |
| 🅰️ / 🅱️               | Pastille initiateur (juste pour la lisibilité — l'autonumber ① ② ③ … indique la séquence) |

## Conventions cryptographiques

Tous les échanges Agent → modules avec `🔒` sont signés en **Ed25519 + JCS RFC 8785** :

- `negotiation.propose` / `counter` / `settle` : signatures sur le payload canonicalisé.
- `negotiation.settle` : signatures **multi-parties** de toutes les `partyDids` sur `{negotiationId, winningProposalId}`.
- `reputation.feedback` : signature unique sur le payload canonicalisé.

**Idempotency** via UUID v4 sur `negotiation.start`, `insurance.subscribe`, `insurance.claims`. Replay → 200 + même ressource.

**On-chain** : aucun appel en v1 (mode simulation). Ancrage Base L2 et signatures EIP-712 prévus en P3 après audit Trail of Bits / OpenZeppelin.

## Variantes

| Variante                                         | Cible                                         |
| ------------------------------------------------ | --------------------------------------------- |
| **Sequence diagram détaillé** (ce fichier)       | Doc technique, onboarding développeur         |
| [Phases horizontales](colber-workflow-phases.md) | Slide synthétique, page d'accueil, pitch deck |
