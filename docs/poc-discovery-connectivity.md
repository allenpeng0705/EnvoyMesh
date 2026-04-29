# POC: Discovery and P2P connectivity (Stages A–D)

This document is the **single reference** for the EnvoyMesh transport POC: **Stage A** (LAN) through **Stage D** (full node / WAN-first). It explains **what each stage tests**, **what it does not prove**, and **how to run it**.

For hybrid Matrix signaling (optional, later), see [architecture-hybrid-planes](./architecture-hybrid-planes.md). For WAN architecture (bootstrap vs relay vs NAT), see [p2p-discovery](./p2p-discovery.md). Extended runbooks beyond these stages live in [live-connectivity-testing](./live-connectivity-testing.md).

---

Sections **A → D** below describe each stage in order: what it tests, what it does not test, mechanics, commands, and success criteria.

---

## Overview: all four stages at a glance

| Stage | What this step **tests** | Primary mechanisms | Typical proof |
|-------|---------------------------|-------------------|---------------|
| **A** | Local **mDNS** discovery and **EMP** envelope path (`system.ping`) between two ephemeral peers | mDNS peer discovery, TCP dial, Noise, Yamux, envelope sign/verify | Smoke script prints `[mdns] success: …` |
| **B** | **Cold-start attachment** to the wide-area overlay: dial **bootstrap**, participate enough that **another peer id** appears via discovery | Bootstrap dial list, **Kademlia DHT** (client mode), relay transport, AutoNAT, DCUtR stack enabled | Smoke script prints `[advanced] success: … discovered at least one peer` |
| **C** | **Circuit Relay v2** path is usable for **your node**: a **`/p2p-circuit`** multiaddr appears in advertised addresses (reservation succeeded) | Same stack as B + **`/p2p-circuit`** listen + relay reservation over discovered relays | Smoke prints `[advanced] success: relay address observed` |
| **D** | Real **`apps/node`** binary behavior: persisted profile, **`wan-default`** discovery profile, bootstrap presets/seeds, **CLI diagnostics** | Same libp2p features wired through production flags + `discovery-seeds`, audits | `connectivity-status` output + stable logs |

Stages **A → B → C** use one script: [`apps/node/src/connectivity-smoke.ts`](../apps/node/src/connectivity-smoke.ts) (`npm run connectivity:smoke` / `poc:discovery:*`).  
Stage **D** uses the full node (`npm run node:dev` or packaged binary) and the **`envoyctl` / CLI** connectivity commands.

---

## How to read “tests”

- **Smoke stages (A–C)** spin up **`EnvoyMesh`** from `@envoymesh/network` directly—no vault, trust store, or dashboard—so failures isolate **transport and discovery**.
- **Pass** means the **specific assertion** for that stage succeeded within the timeout (see each stage below).
- **Fail** does not automatically mean EnvoyMesh is broken; check VPN, firewall, DNS, and corporate proxies before debugging code.

---

## Stage A — LAN mDNS + signed ping

### What this step tests

1. **Multicast DNS** can discover another libp2p peer running EnvoyMesh code on the **same machine** (two isolated peers in **one** OS process).
2. After discovery, the smoke runner can **dial** the peer’s multiaddr and send a **signed** EMP **`system.ping`**; the receiver verifies the signature.

### What it does **not** test

- Discovery between **two physical computers** (Mac vs PC on the same Wi‑Fi): Stage A’s script runs **both** peers locally. Cross-machine LAN uses **Stage D** with two nodes or bespoke manual setup (see [live-connectivity-testing](./live-connectivity-testing.md)).
- **WAN / bootstrap / DHT** (that is Stage B).

### Mechanics

The script (`runMdnsSmoke`) creates **two** `EnvoyMesh` instances with **mDNS enabled**, waits until each sees the other’s **PeerId**, then sends one signed ping.

### Commands

From repo root:

```bash
npm run poc:discovery:mdns -w @envoymesh/node
```

Aliases:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode mdns --timeout-ms 20000
```

```bash
cd apps/node && npx tsx src/connectivity-smoke.ts --mode mdns --timeout-ms 20000
```

### Success criteria

```text
[mdns] success: both local nodes discovered each other and exchanged a signed ping
```

### Troubleshooting (same machine)

VPN off where possible; allow Node/`tsx` on the LAN; UDP **5353** multicast for mDNS; avoid guest/isolated Wi‑Fi; increase `--timeout-ms` if needed. **Windows:** if npm drops `--mode`, use `poc:discovery:mdns` or `cd apps/node` + `npx tsx` as above.

---

## Stage B — WAN bootstrap + DHT discovery

### What this step tests

1. With **advanced connectivity** enabled, the node can **dial at least one bootstrap multiaddr** you provide (well-known entry peers).
2. While connected to the overlay, **peer discovery** reports **at least one remote PeerId** (via bootstrap and/or **DHT**-related discovery paths—not necessarily a sustained routing session).

### What it does **not** test

- That you can dial a **specific friend** or EnvoyMesh bond peer (no trust layer here).
- That **relay reservations** appear (that is Stage C).
- **Semantic** discovery (`discovery.request`, Agent Cards)—different EMP layer ([implementation-plan](./implementation-plan.md) Phase 4E).

### Mechanics (`runAdvancedConnectivitySmoke`)

Single `EnvoyMesh` with **mDNS off**, **DHT client**, **bootstrap** list, **relay transport**, **AutoNAT**, **DCUtR**. Registers `onPeerDiscovered`; waits until `discoveredPeers.length > 0`.

### Bootstrap multiaddr

Must include **`/p2p/<PeerId>`**. Example aligned with EnvoyMesh **`public-libp2p`** preset ([`apps/node/src/args.ts`](../apps/node/src/args.ts)):

```text
/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN
```

### Commands

```bash
npm run poc:discovery:advanced-public -w @envoymesh/node
```

Explicit:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN" --timeout-ms 60000
```

Windows-safe:

```powershell
cd apps\node
npx tsx src/connectivity-smoke.ts --mode advanced --bootstrap /dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN --timeout-ms 60000
```

### Success criteria

```text
[advanced] success: advanced connectivity stack started and discovered at least one peer
```

### If this fails

Increase `--timeout-ms`; add another `--bootstrap` from the same preset list; verify outbound DNS/firewall to `bootstrap.libp2p.io`.

---

## Stage C — Relay `/p2p-circuit` advertisement

### What this step tests

1. Everything **Stage B** asserts (discovery ≥ 1 peer).
2. Your node eventually advertises at least one **`/p2p-circuit`** multiaddr—meaning **Circuit Relay v2 reservation** completed so others could theoretically dial you **via** a relay hop.

EnvoyMesh enables **`/p2p-circuit`** in **`addresses.listen`** when relay is on so reservations can surface in **`getMultiaddrs()`** (relay transport alone mainly enables **dialing through** relays).

### What it does **not** test

- End-to-end **relay dialing from another machine** on another NAT (possible manual follow-on; see [live-connectivity-testing](./live-connectivity-testing.md) §4 DCUtR notes).
- That relay is **fast** or **cheap**—only that addressing appeared.

### Mechanics

Same as Stage B, plus `--expect-relay-address`: poll until **`mesh.multiaddrs`** contains **`/p2p-circuit`** (within timeout).

### Commands

```bash
npm run poc:discovery:relay-public -w @envoymesh/node
```

Explicit:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN" --expect-relay-address --timeout-ms 90000
```

### Success criteria

Both:

```text
[advanced] success: advanced connectivity stack started and discovered at least one peer
[advanced] success: relay address observed
```

Listening lines should include **`/p2p-circuit/`**.

### If relay never appears

Increase `--timeout-ms` (e.g. `120000`); confirm Stage B passes; try extra `--bootstrap` peers; rule out strict firewall paths.

---

## Stage D — Full Envoy node + WAN profile

### What this step tests

1. **Production-shaped** configuration: persisted **`--profile`**, EnvoyMesh **discovery profile** **`wan-default`** (DHT/relay/AutoNAT/DCUtR-style defaults as implemented in `apps/node`).
2. **Bootstrap integration** via **`--bootstrap-preset`** (e.g. `public-libp2p`) and optional extra **`--bootstrap`** multiaddrs; optional **`--connectivity-strict`** so startup fails fast if **no** bootstrap probe succeeds.
3. **Operator visibility**: **`connectivity-status`** CLI reports bootstrap counts, discovery counts, relay-discovery hints, warnings—matching how you debug real deployments.

### What it does **not** test (by itself)

- Automated assertion like A–C success strings—you validate **CLI output** and logs.
- Matrix / HTTPS signaling ([Phase 4G](./implementation-plan.md#phase-4g-optional-control-plane-signaling-hybrid)).

### Typical commands

**Run WAN-first node** (adjust paths):

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --bootstrap "<bootstrap-multiaddr>" --p2p-debug
```

**Strict bootstrap at startup**:

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --bootstrap "<bootstrap-multiaddr>" --connectivity-strict
```

**Inspect diagnostics**:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile ./data/primary
```

On Windows, prefer a dedicated profile dir, e.g. `%USERPROFILE%\envoymesh\win_profile`.

### Success criteria (interpretation)

From **`connectivity-status`** you expect meaningful **bootstrap peer count**, non-empty discovery signals where the network allows, and **clearing** of connectivity warnings after healthy configuration—details in [live-connectivity-testing](./live-connectivity-testing.md) §6.

Stage D is where **two machines** (Mac + Windows) usually validate **real** Envoy workloads once A–C passed on each OS separately.

---

## What none of these stages prove

| Topic | Where it belongs |
|-------|------------------|
| Matrix / bond-scoped HTTPS signaling | [Phase 4G](./implementation-plan.md#phase-4g-optional-control-plane-signaling-hybrid), [architecture-hybrid-planes](./architecture-hybrid-planes.md) |
| EMP **`discovery.request`** / Agent Card semantics | Phase 4E, [implementation-plan](./implementation-plan.md) |
| Full **DCUtR** proof between two NAT’d laptops | Manual procedure [live-connectivity-testing](./live-connectivity-testing.md) §4 |
| Desktop UI / vault / task flows | §5–7 same doc |

---

## Related

- [Implementation plan](./implementation-plan.md)
- [Redesign strategy](./redesign-strategy.md)
- [p2p-discovery](./p2p-discovery.md)
- [live-connectivity-testing](./live-connectivity-testing.md)
