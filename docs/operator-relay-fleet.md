# Operator bootstrap and relay fleet defaults

This document is the **product-facing baseline** for WAN connectivity defaults: which bootstrap **presets** ship in the node, what the **EnvoyMesh community relay** is, how **org-owned** bootstraps and relays fit, and how **key / multiaddr rotation** should be handled. Implementation sources: `packages/api/src/default-bootstrap.ts`, `apps/node/src/bootstrap-resolver.ts` (`KNOWN_PRESETS`), `apps/node/src/args.ts`.

**Related:** [Live connectivity testing](./live-connectivity-testing.md) · [P2P discovery](./p2p-discovery.md) · [Implementation plan § Phase 4 WAN follow-on](./implementation-plan.md#phase-4-wan-follow-on-rendezvous-relay-and-nat-traversal)

---

## 1. Shipped bootstrap presets (`wan-default`)

When the node uses **`discoveryProfile: wan-default`** and no explicit `--bootstrap` peers are given, the CLI default expands to **four preset identifiers** (see `DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS`):

| Preset id | Resolves to | Role |
|-----------|-------------|------|
| `public-libp2p` | Several **`/dnsaddr/bootstrap.libp2p.io/p2p/...`** peers | Public libp2p project bootstraps (**community**, not under EnvoyMesh control). |
| `public-libp2p-am6` | AM6 libp2p bootstrap | Regional variant; useful when one global DNS path is flaky. |
| `public-libp2p-am7` | AM7 libp2p bootstrap | Same intent as `am6`. |
| `cn-relay` | **EnvoyMesh community relay** TCP multiaddr (peer id fixed in repo; IP may rotate — see §3). | First-class bootstrap + relay hop for meshes that use the shared fleet. |

**CLI:** `--bootstrap-preset <name>` (repeatable). **Invalid preset names** are rejected at parse time.

**Important:** Public libp2p bootstrap nodes are **best-effort coordination points**, not a guarantee of any particular protocol or retention policy. For production deployments, plan **at least one org-controlled bootstrap or relay** (§4).

---

## 2. EnvoyMesh community relay (`cn-relay`)

The **`cn-relay`** preset expands to `DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR` (see `default-bootstrap.ts`). It serves as:

- A **dialable libp2p peer** for DHT/bootstrap alignment with other WAN-default nodes.
- A **relay-capable** participant when paired with `--relay` and proper **`relay.checkin` / `relay.lookup`** flows (see [live-connectivity-testing §4](./live-connectivity-testing.md#4-prove-envoymesh-relay-address-switching)).

**HTTP:** `DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT` documents an optional **WebSocket client-proxy** port on that host (when the relay process exposes it). This is **not required** for pure libp2p bootstrap.

---

## 3. Rotation and addressing expectations

| Concern | Expectation |
|---------|-------------|
| **Public libp2p DNS** | May change DNS layout or peer lists without notice. Clients rely on **dnsaddr** resolution at dial time. |
| **Community relay IP** | A bare `/ip4/.../tcp/.../p2p/...` can change if the VM or provider migrates. **Mitigation:** ship config updates in new releases, or use **`--bootstrap-presets-file`** (§4) with your own stable DNS **`/dns4/.../tcp/.../p2p/...`** once you operate a relay with a stable name. |
| **libp2p Peer ID** | Envoys keep a **stable** key under `<profileDir>/libp2p-private.key`; documented in [p2p-discovery](./p2p-discovery.md#stable-libp2p-peer-id). |
| **Relay `--advertise-addr`** | Any relay that serves **off-LAN** clients MUST publish **dialable** bases (public IP or DNS + port), not only VPC-private or loopback addresses, or `relay.lookup` circuit paths will not complete. See [p2p-discovery: relay dialable addresses](./p2p-discovery.md#relay-server-dialable-addresses-for-relaylookup-circuit-paths). |

**Key rotation (operator policy):**

1. Stand up a new relay with a **new** libp2p key **only** when you intend to break old bookmarks; peers must then refresh bootstrap lists.
2. Prefer **DNS + stable port** over raw IPs for anything you put in org presets.
3. Document a **maintenance window** for fleet-wide config refresh if you replace a well-known bootstrap.

---

## 4. Org-owned bootstraps and relays (recommended for production)

Goals: avoid **implicit** dependence on random community infrastructure; keep a **supported injection path** without a central account server.

**Mechanisms already in tree:**

1. **Explicit multiaddrs** — `--bootstrap /dns4/your-relay.example.com/tcp/4001/p2p/<id>` (repeatable) or `ENVOYMESH_BOOTSTRAP_PEERS`.
2. **Custom preset YAML** — `--bootstrap-presets-file <path>` (repeatable). Lets you define named presets that expand to your org’s multiaddrs (same mechanism operators use to namespace fleet-specific lists). Combine with **`wan-default`** and optional **`--connectivity-strict`** so startup fails fast when **your** bootstraps are unreachable.
3. **Persisted node config** — `bootstrapPresets` and discovery profile in `node-config` / Social settings flow (see `NodeConfig` in `@envoymesh/api`).

**“Two to three regions” narrative:** operate **one bootstrap/relay pair per region** (or overlapping roles on the same host), each with **public or DNS multiaddrs**, and ship them through **org YAML presets** or documented env vars. No separate global “registry” product is required for a minimal viable org fleet.

**Governed signed preset list** (future hardening): operators could publish a **signed JSON** list of allowed bootstrap peer ids; the node would verify signatures against configured trust anchors — **not shipped** as of this doc; track in implementation plan if product requires it.

---

## 5. Minimal operator checklist

- [ ] At least one **dialable** relay with **`--relay-server`** and **`--advertise-addr`** (or equivalent YAML/env) for each region that must support **NAT ↔ NAT** via `relay.lookup`.
- [ ] Clients use **`--discovery-profile wan-default`**, **`--relay`**, **`--bootstrap`** (or org preset file) to reach that relay.
- [ ] Run **`connectivity-status`** and **`relay-status`** (on relay) after deploy; confirm bootstrap probes succeed (see [live-connectivity-testing](./live-connectivity-testing.md)).
- [ ] Capture **audit `p2p.trace`** lines for `relay.checkin.ok`, `relay.lookup.ok`, and optional `relay lookup candidate dial ok` when validating a release.

---

## 6. Fleet map (current code defaults)

This table mirrors **`KNOWN_PRESETS`** expansion in `bootstrap-resolver.ts` at the time this doc was written; if presets drift, **code wins** until this file is updated.

| Preset | Expanded peers (summary) |
|--------|--------------------------|
| `public-libp2p` | 4× `bootstrap.libp2p.io` dnsaddr peers |
| `public-libp2p-am6` | AM6 dnsaddr peer |
| `public-libp2p-am7` | AM7 dnsaddr peer |
| `cn-relay` | One TCP multiaddr: `DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR` |
