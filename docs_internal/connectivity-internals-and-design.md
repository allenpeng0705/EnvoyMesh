# EnvoyMesh Connectivity Internals & Efficiency Design

> **Status:** Investigation + design (2026-08-06). No code changes yet — this
> document exists to align on *how libp2p + DHT actually behave*, *what the home
> node is always doing*, and *what we should change* before any implementation.
>
> **Audience:** maintainers who want to understand why a home node "feels like
> it's always connecting" and what we can do about it.
>
> **Scope:** the home node (NodeService / Tauri desktop) connectivity stack.
> Relay-server-side tuning is mentioned where relevant but is not the focus.

---

## Part I — Investigation

### 1. The "always connecting" symptom

Allen's home-node log (CGNAT, `wan-default` profile) shows the concrete shape of
the problem:

```
uptime=30s   totalPeers=106 dialQueue=453  pruned 55
uptime=60s   totalPeers=77  dialQueue=99   pruned 45
uptime=90s   totalPeers=53  dialQueue=26   pruned 24
uptime=120s  totalPeers=71  dialQueue=70   pruned 39
... (repeats every 30s for the entire session)
```

Peer counts bounce 50→100, the dial queue hits **453 pending dials**, and the
node prunes 15–55 peers every 30 seconds — only for the pool to refill. Meanwhile
every DHT self-advertise and capability-topic publish times out:

```
[p2p] provideSelf: DHT routing table: 0 buckets, 0 peers
[p2p] provideSelf: broadcast put timed out after 15s — DHT likely has no reachable peers.
[node-service] advertiseTopic "interest:music" TIMED OUT — DHT likely has no reachable peers.
```

So the node pays ~100 connections of churn per cycle and gets **zero** discovery
benefit. This document explains exactly why, and what to do about it.

> **Nuance (added in review):** Allen's session is the *worst case* — a CGNAT'd
> node whose DHT routing table never fills. On a node with working IPv4 / no
> CGNAT, the DHT *does* warm up: `provideSelf` succeeds, capability topics
> propagate, and the swarm churn is the price of working public-DHT discovery.
> The cost-benefit analysis (Part V) and the `quietWan` design (Solution A1)
> are aimed at the CGNAT / constrained-network case where the DHT churn is pure
> waste. On a healthy open-network node, today's `optimized` preset may be fine.
> Part V separates "startup cost" (always paid) from "steady-state churn" (the
> real problem for CGNAT nodes).

### 2. What libp2p is (mental model)

libp2p is a **networking stack**, not one thing. A node runs several libp2p
**services** simultaneously, each doing different work. From
`packages/network/src/index.ts:642-663`, when "advanced connectivity" is on
(which it is whenever DHT or relay is enabled), the home node runs:

| Service | What it does | Creates connections? |
|---|---|---|
| **bootstrap** | Dials a fixed list of seed peers on startup + periodically | **Yes — a major source** |
| **kad-dht** (KadDHT) | Distributed hash table — `FIND_NODE` fills routing table; `PUT`/`GET` provider records | **Yes — walks the DHT, dialing each hop** |
| **mdns** | LAN peer discovery via UDP multicast | Yes, LAN only |
| **identify** / **identifyPush** | Exchanges listen addrs + protocols on every new connection | No (piggybacks) |
| **circuit-relay transport** | Dials through relay hops to reach NAT'd peers | Yes, to relays |
| **autoNAT** | Asks peers "am I publicly reachable?" | A few probe connections |
| **ping** | Liveness pings on existing connections | No (uses existing) |

**There is no pubsub** (no gossipsub). EnvoyMesh's "broadcast" is DHT provider
records + relay roster, not pubsub topics.

### 3. The key insight: *libp2p itself* dials the anonymous swarm

This is the most important thing to internalize. The 100+ peers are **not**
EnvoyMesh dialing them — it is libp2p's own machinery. The chain:

```
1. bootstrap service dials the bootstrap list on startup
   (default presets expand to ~10-11 peers: 4 public-libp2p presets + cn-relay + us-relay)

2. kad-dht, to fill its routing table, runs FIND_NODE(q=myId)
   against those bootstrap peers. Each returns the K=20 closest peers
   IT knows. libp2p then DIALS those peers to query them too.
   This is the Kademlia "iterative walk" — it fans out.

3. Those dialed peers are the anonymous public IPFS DHT swarm
   (12D3KooW… strangers running IPFS/desktop nodes worldwide).

4. Connection manager caps at 48, but new dials keep arriving
   → dial queue fills (453!) → app-level pruning kicks in → churn.
```

The "always connecting" feeling is **KadDHT trying to maintain a healthy routing
table against the public IPFS DHT**, plus **bootstrap re-dialing**, plus
**EnvoyMesh's own cycles** layered on top. It is libp2p working as designed — but
it is expensive, and for a home node that mostly talks to a few bonded contacts,
it is largely unnecessary noise.

### 4. How Kademlia routing tables fill (and why it fails for Allen)

KadDHT organizes peers into a **k-bucket tree** keyed by XOR distance to your own
peer ID. Each bucket holds up to `K = 20` peers
(`node_modules/@libp2p/kad-dht/src/constants.ts:40`). The routing table starts
**empty**.

To fill it, libp2p runs **`querySelf`** on startup (`query-self.ts`): it issues
`FIND_NODE(myOwnPeerId)` to every bootstrap peer. Each bootstrap returns the
20 peers closest to your ID that *it* knows. You then dial each of those, ask
*them* `FIND_NODE(myId)`, and repeat — the **Kademlia iterative walk**. It fans
out: 1 bootstrap → 20 candidates → dial them → each returns 20 more → ... until
you converge on the true K closest peers to you.

This walk is **what opens dozens of connections to anonymous IPFS peers**. They
are not random — they are the peers the math says are closest to your ID in the
global keyspace.

libp2p refreshes this on a fixed cadence (`node_modules/@libp2p/kad-dht/src/constants.ts`):

```typescript
export const K = 20
export const QUERY_SELF_INTERVAL = 5 * minute
export const TABLE_REFRESH_INTERVAL = 5 * minute
```

So KadDHT refreshes its routing table **every 5 minutes unconditionally**, as
long as the DHT service is enabled — independent of any EnvoyMesh code.

#### Client mode vs server mode

```typescript
// kad-dht.ts:469
await this.setMode(this.clientMode ? 'client' : 'server', { force: true })
// kad-dht.ts:444-449 — client mode does NOT register the RPC handler
if (mode === 'client') {
  this.clientMode = true          // → does NOT call registrar.handle(protocol)
} else {
  await this.components.registrar.handle(this.protocol, ...)  // answers FIND_NODE/PUT/GET
}
```

EnvoyMesh sets `dhtClientMode: true` (`apps/node/src/node-service-start.ts:290`).
**Client mode means: you can *issue* DHT queries (FIND_NODE, PUT, GET), but you
do not *answer* them.** Other peers will not store your peer record the way they
would for a server. You are a consumer of the DHT, not a participant in routing.

This is correct for a home node behind NAT (you cannot accept inbound DHT queries
anyway). But it has a consequence: **your routing table fills more slowly**
because other nodes do not proactively tell *you* about new peers — you only
learn by walking outward yourself.

#### Why Allen's provideSelf / capability advertise times out

Allen's log shows `0 buckets, 0 peers` every cycle — the routing table never
fills. The walk needs at least one reachable DHT-server bootstrap peer to start,
and the chain breaks:

- `cn-relay` is reachable, but it is an EnvoyMesh relay, **not an IPFS DHT
  server** → it returns nothing useful for `FIND_NODE`.
- `public-libp2p` bootstraps (`QmNnooDu7…`, `QmQCU2Ec…`) *do* run the DHT, but
  Allen's node is behind CGNAT; IPv6 is blocked (`EHOSTUNREACH`), IPv4 reach is
  flaky.

So the only source of routing peers is the public-libp2p DHT nodes, and reaching
them is unreliable behind CGNAT. Result: routing table stays empty →
`provideSelf` (a DHT `PUT`) has nowhere to PUT to → times out. The
capability-topic advertising times out for the same reason. **The node keeps
trying to maintain a DHT it cannot actually participate in, paying the
connection churn cost, while getting zero discovery benefit.**

> **Note — home node vs CLI:** `provideSelf()` is called **only in the CLI path**
> (`apps/node/src/index.ts:2927`). The home node (NodeService) never calls
> `provideSelf` directly — its only DHT write path is `provideCapabilityTopic`
> via the capability-discovery cycle. The CLI also runs three one-shot
> `provideSelf` attempts at 30/60/90s after startup.

### 5. Circuit relay & AutoRelay

#### How `/p2p-circuit` works

Circuit relay v2 lets peer A reach peer B through relay R, when B is behind NAT:

```
A dials: /ip4/<R-ip>/tcp/<R-port>/p2p/<R-id>/p2p-circuit/p2p/<B-id>
          └────────── reach R ──────────┘└── hop ──┘└── to B ──┘

R receives the dial, opens a "hop" stream to B (B must have a RESERVATION on R),
and proxies bytes between A and B.
```

**The reservation is the critical precondition.** B must hold a live RESERVE
slot on R, or R refuses the hop with `NO_RESERVATION`. That is the exact error
behind the Windows↔Allen auto-bonding failure (separate fix already applied).

#### AutoRelay vs configured relays

There are two ways a node decides which relays to reserve on:

- **Open AutoRelay hunt** — listen on bare `/p2p-circuit` (no relay specified).
  libp2p listens for any peer advertising the HOP protocol and tries to reserve
  on whatever it finds. This is how IPFS desktop nodes find relays. EnvoyMesh
  **deliberately suppresses this** via `createPreferredRelayDiscoveryFilter`
  (`packages/network/src/index.ts:43-63`) — when `preferredRelayPeerIds` is
  non-empty, any HOP peer not in that allowlist is blocked from AutoRelay
  discovery.

- **Configured relays** (what EnvoyMesh does) — listen on
  `/ip4/<relay>/p2p/<relay-id>/p2p-circuit`. This pins the relay. The trade-off:
  **if the configured relay is down, you have zero relay path** — there is no
  fallback to public relays.

#### Why reservations collapse

The reservation lifecycle in libp2p (`reservation-store.ts`): on successful
RESERVE, the relay returns an `expire` timestamp (default 2 min). libp2p sets a
`setTimeout` to refresh ~30s before expiry. **The refresh only succeeds if the
connection to the relay is still open.** If the underlying TCP drops and the
reservation store's `hasReservation` flag lags behind the real connection state,
the health loop trusts the stale flag and never re-warms. (This was fixed in the
prior session: the health loop now cross-checks `getConnectedPeerIds()`.)

### 6. Connection-gater vs pruning

libp2p exposes a `connectionGater` with hooks that fire **before** a dial happens
(`node_modules/@libp2p/interface/src/connection-gater.ts:14`):

```typescript
denyDialPeer?(peerId): boolean          // before dialing a peer
denyDialMultiaddr?(multiaddr): boolean  // before dialing an address
```

**EnvoyMesh passes NO connection gater** (`packages/network/src/index.ts:593-664`
— no `connectionGater` key). This means **libp2p dials whoever the DHT/bootstrap
tell it to, with no filtering.** Anonymous IPFS swarm peers get dialed freely,
fill the connection pool, and only *then* does EnvoyMesh notice and prune them
post-hoc via `pruneExcessSwarmConnections` (`index.ts:2722`).

The treadmill:

```
DHT/bootstrap says "dial these 20 peers" → libp2p dials all 20 (no gater)
  → pool hits 48 cap → dial queue fills (453!)
  → 30s later node-stats sees peers>32 → prune closes 15-20
  → DHT routing refresh fires → "I need those peers back" → re-dial
  → repeat forever
```

**The alternative — a connection gater** — would let us say "deny dial for any
peer not in my bonded-contacts set + relay set" *before* the dial happens. The
dial queue would never fill, the pool would stay small, and there would be no
churn. The trade-off: it cuts the node off from the public DHT entirely.

### 7. What the DHT is actually *for* in EnvoyMesh (verified)

Two purposes in the design:

**a) Self-advertisement (`provideSelf`)** — publish your peer record so others
can `findPeer(you)` by peer ID. This is how a stranger resolves "where is Allen's
node on the internet."

**b) Capability/interest discovery** — publish provider records for topics like
`interest:tech`, `coding-help`, `geo:country:CN`, `username:shileipeng`. A peer
searching for "who can help with coding?" does `findProviders(coding-help)`.

#### Verified call-site audit (what actually uses the DHT today)

I traced every `findPeer`, `findProviders`, `provideSelf`, and
`provideCapabilityTopic` call site in the codebase. Findings:

**`findPeer` (DHT peer routing) — exactly ONE call site:**

| File:line | Context | When | Fallback if DHT empty? |
|---|---|---|---|
| `apps/node/src/node-service-discovery.ts:465` | `searchByPeerId` — manual search by peer ID | **Manual** (Discover UI: "search by peer ID") | **Yes** — direct dial (`mesh.dial`) at line 479, then relay.lookup at line 501 |

**`findProviders` (DHT content routing) — one impl, called by `searchByTopic`:**

| File:line | Context | When | Fallback if DHT empty? |
|---|---|---|---|
| `node-service-discovery.ts:572` (`findCapabilityTopicProviders`) | `searchByTopic` | **Triggered only** on `optimized`/`smart`/`aggressive` (default presets). The `normal` preset still runs it periodically every 90s — a legacy path that **violates the discovery principle** (see Solution B2) and should be removed. | **Yes** — relay.lookup union at line 624 runs *regardless* of DHT result; comment at 619: "Union DHT ∪ relay roster (not only when DHT is empty)" |

**`provideSelf` (DHT write) — CLI only, NOT home node:**

| File:line | Context | When |
|---|---|---|
| `apps/node/src/index.ts:2927` | CLI `provideSelf()` burst | CLI startup only (3 one-shots at 30/60/90s) |

The home node (NodeService) **never calls `provideSelf`**. Its only DHT write is
`provideCapabilityTopic` via the capability-discovery cycle.

**`provideCapabilityTopic` (DHT write) — home node periodic:**

| File:line | Context | When | Redundant with relay? |
|---|---|---|---|
| `node-service-capability-discovery.ts:165` (`runCapabilityDiscoveryCycleViaRuntime`) | advertise all profile/interest/geo/publish topics | Periodic: 90s (normal) / 120s (opt) / 180s (smart) / 300s (aggr) | **Yes** — `mergeAdvertisedDiscoveryTopics` at line 137 mirrors the same topics into `relay.checkin`, so the relay roster carries them independently of the DHT |

#### What this means: disabling the public DHT breaks almost nothing

The decisive finding is in `node-service-discovery.ts:619-637`:

```typescript
// Union DHT ∪ relay roster (not only when DHT is empty) so NAT-only
// peers that checked in at the relay still appear alongside DHT hits.
let relayResults: PeerSearchResult[] = [];
if (this.deps.queryRelayLookupByTopic) {
  const cid = await cidForCapabilityTopic(topic);
  const budgetMs = dhtResults.length === 0 ? RELAY_TOPIC_UNION_EMPTY_DHT_MS : RELAY_TOPIC_UNION_WITH_DHT_MS;
  relayResults = await withTimeoutFallback(
    this.deps.queryRelayLookupByTopic({ topic, topicHash: cid.toString(), maxResults }),
    budgetMs, [],
  );
}
```

The relay roster lookup runs **regardless** of whether the DHT returned hits.
NAT-only peers (the common case for home nodes behind CGNAT) appear via relay
even when the DHT finds nothing.

| User-facing feature | Uses DHT? | What happens if DHT disabled? |
|---|---|---|
| **Bonding** (bond.request/accept) | No — uses bundled dial hints + relay.lookup | **Unaffected** |
| **Chat / message delivery** | No — dials known addresses from peer directory / relay circuit | **Unaffected** |
| **Team jobs / chain** (find workers) | No — uses `AgentNetworkMembershipIndex` from bonded contacts' agent cards | **Unaffected** |
| **Profile sync** | No — delivered over established bond connection | **Unaffected** |
| **Discover/Search by topic** | Yes (DHT findProviders) **+ relay.lookup union** | **Still works** — relay roster returns the same peers; loses only peers exclusively on the public DHT (rare for bonded mesh) |
| **Discover/Search by peer ID** | Yes (DHT findPeer) **+ direct dial + relay.lookup fallback** | **Still works** — direct dial + relay.lookup find the peer |
| **Auto-bonding (sponsor friend)** | Indirectly (searchPeers) but has relay.lookup + bundled-hints fallback | **Unaffected** (already fixed in prior session) |

**Conclusion:** For a home node whose real discovery surface is "bonded contacts
+ relay roster," the public DHT is doing a lot of work for nothing. No core
feature hard-depends on it; every path has a relay-roster or direct-dial
fallback. The `aggressive` preset already recognizes this
(`forceDisableDht: true`), but it also forces `mdnsPolicy: lan-only`, which
breaks WAN.

### 8. The full home-node timer inventory

All verified from `apps/node/src/node-service-start.ts` and the cycle files.
These are what the home node is "always doing":

| Timer | Default interval (optimized preset) | What it does | Gated |
|---|---|---|---|
| **relay-client-cycle** (`[relay-client]`) | 45s | `relay.checkin` + `relay.lookup` to relays | `relayEnabled` |
| **capability-discovery** (`[node-service]`) | 120s + 0-20s jitter | `provideCapabilityTopic` for interests; mirrors to relay.checkin | `enableDht` |
| **relay reservation health** (`[p2p] relay reservation health`) | adaptive 5min/45s/15s | re-dial + re-reserve relays when slots drop | relay addrs non-empty |
| **node-stats logging** (`[node-stats]`) | 30s | log peer/conn/memory + trigger pruning | always |
| **connection pruning** (`pruned N peers`) | piggybacks 30s node-stats | close anonymous swarm peers when pool>32 or queue>20 | threshold-gated |
| **bond-warm** (`[bond-warm]`) | 5min | re-establish bonded contacts | always; cap 64 conns |
| **discovery advertise retry** | 5min healthy / 60s→5min backoff | re-advertise topics on failure | until all succeed |
| **mDNS browse** | 45s (optimized) | LAN discovery | `enableMdns` |
| **libp2p KadDHT refresh** (internal) | **5min, unconditional** | FIND_NODE to refill routing table → dials swarm | `enableDht` |
| **libp2p querySelf** (internal) | **5min** | find K closest peers to self | `enableDht` |
| **libp2p connection-monitor ping** | 90s (optimized) | half-open detection | always |

Plus libp2p's own bootstrap re-dial (internal, default interval). The combination
of KadDHT refresh + bootstrap re-dial + EnvoyMesh's cycles is what produces the
"always connecting" feeling.

### 9. Connectivity presets — what each trades off

From `packages/api/src/connectivity-tuning.ts:111-175`:

| Knob | normal | **optimized** (default) | smart | aggressive |
|---|---|---|---|---|
| maxConnections | 48 | 48 | 40 | 32 |
| mdnsInterval | 10s | 45s | 60s | 120s |
| capabilityDiscovery | 90s | 120s | 180s | 300s |
| lazyCapabilityDiscovery | off | **on** | on | on |
| idleTimerStretch | off | **on** (×4 when idle) | on | on |
| connMonitor ping | 45s | 90s | 120s | 180s |
| bondWarm | 5min | 5min | 10min | 15min |
| bondWarmEventDriven | off | off | **on** | on |
| relayCycle | 30s | 45s | 60s | 90s |
| forceDisableDht | off | off | off | **on** |
| mdnsPolicy | on | on | on | **lan-only** |

Design intent:
- **normal** = "poll fast, ignore battery/CPU." Most chatty.
- **optimized** (default) = "stretch timers when idle, be lazy about discovery, keep DHT + WAN."
- **smart** = "stop polling already-connected contacts; longer intervals; event-driven bond warming."
- **aggressive** = "constrained network: kill DHT entirely, LAN-only discovery." The closest to a "quiet node" today — `forceDisableDht: true` removes the DHT service entirely, killing swarm churn at the source. **But it also forces `mdnsPolicy: lan-only`, which breaks WAN.**

**The gap:** there is no preset that says "keep relay + WAN, kill the public DHT
swarm, rely on the relay roster for discovery." That is exactly what a home node
behind CGNAT wants.

---

## Part II — Design

The investigation points to three problems and a missing operating mode. The
solutions below are ordered by impact. Each is independently shippable.

### Problem A — Public DHT churn for zero benefit

A CGNAT'd home node cannot run a useful DHT (routing table stays empty,
`provideSelf`/advertise time out every cycle), yet it pays ~100 connections of
churn maintaining one.

### Solution A1 — Add a `quiet-wan` connectivity preset (highest impact)

A new preset that keeps WAN relay + WAN discovery, drops the public DHT swarm
entirely, and relies on the relay roster for discovery. This is what Allen's
node actually needs.

**Proposed preset** (add to `packages/api/src/connectivity-tuning.ts`):

```typescript
quietWan: {
  maxConnections: 24,                 // half of optimized — no swarm to fill
  mdnsIntervalMs: 60_000,             // 60s — LAN is secondary on this profile
  mdnsPolicy: "on",                   // keep LAN (NOT lan-only like aggressive)
  capabilityDiscoveryIntervalMs: 300_000, // 5min — topics also go via relay.checkin
  lazyCapabilityDiscovery: true,
  idleTimerStretch: true,
  connectionMonitorPingIntervalMs: 120_000,
  bondWarmIntervalMs: 5 * 60_000,
  bondWarmPerContactCooldownMs: 5 * 60_000,
  bondWarmEventDriven: true,
  relayCycleBaseMs: 60_000,           // 60s — primary discovery path now
  forceDisableDht: true,              // ← kill the public DHT entirely
  relayIdleStretchMaxMultiplier: 2,
}
```

The combination `forceDisableDht: true` + `mdnsPolicy: "on"` + relay kept on is
the key difference from `aggressive` (which is `lan-only`). Discovery flows
through: relay roster (primary, cross-NAT) + mDNS (LAN) + bonded contacts.

#### A1.1 — Bootstrap narrowing (must ship with A1)

`forceDisableDht: true` stops KadDHT refresh walks, but the **bootstrap service
still dials the configured bootstrap peers** and `identify` still runs on those
connections. To fully kill the public-libp2p swarm, `quietWan` must also narrow
bootstrap to EnvoyMesh relays only (drop the `public-libp2p`, `public-libp2p-am6`,
`public-libp2p-am7` presets; keep `cn-relay` and `us-relay`).

This is already supported by existing infrastructure:
- `DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS = ["cn-relay", "us-relay"]`
  (`packages/api/src/default-bootstrap.ts`)
- `normalizeBootstrapPresetsForContactsOnly()` strips public-libp2p
  presets and ensures community `cn-relay` + `us-relay` remain
- `discoveryProfile: "contacts-only" | "relay-only"` already maps to contacts-only
  bootstrap (`defaultBootstrapPresetsForDiscoveryProfile`, line 32)

**Implementation coupling:** `quietWan` is a *connectivity mode*
(`connectivity-tuning.ts`), while bootstrap narrowing is a *discovery profile*
(`default-bootstrap.ts`). These are separate axes today. Two options:

1. **Document the pairing** (lowest risk): `quietWan` mode +
   `discoveryProfile: contacts-only` is the intended combination. The Settings UI
   should offer them together as a bundle ("Quiet WAN — relay-only discovery").
2. **Auto-narrow bootstrap when `quietWan` is active** (cleaner, but couples the
   two axes): when `resolveConnectivityRuntime()` returns `forceDisableDht: true`
   via `quietWan`, also force `normalizeBootstrapPresetsForContactsOnly()` on the
   effective bootstrap list.

**Recommendation:** Start with option 1 (document + bundle in UI). It preserves
the two-axis flexibility and avoids surprising operators who set `quietWan` mode
but keep `wan-default` profile deliberately. Promote to option 2 only if the
bundle proves error-prone in practice.

**Discovery impact:** Per the §7 audit, no core feature breaks. Discover/Search
still works via relay-roster union. The only loss is peers who are *exclusively*
on the public DHT and not on any relay — rare for the bonded-mesh use case.

**Default change?** Do NOT make `quietWan` the global default. Ship it as a
selectable profile; on **definitive** CGNAT classification at startup (RFC 6598
range, or symmetric NAT + UPnP-private corroboration) auto-apply and persist
`quietWan` when the operator has not explicitly chosen a mode (default
`optimized` is eligible). Ambiguous signals only surface a Settings suggestion.
See Open Question #1 (resolved) and `cgnat-detection.ts`.

### Solution A2 — Connection gater to block anonymous dials (defense in depth)

Even with `forceDisableDht`, a node could still dial anonymous peers if some
other path (identify, a misconfigured bootstrap) introduces them. A connection
gater at the libp2p layer is the clean way to enforce "only dial peers I know."

**Proposed:** add an optional `connectionGater` to the `createLibp2p` call in
`packages/network/src/index.ts:593`:

```typescript
connectionGater: this.options.strictDialPolicy
  ? createStrictDialGater({
      allowPeerIds: () => [
        ...this.preferredRelayPeerIds,          // configured relays
        ...this.bondedContactPeerIds,           // trust-store contacts
        ...this.discoverySeedPeerIds,           // relay-roster / mDNS discovered
      ],
    })
  : undefined,
```

`denyDialPeer(peerId)` returns `true` (block) for any peer not in the allow-set.
This stops the dial queue from ever filling with strangers.

**Trade-off:** This is stricter than A1 alone — it blocks *all* unknown-peer
dials, including a manual Discover search hit that hasn't been seeded into the
discovery store yet. So it must permit peers returned by `searchPeers` (which
already upserts into `discoverySeedStore`). The allow-set must be refreshed
whenever discovery adds candidates.

**Recommendation:** Ship A1 first (it solves the root cause cleanly). Add A2
later only if churn persists from non-DHT sources. A2 is the right long-term
design but has more edge cases to validate.

### Problem B — Advertise retries are wasteful on an empty routing table

When the DHT routing table is empty (0 peers), every `provideCapabilityTopic`
call independently times out after 15s. With ~15 topics, that is ~15 × 15s = up
to 225s of wasted DHT walks per cycle — all failing for the same reason.

The retry logic (`apps/node/src/node-service-identity.ts:100-103`) retries every
60s on failure, capped at 5min. So a node with a permanently-empty routing table
retries the full topic set forever.

### Solution B1 — Early-exit the advertise cycle when the routing table is empty

Before iterating topics, check the routing table size. If it is 0 (or below a
small threshold), skip the entire provide pass for this cycle and emit a single
audit log line instead of N timeouts.

**Proposed change** in `runCapabilityDiscoveryCycleViaRuntime`
(`node-service-capability-discovery.ts`), before the topic loop:

```typescript
// Bail fast when the DHT can't route — every provide will time out
// independently, wasting ~15s × N topics. The relay.checkin mirror
// (mergeAdvertisedDiscoveryTopics below) already carries these topics
// cross-NAT, so skipping the DHT provide loses nothing.
if (connectivityRuntime.enableDht) {
  const tableSize = mesh.getRoutingTableSize?.() ?? -1;
  if (tableSize === 0) {
    console.log("[node-service] capability discovery: DHT routing table empty — skipping DHT provide (relay.checkin mirror carries topics)");
    ctx.mergeAdvertisedDiscoveryTopics?.(finalTopics); // still mirror to relay
    return;
  }
}
```

This requires exposing a `getRoutingTableSize()` helper on `EnvoyMesh` (a small
addition to `packages/network/src/index.ts` that reads `dht.routingTable`
bucket sizes — the introspection code already exists in `provideSelf` at line
2024-2037, just factored out).

**Impact:** Eliminates the startup-timeout burst (~11 topics × 30s = up to 330s
of wasted DHT walks during the cold-start window). Once the DHT routing table
fills, this guard stops firing — so the steady-state saving is zero. See Part V
for the measured numbers behind this corrected scope.

> **Correction from initial draft:** an earlier version of this section claimed
> "~225s/cycle of wasted DHT walks" recurring every cycle. That overstated the
> impact. Measurement of Allen's 55-minute session shows only **11 early
> timeouts** during DHT bootstrap, followed by **184 successful advertises**
> across 13 cycles once the DHT warmed. B1 is a **cold-start optimization**,
> not a steady-state one. The real recurring waste is the connection churn
> (Solution A1's territory) — see Part V.

### Solution B2 — Discovery is always *triggered*, never free-running

A core product principle emerged during review: **discovery should only ever run
when a human or an AI agent (acting on a human's behalf) explicitly triggers it**
— a manual search in Discover, an agent calling `searchPeers` for a task, a bond
flow resolving a sponsor. It should **never** run on a free-running "every N
minutes" timer.

This matches how the product actually wants to work today and how it will extend
later (e.g. an AI agent proactively discovering peers for a Team job is still
*agent-triggered*, tied to a task — not a background poll).

#### Current state vs the principle

| Path | Today | Principle | Action |
|---|---|---|---|
| **Advertise** (provide topics) | Periodic: 90-300s depending on preset | Re-publish on a slow cadence (TTL refresh) + on change | B1 + B2 below |
| **Discover** (`findProviders`) on `optimized`/`smart`/`aggressive` | **Already OFF** (`lazyCapabilityDiscovery=true`) | Triggered only | ✅ already correct |
| **Discover** (`findProviders`) on `normal` preset | **Periodic every 90s** (`lazyCapabilityDiscovery=false`) | Triggered only | **Remove the periodic path** — make `normal` lazy too, or drop the `runFind` periodic branch entirely |
| **`searchPeers`** (Discover UI, agent tools, bond flow) | Triggered | Triggered only | ✅ already correct |

The `normal` preset is the one outlier: it runs `findProviders` automatically
every 90s. Since `normal` is **not the default** (`DEFAULT_CONNECTIVITY_MODE =
"optimized"`), few users hit this today — but it is the only path that violates
the principle, and it should be removed.

#### Proposed changes

1. **Remove the periodic `runFind` branch.** In
   `node-service-capability-discovery.ts:129-133` and `apps/node/src/index.ts:4450-4456`,
   drop the `shouldRunPeriodicCapabilityFind` path so `runFind` is only `true`
   when the caller explicitly passes it (manual search / on-demand). The
   `shouldRunPeriodicCapabilityFind` function and its `lazyCapabilityDiscovery`
   gate become dead code and can be removed.

2. **Make advertise event-driven + slow re-publish.** Today advertise
   (provide) runs every 90-300s regardless of whether topics changed. Change it
   to: (a) re-run immediately when the topic set *changes* (profile edit, new
   interest, new publish tag), and (b) re-publish on a slow safety cadence
   (e.g. 30 min) only for DHT TTL refresh — and only if the routing table is
   non-empty (B1 already guards this). On `quietWan` (DHT disabled), advertise
   is purely event-driven into the relay.checkin mirror; no timer at all.

3. **Keep `searchPeers` triggered.** No change — it already runs only when the
   Discover UI, an agent tool, or a bond flow calls it.

This is lower priority than B1 (B1 alone removes most of the waste) but is the
right structural fix and codifies the principle.

### Problem C — Prune churn treadmill

Even with the DHT disabled (Solution A1), if some path still fills the pool
(e.g. mDNS on a busy LAN, or identify pushing peer-store entries), the
prune-at-32 / refill treadmill can still occur at a smaller scale.

### Solution C1 — Make pruning less aggressive and smarter

Today pruning triggers at `totalPeers > 32` OR `dialQueue > 20`
(`PRUNE_EXCESS_SWARM_MAX_PEERS = 32`, `PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD =
20`). On a node with no DHT, 32 is too low — it prunes legitimate LAN/discovered
peers.

**Proposed:** Tie the prune threshold to the connectivity preset (or the
`maxConnections` value) rather than a fixed constant. E.g. prune at
`maxConnections - 8`. With `quietWan` (maxConnections=24), prune at 16; with
`optimized` (48), prune at 40.

This is minor polish — do it last, only if A1 + B1 don't fully quiet the node.

---

## Part III — Phased rollout

| Phase | Solution | Effort | Impact | Risk | Relay-safe? |
|---|---|---|---|---|---|
| **1** | A1 — `quietWan` preset | Small (~30 lines in `connectivity-tuning.ts` + a selector) | **High** — kills public DHT churn for CGNAT nodes | Low — opt-in preset, no default change | ✅ relay ignores presets |
| **2** | B1 — advertise early-exit on empty routing table | Small (~20 lines + `getRoutingTableSize` helper) | **Medium** — cold-start polish (~330s saved once) | Low — relay mirror untouched | ✅ relay doesn't run the cycle |
| **3** | B2 — remove periodic `find`; make advertise event-driven | Small-medium (~remove `shouldRunPeriodicCapabilityFind` path; add on-change advertise trigger) | **Medium** — codifies discovery principle; prevents future regressions | Low — `normal` preset users lose background discovery (rare; not the default) | ✅ relay doesn't run capability-discovery |
| **4** | Validate A1+B1+B2 on real nodes (Allen's Mac, Windows 5G, LAN node) | Testing | Confirms no discovery regression | — | — |

#### Phase 4 success metrics (must hit these before promoting the default)

Validate against the baseline measurements in Part V. Targets after switching a
CGNAT node to `quietWan` + B1 + B2:

| Metric | Baseline (Allen's log) | Target after A1+B1+B2 | How to measure |
|---|---|---|---|
| Peak dial queue | 453 | **< 20** (only relay/bonded dials) | `grep "dialQueue=" node log \| max` |
| Prune cycles / hour | ~55 (51 in 55 min) | **0** (nothing to prune) | `grep -c "pruned" node log` per hour |
| Peak open connections | 106 | **< 20** (relays + bonded + LAN) | `grep "totalPeers=" node log \| max` |
| Steady-state memory RSS | ~1200 MB | **< 700 MB** | `grep "memoryRss=" node log` (steady window) |
| Cold-start advertise timeouts | 11 | **0** (B1 early-exits) | `grep -c "TIMED OUT" node log` in first 5 min |
| Discover by topic (relay only) | works (DHT ∪ relay) | **still works** (relay union) | Manual: Discover UI search a topic, confirm results |
| Bond over circuit (WAN) | broken before relay-fix; works after | **still works** | Manual: sponsor-friend auto-bond or invite bond from WAN node |
| Chat over circuit (WAN) | works | **still works** | Manual: send message from WAN node |

If any "still works" row regresses, the relay-roster fallback has a hole — fix
before promoting. If all green across Allen's Mac + Windows 5G + one LAN node,
consider making `quietWan` the suggested default for CGNAT-detected nodes
(Settings prompt, not silent auto-apply).

#### Residual cost that remains (not eliminated by A1/B1/B2)

Be honest that `quietWan` quiets the node, it does not silence it. These cycles
**stay and are correct to keep**:

| Cycle | Interval | Why it stays |
|---|---|---|
| **relay-client-cycle** (`relay.checkin` + `relay.lookup`) | 30-90s | Primary discovery path on `quietWan` — relay roster is how you find bonded peers cross-NAT. Cannot remove. |
| **bond-warm** | 5-15 min | Keeps bonded contacts reachable (connection freshness, path verification). Cannot remove without breaking chat send latency. |
| **mDNS browse** | 10-120s | LAN discovery — cheap, useful, and the only discovery path if no relay is configured. Stays. |
| **connection-monitor ping** | 45-180s | libp2p half-open detection. Without it, dead connections linger. Stays. |

So even on `quietWan`, the node still does background work — but it's ~4
intentional, bounded cycles instead of the ~100-peer swarm churn. That is the
goal: not "zero network activity" but "no anonymous-swarm churn."
| **5** | C1 — preset-driven prune threshold | Small | Minor polish | Low | ✅ relay doesn't prune |
| **6** | A2 — connection gater (optional, defense in depth) | Medium | Defense in depth | Medium (edge cases) | ⚠️ `strictDialPolicy` must default OFF; relay must never set it |
| **7** | **M1 — reservation health backoff on sustained relay-down** (Part VIII) | Small (~15 lines in health loop) | **Medium** — stops wasted retries on a dead relay; applies to all presets | Low | ✅ relay doesn't run the loop |
| **8** | **M2 — surface relay-down in UI** (Part VIII) | Small-medium (wire `lastReservationError` to dashboard) | **Medium** — operators see when WAN discovery is dead | Low | ✅ relay-side N/A |

**Recommended starting point:** Phase 1 + Phase 2 + Phase 3 together. They are
the highest-impact, lowest-risk changes, they directly address the "always
connecting" symptom, and together they codify the discovery principle
(triggered-only, never free-running). Validate on real nodes (Phase 4) before
considering a default change.

---

## Part IV — Confirmed design principles & open questions

### Confirmed principles (from review)

1. **Discovery is always triggered, never free-running.** Discovery (finding
   other peers) runs only when a human or an AI agent (acting on a human's
   behalf) explicitly triggers it — a manual Discover search, an agent calling
   `searchPeers` for a task, a bond flow resolving a sponsor. It never runs on a
   background timer. This is true today on the default presets and Solution B2
   removes the one legacy outlier (the `normal` preset's periodic find).

   *Future extension:* an AI agent proactively discovering peers for a Team job
   or on the owner's behalf is still **agent-triggered** (tied to a task or an
   explicit instruction) — not a background poll. The principle holds: there is
   always a trigger (human or agent), never a free-running "every 3 minutes"
   discovery loop.

2. **Advertise is change-driven + slow TTL refresh, not periodic.** Advertising
   one's own profile/interests runs when the topic set changes (profile edit,
   new interest, new publish tag) plus a slow re-publish for record TTL — not
   every 90-300s unconditionally.

### Open questions

1. **Should `quietWan` auto-activate on CGNAT detection?** ✅ **Resolved &
   implemented.** Startup runs `detectCgnatAtStartup` with definitive signals
   (RFC 6598 alone, or symmetric NAT + UPnP-private). When classification is
   `cgnat` and the operator has not locked a mode (`connectivityModeExplicit`),
   the node auto-applies **and persists** `quietWan` *before* lean bootstrap so
   public-libp2p presets are also stripped. Default `optimized` without the
   explicit flag is eligible; Settings mode changes set `connectivityModeExplicit:
   true`. Ambiguous results only suggest Quiet WAN in diagnostics. See
   `apps/node/src/cgnat-detection.ts` + `shouldAllowCgnatQuietWanAutoApply`.

2. **Should we fully deprecate the public DHT?** Given that every discovery path
   has a relay-roster fallback, the public DHT's only unique value is finding
   peers who are on the IPFS DHT but no EnvoyMesh relay. **Decision: do NOT
   deprecate yet** — keep it as an option for non-CGNAT nodes and future
   "discover strangers on the global mesh" experimentation. `quietWan` is an
   opt-in mode for constrained networks, not a deprecation of the DHT. Treat
   full deprecation as a separate product decision, deferred until we have data
   on how many users actually benefit from public-DHT discovery vs how much it
   costs.

3. **Relay-server capacity (operational, not blocking).** If more home nodes
   move to relay-roster-only discovery (`quietWan`), the cn-relay's rendezvous
   store sees more `relay.checkin` / `relay.lookup` traffic, and more reservation
   slots are consumed. Relays stay lean (no LLM, no home-node cycles), but
   rendezvous + circuit load grows. **This is the right reason to deploy more
   relays** — it complements A1, it is not a reason to reject it. Monitor
   `/reservations` utilization and roster size; the existing relay health
   endpoints surface this.

4. **`getRoutingTableSize()` accuracy — RESOLVED.** The installed
   `@libp2p/kad-dht` exposes a clean `RoutingTable.size` getter
   (`node_modules/@libp2p/kad-dht/src/routing-table/index.ts:485`,
   `return this.kb.count()`). The helper should use **`dht.routingTable.size`**
   directly — NOT the bucket-introspection loop the initial draft proposed (which
   the existing `provideSelf` at `index.ts:2024-2037` uses as a fallback). The
   `provideSelf` introspection code should also be simplified to use `.size`.

---

## Part V — Performance impact (measured)

To answer "how much do we actually gain?", I measured the real costs against
Allen's 55-minute CGNAT session log (uptime 30s → 3330s). The numbers below are
**empirical, not estimated**.

### Baseline: what the node actually spends today

| Resource | Measured (Allen's CGNAT node, 55 min) | Per-minute cost |
|---|---|---|
| **Prune cycles** | 51 cycles | ~1 prune/min |
| **Peers pruned (cumulative)** | ~1,100+ peers closed & re-dialed | ~20 peers/min churned |
| **Peak dial queue** | 453 pending dials | — |
| **Peak open connections** | 106 | — |
| **Steady-state connections** | 15–50 (bouncing) | — |
| **Peak memory RSS** | 1851 MB | — |
| **Steady-state memory RSS** | ~1200 MB | ~1.2 GB held by libp2p peer/conn state |
| **`provideCapabilityTopic` ops** | 195 total (15 topics × 13 cycles); 11 timed out, 184 succeeded | ~3.5 DHT provides/min |
| **`provideSelf` ops** (CLI path only) | 3 (all failed: 0 routing peers) | cold-start only |
| **libp2p KadDHT refresh** | every 5 min × 11 = 11 walks | each walk dials up to 20 new peers |

**The headline:** this node churned **~1,100 peer connections in 55 minutes** —
opening and closing strangers, over and over — while getting **zero discovery
benefit** (its routing table never filled usefully for cross-NAT peer discovery;
the relay roster did the actual work).

### Gain per solution

| Solution | What it eliminates | Measured / estimated gain | Confidence |
|---|---|---|---|
| **A1 — `quietWan` preset** (`forceDisableDht: true`) | KadDHT service entirely: no routing-table refresh walks, no bootstrap re-dial of public-libp2p swarm, no `provideCapabilityTopic` to the DHT | **~1,100 fewer peer connections churned per hour. Peak connections drop 106 → ~10-15 (relays + bonded contacts + LAN). Memory RSS drops ~1200 MB → ~400-600 MB (peer/conn state is the bulk of libp2p's heap). Dial queue never fills. Prune treadmill stops entirely.** | **High** — `aggressive` preset already proves `forceDisableDht` removes the swarm; `quietWan` just adds back WAN. |
| **B1 — advertise early-exit on empty routing table** | The startup timeout burst when the routing table is empty | **~330s of wasted DHT walks during cold start** (11 topics × 30s timeout). Steady-state gain: **~0** (once the DHT warms, advertises succeed). | **High** — directly measured. *(Initial draft overstated this as recurring; corrected.)* |
| **B2 — remove periodic find; event-driven advertise** | The `normal` preset's 90s periodic `findProviders`; advertise re-runs on change instead of every 90-300s | **Small for default users** (`optimized` already lazy). For `normal`-preset users: eliminates ~40 `findProviders` walks/hour. Advertise frequency drops from ~13 cycles/hour to ~1-2 (change-driven). | **Medium** — depends on how many users are on `normal` (not the default). |
| **C1 — preset-driven prune threshold** | Over-aggressive pruning on low-conn presets | Minor — fewer false prunes of legitimate LAN/discovered peers. | Low impact; polish. |
| **A2 — connection gater** (optional) | Any residual anonymous dials from non-DHT sources | Defense in depth; near-zero additional gain if A1 is in effect. | Low marginal gain post-A1. |

### Where the gains come from (why A1 dominates)

The overwhelming cost is **libp2p's KadDHT maintaining a routing table against
the public IPFS swarm**. Concretely, every 5 minutes (`TABLE_REFRESH_INTERVAL`):

1. KadDHT picks a bucket prefix to refresh.
2. Runs `FIND_NODE(randomIdInPrefix)` against the closest known peers.
3. Each returns up to 20 new peer IDs → libp2p **dials all of them** to query further.
4. Those dials open connections (counted against the 48 cap), fill the dial queue (peaks at 453), and trigger pruning.
5. 30s later, pruning closes them. KadDHT refresh fires again → re-dial. Repeat forever.

`forceDisableDht: true` (A1) removes step 1-2 at the source — no DHT service, no
refresh walks, no swarm dials. The connection manager drops to its natural floor:
configured relays (1-2) + bonded contacts (0-5) + LAN mDNS peers (0-3). That's
~5-10 connections steady-state instead of 50-106.

The memory drop (~1.2 GB → ~500 MB) comes from libp2p holding peer-store entries,
connection state, identify caches, and stream multiplexers for every connected
peer. Halving the peer count roughly halves the libp2p heap footprint.

### What A1 does NOT gain (be honest)

- **It does not reduce the relay-client-cycle cost** (relay.checkin/lookup every 30-90s) — that's the primary discovery path and stays.
- **It does not reduce mDNS traffic** — that's LAN discovery and stays (and should — it's cheap and useful on LAN).
- **It does not reduce bond-warm** — that's how bonded contacts stay reachable and stays.
- **It loses the public DHT as a discovery source.** Per the §7 audit, every feature has a relay-roster fallback, so no core feature breaks. But a peer who is on the public IPFS DHT and NOT on any EnvoyMesh relay becomes undiscoverable. For the bonded-mesh product (Allen's use case), this set is likely empty. For a future "discover strangers on the global mesh" feature, the DHT would need to come back (or be replaced by relay-roster federation).

### Net assessment

**A1 alone delivers ~90% of the total available performance gain.** It eliminates
the connection churn (the visible "always connecting" symptom), cuts memory ~50%,
and drops the dial queue to near-zero. B1 is a worthwhile cold-start polish. B2
codifies the discovery principle and prevents future regressions, with modest
steady-state gain on non-default presets. C1 and A2 are polish/defense-in-depth.

The recommended Phase 1+2+3 rollout targets exactly the high-gain, low-risk
slice: A1 (the big win), B1 (cold-start polish), B2 (principle + minor cleanup).
Nothing else is needed to make the home node quiet.

---

## Part VI — Impact on the relay server (shared codebase)

> **Concern:** `apps/relay` shares `packages/network` and `packages/api` with the
> home node. Do the proposed changes bleed into relay-server behavior?

**Short answer: no — the relay is structurally isolated from every proposed
change.** The relay builds its `EnvoyMesh` from raw CLI args
(`apps/relay/src/index.ts:261-273`), never imports `connectivity-tuning.ts`
presets, never runs the home-node advertise/discovery cycles, and is exempt from
the connection cap. Each solution is analyzed below.

### How the relay differs from the home node (verified)

| Aspect | Home node (NodeService) | Relay server (`apps/relay`) |
|---|---|---|
| **Mesh options source** | `resolveConnectivityRuntime()` applies a preset (`connectivity-tuning.ts`) | Raw CLI args only — **never imports presets** |
| **`maxConnections`** | Capped at `DEFAULT_CLIENT_MAX_CONNECTIONS` (48) | **Uncapped** — `enableRelayServer: true` → `maxConnections = undefined` (`index.ts:586-588`) |
| **`provideCapabilityTopic` / capability-discovery cycle** | Runs every 90-300s (B1/B2 target) | **Not run at all** — zero matches for `runCapabilityDiscoveryCycle`/`provideCapabilityTopic` in `apps/relay/src/` |
| **`relay-client-cycle` (relay.checkin/lookup as a client)** | Runs every 30-90s | **Not run** — the relay *receives* checkins via `attachStandaloneRelayControl`; it is not a client |
| **`startRelayReservationHealthLoop`** | Runs (reservation health) | **Not run** — the relay is the reservation *server*, not a client holding slots |
| **`node-service-start` / `NodeServiceImpl`** | The home-node runtime | **Not imported** by the relay |
| **Swarm pruning (`pruneExcessSwarmConnections`)** | Runs every 30s (C1 target) | **Not run** — no `node-stats-log` / pruning on the relay |
| **`provideSelf`** | CLI path only (home node never calls it) | Called at startup + every 10min (`index.ts:736,741`) in DHT-server mode |

### Solution-by-solution relay impact

| Solution | Shared-code change? | Relay impact | Action needed |
|---|---|---|---|
| **A1 — `quietWan` preset** | New preset in `connectivity-tuning.ts` | **None.** Relay never imports presets; it sets `enableDht`/`dhtClientMode` from CLI flags directly. The preset is purely opt-in for home nodes. | None. |
| **B1 — advertise early-exit on empty routing table** | Adds `getRoutingTableSize()` to `EnvoyMesh` (shared); changes `runCapabilityDiscoveryCycleViaRuntime` (home-node only) | **None on the cycle change** (relay doesn't run it). The `getRoutingTableSize()` helper is additive and used only by callers that opt in. **However**, the relay's own `provideSelf` (`index.ts:736`) could optionally use the early-exit too — but it only runs in DHT-server mode (where the routing table is intentionally being filled), so skipping it would be wrong. Leave the relay's `provideSelf` untouched. | None. Optional: relay's `provideSelf` could log routing-table size for diagnostics, but must NOT skip. |
| **B2 — remove periodic find; event-driven advertise** | Removes `shouldRunPeriodicCapabilityFind` path in `node-service-capability-discovery.ts` + `apps/node/src/index.ts` (CLI) | **None.** Relay doesn't run capability-discovery at all. The CLI path (`apps/node/src/index.ts`) is the node daemon, not the relay. | None. |
| **C1 — preset-driven prune threshold** | Changes `pruneExcessSwarmConnections` trigger thresholds | **None.** Relay doesn't run pruning. | None. |
| **A2 — connection gater** (optional) | Adds optional `connectionGater` to `EnvoyMesh` | **None if gated correctly.** The gater must be opt-in via `EnvoyMeshOptions.strictDialPolicy` and default OFF. The relay does NOT pass it (it must accept inbound relay reservations and hop traffic from arbitrary peers). **Must NOT enable strictDialPolicy on the relay** — would break circuit hopping. | Ensure `strictDialPolicy` defaults to `false` and the relay never sets it. |

### The one invariant to preserve

**The connection cap (`maxConnections`) must stay disabled for relay servers.**
Line 586-588 of `packages/network/src/index.ts`:

```typescript
const maxConnections =
  this.options.maxConnections ??
  (this.options.enableRelayServer ? undefined : DEFAULT_CLIENT_MAX_CONNECTIONS);
```

This `enableRelayServer ? undefined : ...` ternary is the load-bearing isolation.
None of the proposed changes touch it. A future change that accidentally applies
the home-node cap to relays would **starve the relay of circuit-hop connections**
— the most dangerous regression. Any PR touching `maxConnections` resolution must
preserve the relay exemption.

### Summary

The relay server is a **minimal standalone runtime** that happens to share the
`EnvoyMesh` class and protocol schemas with the home node. It does not share the
home-node connectivity stack (presets, capability-discovery cycles, pruning,
reservation health, bond-warm). All five proposed solutions are either home-node-
only code paths or additive shared-code helpers with opt-in callers. **No relay
behavior change is required or expected**, provided A2's `strictDialPolicy`
defaults OFF and the `enableRelayServer` connection-cap exemption stays intact.

---

## Part VII — Multi-relay fleets & file sharing (will it break?)

Two follow-up concerns raised during review: (1) the operator plans to deploy
more relay servers, and (2) the project supports IPFS for file sharing — do the
proposed changes interact badly with either?

### 1. Adding more relay servers — fully supported, no code change needed

The relay infrastructure already handles multiple operator-configured relays:

- **`configuredRelays`** is an array in `node-config.json`
  (`apps/node/src/node-config-store.ts:56` — `RelayConfig[]`, each
  `{ enabled, addr }`).
- **`collectRelayControlTargets()`** (`relay-reservation-health.ts:36`) merges
  configured relays + community cn-relay + us-relay + bootstrap, dedupes, and caps at
  `DEFAULT_MAX_RELAY_CONTROL_TARGETS = 4` (line 25).
- Both the **relay-client-cycle** (`relay.checkin`/`relay.lookup`) and the
  **reservation health loop** iterate over all collected relay targets.
- The reservation health loop reserves on **each** preferred relay independently
  (multi-home circuit relaying) and re-warms any that drop.

So adding relay servers is an operator config change — append multiaddrs to
`configuredRelays`, and the node will checkin, lookup, and reserve on all of
them. `quietWan` complements this directly: with the public DHT gone, the relay
roster becomes the primary discovery path, so a fleet of relays improves both
discovery coverage and circuit-reachability resilience.

**One tunable to watch:** the `maxTargets = 4` cap. If you deploy >4 relays and
want all of them used for checkin/reservation, raise
`DEFAULT_MAX_RELAY_CONTROL_TARGETS`. Otherwise the node picks 4 (which is usually
enough — more relays than that has diminishing discovery returns and more
connection overhead).

### 2. File sharing & IPFS — `quietWan` is safe (file transfer does NOT use the DHT)

There are **two completely separate file-related systems** in the codebase, and
only one of them touches the DHT — and that one is opt-in and uses a *separate*
libp2p node, not the mesh DHT.

#### a) Mesh file sharing between bonded peers (the main feature) — NO DHT

The bonded-peer file-transfer path
(`apps/node/src/node-service-fileshare.ts` → `node-file-share.ts` →
`data-transfer-inbound.ts`):

1. Sender reads the vault file, SHA-256 hashes it, builds a signed
   `DataTransferVoucher` (issuer peer/owner/device, relativePath, totalBytes,
   contentHash), chunks to 64 KiB.
2. Sends it over a **direct libp2p stream** on protocol `ENVOY_DATA_PROTOCOL`
   (`packages/network/src/index.ts:3266` `sendDataTransfer`).
3. The target peer is located via **dial hints** — direct multiaddrs +
   `/p2p-circuit/` relay addresses (the same path as chat delivery,
   `openOutboundStream` → `dialOpenStreamViaHints`). **No `findProviders`, no
   Bitswap, no DHT provider lookup anywhere in this path.**
4. Receiver verifies the voucher (expiry, signature, issuer-peer binding, byte
   length) and writes the reassembled bytes into the vault.

This path **never imports `contentRouting`, never calls `findProviders`, never
references the DHT service**. With `forceDisableDht: true`, bonded-peer file
sharing works identically — the file moves over the same direct stream or circuit
relay as chat.

#### b) "External IPFS publish" (opt-in, off by default) — separate Helia node

There *is* Bitswap/Unixfs in the repo (`packages/ipfs-helia/`,
`apps/node/src/vault-ipfs-export-service.ts`), but it powers an **opt-in external
publish** feature:

- Gated behind `config.externalPublish.allowIpfs` — **off by default**; every
  entry point (`exportLibraryItemToIpfs`, `pinLibraryItemExternal`,
  `verifyLibraryItemIpfsGateway`) returns `{ ok: false, error: "IPFS export is
  disabled" }` unless the operator enables it.
- Uses a **separate Helia/Kubo node** with its *own* libp2p instance and DHT —
  completely independent of the mesh's libp2p node and `enableDht`.
- Designed for publishing vault documents to the global IPFS network / external
  pinning services (Pinata, gateways), not for peer-to-peer mesh transfer.

Disabling the mesh DHT does **not** affect this feature — it runs its own DHT
inside the Helia node.

#### The one caveat (discovery, not transfer)

If a node ever relied on the DHT to find *new WAN peers it has never contacted*
(stranger discovery via `findPeer`), that avenue disappears under `quietWan`.
But this affects **who you can discover**, not **how files move once a peer is
reachable**. Bonded contacts reached via relay roster / direct address stay fully
file-share-capable.

### Net answer

| Concern | Impact of `quietWan` / DHT-off |
|---|---|
| Adding more relay servers | ✅ **None — fully supported.** More relays improve discovery coverage under `quietWan` (relay roster becomes primary). Watch the `maxTargets=4` cap if deploying >4 relays. |
| Mesh file sharing (bonded peers) | ✅ **None — file transfer uses direct streams + circuit relay, never the DHT.** |
| External IPFS publish | ✅ **None — uses its own Helia node with a separate DHT.** (And it's off by default anyway.) |
| Discovering new WAN peers via DHT | ⚠️ **Lost** — but this is the intended trade-off; relay roster + mDNS + bonded contacts cover the product's discovery needs. |

`quietWan` is safe to ship for the file-sharing and multi-relay use cases.

---

## Part VIII — Relay failure (single relay vs dual community relays)

> **Concern:** under `quietWan`, the relay roster is the primary discovery path.
> What happens when a community relay goes down?

**Current product defaults (Phase 46):** fresh installs ship **both** community
presets (`cn-relay` + `us-relay`). The sections below still apply to **legacy
configs** that only enable one relay, and to the case where **both** community
relays are unreachable at once.

This is the most important resilience question for the design. The answer has
two parts: **what user-facing features break** (bounded, recoverable), and
**what the node keeps doing** (a real concern that needs a mitigation).

### 1. What breaks immediately (the user-visible impact — single relay only)

When **only one** relay is configured and it goes down:

| Feature | Impact when the only relay is down | Why |
|---|---|---|
| **WAN chat / message to a CGNAT'd peer** | ❌ **Fails** with `"No reachable path to <peer>"` | The peer is behind NAT; the only path was `/p2p-circuit/` through the relay. No relay → no circuit → no path. (`chat-outbound-deliver.ts:299`) |
| **WAN file share to a CGNAT'd peer** | ❌ **Fails** the same way | Same dial path as chat (`ENVOY_DATA_PROTOCOL` over circuit relay). |
| **WAN auto-bonding (sponsor friend)** | ❌ **Fails** after exhausting retries | `searchPeers({peerId})` relay.lookup fails → falls back to bundled dial hints → if those are also stale/circuit-only, `"No reachable path"`. (`node-service-setup-sponsor-friend.ts:659-666`) |
| **Discover/Search by topic (cross-NAT)** | ❌ **Returns empty** | The DHT is off (`quietWan`); relay.lookup returns nothing. mDNS still works for LAN. |
| **Discover/Search by peer ID (cross-NAT)** | ❌ **Fails** — direct dial + relay.lookup both fail | `node-service-discovery.ts:465` findPeer (off), `:479` direct dial (CGNAT'd peer unreachable), `:501` relay.lookup (relay down). |
| **Team jobs across WAN** | ❌ **Worker unreachable** | Orchestrator can't propose to a CGNAT'd worker. |

### 2. What still works (the resilience floor)

| Feature | Still works? | Why |
|---|---|---|
| **LAN chat / file share / bond** | ✅ **Yes** | mDNS discovery + direct LAN dial — no relay needed. (`pickAddressFilterForPeer` returns `"all"` when only LAN/private addrs exist) |
| **Local EnvoyAI / Pi / Ext Agent** | ✅ **Yes** | Runs on the home node, no network. |
| **Already-bonded WAN peers with a *direct* public address** | ✅ **Yes** | If the peer is not behind NAT (has a public IP), direct TCP dial works without the relay. |
| **Inbox / history / vault** | ✅ **Yes** | All local. |

**The key boundary:** relay-down breaks **cross-NAT reachability to CGNAT'd peers**. It does not break LAN, local AI, or peers with public addresses. For Allen's Mac ↔ Windows-5G setup (both CGNAT'd), relay-down means total loss of contact — which is the inherent cost of NAT'd networking without a relay.

### 3. What the node keeps doing (the real concern)

When the relay is down, the node does **not** give up — it keeps retrying on three
cycles:

| Cycle | Retry behavior when relay down | Cost |
|---|---|---|
| **Relay reservation health loop** | Re-warms every 15s (`lostMs`) when all reservations are lost: `eagerConnectToRelays` (30s dial timeout) + `requestRelayReservation` per relay | Moderate — a 30s dial + reserve attempt every 15s, each failing. ~CPU + dial-queue pressure. |
| **relay-client-cycle** (checkin/lookup) | Runs every `relayCycleBaseMs` (45-90s depending on preset), each checkin/lookup failing with a timeout | Low-moderate — one failed RPC per relay per cycle. |
| **Connection manager reconnect** | libp2p tries to reconnect the dropped relay connection: `reconnectRetries: 10`, `reconnectRetryInterval: 5000`, backoff ×1.5 | Low — libp2p internal, bounded retries. |

So a dead relay produces a **steady background hum of failed reconnection
attempts** (~one 30s dial attempt every 15s from the reservation health loop, plus
libp2p's own reconnect attempts). This is not catastrophic (the node stays
responsive; LAN/local features work), but on a battery-constrained device or a
metered connection it is wasted work. **Under `quietWan` specifically, there is
no DHT fallback to discover peers through, so the relay is the only path being
retried — which makes the retry cadence more visible than on today's `optimized`
preset (where the DHT churn masks it).**

### 4. Mitigations (design additions for `quietWan`)

Two mitigations, one immediate and one structural:

#### M1 — Backoff the reservation health loop on sustained failure (do this)

Today the health loop re-warms every 15s (`lostMs`) when all reservations are
lost, forever. Add exponential backoff: after N consecutive failed re-warm cycles
(e.g. 4 failures = ~1 minute of no relay), stretch the cadence to `lostMs × 2^n`
capped at e.g. 5 min. Reset immediately on any successful reservation.

```typescript
// Conceptual — in startRelayReservationHealthLoop tick():
if (consecutiveReWarmFailures > 4) {
  // Backoff: stop hammering a dead relay
  delay = Math.min(lostMs * 2 ** (consecutiveReWarmFailures - 4), 5 * 60_000)
}
```

This turns "30s dial attempt every 15s forever" into "30s dial attempt every
15s for the first minute, then every 30s, 60s, 2min, capped at 5min." The node
still recovers within ~15s when the relay comes back (the cadence resets on
success), but it stops wasting effort on a relay that's been down for 10 minutes.

**This applies to all presets, not just `quietWan`** — the sustained-retry-on-
dead-relay behavior exists today. `quietWan` just makes it more visible because
there's no DHT fallback.

#### M2 — Surface relay-down to the operator (do this alongside M1)

Add a health state to the connectivity dashboard / Settings: when
`lastReservationError` is set and no configured relay has held a reservation for
>2 minutes, show a clear **"Relay unreachable"** warning with the relay address
and a suggestion to add a backup relay or check the relay server. Today this
failure is invisible in the UI (only visible in logs) — operators don't know
their WAN peer discovery is dead until they try to bond and it fails.

The existing `mesh-readiness` / connectivity-diagnostics code already tracks
`lastReservationError`; it just needs to be surfaced in the UI, not only logged.

#### M3 — Multi-relay as the structural fix (shipped in defaults + operator scale-out)

The structural answer to "what if a community relay is down" is **don't rely on
one hop**. Current defaults configure **cn-relay + us-relay**; operators can add
org relays via `configuredRelays` (cap 4). With multiple relays:

- The reservation health loop reserves on **each** relay independently
  (multi-home circuit relaying).
- If cn-relay goes down, the node still has reservations on the other relays →
  WAN peers can still hop through a backup relay.
- `relay.lookup` queries all configured relays → discovery survives one being
  down.

This is why the operator's plan to **deploy more relay servers** is not just a
nice-to-have under `quietWan` — it is the primary resilience mechanism. A
`quietWan` node with a single relay has a single point of failure for WAN
discovery and cross-NAT reachability. A `quietWan` node with 2-3 relays is
resilient to any one going down.

### 5. Net answer

| Scenario | Outcome |
|---|---|
| One community relay down, **dual-relay defaults**, `quietWan` | **Usually no user-visible impact** — the other community relay carries reservation + lookup. |
| One relay down, **single-relay legacy config**, `quietWan` | WAN cross-NAT features break; LAN + local + public-addr peers still work. Node retries with backoff (M1). Add `us-relay` or a backup relay. |
| cn-relay down, multiple relays, `quietWan` | **No user-visible impact** — backup relays carry reservation + lookup load. This is the intended operating mode. |
| Both community relays down, dual-relay defaults | Same as single-relay failure — WAN cross-NAT to CGNAT peers breaks until at least one relay recovers. |
| cn-relay down, single relay, today's `optimized` | Same WAN breakage, but masked by DHT churn (peers *might* still be discoverable via DHT if reachable). Relay-down is less visible but still breaks cross-NAT *reachability* (DHT finds the peer but you can't dial it without a circuit). |

**Action items before promoting `quietWan`:**
1. **M1 — backoff the reservation health loop on sustained failure** (small code change, applies to all presets).
2. **M2 — surface relay-down in the UI** (small, big operator-experience win).
3. **Recommend multi-relay in the `quietWan` setup docs** (operator guidance, not code).

`quietWan` should ship with M1 + M2. M3 (deploy more relays) is the operator's
responsibility and the documented best practice for the mode.

- Connectivity presets: `packages/api/src/connectivity-tuning.ts:111-175`
- libp2p node assembly: `packages/network/src/index.ts:593-664`
- DHT (KadDHT) config: `packages/network/src/index.ts:647-654`
- Connection manager + monitor: `packages/network/src/index.ts:601-619`
- Peer discovery (mdns + bootstrap): `packages/network/src/index.ts:3494-3516`
- AutoRelay discovery filter: `packages/network/src/index.ts:43-63`
- Circuit relay reservation health: `packages/network/src/index.ts:1205-1334`
- Swarm pruning: `packages/network/src/index.ts:2722-2775`
- Connection cap + mDNS interval constants: `packages/network/src/connection-stats.ts:19,29`
- Bootstrap preset/relay defaults: `packages/api/src/default-bootstrap.ts:7-16`
- Discovery advertise retry math: `apps/node/src/node-service-identity.ts:100-103, 1193-1250`
- Capability discovery cycle: `apps/node/src/node-service-capability-discovery.ts:88-137, 142-185`
- `searchByTopic` DHT ∪ relay union: `apps/node/src/node-service-discovery.ts:562-647`
- `searchByPeerId` DHT + direct-dial + relay fallback: `apps/node/src/node-service-discovery.ts:454-535`
- libp2p KadDHT constants: `node_modules/@libp2p/kad-dht/src/constants.ts` (`K=20`, `QUERY_SELF_INTERVAL=5min`, `TABLE_REFRESH_INTERVAL=5min`)
- libp2p KadDHT client/server mode: `node_modules/@libp2p/kad-dht/src/kad-dht.ts:420-456`
- libp2p reservation store stale-handling: `node_modules/@libp2p/circuit-relay-v2/src/transport/reservation-store.ts:220-245`
- libp2p connection-gater interface: `node_modules/@libp2p/interface/src/connection-gater.ts`

*Last updated: 2026-08-06 — investigation + design, no code changes yet.*
