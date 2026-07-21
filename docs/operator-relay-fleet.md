# Operator bootstrap and relay fleet defaults

This document is the **product-facing baseline** for WAN connectivity defaults: which bootstrap **presets** ship in the node, what the **EnvoyMesh community relay** is, how **org-owned** bootstraps and relays fit, and how **key / multiaddr rotation** should be handled. Implementation sources: `packages/api/src/default-bootstrap.ts`, `apps/node/src/bootstrap-resolver.ts` (`KNOWN_PRESETS`), `apps/node/src/args.ts`.

**Related:** [Relay server design](./relay-server-design.md) · [Layered relay network (long-term graph)](./layered-relay-network.md) · [P2P discovery](./p2p-discovery.md) · [Live connectivity testing](./live-connectivity-testing.md) · [Implementation plan Phase 46](./implementation-plan.md#phase-46--multi-relay-fleet-coordination) · [Implementation plan Phase 4 WAN](./implementation-plan.md#phase-4-wan-follow-on-rendezvous-relay-and-nat-traversal)

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

The **`cn-relay`** preset expands to `DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR` (see `default-bootstrap.ts`). It is a **full EnvoyMesh relay hop**, not discovery-only:

- **Dialable libp2p peer** for DHT/bootstrap alignment with other WAN-default nodes.
- **Circuit-relay-v2 server** so NAT clients can `addRelay` / reserve a slot and dial `/p2p-circuit/` paths (auto-bond, WAN join invites).
- **EnvoyMesh discovery** via `relay.checkin` / `relay.lookup` (topic roster) when the relay process is current.

**HTTP:** `DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT` (15432) exposes `/health`, Admin UI `/admin/`, and WebSocket client-proxy when `--http-port` is set.

**Operator requirement:** run the relay with a public `--advertise-addr` (auto-enables `--relay-public-mode`) and redeploy after pulling so client and server share the same `@libp2p/circuit-relay-v2` stack. See §7.

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

### Multi-relay client preset (Phase 46A)

Clients check in, look up, and **reserve** on a shared EnvoyMesh target set (cap ~4), not only the first bootstrap peer:

- Prefer **regional relay(s) + at least one shared hub** (community `cn-relay` or org hub) in the same preset / `configuredRelays` list.
- Relays that should miss-forward to each other must list each other in `--bootstrap` / `ENVOYMESH_BOOTSTRAP_PEERS` so the sibling book is seeded (Phase 46B/C).
- Design: [relay-server-design.md](./relay-server-design.md) Part B.

### Multi-relay fleet tests (Phase 46)

| Suite | When | How |
|-------|------|-----|
| In-process | Always under `RUN_E2E=1` / orchestrator `e2e-fast` | `multi-relay-fleet-e2e.test.ts` |
| Process spawn | Always under `RUN_E2E=1` | `npm run test:e2e:relay:process` — two real `apps/relay` children |
| Live WAN | Gated | `TEST_RELAY_A` + `TEST_RELAY_B` (distinct, mutually bootstrapped) → `npm run test:e2e:relay:live` or `./scripts/multi-relay-fleet-live-signoff.sh` |

Do **not** set both live vars to the same community `cn-relay` — one peer cannot prove miss-forward.

**Governed signed preset list** (future hardening): operators could publish a **signed JSON** list of allowed bootstrap peer ids; the node would verify signatures against configured trust anchors — **not shipped** as of this doc; track in implementation plan if product requires it.

---

## 5. Minimal operator checklist

- [ ] At least one **dialable** relay with **`--advertise-addr`** (auto public-mode) and a current `apps/relay` build for each region that must support **NAT ↔ NAT**.
- [ ] Clients use **`--discovery-profile wan-default`**, **`--relay`**, and the **`cn-relay`** (or org) bootstrap preset to reach that relay.
- [ ] Confirm **circuit reservation** on a home node (`Settings → Network` → reserved) before minting WAN invites.
- [ ] Run **`connectivity-status`** after deploy; confirm bootstrap probes and `relay.checkin.ok` / `relay.lookup.ok` in audit when validating a release.
- [ ] Admin UI / `/reservations` shows non-zero count when clients are connected (see §7).

---

## 6. Fleet map (current code defaults)

This table mirrors **`KNOWN_PRESETS`** expansion in `bootstrap-resolver.ts` at the time this doc was written; if presets drift, **code wins** until this file is updated.

| Preset | Expanded peers (summary) |
|--------|--------------------------|
| `public-libp2p` | 4× `bootstrap.libp2p.io` dnsaddr peers |
| `public-libp2p-am6` | AM6 dnsaddr peer |
| `public-libp2p-am7` | AM7 dnsaddr peer |
| `cn-relay` | One TCP multiaddr: `DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR` |

---

## 7. systemd unit + reservation verification (community / regional relays)

Every fleet relay uses the **same** `apps/relay` binary: discovery **and** circuit-relay-v2. Passing `--advertise-addr` auto-enables community public-mode presets (1024 reservations, 30 min TTL, …). Opt out with `--relay-private-mode` only for LAN/test.

### Example unit (`/etc/systemd/system/envoymesh-relay.service`)

Adjust paths, public IP, and admin password for each host:

```ini
[Unit]
Description=EnvoyMesh Relay Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/admin/mygithub/EnvoyMesh/node /home/admin/mygithub/EnvoyMesh/apps/relay/dist/index.js \
  --profile /home/admin/mygithub/EnvoyMesh/data/relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/47.93.11.212/tcp/4001 \
  --bootstrap /ip4/<sibling-public-ip>/tcp/4001/p2p/<sibling-peer-id> \
  --http-port 15432
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=10
User=admin
Environment=NODE_ENV=production
Environment=ENVOYMESH_RELAY_ADMIN_USER=admin
Environment=ENVOYMESH_RELAY_ADMIN_PASSWORD=change-me-before-public
# Optional explicit override (advertise-addr already implies public mode):
# Environment=ENVOYMESH_RELAY_PUBLIC_MODE=1

[Install]
WantedBy=multi-user.target
```

Deploy / refresh:

```bash
cd /home/admin/mygithub/EnvoyMesh
git pull
npm install
npm run relay:build
sudo systemctl daemon-reload
sudo systemctl restart envoymesh-relay
sudo journalctl -u envoymesh-relay -n 80 --no-pager
```

Startup must include a line like:

`[relay] circuit-relay-v2 server config: maxReservations=1024 … (public mode)`

If you still see “libp2p defaults (15 reservations…)”, the process is not seeing `--advertise-addr` / public mode — fix the unit and rebuild.

### Verification checklist

| Step | Expect |
|------|--------|
| `curl -u admin:… http://127.0.0.1:15432/health` | JSON status (not 401 for `/health`; auth unused on health) |
| Admin UI `http://<public-ip>:15432/admin/` | Status + peers + reservations + discovery roster / topicHashes after Basic Auth |
| `GET /admin/api/reservations` (authed) | `count` increases when a home node with `--relay` connects |
| `GET /admin/api/roster` (authed) | Entries include `topicHashes` and `hasHopSlot` for live circuit reservations |
| `GET /admin/api/metrics` or `/version` `live.metrics` | checkin/lookup counters; prefer peers with live hops |
| Home node Settings → Network | Circuit reservation chip = **reserved** |
| Mint WAN join invite | Succeeds without `relay≠RESERVED` hard-gate error |
| Auto-bond / chat over WAN | Dial uses `/p2p-circuit/` via this relay’s peer id |

**New region:** copy the unit, change `--advertise-addr` (or `/dns4/…`), open TCP 4001 (+ 15432 if you want Admin remotely behind TLS), ship the new multiaddr in an org bootstrap preset or update `DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR` when rotating the primary `cn-relay`.

**Security:** put Caddy/nginx TLS in front of `:15432` for remote Admin access; change the default admin password; keep `Restart=always` so Admin UI **Hard restart** comes back.

### Discovery privacy note (`relay.lookup` by peer id)

Exact `targetPeerId` / `targetOwnerId` lookups are answered under `visibilityScope: "public"` when the peer checked in with a public advertisement **or** the `mesh.discovery` capability (which normal nodes always advertise). Tradeoff: anyone who already knows a peer id can learn whether that peer currently has a **live circuit hop** on this relay (lookup omits checkin-only peers with no reservation). Public lookups still omit `ownerId` for capability/public visibility.
