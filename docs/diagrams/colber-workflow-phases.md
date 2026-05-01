# Colber — workflow A2A par phases (vue synthétique horizontale)

> Variante synthétique du workflow A2A : 4 phases lisibles d'un coup d'œil.
> Pour la version détaillée avec sequence diagram, voir [colber-workflow-a2a.md](colber-workflow-a2a.md).

```mermaid
flowchart LR
    classDef discovery fill:#EFF4FF,stroke:#1E3A8A,stroke-width:2px,color:#1E3A8A
    classDef negotiation fill:#FFF1E6,stroke:#EA580C,stroke-width:2px,color:#EA580C
    classDef insurance fill:#E8F8F0,stroke:#059669,stroke-width:2px,color:#059669
    classDef delivery fill:#F5EFFF,stroke:#7C3AED,stroke-width:2px,color:#7C3AED
    classDef trace fill:#ECFAFE,stroke:#0891B2,stroke-width:2px,color:#0891B2,stroke-dasharray:5 5

    subgraph Phase1["1️⃣  DÉCOUVERTE"]
        direction TB
        S1["① <b>reputation.score(B)</b><br/>→ score=510 · attestation Ed25519<br/><i>A évalue la fiabilité de B avant d'engager</i>"]:::discovery
    end

    subgraph Phase2["2️⃣  NÉGOCIATION"]
        direction TB
        S2["② <b>negotiation.start</b><br/>parties=[A,B] · strategy=ascending-auction<br/>deadline=+24h"]:::negotiation
        S3["③ <b>propose A=100 USDC</b><br/>signé Ed25519+JCS 🔒"]:::negotiation
        S4["④ <b>counter B=150 USDC</b><br/>signé Ed25519+JCS 🔒"]:::negotiation
        S5["⑤ <b>settle</b><br/>sigs multi-parties A+B<br/>sur {negoId, winId} 🔒"]:::negotiation
        S2 --> S3 --> S4 --> S5
    end

    subgraph Phase3["3️⃣  GARANTIE"]
        direction TB
        S6["⑥ <b>insurance.quote</b><br/>premium = 150 × 2 % × mult(score)<br/>= 3.0 USDC"]:::insurance
        S7["⑦ <b>insurance.subscribe</b><br/>policy + <b>escrow LOCKED 150 USDC</b><br/><i>v1 simulé Postgres · P3 Base L2</i>"]:::insurance
        S6 --> S7
    end

    subgraph Phase4["4️⃣  LIVRAISON + FEEDBACK"]
        direction TB
        S8["⑧ <b>Agent B exécute</b> (~23h)"]:::delivery
        S9["⑨ <b>memory.store</b><br/>deal_outcome · vecteur 768d"]:::delivery
        S10["⑩ <b>memory.search</b><br/>3 hits · cosine 0.87"]:::delivery
        S11["⑪ <b>reputation.feedback</b><br/>rating=5 · dims · sig 🔒"]:::delivery
        S12["⑫ <b>escrow released</b><br/>policy=expired · livrable validé<br/><i>(ou claim → escrow=claimed → payout)</i>"]:::delivery
        S8 --> S9 --> S10 --> S11 --> S12
    end

    Phase1 ==> Phase2 ==> Phase3 ==> Phase4

    OBS["🔭 <b>OBSERVABILITY</b><br/>trace tous les échanges en continu<br/><i>logs + spans ClickHouse</i>"]:::trace

    Phase1 -.-> OBS
    Phase2 -.-> OBS
    Phase3 -.-> OBS
    Phase4 -.-> OBS
```

## Lecture du schéma

Le **temps avance de gauche à droite**. Chaque phase regroupe les étapes du sequence diagram détaillé selon leur rôle métier.

| Phase                   | Étapes du sequence diagram | Module dominant                 |
| ----------------------- | -------------------------- | ------------------------------- |
| 1️⃣ Découverte           | ①                          | REPUTATION                      |
| 2️⃣ Négociation          | ② ③ ④ ⑤                    | NEGOTIATION                     |
| 3️⃣ Garantie             | ⑥ ⑦                        | INSURANCE                       |
| 4️⃣ Livraison + Feedback | ⑧ ⑨ ⑩ ⑪ ⑫                  | MEMORY + REPUTATION + INSURANCE |

**OBSERVABILITY trace en continu** sur l'ensemble du flux (toutes les phases) — logs et spans ingérés dans ClickHouse, disponibles via `observability.query`.

## Avantages vs sequence diagram détaillé

|                                  | Phases horizontales (ce fichier) | Sequence diagram détaillé     |
| -------------------------------- | -------------------------------- | ----------------------------- |
| **Lisibilité au premier regard** | ✅ Excellente                    | ⚠️ Demande lecture verticale  |
| **Compréhension flux global**    | ✅ Évidente (gauche → droite)    | ⚠️ Implicite                  |
| **Détail des payloads**          | ❌ Synthétique                   | ✅ Chaque message visible     |
| **Direction des appels**         | ❌ Implicite                     | ✅ Explicite (->>vs-->>)      |
| **Public cible**                 | Pitch, slide, page d'accueil     | Doc technique, onboarding dev |

> 💡 Les deux schémas sont complémentaires. La phase est la "carte" — le sequence est le "manuel".
