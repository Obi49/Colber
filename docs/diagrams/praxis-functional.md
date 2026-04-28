# Praxis — schéma fonctionnel (vue plateforme)

> Vue d'ensemble : acteurs → protocoles d'accès → 5 modules + agent-identity → systèmes externes intégrés.
> Rendu natif par GitHub. Édition par modification du bloc Mermaid ci-dessous.

```mermaid
flowchart TB
    %% ─────────────────────────────────────────────────────────────
    %% Styles (palette Praxis)
    %% ─────────────────────────────────────────────────────────────
    classDef actor fill:#F8FAFC,stroke:#0F172A,stroke-width:1.5px,color:#0F172A
    classDef proto fill:#0F172A,stroke:#0F172A,color:#F8FAFC
    classDef identity fill:#F1F5F9,stroke:#475569,stroke-width:2px,color:#0F172A
    classDef reputation fill:#EFF4FF,stroke:#1E3A8A,stroke-width:2px,color:#1E3A8A
    classDef memory fill:#F5EFFF,stroke:#7C3AED,stroke-width:2px,color:#7C3AED
    classDef observability fill:#ECFAFE,stroke:#0891B2,stroke-width:2px,color:#0891B2
    classDef negotiation fill:#FFF1E6,stroke:#EA580C,stroke-width:2px,color:#EA580C
    classDef insurance fill:#E8F8F0,stroke:#059669,stroke-width:2px,color:#059669
    classDef ext fill:#FFFFFF,stroke:#94A3B8,stroke-width:1.5px,color:#475569
    classDef extP3 fill:#FFFFFF,stroke:#D97706,stroke-width:1.5px,stroke-dasharray:5 5,color:#475569
    classDef platform fill:#F8FAFC,stroke:#1E3A8A,stroke-width:2px,color:#0F172A
    classDef phaseLabel fill:#0F172A,color:#F8FAFC,stroke:#0F172A

    %% ─────────────────────────────────────────────────────────────
    %% ZONE 1 — ACTEURS
    %% ─────────────────────────────────────────────────────────────
    subgraph Acteurs["👥 ACTEURS"]
        direction LR
        A1["🤖 <b>Agents IA autonomes</b><br/><i>Utilisateurs primaires</i>"]:::actor
        A2["👤 <b>Opérateurs humains</b><br/><i>Utilisateurs secondaires</i>"]:::actor
        A3["</> <b>Développeurs tiers</b><br/><i>Intégrateurs / SDK</i>"]:::actor
    end

    %% ─────────────────────────────────────────────────────────────
    %% ZONE 2 — PROTOCOLES D'ACCÈS
    %% ─────────────────────────────────────────────────────────────
    Proto["🔌 <b>PROTOCOLES D'ACCÈS</b> · <b>MCP-native</b> · MCP · REST · gRPC<br/><i>Auth: DID:key Ed25519 + JCS RFC 8785</i>"]:::proto

    %% ─────────────────────────────────────────────────────────────
    %% ZONE 3 — PRAXIS PLATFORM
    %% ─────────────────────────────────────────────────────────────
    subgraph PraxisPlatform["🏛️ PRAXIS PLATFORM — 5 modules autour d'agent-identity"]
        direction TB

        %% Pilier identité au centre
        AI(("🔐 <b>agent-identity</b><br/>Pilier transverse<br/><i>DID:key Ed25519</i>")):::identity

        %% 5 modules
        REP["🛡️ <b>REPUTATION</b><br/><i>Oracle de fiabilité</i><br/>—<br/>score · history<br/>verify · feedback<br/>—<br/><i>Neo4j + attestations Ed25519</i>"]:::reputation
        MEM["🧠 <b>MEMORY</b><br/><i>Mémoire externe persistante</i><br/>—<br/>store · retrieve<br/>update · share<br/>—<br/><i>Qdrant 768d + Ollama</i>"]:::memory
        OBS["🔭 <b>OBSERVABILITY</b><br/><i>Tracing distribué A2A</i><br/>—<br/>log · trace<br/>query · alert<br/>—<br/><i>ClickHouse + Postgres</i>"]:::observability
        NEG["⚖️ <b>NEGOTIATION</b><br/><i>Broker A2A multi-parties</i><br/>—<br/>start · propose<br/>counter · settle<br/>—<br/><i>Event sourcing Postgres</i>"]:::negotiation
        INS["🛡️ <b>INSURANCE</b><br/><i>Garantie de livrable</i><br/>—<br/>quote · subscribe<br/>claim · status<br/>—<br/><i>Pricing + escrow simulé v1</i>"]:::insurance

        %% Lien identité ↔ modules (rayon)
        AI --- REP
        AI --- MEM
        AI --- OBS
        AI --- NEG
        AI --- INS

        %% Synergies inter-modules
        REP -. "score lookup<br/>(pricing)" .-> INS
        NEG -. "auto-subscribe<br/>(P3)" .-> INS
        NEG -. "feedback post-deal<br/>(v1.1)" .-> REP
    end

    %% ─────────────────────────────────────────────────────────────
    %% ZONE 4 — SYSTÈMES EXTERNES
    %% ─────────────────────────────────────────────────────────────
    subgraph SystExt["🔗 SYSTÈMES EXTERNES — consommés ou intégrés"]
        direction LR
        SE1["💵 <b>x402 + USDC</b><br/><i>Paiement A2A — Coinbase</i>"]:::ext
        SE2["⛓️ <b>Base · Optimism · Arbitrum</b><br/><i>Escrow on-chain</i><br/><b>P3</b> — escrow v1 simulé Postgres"]:::extP3
        SE3["✨ <b>LLM providers</b><br/><i>Claude · GPT · Mistral</i><br/>raisonnement agent"]:::ext
        SE4["📐 <b>Embeddings</b><br/><i>Ollama · OpenAI · Voyage · Cohere</i><br/>vecteurs sémantiques 768d"]:::ext
        SE5["📈 <b>Datadog · Honeycomb · Jaeger</b><br/><i>Export OTel — P2</i>"]:::extP3
        SE6["🌐 <b>Plateformes A2A</b><br/><i>AgenticTrade · MCP Registries</i>"]:::ext
    end

    %% ─────────────────────────────────────────────────────────────
    %% Flux INBOUND (acteurs → Praxis)
    %% ─────────────────────────────────────────────────────────────
    A1 ==>|"consomme"| Proto
    A2 ==>|"consomme"| Proto
    A3 ==>|"consomme"| Proto
    Proto ==> PraxisPlatform

    %% ─────────────────────────────────────────────────────────────
    %% Flux OUTBOUND (Praxis → systèmes externes)
    %% ─────────────────────────────────────────────────────────────
    PraxisPlatform -->|"consomme"| SE1
    PraxisPlatform -.->|"intègre P3"| SE2
    PraxisPlatform -->|"consomme"| SE3
    PraxisPlatform -->|"consomme"| SE4
    PraxisPlatform -.->|"exporte P2"| SE5
    PraxisPlatform -->|"listage"| SE6

    %% ─────────────────────────────────────────────────────────────
    %% Pied — effet de plateforme
    %% ─────────────────────────────────────────────────────────────
    EFFET["💎 <b>EFFET DE PLATEFORME</b><br/>5 modules intégrés vs concurrents focalisés sur un seul<br/>(MoonPay/x402 = paiement · Mem0/Letta/Zep = mémoire · Datadog = observability humaine)<br/>— chacun gagne en valeur composée avec les autres"]:::phaseLabel
    SystExt -.- EFFET
```

## Légende

| Couleur   | Module           | Statut                                      |
| --------- | ---------------- | ------------------------------------------- |
| 🔵 Bleu   | REPUTATION       | v1 livré                                    |
| 🟣 Violet | MEMORY           | v1 livré                                    |
| 🩵 Cyan   | OBSERVABILITY    | v1 livré                                    |
| 🟠 Orange | NEGOTIATION      | v1 livré                                    |
| 🟢 Vert   | INSURANCE        | v1 livré (mode simulation — on-chain en P3) |
| ⚫ Gris   | `agent-identity` | v1 livré (pilier transverse)                |

**Conventions de flèches :**

- `==>` (épaisses) : flux INBOUND — acteurs consomment Praxis
- `-->` (simples) : flux OUTBOUND — Praxis intègre/consomme/exporte
- `-.->` (pointillées) : intégrations non encore actives en v1 (P2, P3)
- `---` (sans tête) : lien d'appartenance (modules ↔ pilier identité)
- `-.->` (avec label) entre modules : synergies inter-modules (futurs ou v1)

**Référence visuelle :** voir aussi [praxis-functional-hub.md](praxis-functional-hub.md) pour la variante hub & spoke (slide hero / pitch deck).
