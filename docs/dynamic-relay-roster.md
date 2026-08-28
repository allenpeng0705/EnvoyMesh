# Dynamic relay roster (Phase 46E)

**Status:** Shipped in-tree (Path C + fleet sync)  
**Day-to-day ops:** [add-relay-runbook.md](./add-relay-runbook.md)

**Goal:** Add relay #3…#N so **existing homes** (and EnvoyGo via home) adopt them **without** a new DMG/EXE/EnvoyGo, without editing every home, and without restarting CN/US for each new relay (after a one-time Path C deploy + join token).

**Related:** [community-relay-join.md](./community-relay-join.md) · [operator-relay-fleet.md](./operator-relay-fleet.md) §8–§9 · [relay-server-design.md](./relay-server-design.md) Part B · Phase 46 in [implementation-plan.md](./implementation-plan.md)

---

## 1. Product model: fleet of N, active set of K

| Layer | Typical size | Where | Purpose |
|-------|--------------|-------|---------|
| **Fleet roster** | 10+ | Same `relay-roster.json` on every relay + home cache | All known community/org relays |
| **Active control targets** | **K ≈ 4** | Per home (`collectRelayControlTargets` / `selectActiveRelayTargets`) | Checkin / lookup / circuit RESERVE |

```text
New relay joins (46D token) → merges self into roster → PUT to fleet
        │
Existing relays write file if issuedAt newer (no restart) + fanout + periodic pull
        │
Homes GET /relay-roster.json from ANY known relay → select ≤K → hot-reload
        │
EnvoyGo unchanged (home JSON-RPC)
```

---

## 2. Distribution (Path C) — no separate CDN required

| Source | Role |
|--------|------|
| **DMG/EXE seed** | `resources/node/relay-roster.json` (staged from repo-root [`relay-roster.json`](../relay-roster.json)) for first boot |
| **Any fleet relay** | Public `GET http://<host>:15432/relay-roster.json` |
| **Optional CDN** | Only if you set `relayRosterUrl` / `ENVOYMESH_RELAY_ROSTER_URL` explicitly |
| **Optional Ed25519 signature** | Still supported; **not required** when the URL is a known relay HTTP host (`:15432`) |

Homes poll **all** known relay HTTP endpoints (community defaults + configured + prior roster entries), not only CN/US.

---

## 3. Fleet sync (relays converge on one file)

| Mechanism | Behavior |
|-----------|----------|
| **Publish** | After gated join, new relay pulls newest roster, upserts itself, writes local file, **PUT**s to peers with join token |
| **Accept PUT** | Same `ENVOYMESH_RELAY_JOIN_TOKEN`; apply only if `issuedAt` is newer; no process restart |
| **Fanout** | Receivers re-PUT to other fleet URLs (bounded sync depth) |
| **Pull** | Relays periodically GET peers and adopt newer `issuedAt` (~15 min) |

Auth header: `X-Envoy-Relay-Join-Token` or `Authorization: Bearer <token>`.

Disable publish: `ENVOYMESH_RELAY_ROSTER_PUBLISH=0`.

Optional entry labels on the new relay: `ENVOYMESH_RELAY_ROSTER_ID`, `ENVOYMESH_RELAY_ROSTER_REGION`, `ENVOYMESH_RELAY_ROSTER_PRIORITY`.

**Honest one-time gate:** CN/US (and other existing relays) must run a build that serves Path C **GET + PUT + pull** once. After that, adding #N does not require restarting them or hand-copying the file.

Preset gatekeepers (CN/US) skip outbound join; they **receive** PUTs and pull — they do not self-publish via the join hook.

---

## 4. Document shape

```json
{
  "v": 1,
  "issuedAt": "2026-08-28T06:00:00.000Z",
  "expiresAt": "2027-08-28T06:00:00.000Z",
  "fleetId": "envoymesh-community",
  "maxActiveTargets": 4,
  "relays": [
    {
      "id": "cn-relay",
      "peerId": "12D3KooW…",
      "multiaddrs": ["/ip4/…/tcp/4001/p2p/12D3KooW…"],
      "region": "asia",
      "role": "hub",
      "priority": 100,
      "enabled": true
    }
  ]
}
```

`signature` is optional. Upsert/publish drops an old signature when content changes (Path C trusts join-token write + known-host read).

Example seed (CN + US): repo-root [`relay-roster.json`](../relay-roster.json) (same content as [docs/examples/relay-roster.example.json](./examples/relay-roster.example.json)). Optional sign: `scripts/sign-relay-roster.sh`.

---

## 5. Trust sources (home active set)

| Source | Into roster? | Into active K? |
|--------|--------------|----------------|
| Bundled / community CN+US | Yes | Yes (hubs preferred) |
| `GET` from known relay `:15432` | Yes | After select |
| Preset-vouched `relay.hints` | Candidates | If under K |
| Leaf / non-preset gossip | No | Never |
| Settings → Add relay | Yes | Yes |

---

## 6. Steady-state ops

| Step | Who | Restart CN/US? | New DMG? |
|------|-----|----------------|----------|
| Deploy #N + same join token | Ops | No | No |
| Join + auto roster publish | Automatic | No | No |
| Fleet file converges | Automatic | No | No |
| Homes poll + hot-reload | Automatic | No | No |

Day-to-day steps: **[add-relay-runbook.md](./add-relay-runbook.md)**.

---

## 7. Implementation map

| Piece | Path |
|-------|------|
| Schema / select / URL helpers / upsert | `packages/api/src/relay-roster.ts` |
| Home poll / cache / seed | `apps/node/src/relay-roster-feed.ts` |
| Hot-reload targets | `apps/node/src/relay-targets-reload.ts` |
| Preset-vouched hints | `apps/node/src/relay-hint-promote.ts` |
| Relay GET/PUT file | `apps/relay/src/relay-roster-http.ts` |
| Publish / fanout / pull | `apps/relay/src/relay-roster-sync.ts` |
| Join → publish hook | `apps/relay/src/community-relay-join.ts` + `index.ts` |
| DMG/EXE seed stage | `scripts/stage-bundle-node-runtime.sh` / `.ps1` |

### Checklist

- `[x]` **46E.1** Hot-reload on add/remove/update relay config
- `[x]` **46E.2** Roster poll + cache + N→K select (any fleet relay; optional CDN/signature)
- `[x]` **46E.3** Preset-vouched hint promote
- `[x]` **46E.4** Path C defaults: feed on without trust keys; DMG seed; poll community HTTP
- `[x]` **46E.5** Fleet sync: join-token PUT, publish after join, fanout, pull-adopt
- `[x]` Unit tests: select/verify/upsert, hint promote, hot-reload, roster HTTP put/publish

### Known gaps

- `preferredRegion` supported in selector; not yet wired from home `node-config`
- Cleartext HTTP on `:15432` — put TLS in front for hostile networks; write path still join-token gated

---

## 8. Out of scope

- Replacing gated join (46D) — join = sibling book; roster = home fleet list
- Hierarchical multi-hop join/summary ([layered-relay-network.md](./layered-relay-network.md))
- EnvoyGo UI for relay lists
