# EnvoyMesh Node Discovery Guide

This document explains how EnvoyMesh nodes discover each other on **native libp2p paths** (LAN and WAN), what “healthy” discovery looks like, and how to debug failures.

**Scope:** Describes bootstrap, DHT, relay, seeds, and observability for EnvoyMesh's native libp2p-first discovery posture. No external signaling network is planned for discovery.

**POC entry:** ordered proof sequence for transport discovery + connectivity (LAN → bootstrap/DHT → relay observation) lives in [poc-discovery-connectivity](./poc-discovery-connectivity.md).

**Relay network design:** layered relay-node topology, address-switching behavior, summary-guided relay graph routing, multi-relay failover, relay manager surfaces, and growth controls live in [layered-relay-network](./layered-relay-network.md).

## Discovery Model At A Glance

EnvoyMesh discovery is layered:

1. **LAN-first discovery (fast path)** via mDNS.
2. **WAN-capable discovery (fallback path)** via bootstrap peers + DHT + relay stack.
3. **Identity-level continuity** via verified `system.signal` and local owner-to-peer mapping.
4. **Operational observability** via audit `p2p.trace`, CLI `connectivity-status`, and Dashboard Discovery Health.

The goal is resilience: local networks should connect quickly, while non-LAN environments should still converge through the WAN stack.

## WAN + NAT: Rendezvous Model (Production Reality)

Across the public internet, **“automatic discovery” still depends on rendezvous**: a small set of well-known, reachable coordination points plus a way to publish and learn **dialable** multiaddrs.

EnvoyMesh’s WAN posture (`wan-default`) enables the standard libp2p building blocks:

- **Bootstrap peers** join the wider network and discover relays/peers.
- **DHT (client mode)** helps discover peers/addresses once the node is connected well enough to participate.
- **Circuit relay (`/p2p-circuit`)** provides a path when both sides are behind strict NATs; relay is a coordination transport, not an application data bypass (streams remain encrypted at the libp2p layer).
- **AutoNAT** helps the node learn what it looks like from the outside (observed addresses).
- **DCUtR** attempts to upgrade relay-mediated connectivity to a direct path when possible.

### What `wan-default` does *not* guarantee

`wan-default` is **not** a promise that two arbitrary nodes will spontaneously learn each other’s current addresses with zero configuration.

It is a **connectivity posture**: it turns on the WAN-capable mechanisms so a node *can* converge when at least one rendezvous path exists (public bootstrap/relay fleet, explicit bootstrap multiaddrs, or an out-of-band invite that seeds dialable information).

### “Guaranteed rendezvous” for EnvoyMesh (recommended product shape)

For WAN-first deployments, treat these as first-class requirements:

1. **Operate a small bootstrap + relay fleet** (2–3 regions) with stable DNS names and operator-owned keys.
2. **Cold start pairing** (invite link / QR / copied multiaddr) that carries enough information for the first dial (often includes a relay circuit template or rendezvous token).
3. **Persistence + reprobe** so rediscovery survives IP changes (EnvoyMesh already persists discovery seeds; pairing should refresh seeds when needed).
4. **Operator diagnostics** (`connectivity-status`, `p2p.trace`, dashboard health) that distinguish:
   - cannot reach bootstrap
   - can reach bootstrap but cannot obtain relay addresses
   - relay works but direct upgrade fails (still OK)
   - direct upgrade succeeds (best)

This is the same practical architecture used by mature P2P systems: **coordination is allowed**, while **application payloads remain owner-controlled and signed** at the EnvoyMesh protocol layer.

## Roadmap: DHT “Topics” (Capability Advertisements) — Not The Same As `discovery.request`

EnvoyMesh already has a **protocol-level** discovery path for “ask a specific peer for matches” via signed `discovery.request` / `discovery.response` (story-driven / policy-gated).

A **global** “topic” system is a different layer: a way to **publish and find** capability records in the wide area without already knowing a dialable multiaddr.

**Target design (directional)**

- Represent a capability topic as a stable string (often hashed), for example `capability:envoymesh.file_provider`.
- Publish **small records** to the DHT under that topic key (typically “provider records”), containing:
  - publisher **peer id**
  - **freshness** (`createdAt`, TTL)
  - **proof-of-control** references (signature over record; optional stake/reputation later)
  - pointers to richer metadata (often still fetched via EMP `discovery.*` after you learn a candidate peer)

**Why this is separate from `discovery.request`**

- `discovery.request` is an **application conversation** after you have a peer target (or can resolve one).
- DHT topics are **rendezvous metadata** to discover who might be worth contacting.

**Prod dependency**

This only becomes reliable with an operator **bootstrap + relay fleet** (your Lighthouse nodes), because home users cannot depend on overloaded public relays or flaky community bootstraps.

**Shipped:** `@envoymesh/network` includes deterministic topic hashing (`cidForCapabilityTopic`) plus helper APIs to publish/query provider records (`provideCapabilityTopic`, `findCapabilityTopicProviders`). Query calls are bounded with a timeout by default so they settle instead of streaming forever in sparse networks.

**Signed record envelopes (Phase 4F.A):** Provider records carry a **cryptographically signed capability topic record** to prevent spoofing. The record is encoded as multiaddr query parameters when advertised via DHT, and verified by queriers before trusting the provider.

**Record shape:**

```
SignedCapabilityTopicRecord {
  topic: string           // capability topic string (e.g. "envoymesh.file_provider")
  peerId: string          // publisher libp2p peer ID
  multiaddr: string       // transport multiaddr
  signature: string       // base64url-encoded Ed25519 signature
  createdAt: string       // ISO 8601 timestamp
  ttlSeconds: number      // freshness window (seconds)
  org?: string            // optional org scope tag
  net?: string            // optional network scope tag
  ver?: string            // optional version scope tag
}
```

**Multiaddr encoding:** When a signed record is advertised, it is encoded as query parameters on the provider's transport multiaddr:

```
/ip4/1.2.3.4/tcp/4000/p2p/12D3KooW...?
  topic=<topic>&
  sig=<base64url-signature>&
  ts=<iso-timestamp>&
  ttl=<seconds>&
  org=<org-scope>&     # optional
  net=<net-scope>&     # optional
  ver=<version-scope>   # optional
```

**Publishing with signing:** `provideCapabilityTopic(topic, { signingKey: pemPrivateKey, ttlSeconds: 3600, org: "acme" })` — the signing key is a PEM-encoded Ed25519 private key. The signed record is stored in the DHT (best-effort, 5s timeout) and the multiaddr carrying the encoded record is announced via `contentRouting.provide`.

**Querying with verification:** `findCapabilityTopicProviders(topic, { signingPublicKey: pemPublicKey })` — after finding providers via DHT, the querier fetches and verifies the signed record from the DHT. If `signingPublicKey` is omitted, providers are returned without signature verification. Results include:

- `signedRecord` — verified record (signature valid, not stale)
- `signedRecordInvalid` — present but verification failed (signature mismatch or stale)
- neither field — no signed record found for this provider

**Verification checks:** `verifySignedCapabilityTopicRecord` enforces:
1. Non-empty `topic`, `peerId`, `multiaddr`
2. Record not stale: `now - createdAt <= ttlSeconds * 1000`
3. Signature valid over canonical JSON of the unsigned record fields

## Signed Discovery Signals — Signing Is Necessary, Not Sufficient

**Shipped (Phase 4F.A):** Signed capability topic records are now implemented (`createSignedCapabilityTopicRecord`, `verifySignedCapabilityTopicRecord`) with Ed25519 signatures over canonical JSON, staleness enforcement, and multiaddr encoding. The `findCapabilityTopicProviders` API accepts a `signingPublicKey` to verify incoming records.

At the transport layer, libp2p connections are encrypted (Noise in this repo’s mesh setup).

At the EnvoyMesh protocol layer, discovery-ish intents must still be treated as **untrusted input** until policy says otherwise:

- **Signing** prevents trivial spoofing and ties statements to keys/certs (`system.signal` participates in identity continuity).
- **Policy + rate limits + trust tiers** prevent flooding and “truthy noise” even from valid signatures.

Threat-model implications to document explicitly:

- Sybil identities can still sign messages.
- Capability advertisements must include **freshness**, **scopes**, and **intent-specific limits**.
- Abuse controls belong in inbound guards + audits (correlation), not “crypto alone”.

## Roadmap: QUIC As Additive Transport (Parallel To TCP)

QUIC is a strong modern default for WAN resilience (better loss behavior than TCP-only stacks in many environments; connection migration is valuable on laptops switching networks).

For EnvoyMesh, QUIC should land as:

- **additive**: TCP remains supported for compatibility and debugging
- **preference policy**: prefer QUIC multiaddrs when present, fall back cleanly *(not wired into dial sorting yet — today QUIC is parallel; TCP-first dials still behave as before)*
- **release gates**: macOS / Windows / Linux smoke coverage + firewall/VPN adversarial notes

**Shipped (opt-in):** `@chainsafe/libp2p-quic` is registered alongside TCP when enabled; each TCP listen address gets a companion `/udp/.../quic-v1` listener. Enable with **`--quic`** / **`--no-quic`**, YAML `discovery.quic`, or **`ENVOYMESH_QUIC=1`**. *(Native QUIC bindings are platform-specific; CI covers the integration test where the runner matches a published `@chainsafe/libp2p-quic-*` binary.)*

When reading **`EnvoyMesh.multiaddrs`**, libp2p typically appends **`/p2p/<self>`** on each announced address. **Do not** concatenate an extra `/p2p/<peer>` when reusing those strings as a dial target, or transports will see a malformed “double `/p2p/`” multiaddr.

Implementation notes are intentionally tracked in [`docs/implementation-plan.md`](./implementation-plan.md#phase-4f-wan-capability-topics-and-transport-hardening) (**Phase 4F**) because this touches `packages/network` transport wiring and operational testing burden.

## Discovery Profiles

EnvoyMesh supports profile-level defaults:

- `lan-fast` (default)
  - Optimized for same-LAN testing and local development.
  - mDNS enabled by default.

- `wan-default`
  - Optimized for non-LAN and unstable mDNS environments.
  - Enables:
    - DHT client mode
    - Circuit relay transport
    - AutoNAT
    - DCUtR

Set profile with:

```bash
--discovery-profile lan-fast
--discovery-profile wan-default
```

Or environment variable:

```bash
ENVOYMESH_DISCOVERY_PROFILE=wan-default
```

Or node config YAML:

```yaml
discovery:
  profile: wan-default
```

When DHT is enabled, the node now also runs an **automatic capability-topic cycle**:

- derives topics from local device capabilities (`capability:<name>`)
- publishes provider records on startup and periodically
- queries provider records on a bounded timeout and persists discovered multiaddrs as discovery seeds

This improves WAN auto-discovery convergence without requiring manual `discovery.request` CLI calls for every cold start.

### Stable libp2p Peer ID

The **`/p2p/<peerId>`** segment in multiaddrs comes from libp2p’s transport identity (`12D3Koo…`), not from the Envoy EMP device id (`envoy_…`).

By default, if no key is supplied, **js-libp2p generates a new key on every process start**, so the Peer ID **changes on every restart**. That breaks any bookmarked bootstrap multiaddrs, relay `--advertise-addr` lines you composed by hand, and peers’ stored addresses—**even when the TCP IP and port stay the same**.

The EnvoyMesh node stores a **per-profile** libp2p key next to `profile.json`:

- **File:** `<profileDir>/libp2p-private.key` (protobuf; create-on-first-start; mode `0o600` where supported)

The main `apps/node` runtime and **`discovery-dashboard`** pass this path automatically from **`--profile`**.

This is **independent** of the Envoy EMP **device key** in `profile.json` (used for `senderPeerId` / `derivePeerId(...)`). You will still see two different identifiers:

- **Envoy / EMP** logical id: `envoy_…` (signing identity)
- **libp2p** transport id: `12D3Koo…` (dial / Noise / DHT)

Back up **`libp2p-private.key`** with the profile when you care about stable addresses. If you delete it, the next start generates a **new** libp2p Peer ID (one-time rotation).

For programmatic or custom embedders, pass **`libp2pPrivateKeyPath`** into **`EnvoyMesh`**. Omit it only for throwaway or single-session meshes.

## Bootstrap Peers And Presets

WAN discovery needs at least one reachable bootstrap/relay source.

You can provide peers directly:

```bash
--bootstrap "<multiaddr>"
```

Or use managed presets:

```bash
--bootstrap-preset public-libp2p
--bootstrap-preset public-libp2p-am6
--bootstrap-preset public-libp2p-am7
```

Or environment variables:

```bash
ENVOYMESH_BOOTSTRAP_PEERS="<addr1>,<addr2>"
ENVOYMESH_BOOTSTRAP_PRESETS="public-libp2p,public-libp2p-am6,public-libp2p-am7"
```

Or node config YAML:

```yaml
discovery:
  bootstrapPresets:
    - public-libp2p
    - public-libp2p-am6
    - public-libp2p-am7
  bootstrapPeers:
    - "<addr1>"
    - "<addr2>"
```

EnvoyMesh deduplicates peers when combining env values, repeated flags, and presets.

Built-in preset names:

- `public-libp2p`
- `public-libp2p-am6`
- `public-libp2p-am7`

### Operator-defined bootstrap presets (YAML)

For WAN-first deployments, you should maintain your own small preset registry (your bootstrap + relay fleet), and reference preset names from node config / flags.

YAML file shape (map of preset name → list of multiaddrs):

```yaml
my-org:
  - /dns4/bootstrap.example.com/tcp/443/wss/p2p/12D3KooWExample
  - /dns4/relay.example.com/tcp/443/wss/p2p/12D3KooWRelay
```

Wire it in:

```bash
npm run node:dev -- --bootstrap-presets-file ./bootstrap-presets.yaml --bootstrap-preset my-org
```

Or node config YAML:

```yaml
discovery:
  bootstrapPresetsFiles:
    - ./bootstrap-presets.yaml
  bootstrapPresets:
    - my-org
```

Env:

```bash
ENVOYMESH_BOOTSTRAP_PRESETS_FILES="./bootstrap-presets.yaml"
```

### WAN cold start: join-invite tokens

For strict NAT / no multicast environments, use a one-time **join-invite** payload to seed bootstrap peers and optional preset names.

Generate:

```bash
npm run cli -w @envoymesh/node -- invite encode --bootstrap-peer "<multiaddr>" --invite-bootstrap-preset public-libp2p-am6
```

Join (receiver):

```bash
npm run node:dev -- --join-invite "<token-from-invite-encode>"
```

Notes:

- Invite tokens are **unsigned** in v1 (tamperable). Treat them like a join URL: short-lived, sent over a trusted channel, and rotate if leaked.

## Known-Good Seed Persistence (Phase D Start)

EnvoyMesh also persists discovery seeds under each profile directory and reuses them on startup.

Seed sources include:

- manually configured bootstrap peers (`--bootstrap`)
- successful bootstrap probe targets
- multiaddrs observed from `peer:discovery` events
- listen addresses remembered from verified `system.signal` peer directory records

On startup, these sources are merged and deduplicated into an effective bootstrap set. This improves cold-start discovery after prior successful sessions, especially on non-LAN networks.

## Strict Connectivity Gate

Use strict startup mode when you want fail-fast behavior in WAN deployments:

```bash
--connectivity-strict
```

With this flag, startup fails if all bootstrap probes fail under `wan-default`.

Env override:

```bash
ENVOYMESH_CONNECTIVITY_STRICT=1
```

Or node config YAML:

```yaml
discovery:
  connectivityStrict: true
```

## Runtime Discovery Signals

At runtime, EnvoyMesh writes connectivity telemetry to audit as `p2p.trace` events, including:

- profile selection and discovery posture
- connectivity warnings
- discovered peers
- bootstrap probe success/failure
- periodic bootstrap reprobe success/failure (`connectivity.reprobe.ok` / `connectivity.reprobe.fail`)
- periodic health checkpoints
- relay control events such as `relay.checkin`, `relay.lookup`, `relay.summary`, forwarded lookup traces, and local `relay.manager.snapshot` rows

These traces power:

- CLI:
  - `npm run cli -w @envoymesh/node -- connectivity-status --profile "<profile>"` — prints aggregate counters **plus** the latest **`peer.discovery`** row per libp2p peer id, recent **`discovery.capability.*`** traces when present, and **`discovery-seeds.json`** rows (with `source`: `peer.discovery`, `capability-topic`, `bootstrap-probe`, …).
  - `npm run cli -w @envoymesh/node -- relay-status --profile "<profile>"` — prints the local relay manager snapshot: roster counts, relay-book neighbors, summary freshness, routing metrics, recent relay traces, and warnings.
  - Running node with **`--peer-discovery-log`** or **`ENVOYMESH_PEER_DISCOVERY_LOG=1`** prints **`[peer-discovery]`** lines to the console whenever libp2p reports a newly discovered peer (supplements audit).
- Dashboard:
  - Discovery Health panel (bootstrap/discovered/relay/warnings/checkpoint fields)
  - Relay Manager panel (local/read-only relay roster, relay graph, and routing snapshot)

## End-To-End Discovery Flow

1. Node starts with `lan-fast` or `wan-default`.
2. Discovery modules initialize (mDNS and/or WAN stack).
3. Node attempts peer discovery through active mechanisms.
4. For `wan-default`, bootstrap probes are executed and recorded.
5. Relay clients periodically send `relay.checkin`; relay nodes answer bounded `relay.lookup` queries from their local roster first and then selected relay neighbors when `maxHops` allows it.
6. A discovered peer becomes dialable and traffic can flow (`system.signal`, `system.ping`, chat/task/data).
7. Verified `system.signal` helps stabilize addressing by owner identity over time.

## Relay server: dialable addresses for `relay.lookup` circuit paths

When a node runs with **`--relay-server`**, it answers **`relay.lookup`** by returning peer candidates whose multiaddrs are **relay circuit paths**. A client must dial a multiaddr of the form:

```text
<relay-base>/p2p/<relay-libp2p-id>/p2p-circuit/p2p/<target-libp2p-id>
```

The **`relay-base`** list is derived from:

1. **`--advertise-addr`** values (repeatable), if any; else  
2. **`getMultiaddrs()`**, with loopback-style bases removed.

On cloud VMs and many home gateways, **`getMultiaddrs()`** may only include **loopback** (127.0.0.1) and **private NIC** addresses (for example `172.16.x.x`). Clients on a **different** network cannot dial those bases, so they may connect to the relay as a bootstrap peer (using a **public** DNS/IP multiaddr you gave them) but **never complete a circuit** to another leaf peer—even when the relay roster shows both clients.

**Fix:** publish at least one **client-reachable** base multiaddr, **same TCP port** as `--listen`, with security group / firewall allowing inbound TCP:

```bash
--advertise-addr /ip4/<public-ip>/tcp/4001
# or
--advertise-addr /dns4/relay.example.com/tcp/4001
```

Environment variable (comma-separated):

```bash
export ENVOYMESH_ADVERTISE_ADDRS=/ip4/<public-ip>/tcp/4001
```

If the address does not already end with `/p2p/<relay-libp2p-id>`, the node appends it from the running relay’s libp2p peer id.

**Client-side fallback:** leaf nodes **rewrite** each returned `/p2p-circuit/` multiaddr using any **`--bootstrap`** / **`ENVOYMESH_BOOTSTRAP_PEERS`** entry that ends with the **same relay `/p2p/<id>`**, and try those dial candidates **first**. So if the relay embeds a private IP in the circuit path but you bootstrap via **`<public-ip>/tcp/4001/p2p/<same-relay>`**, Windows peers can still open the circuit without `--advertise-addr` on the relay (though advertising public bases on the relay remains the cleanest fix).

With **`wan-default`** and **`--relay-server`**, startup logs a **connectivity warning** when no `--advertise-addr` is set, as a reminder for cross-network deployments.

Step-by-step validation (two Windows nodes + relay) lives in [live-connectivity-testing](./live-connectivity-testing.md#4-prove-envoymesh-relay-address-switching).

### Envoy logical peer id vs libp2p peer id (signing and delivery)

EMP envelopes use **`senderPeerId` = `derivePeerId(devicePublicKeyPem)`** (the `envoy_…` stable application id from `@envoymesh/identity`). That is **not** the same string as **`libp2p`’s `PeerId`** (`12D3Koo…`).

- **Verification** (`verifyEnvelope`) ties the signature to the device key and expects `senderPeerId` to match that derivation. Tools that sign with the profile key but set `senderPeerId` to **`mesh.peerId`** will see **`invalid signature`** on the relay—even though the bytes are signed correctly.
- **Transport delivery**: when the relay (or any node) sends a reply on an **existing libp2p connection**, **`mesh.send`** must target the **`remotePeerId`** of that connection (libp2p id or dialable multiaddr), not the Envoy `senderPeerId` of the inbound envelope.

## Recommended Startup Commands

### Profile directories (cross-platform)

Use separate profile directories per machine so keys and persisted discovery seeds stay isolated:

| OS | Example `--profile` path |
| --- | --- |
| macOS / Linux | `$HOME/envoymesh/mac_profile` |
| Windows (PowerShell) | `$env:USERPROFILE\envoymesh\win_profile` |
| Windows (cmd) | `%USERPROFILE%\envoymesh\win_profile` |

WAN example on Windows (PowerShell); line continuation is backtick (`` ` ``), not `\`:

```powershell
npm run node:dev -- `
  --profile "$env:USERPROFILE\envoymesh\win_profile" `
  --listen "/ip4/0.0.0.0/tcp/4002" `
  --discovery-profile wan-default `
  --bootstrap "/ip4/<bootstrap-host>/tcp/4001/p2p/<BOOTSTRAP_PEER_ID>" `
  --bootstrap-preset public-libp2p `
  --p2p-debug
```

If `tsx src/index.ts` logs **unknown argument `C:\...\win_profile`** (values without `--profile` prefixes), PowerShell/npm on Windows stripped the `--…` tokens before Node saw them.

The **`parseNodeArgs`** path includes a small **positional fallback** when every token is bare values starting with a Windows absolute path (`C:\…`): it restores `--profile`, `--listen`, `--discovery-profile`, `--bootstrap`, `--bootstrap-preset`, and a trailing positional `p2p-debug`.

If that fallback does not fit your invocation, set the profile via env and keep the remaining flags minimal:

```powershell
$env:ENVOYMESH_PROFILE = "$env:USERPROFILE\envoymesh\win_profile"
npm run node:dev -- --listen "/ip4/0.0.0.0/tcp/4002" --discovery-profile wan-default --bootstrap "/ip4/<host>/tcp/4001/p2p/<peer>" --bootstrap-preset public-libp2p --p2p-debug
```

(`--profile` from argv still overrides `ENVOYMESH_PROFILE` when both are set.)

LAN-focused:

```bash
npm run node:dev -- --profile ./data/primary --listen /ip4/0.0.0.0/tcp/0 --p2p-debug
```

WAN-focused:

```bash
npm run node:dev -- --profile ./data/primary --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap-preset public-libp2p --bootstrap-preset public-libp2p-am6 --bootstrap-preset public-libp2p-am7 --connectivity-strict --p2p-debug
```

For WAN-first testing, prefer **explicit org bootstrap/relay multiaddrs** in addition to public presets. Public presets are convenient for development, but production WAN reliability should not depend on them alone.

## Common Failure Modes

1. **No reachable bootstrap peers**
   - Symptom: zero progress in WAN mode, strict mode startup failure.
   - Fix: add a known-good bootstrap/relay with `--bootstrap`.

2. **Firewall or NAT limits**
   - Symptom: discovery appears partial; dialing is unreliable.
   - Fix: permit outbound TCP, consider fixed listen ports, verify network policy.

3. **Stale multiaddrs**
   - Symptom: explicit sends fail after restart.
   - Fix: recopy current `Listening on:` address.

4. **Profile path mismatch**
   - Symptom: Dashboard/CLI appears empty while node logs activity.
   - Fix: use the same absolute profile path across node, CLI, and dashboard.

5. **mDNS-only expectation in non-LAN environments**
   - Symptom: works on LAN, fails across networks.
   - Fix: switch to `wan-default` + bootstrap/relay strategy.

6. **Relay roster OK but leaf peers never connect (circuit dials fail)**
   - Symptom: both clients check in (`relay-status` shows roster ≥ 2); `relay.lookup` returns peers but **`relay lookup candidate dial fail`** or discovery dashboard shows **`dialFail`** increasing; clients only “see” the relay at the libp2p layer.
   - Cause: **`relay.lookup`** embedded **unreachable** relay bases (private loopback/NIC only).
   - Fix: set **`--advertise-addr`** / **`ENVOYMESH_ADVERTISE_ADDRS`** on the relay server to a **public or DNS** multiaddr clients actually use (see [Relay server: dialable addresses](#relay-server-dialable-addresses-for-relaylookup-circuit-paths)).

7. **`invalid signature` on `relay.checkin` / `relay.lookup` at the relay**
   - Symptom: relay logs reject with **`invalid signature`**.
   - Cause: envelope **`senderPeerId`** set to **`mesh.peerId` (libp2p)** instead of **`derivePeerId(devicePublicKeyPem)`** while signing with the device key.
   - Fix: use the same signing pattern as the main node (`apps/node/src/index.ts`); discovery dashboard and any custom tooling must align.

8. **Relay restarts lose relay graph state**
   - Symptom: relay-to-relay lookups fail after relay restart even though peers have re-checked in.
   - Cause: relay book and summaries were in-memory only and were lost on restart.
   - Fix: relay book and summaries are now persisted to `relay-book.json` and `relay-summaries.json` in the profile directory and restored on startup. Peer roster entries are intentionally ephemeral and rebuilt from `relay.checkin`.

## Validation Checklist

1. Start both nodes with intended discovery profile.
2. Run `connectivity-status` on each node profile.
3. Confirm non-zero bootstrap count (WAN mode).
4. Send `system.signal` and `system.ping`.
5. Send chat/task/data commands.
6. Verify audit rows, task updates, and dashboard Discovery Health.

## Related Docs

- [QuickStart](../QuickStart.md)
- [Live Connectivity Testing](./live-connectivity-testing.md)
- [Developer CLI](./developer-cli.md)
- [Desktop Dashboard](./desktop-dashboard.md)
