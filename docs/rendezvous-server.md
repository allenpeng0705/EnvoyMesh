# EnvoyMesh Rendezvous Server

## Overview

A lightweight capability registry that enables peer discovery based on offered capabilities. Designed for **simplicity and scalability** — no LLM, no complex logic, just fast storage and pattern matching.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    RELAY NODE (Rendezvous)                      │
│                                                                │
│  - No LLM                                                      │
│  - Stores structured capability data                             │
│  - Indexes by tag and type                                      │
│  - Pattern matches queries                                      │
│  - Returns match results                                        │
│  - Pure performance                                            │
└────────────────────────────────────────────────────────────────┘
                              ▲
                    structured data
                    query/response
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    NORMAL NODE                                  │
│                                                                │
│  - Preset capabilities (no LLM for v1)                        │
│  - Simple query formulation via UI presets                     │
│  - Direct peer connection on match                            │
└────────────────────────────────────────────────────────────────┘
```

**Note**: LLM integration is planned for future versions. For v1, normal nodes use preset capability templates for testing and manual capability selection.

---

## Capability Model

### Hybrid Format (Supported)

```typescript
// Simple tag
{ tag: "translation" }

// Structured capability
{ type: "translation", params: { from: "en", to: "zh" } }

// LLM descriptor (for future semantic matching)
{ descriptor: "I can translate English to Chinese with 90% accuracy" }
```

### Capability Types

| Type | Example | Params |
|------|---------|--------|
| **service** | `"document-search"` | `{scope: "finance"}` |
| **language** | `"lang:en"` | - |
| **translation** | `"translation"` | `{from: "en", to: "zh"}` |
| **resource** | `"vault-access"` | `{category: "finance"}` |
| **expertise** | `"coding-help"` | `{languages: ["python", "javascript"]}` |

### Registration Payload

```json
{
  "intent": "rendezvous.register",
  "payload": {
    "peerId": "QmX...",
    "multiaddr": "/ip4/1.2.3.4/tcp/4001/p2p/QmX...",
    "capabilities": [
      { "tag": "coding-help" },
      { "type": "translation", "params": { "from": "en", "to": "zh" } }
    ],
    "ttlSeconds": 3600
  }
}
```

---

## Query Model

### Query Payload

```json
{
  "intent": "rendezvous.query",
  "payload": {
    "match": {
      "type": "translation",
      "params": { "from": "en" }
    },
    "maxResults": 10
  }
}
```

### Matching Rules

| Query | Matches |
|-------|---------|
| `{type: "translation"}` | Any entry with capability type "translation" |
| `{type: "translation", params: {from: "en"}}` | Any "translation" capability where `params.from === "en"` |
| `{type: "translation", params: {from: "en", to: "zh"}}` | Exact match on all specified params |
| `{tag: "coding-help"}` | Any entry with simple tag "coding-help" |

**Param Matching Logic**:
- If query specifies a param, capability must have same param value
- If query omits a param, capability matches (wildcard)
- Example: Query `{type: "translation", params: {from: "en"}}` matches:
  - `{type: "translation", params: {from: "en", to: "zh"}}` ✓
  - `{type: "translation", params: {from: "en", to: "fr"}}` ✓
  - `{type: "translation", params: {from: "zh", to: "en"}}` ✗

### Query Response

```json
{
  "intent": "rendezvous.response",
  "payload": {
    "matches": [
      {
        "peerId": "QmX...",
        "multiaddr": "/ip4/1.2.3.4/tcp/4001/p2p/QmX...",
        "capabilities": [
          { "type": "translation", "params": { "from": "en", "to": "zh" } }
        ]
      }
    ]
  }
}
```

---

## Data Model

### Registry Entry

```typescript
interface RegistryEntry {
  peerId: string;
  multiaddr: string;
  capabilities: Capability[];
  registeredAt: Date;
  ttlSeconds: number;
  expiresAt: Date;
}

interface Capability =
  | { tag: string }
  | { type: string; params: Record<string, any>; confidence?: number }
  | { descriptor: string };
```

### In-Memory Index

```
tagIndex: Map<string, Set<peerId>>
  └── "translation" → {peer1, peer2, peer3}

typeIndex: Map<string, Set<peerId>>
  └── "translation" → {peer1, peer2}

fullIndex: Map<peerId, RegistryEntry>
  └── peer1 → {capabilities: [...], ttlSeconds: 3600, ...}
```

### Operations

| Operation | Complexity |
|-----------|------------|
| Register | O(1) insert + index updates |
| Query by tag | O(1) lookup in tagIndex |
| Query by type | O(k) lookup in typeIndex, then filter by params |
| Expire (TTL) | Lazy cleanup on query or background sweep |

---

## Protocol Flow

### Registration

```
1. Normal Node → Relay: Register(peerId, multiaddr, capabilities, ttlSeconds)
2. Relay: Validate payload, store entry, update indexes
3. Relay → Normal Node: OK
```

### Query

```
1. Normal Node → Relay: Query(match, maxResults)
2. Relay: Match against index, collect results
3. Relay → Normal Node: Response(matches[])
4. Normal Node: Evaluates matches (via LLM)
5. Normal Node: Connects directly to matched peer
```

### TTL Expiration

```
- Entry expires after ttlSeconds
- On query: remove expired entries lazily
- Or: background sweeper removes expired entries periodically
```

---

## Scaling

### Regional Relay Nodes

```
┌─────────────────────────────────────────────────────────────┐
│                  REGIONAL RELAY                             │
│  - US-East / EU-Central / Asia-Pacific                      │
│  - Independent registries                                   │
│  - Cross-region federation optional                        │
└─────────────────────────────────────────────────────────────┘
```

### Scaling Strategy

| Layer | Mechanism |
|-------|-----------|
| **Registry** | Regional isolation, independent registries |
| **Connections** | Multi-relay failover (existing relay infrastructure) |
| **TTL** | Soft state, auto-expiration, no explicit cleanup |

---

## Roadmap (Future Options)

### Option B: Scored/Ranked Results
- Score matches based on relevance
- Return ranked results instead of flat list
- **Complexity**: Requires scoring algorithm

### Option B: Compound Queries (AND/OR/NOT)
- `match: {op: "AND", conditions: [...]}`
- `match: {op: "OR", conditions: [...]}`
- `match: {op: "NOT", condition: {...}}`
- **Complexity**: Query parser, execution planner

### Option B: Relay-Facilitated Connection
- Relay helps establish connection via hole-punching
- Direct connection upgrade assistance
- **Complexity**: Requires additional protocol for connection handoff

### Option B: Explicit Unregister
- `rendezvous.unregister(peerId)` message
- Immediate removal from registry
- **Complexity**: Additional message type, but cleaner state management

### Option B: Semantic Matching
- Use descriptor field for LLM-based matching
- Relay stores descriptor, LLM evaluates similarity
- **Complexity**: Requires LLM integration (not on relay node)

---

## Security Considerations

| Aspect | Approach |
|--------|----------|
| **Registration** | Open (any peer can register) |
| **Query** | Open (any peer can query) |
| **Capability Auth** | Not validated by relay (relies on trust + direct verification) |
| **Rate Limiting** | Per-connection rate limits to prevent abuse |

---

## Implementation Priority

1. **Phase 1 (MVP)**
   - Simple tag-based registration
   - Tag index for fast lookup
   - TTL-based expiration
   - Basic query by tag or type

2. **Phase 2 (Enhancement)**
   - Structured capability support
   - Parameter-based filtering
   - Result limits and pagination

3. **Phase 3 (Advanced)**
   - Federation between regional relay nodes
   - Cross-relay queries
   - Semantic matching via descriptor field

---

## Preset Capabilities & Query Templates (v1 Testing)

For testing without LLM, the following preset capabilities and query templates are recommended:

### Preset Capability Templates

```typescript
const PRESET_CAPABILITIES = {
  services: [
    { tag: "document-search", label: "Document Search", params: {} },
    { tag: "coding-help", label: "Coding Help", params: {} },
    { tag: "translation", label: "Translation", params: {} },
    { tag: "data-analysis", label: "Data Analysis", params: {} },
  ],
  languages: [
    { tag: "lang:en", label: "English", params: {} },
    { tag: "lang:zh", label: "Chinese", params: {} },
    { tag: "lang:es", label: "Spanish", params: {} },
    { tag: "lang:fr", label: "French", params: {} },
  ],
  expertise: [
    { tag: "expertise:python", label: "Python", params: {} },
    { tag: "expertise:javascript", label: "JavaScript", params: {} },
    { tag: "expertise:typescript", label: "TypeScript", params: {} },
    { tag: "expertise:rust", label: "Rust", params: {} },
  ],
  resources: [
    { tag: "vault-access:finance", label: "Finance Vault", params: {} },
    { tag: "vault-access:legal", label: "Legal Vault", params: {} },
    { tag: "compute-gpu", label: "GPU Compute", params: {} },
  ],
};
```

### Preset Query Templates

```typescript
const PRESET_QUERIES = {
  "translation-en-zh": {
    match: { type: "translation", params: { from: "en", to: "zh" } },
    label: "English → Chinese Translation",
  },
  "coding-python": {
    match: { type: "expertise", params: { language: "python" } },
    label: "Python Developer",
  },
  "document-search": {
    match: { tag: "document-search" },
    label: "Document Search Service",
  },
  "all-coders": {
    match: { tag: "coding-help" },
    label: "Any Coding Help",
  },
};
```

### UI Recommendations

| Screen | Feature |
|--------|---------|
| **Profile/Capabilities** | Checkbox/toggle list for preset capabilities |
| **Search** | Dropdown or chip selector for preset queries |
| **Results** | Display matched capabilities with peer info |

---

## Open Questions

| Question | Status |
|----------|--------|
| Max entries per relay? | No limit (memory-dependent) |
| Max results per query? | Configurable, default 10 |
| Relay discovery (how nodes find relay)? | Use existing relay bootstrap mechanism |
| Authentication required? | No (open model for v1) |

---

## Related Documentation

- [Network Model](./network-model.md) — Relay node architecture
- [P2P Discovery](./p2p-discovery.md) — DHT-based discovery for interests
- [Protocol Standard](./protocol-standard.md) — EMP message format
