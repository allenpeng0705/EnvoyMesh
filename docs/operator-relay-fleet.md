# Operator bootstrap and relay fleet defaults

This document is the **product-facing baseline** for WAN connectivity defaults: which bootstrap **presets** ship in the node, what the **EnvoyMesh community relay** is, how **org-owned** bootstraps and relays fit, and how **key / multiaddr rotation** should be handled. Implementation sources: `packages/api/src/default-bootstrap.ts`, `apps/node/src/bootstrap-resolver.ts` (`KNOWN_PRESETS`), `apps/node/src/args.ts`.

**Adding a new relay?** Start here → **[add-relay-runbook.md](./add-relay-runbook.md)** (community gated join + Path C roster sync, or org mutual-bootstrap).

**Related:** [Relay server design](./relay-server-design.md) · [Dynamic relay roster (46E)](./dynamic-relay-roster.md) · [Community relay join (46D)](./community-relay-join.md) · [Layered relay network (long-term graph)](./layered-relay-network.md) · [P2P discovery](./p2p-discovery.md) · [Live connectivity testing](./live-connectivity-testing.md) · [Implementation plan Phase 46](./implementation-plan.md#phase-46--multi-relay-fleet-coordination) · [Implementation plan Phase 4 WAN](./implementation-plan.md#phase-4-wan-follow-on-rendezvous-relay-and-nat-traversal)

---

## 1. Shipped bootstrap presets (`wan-default`)

When the node uses **`discoveryProfile: wan-default`** and no explicit `--bootstrap` peers are given, the CLI default expands to **five preset identifiers** (see `DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS`):

| Preset id | Resolves to | Role |
|-----------|-------------|------|
| `public-libp2p` | Several **`/dnsaddr/bootstrap.libp2p.io/p2p/...`** peers | Public libp2p project bootstraps (**community**, not under EnvoyMesh control). |
| `public-libp2p-am6` | AM6 libp2p bootstrap | Regional variant; useful when one global DNS path is flaky. |
| `public-libp2p-am7` | AM7 libp2p bootstrap | Same intent as `am6`. |
| `cn-relay` | Asia EnvoyMesh community relay (`DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR`) | First-class bootstrap + circuit hop. |
| `us-relay` | US EnvoyMesh community relay (`DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR`) | Second community hop (Phase 46 multi-home). |

**CLI:** `--bootstrap-preset <name>` (repeatable). **Invalid preset names** are rejected at parse time.

**Important:** Public libp2p bootstrap nodes are **best-effort coordination points**, not a guarantee of any particular protocol or retention policy. For production deployments, plan **at least one org-controlled bootstrap or relay** (§4).

---

## 2. EnvoyMesh community relays (`cn-relay` + `us-relay`)

Presets expand to full dialable multiaddrs in `default-bootstrap.ts`. Each is a **full EnvoyMesh relay hop**, not discovery-only:

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
- Example YAML: [`bootstrap-presets.example.yaml`](../bootstrap-presets.example.yaml) (`org-fleet` preset).
- Design: [relay-server-design.md](./relay-server-design.md) Part B.
- **Adding relay #2+:** follow [§8](#8-adding-a-second-or-nth-relay) (do not only update systemd on one host).

### Multi-relay fleet tests (Phase 46)

| Suite | When | How |
|-------|------|-----|
| In-process | Always under `RUN_E2E=1` / orchestrator `e2e-fast` | `multi-relay-fleet-e2e.test.ts` |
| Process spawn | Always under `RUN_E2E=1` | `npm run test:e2e:relay:process` — two real `apps/relay` children |
| Live WAN | Gated | `TEST_RELAY_A` + `TEST_RELAY_B` (distinct, mutually bootstrapped) → `npm run test:e2e:relay:live` or `./scripts/multi-relay-fleet-live-signoff.sh` |

Do **not** set both live vars to the same community `cn-relay` — one peer cannot prove miss-forward.

**Governed relay roster** (Phase **46E**, shipped — Path C): fleet `relay-roster.json` served from **every** relay HTTP port; homes poll any known relay; new relays publish after join so the fleet converges. Fleet may be 10+; each home still activates ≤ ~4 hops. Design: [dynamic-relay-roster.md](./dynamic-relay-roster.md). Ops steps: [add-relay-runbook.md](./add-relay-runbook.md).

---

## 5. Minimal operator checklist

- [ ] At least one **dialable** relay with **`--advertise-addr`** (auto public-mode) and a current `apps/relay` build for each region that must support **NAT ↔ NAT**.
- [ ] Clients use **`--discovery-profile wan-default`**, **`--relay`**, and the **`cn-relay`** (or org multi-relay) bootstrap preset to reach that fleet (cap ~4 EnvoyMesh targets).
- [ ] If running **2+ relays**, complete [§8](#8-adding-a-second-or-nth-relay) (mutual `--bootstrap` + client preset) before relying on miss-forward.
- [ ] Confirm **circuit reservation** on a home node (`Settings → Network` → reserved) before minting WAN invites.
- [ ] Run **`connectivity-status`** after deploy; confirm bootstrap probes and `relay.checkin.ok` / `relay.lookup.ok` in audit when validating a release.
- [ ] Admin UI / `/reservations` shows non-zero count when clients are connected (see §7).
- [ ] Dual-relay deploy: run live miss-forward signoff (`npm run test:e2e:relay:live`) once.

---

## 6. Fleet map (current code defaults)

This table mirrors **`KNOWN_PRESETS`** expansion in `bootstrap-resolver.ts` at the time this doc was written; if presets drift, **code wins** until this file is updated.

| Preset | Expanded peers (summary) |
|--------|--------------------------|
| `public-libp2p` | 4× `bootstrap.libp2p.io` dnsaddr peers |
| `public-libp2p-am6` | AM6 dnsaddr peer |
| `public-libp2p-am7` | AM7 dnsaddr peer |
| `cn-relay` | Asia TCP multiaddr: `DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR` |
| `us-relay` | US TCP multiaddr: `DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR` |

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
WorkingDirectory=/opt/EnvoyMesh
# Seed live roster once from the checkout; -n never overwrites after fleet sync.
ExecStartPre=/bin/mkdir -p /var/lib/envoymesh-relay
ExecStartPre=/bin/cp -n /opt/EnvoyMesh/relay-roster.json /var/lib/envoymesh-relay/relay-roster.json
ExecStart=/opt/EnvoyMesh/node /opt/EnvoyMesh/apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/47.93.11.212/tcp/4001 \
  --http-port 15432
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=10
User=admin
Environment=NODE_ENV=production
Environment=ENVOYMESH_RELAY_ADMIN_USER=admin
Environment=ENVOYMESH_RELAY_ADMIN_PASSWORD=change-me-before-public
Environment=ENVOYMESH_RELAY_JOIN_TOKEN=your-long-random-secret
Environment=ENVOYMESH_RELAY_ROSTER_PATH=/var/lib/envoymesh-relay/relay-roster.json
# Optional: Environment=ENVOYMESH_RELAY_ROSTER_SEED=/opt/EnvoyMesh/relay-roster.json

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
| Dual-relay miss-forward (fleet) | After [§8](#8-adding-a-second-or-nth-relay): `TEST_RELAY_A=… TEST_RELAY_B=… npm run test:e2e:relay:live` green |

**New region / second host:** follow [§8](#8-adding-a-second-or-nth-relay) (not only change `--advertise-addr`). Open TCP **4001** (+ **15432** only if Admin is exposed, preferably behind TLS). Ship both multiaddrs in an org bootstrap preset (see `org-fleet` in [`bootstrap-presets.example.yaml`](../bootstrap-presets.example.yaml)).

**Security:** put Caddy/nginx TLS in front of `:15432` for remote Admin access; change the default admin password; keep `Restart=always` so Admin UI **Hard restart** comes back.

### Discovery privacy note (`relay.lookup` by peer id)

Exact `targetPeerId` / `targetOwnerId` lookups are answered under `visibilityScope: "public"` when the peer checked in with a public advertisement **or** the `mesh.discovery` capability (which normal nodes always advertise). Tradeoff: anyone who already knows a peer id can learn whether that peer currently has a **live circuit hop** on this relay (lookup omits checkin-only peers with no reservation). Public lookups still omit `ownerId` for capability/public visibility.

---

## 8. Adding a second (or Nth) relay

**Preferred community path (join + auto roster publish, no DMG per relay):** see **[add-relay-runbook.md](./add-relay-runbook.md)**.

Use the steps below for **org mutual `--bootstrap`** detail, or private fleets that skip community join. Phase 46 miss-forward only works when relays **seed each other** (or learn via verified `relay.hints` — slower / less reliable for production cutover). Prefer **mutual `--bootstrap`** for private fleets.

### Prerequisites

- Relay A already running with public `--advertise-addr` and Basic Auth configured.
- New host B with TCP **4001** reachable from A and from clients (and from A↔B for forward dials).
- Current `npm run relay:build` on both hosts.

### Sequenced steps

1. **Start relay B** (no sibling seed yet) with its own profile dir and public advertise:

   ```bash
   ./scripts/run-relay.sh \
     --profile ./data/relay-b \
     --port 4001 \
     --advertise <B_PUBLIC_IP> \
     --http-port 15432 \
     --public-mode
   ```

2. **Read B’s dialable multiaddr** (Basic Auth required when admin creds are set — including defaults):

   ```bash
   curl -sf -u "$ENVOYMESH_RELAY_ADMIN_USER:$ENVOYMESH_RELAY_ADMIN_PASSWORD" \
     http://127.0.0.1:15432/info
   # Pick an addr with /ip4/<public>/ or /dns4/… and /p2p/<peerId>
   # → export RELAY_B=/ip4/<B_PUBLIC_IP>/tcp/4001/p2p/<B_PEER_ID>
   ```

3. **Read A’s multiaddr the same way** → `RELAY_A=…`.

4. **Mutual seed (required for reliable miss-forward):**
   - **Community CN + US fleet:** public-mode relays (`--advertise-addr` / `--relay-public-mode`) **auto-merge** both multiaddrs from `DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS` into `--bootstrap` (self skipped by peer id). After `git pull` + `npm run relay:build` + restart, look for `Community sibling fleet: merged` and `Seeded N sibling(s) into relay book from --bootstrap`. Opt out: `ENVOYMESH_RELAY_SKIP_COMMUNITY_SIBLINGS=1`.
   - **Org / private fleets:** still add explicit `--bootstrap $RELAY_B` (or `ENVOYMESH_BOOTSTRAP_PEERS`) on each host and **restart**.
   - Startup log should include `Seeded N sibling(s) into relay book from --bootstrap`.

   One-direction seed (only A→B) is enough for **A forwards to B**; bidirectional is required for **both** directions. The shipped community merge provides both directions once both hosts run a current public-mode build.

5. **Optional gossip path:** if you seed only A→B and later add C, C can appear via periodic `relay.hints` (~90s) after verify. For production cutovers, still add explicit `--bootstrap` rather than waiting on gossip. (Learning a third relay **only** via gossip is manual/deferred — no dedicated E2E.)

6. **Update clients** (cap ~4 EnvoyMesh targets):
   - Org YAML preset listing both addrs (see `org-fleet` in [`bootstrap-presets.example.yaml`](../bootstrap-presets.example.yaml)), **or**
   - Social **Settings → Network → configured relays** / `addRelay` for each, **or**
   - CLI `--bootstrap $RELAY_A --bootstrap $RELAY_B` / `ENVOYMESH_BOOTSTRAP_PEERS`.
   - Restart or re-apply node config so `collectRelayControlTargets` sees the full set.

7. **Verify single-relay health** on A and B (§7 table: public mode line, `/health`, reservations after a home connects).

8. **Prove miss-forward** (do **not** point both vars at the same `cn-relay`):

   ```bash
   TEST_RELAY_A="$RELAY_A" TEST_RELAY_B="$RELAY_B" npm run test:e2e:relay:live
   # or: ./scripts/multi-relay-fleet-live-signoff.sh "$RELAY_A" "$RELAY_B"
   ```

### Cutover / replace a relay

1. Stand up the replacement with a **new** profile only if you intend a new peer id (§3).
2. Mutual-bootstrap with remaining fleet members (§8 steps 2–4).
3. Ship updated preset to clients; drain old relay (stop advertising in presets) after clients reserve on the replacement.
4. Do not delete the old `libp2p-private.key` until bookmarks/presets no longer reference its peer id.

---

## 9. Gated join for community fleet expansion (Phase 46D)

When adding a relay to the **community preset fleet** (not just org mutual-bootstrap), use **`relay.join.request`** so only `cn-relay` / `us-relay` gatekeepers admit verified siblings. Full design: [community-relay-join.md](./community-relay-join.md). **End-to-end add-relay steps (join + roster):** [add-relay-runbook.md](./add-relay-runbook.md).

**Quick runbook:**

1. Generate a long random token shared by CN, US, and the new relay:
   ```bash
   export ENVOYMESH_RELAY_JOIN_TOKEN='…'   # ≥ 8 chars; same on all three hosts
   ```
2. Restart **both** preset relays with the token set (they reject joins if unset). **Once** this is live, later relays need no CN/US config change.
3. Start the new relay with `--advertise-addr`, public mode, and the same token — it auto-sends join on startup.
4. Confirm logs: `join.request accepted` on a preset; `Community join accepted` on the new relay.
5. **Client adoption (Phase 46E Path C):** after join, the new relay **publishes** an updated `relay-roster.json` to fleet peers (join-token PUT). Homes poll **any** relay’s `GET /relay-roster.json` and hot-reload — no CDN, no new DMG/EnvoyGo. Steps: [add-relay-runbook.md](./add-relay-runbook.md). Escape hatch: Settings → Add relay / org YAML.

**Private org relays** are unchanged: use mutual `--bootstrap` and `ENVOYMESH_RELAY_SKIP_COMMUNITY_SIBLINGS=1`; they do not participate in community gated join unless their peer ids are added to the shipped preset list (or org signed roster) in a release / feed.
