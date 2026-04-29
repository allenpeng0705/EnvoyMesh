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

Proves attachment to the overlay: **one** node process connects to configured bootstrap peers and observes **at least one discovered peer** via the discovery pipeline (not necessarily a full dial to that peer in this script).

```bash
npm run poc:discovery -w @envoymesh/node -- --mode advanced --bootstrap "<bootstrap-multiaddr>" --timeout-ms 60000
```

**Expected:**

```text
[advanced] success: advanced connectivity stack started and discovered at least one peer
```

Use a bootstrap multiaddr your operator trusts (project presets, public libp2p bootstrappers, or your VPS—document which you used).

---

## Stage C — Relay address observation

Confirms relay transport + observed relay addressing (still single-process smoke; not full two-WAN NAT proof):

```bash
npm run poc:discovery -w @envoymesh/node -- --mode advanced --bootstrap "<relay-capable-multiaddr>" --expect-relay-address --timeout-ms 90000
```

**Expected:** includes both advanced success lines from [live-connectivity-testing](./live-connectivity-testing.md) §3.

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
