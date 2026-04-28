# Praxis — schéma fonctionnel (variante hub & spoke)

> Variante "marketable" du schéma fonctionnel : `agent-identity` au centre comme pilier transverse, les 5 modules en pétales radiaux. Idéal pour slide hero / pitch deck.
> Pour la version technique alignée avec endpoints, voir [praxis-functional.md](praxis-functional.md).

```mermaid
flowchart TB
    classDef identity fill:#F1F5F9,stroke:#475569,stroke-width:3px,color:#0F172A
    classDef reputation fill:#EFF4FF,stroke:#1E3A8A,stroke-width:2px,color:#1E3A8A
    classDef memory fill:#F5EFFF,stroke:#7C3AED,stroke-width:2px,color:#7C3AED
    classDef observability fill:#ECFAFE,stroke:#0891B2,stroke-width:2px,color:#0891B2
    classDef negotiation fill:#FFF1E6,stroke:#EA580C,stroke-width:2px,color:#EA580C
    classDef insurance fill:#E8F8F0,stroke:#059669,stroke-width:2px,color:#059669

    AI(("🔐<br/><b>agent-identity</b><br/>Pilier identité<br/><i>DID:key Ed25519</i><br/>JCS RFC 8785")):::identity

    REP["🛡️ <b>REPUTATION</b><br/><i>Oracle de fiabilité agentique</i><br/>—<br/>score · history · verify · feedback"]:::reputation
    MEM["🧠 <b>MEMORY</b><br/><i>Mémoire externe persistante</i><br/>—<br/>store · retrieve · update · share"]:::memory
    OBS["🔭 <b>OBSERVABILITY</b><br/><i>Tracing distribué A2A</i><br/>—<br/>log · trace · query · alert"]:::observability
    NEG["⚖️ <b>NEGOTIATION</b><br/><i>Broker A2A multi-parties</i><br/>—<br/>start · propose · counter · settle"]:::negotiation
    INS["🛡️ <b>INSURANCE</b><br/><i>Garantie de livrable agentique</i><br/>—<br/>quote · subscribe · claim · status"]:::insurance

    %% Rayons (chaque module délègue son identité au pilier)
    AI ===|"delivers DID"| REP
    AI ===|"delivers DID"| MEM
    AI ===|"delivers DID"| OBS
    AI ===|"delivers DID"| NEG
    AI ===|"delivers DID"| INS

    %% Synergies inter-modules (arcs)
    REP -. "score lookup<br/>(pricing v1)" .-> INS
    NEG -. "auto-subscribe<br/>(P3)" .-> INS
    NEG -. "feedback post-deal<br/>(v1.1)" .-> REP
    OBS -. "trace tout<br/>(plan arrière)" .-> NEG
```

## Lecture du schéma

- **Au centre** : `agent-identity`, le pilier transverse. **Tous** les modules délèguent l'identité à ce service. C'est le seul service qui n'a pas besoin lui-même de signatures inbound — il les fournit aux autres.
- **Les 5 pétales** : les 5 modules métier de Praxis. Chacun expose 4 endpoints MCP (et leurs équivalents REST + gRPC). Chacun a une couleur d'identité unique cohérente dans toute la documentation.
- **Les arcs en pointillés** : synergies inter-modules. La seule active en v1 est `REPUTATION → INSURANCE` (lookup score pour le pricing). Les autres sont des intégrations futures (P3 on-chain, v1.1 bridges).

## Effet de plateforme

> **5 modules intégrés** mais commercialisables séparément.
>
> Là où les concurrents sont focalisés sur **un seul** module (MoonPay/x402 = paiement, Mem0/Letta/Zep = mémoire, Datadog = observability humaine), Praxis offre les **5 modules connectés** autour d'une identité agentique unifiée.
>
> Chaque module gagne en valeur composée à chaque ajout — fenêtre stratégique 12-24 mois avant qu'un acteur établi (Stripe / Coinbase / AWS) bundle l'ensemble.

## Quand utiliser cette variante

| Cas d'usage             | Variante recommandée                                                |
| ----------------------- | ------------------------------------------------------------------- |
| Slide hero pitch deck   | **Hub & spoke** (ce fichier) — plus visuel, plus parlant            |
| Page d'accueil site web | **Hub & spoke** (ce fichier)                                        |
| Doc technique / README  | [Grille fonctionnelle](praxis-functional.md) — alignement endpoints |
| Onboarding développeur  | [Grille fonctionnelle](praxis-functional.md)                        |
