# ADR: Broadcast substrate for anonymous / broad discovery (Phase 15A)

**Status:** Accepted (Phase 15)  
**Date:** 2026-05-20  
**Context:** Scenario 2 (blind discovery), Phase 8I anonymous discovery modes, Phase 8J relay broadcast, Phase 4F DHT capability topics.

## Decision

EnvoyMesh uses a **layered discovery stack** with a clear primary path per layer:

| Layer | Primary substrate | Purpose |
|-------|-------------------|---------|
| **Global topic/provider hints** | **DHT capability topic records** (`provideCapabilityTopic` / `findCapabilityTopicProviders`) | Find candidate libp2p peer IDs for a topic without prior bond |
| **Semantic negotiation** | **Signed `discovery.request` / `discovery.response`** (EMP on `/envoymesh/*`) | Policy-gated match details after a candidate is reachable |
| **Contact-scoped fanout** | **Bond-ordered direct send** | Library discover, syndication, trusted morning-report ranking |
| **Anonymous / broadcast intents** | **Relay-assisted fanout (8J)** when Settings anonymous discovery mode is on | Bounded broadcast of allowlisted intents (default: `discovery.request` only) |

**Gossipsub** is **not** the primary anonymous discovery substrate in Phase 15. It remains available in libp2p for future pub/sub experiments but is not exposed in Social Settings.

## Rationale

1. **DHT capability topics** are small, TTL’d, signed hints — distinct from rich EMP payloads. They solve “who might care about topic X?” without conflating with `discovery.request` semantics (Phase 4F).
2. **Relay broadcast (8J)** reuses the operator fleet for NAT-friendly fanout without requiring global DHT write load for every owner.
3. **Contact fanout** preserves trust ordering and audit correlation for bonded workflows (library discover, morning report).
4. Gossipsub broad topics would add Sybil/noise surface area before abuse policy and operator presets are fleet-wide.

## Settings mapping

| Setting | Substrate used |
|---------|----------------|
| `discoveryProfile: wan-default` | Bootstrap + DHT client + relay transport + DCUtR |
| Anonymous discovery mode (8I) | Relay broadcast for allowlisted intents |
| Search → **By Topic (DHT)** | `findCapabilityTopicProviders` → optional bonded `discovery.request` follow-up |
| Search → **Published files** | Bond-ordered `discovery.request` (contact fanout) |

## Consequences

- Social Search **By Topic** and CLI `discover-topic` are the product surface for global DHT hints.
- Operators must keep bootstrap/relay healthy (Phase 15B) for WAN DHT queries to return providers.
- Future gossipsub experiments require a new ADR + explicit Settings toggle.

## References

- [p2p-discovery.md](./p2p-discovery.md) — capability topic API
- [implementation-plan.md](./implementation-plan.md) — Phase 4F, 8J, 15A
- [live-connectivity-testing.md](./live-connectivity-testing.md) — WAN proof procedures
