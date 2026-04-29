# POC: Auto-discovery and P2P connectivity

This document defines the **minimum proof sequence** before investing in hybrid signaling (Matrix) or semantic discovery UX. Goal: show that EnvoyMesh nodes **discover peers** and **establish libp2p connectivity** (including signed ping) using the shipped stack.

**Full operator detail** (firewall tips, relay proofs, DCUtR notes) stays in [live-connectivity-testing](./live-connectivity-testing.md). **WAN architecture** (bootstrap vs relay vs NAT) is in [p2p-discovery](./p2p-discovery.md).

---

## What success looks like

| Stage | Proves | Artifact |
|-------|--------|----------|
| **A — LAN** | mDNS discovers another EnvoyMesh peer **on the same host** (two processes); EMP path works | Smoke script success line |
| **B — WAN overlay** | At least one bootstrap peer is reachable; DHT discovers another peer id | Smoke script success line |
| **C — Relay observation** | Node observes a `/p2p-circuit` address when relay stack is enabled | Smoke script success line |
| **D — Real Envoy** (optional) | Same behavior via full node + `wan-default` + bootstrap preset | `connectivity-status` + logs |

Stages **A→B** are the POC spine; **C→D** validate production-shaped configs.

---

## Prerequisites

- Repo installed: `npm install`, `npm run typecheck`.
- For LAN tests: VPN off where possible; multicast allowed for mDNS.
- For WAN tests: at least one **reachable libp2p bootstrap multiaddr** (public bootstrap fleet or your own VPS peer—see [p2p-discovery](./p2p-discovery.md)).

---

## Stage A — LAN discovery + signed ping

Runs **two** ephemeral peers **inside one Node process on one machine**; discovers via **mDNS**; exchanges a signed `system.ping`.

**Important:** This smoke script does **not** coordinate “half on Mac and half on Windows.” Run the command below **once on the Mac** *or* **once on the PC** — not split across machines. Cross-machine LAN discovery is a separate check (two full nodes or bootstrap-assisted flows — see Stage D / [live-connectivity-testing](./live-connectivity-testing.md)).

```bash
npm run poc:discovery -w @envoymesh/node -- --mode mdns --timeout-ms 20000
```

If npm reports **`Missing script: "poc:discovery"`**, your tree is older than the alias—either **`git pull`** and retry, or use the canonical script name:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode mdns --timeout-ms 20000
```

**Windows:** some npm versions collapse `--mode` / `--timeout-ms` into positional args (`tsx ... mdns 20000`). The smoke script accepts that shorthand after our fix—rerun the same command—or avoid npm argument forwarding entirely:

```bash
npm run poc:discovery:mdns -w @envoymesh/node
```

Or run the smoke entry directly from `apps/node` (no workspace script needed):

```bash
cd apps/node
npx tsx src/connectivity-smoke.ts --mode mdns --timeout-ms 20000
```

**Expected:**

```text
[mdns] success: both local nodes discovered each other and exchanged a signed ping
```

If this fails, fix LAN/multicast before debugging WAN.

### Troubleshooting Stage A (same machine still failing)

Work through these **on each OS separately** (Mac-only run, then Windows-only run):

1. **VPN off** — Corporate VPNs and many mesh VPNs break or swallow multicast DNS on the LAN interface.
2. **Firewall** — Allow **Node.js** (or `tsx`) on **Private networks** on Windows; on macOS allow incoming for the terminal/app if prompted. mDNS uses **UDP port 5353** multicast (`224.0.0.251`).
3. **Timeout** — Increase `--timeout-ms` (for example `45000`) if discovery is slow on first browse.
4. **Wi‑Fi isolation** — Guest Wi‑Fi / AP isolation blocks peer ↔ peer discovery; use the main LAN or ethernet.
5. **Machine sleep / Hyper‑V/WSL** — Run native Node on the host OS; VMs often need bridged networking for multicast.

If Stage A passes on Mac but never on Windows (same LAN expectations later), ensure Windows has working multicast DNS for Node (Bonjour Print Services / OS support varies); failing that, rely on **Stage B** with a bootstrap peer rather than LAN-only discovery.

---

## Stage B — Bootstrap + DHT peer discovery

### What this proves

**One** Node process starts EnvoyMesh with the **WAN-style stack** (DHT client mode, relay transport, AutoNAT, DCUtR — same as `runAdvancedConnectivitySmoke` in `connectivity-smoke.ts`). It dials at least one **bootstrap** peer, joins ongoing overlay activity, and your node reports **`peer:discovery`** with **at least one remote peer id**.

This does **not** guarantee a stable dial to a specific friend; it proves **cold-start overlay attachment**. For production you still maintain your own bootstrap/relay fleet — see [p2p-discovery](./p2p-discovery.md).

### Prerequisites

1. **Outbound internet** allowed from the machine (no proxy blocking arbitrary TCP to bootstrap hosts unless you configure one).
2. **Firewall** allows Node/`tsx` outbound (Windows: Private network profile is usually enough).
3. **VPN off** if it breaks UDP/DHT path to public bootstrappers (same guidance as Stage A when possible).

### Bootstrap multiaddr

You must pass a full libp2p **multiaddr** that includes `/p2p/<PeerId>`.

The EnvoyMesh node preset **`public-libp2p`** uses the same pool as `publicLibp2pBootstrapPeers()` in [`apps/node/src/args.ts`](../apps/node/src/args.ts). **Example** (first entry from that preset — usable for Stage B):

```text
/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN
```

You may repeat `--bootstrap` with additional peers from that list if one hostname is flaky.

### Commands

**Easiest (preset baked into npm — macOS, Linux, Windows):**

From repo root:

```bash
npm run poc:discovery:advanced-public -w @envoymesh/node
```

This runs Stage B against the multiaddr above with `--timeout-ms 60000`.

**Explicit bootstrap (same preset peer):**

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN" --timeout-ms 60000
```

**Windows:** If `--mode` / `--bootstrap` disappear again, run without npm mangling:

```powershell
cd apps\node
npx tsx src/connectivity-smoke.ts --mode advanced --bootstrap /dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN --timeout-ms 60000
```

Or use **`npm run poc:discovery:advanced-public -w @envoymesh/node`** after pulling (flags are fully inside the script).

**Your own VPS bootstrap:** replace the `--bootstrap` value with the multiaddr your operator published (must include `/p2p/<PeerId>`).

### Success criteria

Console prints lines similar to:

```text
[advanced] peer=<your-local-peer-id>
[advanced] enabled=...
[advanced] listening:
  ...
[advanced] discovered peer=<remote-peer-id> addrs=...
[advanced] success: advanced connectivity stack started and discovered at least one peer
```

If discovery never fires:

1. Increase `--timeout-ms` (for example `120000`).
2. Try another bootstrap from the same `public-libp2p` list in `args.ts`.
3. Confirm corporate firewall/DNS does not block `bootstrap.libp2p.io`.

---

## Stage C — Relay address observation

### What this proves

Same **advanced** stack as Stage B, plus **`--expect-relay-address`**: the smoke runner waits until your node advertises at least one **`/p2p-circuit`** multiaddr — meaning Circuit Relay v2 reservation succeeded via paths reachable from your bootstrap/DHT picture.

EnvoyMesh adds **`/p2p-circuit`** to libp2p **`addresses.listen`** whenever **`enableRelay`** is true so reservations can appear in **`getMultiaddrs()`** (relay transport alone only enables *dialing* through relays).

This confirms **relay-aware addressing**, not full **two-NAT hole punching** between two EnvoyMesh peers (that remains a manual two-machine check — see [live-connectivity-testing](./live-connectivity-testing.md) §4).

### Prerequisites

Everything from Stage B, plus patience: relay reservation can take longer than plain peer discovery — default timeout below is **90s**.

### Bootstrap peer

Stage C uses the **same example bootstrap** as Stage B (`public-libp2p` first entry). Public libp2p bootstrap nodes participate in relay topology so this usually works when outbound connectivity is healthy.

### Commands

**Easiest (flags baked into npm — macOS, Linux, Windows):**

From repo root:

```bash
npm run poc:discovery:relay-public -w @envoymesh/node
```

**Explicit (same bootstrap + `--expect-relay-address`):**

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN" --expect-relay-address --timeout-ms 90000
```

**Windows:** If npm strips flags again:

```powershell
cd apps\node
npx tsx src/connectivity-smoke.ts --mode advanced --bootstrap /dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN --expect-relay-address --timeout-ms 90000
```

**Your own relay-capable bootstrap:** replace `--bootstrap` with a multiaddr whose peer offers Circuit Relay v2 compatible with js-libp2p.

### Success criteria

You should see Stage B-style discovery logs, then **both**:

```text
[advanced] success: advanced connectivity stack started and discovered at least one peer
[advanced] success: relay address observed
```

Listening addresses printed earlier should include a **`/p2p-circuit/`** segment.

### If relay never appears

1. Increase `--timeout-ms` (for example `120000`).
2. Retry Stage B first — if B fails, C will not pass.
3. Try another bootstrap from [`publicLibp2pBootstrapPeers()`](../apps/node/src/args.ts) as a second `--bootstrap` (explicit command only).
4. Strict firewalls can block relay negotiation — try another network briefly to isolate policy.

---

## Stage D — Full node (optional)

Aligns POC with **real profiles**, seeds, and diagnostics:

1. Run two machines or profiles with `--discovery-profile wan-default`, bootstrap preset / `--bootstrap`, and optional `--connectivity-strict` if you require probe success at startup.
2. Inspect:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile ./data/primary
```

Commands and expectations match [live-connectivity-testing](./live-connectivity-testing.md) §6.

---

## Out of scope for this POC

- **Matrix / HTTPS signaling** — deferred until native WAN/bootstrap baseline is credible ([Phase 4G](./implementation-plan.md#phase-4g-optional-control-plane-signaling-hybrid)).
- **Semantic EMP discovery** (`discovery.request` / Agent Card flows) — distinct layer; assumes transport discovery already works.
- **Two-machine DCUtR proof** — track manually until a stable relay endpoint exists ([live-connectivity-testing](./live-connectivity-testing.md) §4).

---

## Related

- [Implementation plan](./implementation-plan.md) — prioritization and Phase 4 WAN items
- [Redesign strategy](./redesign-strategy.md) — native WAN before optional hybrid track
- [p2p-discovery](./p2p-discovery.md) — bootstrap, relay, NAT model
- [live-connectivity-testing](./live-connectivity-testing.md) — extended smoke procedures
