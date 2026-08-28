# Add a new relay — step by step

Homes learn the fleet from **any** relay (`GET http://<relay>:15432/relay-roster.json`).  
After join, a new relay **publishes** an updated roster to the others (same join token). Existing relays **do not restart** — they apply newer `issuedAt` on PUT and also pull periodically until everyone matches.

Do these steps in order. Skip the “one-time” section if CN/US already serve a roster and accept joins.

---

## One-time setup (only once on CN and US)

### 1. Path C sync build

Relays must serve:

- `GET /relay-roster.json` (homes + peer pull)
- `PUT /relay-roster.json` (join-token auth; write only if `issuedAt` is newer)

```bash
cd /home/admin/mygithub/EnvoyMesh   # or your checkout path
git pull
npm install
npm run relay:build
```

### 2. systemd units (relay + liveness watchdog)

Use a **live** roster under `/var/lib/…` (not the git file). Seed once with `cp -n`.  
If `User=` is non-root, **every** `ExecStartPre` that touches `/var/lib` needs a leading `+` (run as root). Without `+`, `mkdir` fails and the unit crash-loops.

#### `/etc/systemd/system/envoymesh-relay.service`

Adjust `--advertise` IP / paths / Node PATH per host. **Do not commit real admin passwords or join tokens.**

```ini
[Unit]
Description=EnvoyMesh Relay Server
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
Environment=ENVOYMESH_RELAY_PUBLIC_MODE=1
ExecStart=/bin/bash /home/admin/mygithub/EnvoyMesh/scripts/run-relay.sh --advertise 47.251.91.97 --public-mode
WorkingDirectory=/home/admin/mygithub/EnvoyMesh
# "+" = root despite User=admin (required for /var/lib)
ExecStartPre=+/bin/mkdir -p /var/lib/envoymesh-relay
ExecStartPre=+/bin/cp -n /home/admin/mygithub/EnvoyMesh/relay-roster.json /var/lib/envoymesh-relay/relay-roster.json
ExecStartPre=+/bin/chown -R admin:admin /var/lib/envoymesh-relay
Environment=ENVOYMESH_RELAY_ROSTER_PATH=/var/lib/envoymesh-relay/relay-roster.json
Restart=always
RestartSec=5
User=admin
Environment=NODE_OPTIONS=--experimental-global-customevent
Environment=DEBUG=libp2p:circuit-relay*,libp2p:connection-manager,libp2p:transport*
Environment=PATH=/home/admin/.nvm/versions/node/v24.11.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=ENVOYMESH_RELAY_ADMIN_USER=admin
Environment=ENVOYMESH_RELAY_ADMIN_PASSWORD=change-me-before-public
Environment=ENVOYMESH_RELAY_JOIN_TOKEN=pick-a-long-secret-at-least-8-chars

[Install]
WantedBy=multi-user.target
```

CN host: same unit with `--advertise 47.93.11.212` (or your CN public IP). Same join token on both.

#### `/etc/systemd/system/envoymesh-relay-liveness.service`

Sibling HTTP watchdog — kills a wedged relay MainPID when `GET /health` stops answering; systemd `Restart=always` brings it back. Use `Wants=` (not `Requires=`) so the watchdog stays up across relay restarts. Same `User=` as the relay.

```ini
[Unit]
Description=EnvoyMesh Relay HTTP liveness watchdog
After=envoymesh-relay.service
Wants=envoymesh-relay.service

[Service]
Type=simple
ExecStart=/home/admin/mygithub/EnvoyMesh/scripts/http-liveness-watch.sh --url http://127.0.0.1:15432/health --systemctl envoymesh-relay
WorkingDirectory=/home/admin/mygithub/EnvoyMesh
Restart=always
RestartSec=5
User=admin

[Install]
WantedBy=multi-user.target
```

Repo seed file (CN + US hubs): [`relay-roster.json`](../relay-roster.json) at the checkout root.

Apply on each host:

```bash
chmod +x /home/admin/mygithub/EnvoyMesh/scripts/http-liveness-watch.sh
sudo systemctl daemon-reload
sudo systemctl reset-failed envoymesh-relay   # if it previously crash-looped
sudo systemctl enable --now envoymesh-relay
sudo systemctl enable --now envoymesh-relay-liveness
sudo systemctl status envoymesh-relay envoymesh-relay-liveness
```

More watchdog detail: [relay_server_deployment.md](./relay_server_deployment.md) §4.

### 3. Verify roster + health

```bash
curl -sf http://127.0.0.1:15432/relay-roster.json | head
curl -sf http://127.0.0.1:15432/health
```

Open TCP **4001** and **15432** on each public IP (15432 is required for homes/peers to fetch the roster, not only for Admin).

The relay also seeds automatically if the live path is missing (`ENVOYMESH_RELAY_ROSTER_SEED` or `$WorkingDirectory/relay-roster.json`) — still never overwrites an existing live file.

### 4. Homes (once)

Ship a Path C DMG/EXE once (bundles seed + poller). Usually nothing to configure. Opt out:

```json
{ "relayRosterEnabled": false }
```

---

## Every time you add a new relay

### 5. Start only the new relay

Same join token as CN/US. Own profile (new peer id). Public advertise + HTTP port.

**systemd** (recommended): copy the unit above, change `--advertise`, use a **new** profile if you override `--profile`, keep the same token and roster Pre lines.

**Or foreground:**

```bash
export ENVOYMESH_RELAY_JOIN_TOKEN='same-secret-as-cn-and-us'
export ENVOYMESH_RELAY_ROSTER_ID='eu-relay'          # optional
export ENVOYMESH_RELAY_ROSTER_REGION='eu'            # optional

./scripts/run-relay.sh \
  --profile ./data/relay-NEWNAME \
  --port 4001 \
  --advertise YOUR_PUBLIC_IP_OR_DNS \
  --http-port 15432 \
  --public-mode
```

Also set `ENVOYMESH_RELAY_ROSTER_PATH` (or rely on auto-seed into the profile dir).

### 6. Confirm join + roster publish

New relay log:

```text
Community join accepted
[relay-roster-sync] published fleet=... pushOk=...
```

On an **existing** relay (**no** restart):

```bash
curl -sf http://127.0.0.1:15432/relay-roster.json
# expect new id / IP / peer id; same issuedAt across fleet after sync
```

If a peer was offline during publish, it catches up on pull (~15 min) or fanout.

### 7. Homes

Wait for the next home poll (~20 min), or restart one home to test:

```text
[relay-roster] applied fleet=... via=http://...:15432/relay-roster.json
```

No new DMG. No manual roster copy onto CN/US for each add.

---

## Quick checklist

| Step | Done? |
|------|--------|
| 1–3. Path C build + systemd (`ExecStartPre=+…`) + curl roster on CN + US | |
| Same `ENVOYMESH_RELAY_JOIN_TOKEN` on all fleet relays | |
| 5. New relay up with advertise + token | |
| 6. Join + published; peers show new entry | |
| 7. Home log: roster applied | |

---

## If something fails

| Problem | Fix |
|---------|-----|
| `ExecStartPre=/bin/mkdir … status=1` | Add leading `+` on Pre lines; `User=` cannot mkdir under `/var/lib` |
| `Start request repeated too quickly` | `sudo systemctl reset-failed envoymesh-relay` then start again |
| Join rejected | Same `ENVOYMESH_RELAY_JOIN_TOKEN` (≥ 8 chars) on CN, US, and new relay |
| `PUT` 401 / pushFail | Token missing on receivers; or old build without Path C PUT |
| Publish skipped | Need public `--advertise` multiaddrs; unset `ENVOYMESH_RELAY_ROSTER_PUBLISH=0` |
| Peer still old roster | `:15432` reachable between relays; wait for pull |
| Home never updates | Home build predates Path C; or no reachable relay HTTP |
| Pointed `ENVOYMESH_RELAY_ROSTER_PATH` at git tree | Don’t — use `/var/lib/…`; `git pull` can overwrite a live fleet file |

Disable auto-publish only if needed:

```bash
Environment=ENVOYMESH_RELAY_ROSTER_PUBLISH=0
```

---

## One home only (no fleet)

1. Start relay (step 5).
2. Social → **Settings → Network → Add relay**.

---

## Design detail

See [dynamic-relay-roster.md](./dynamic-relay-roster.md) · [operator-relay-fleet.md](./operator-relay-fleet.md) §7.
