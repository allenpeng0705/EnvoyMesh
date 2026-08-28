# Add a new relay — step by step

Homes learn the fleet from **any** relay (`GET http://<relay>:15432/relay-roster.json`).  
After join, a new relay **publishes** an updated roster to the others (same join token). Existing relays **do not restart** — they apply newer `issuedAt` on PUT and also pull periodically until everyone matches.

Do these steps in order. Skip the “one-time” section if you already did it.

---

## One-time setup (only once)

### 1. Deploy Path C sync build on CN and US

Existing relays need a build that serves:

- `GET /relay-roster.json` (homes + peer pull)
- `PUT /relay-roster.json` (join-token auth, write if newer)

Upgrade/redeploy **cn-relay** and **us-relay** once with that build. Later adds do **not** require restarting them.

### 2. Same join token on CN and US

```bash
ENVOYMESH_RELAY_JOIN_TOKEN=pick-a-long-secret-at-least-8-chars
sudo systemctl restart envoymesh-relay
```

Use the **same** token on every new relay later.

### 3. Seed roster on CN and US (automatic)

**Preferred (systemd):** keep the live file under `/var/lib/…` and seed it **once** from the checkout. `cp -n` does not overwrite after fleet sync has updated the file.

```ini
# In /etc/systemd/system/envoymesh-relay.service
WorkingDirectory=/opt/EnvoyMesh
ExecStartPre=/bin/mkdir -p /var/lib/envoymesh-relay
ExecStartPre=/bin/cp -n /opt/EnvoyMesh/relay-roster.json /var/lib/envoymesh-relay/relay-roster.json
Environment=ENVOYMESH_RELAY_ROSTER_PATH=/var/lib/envoymesh-relay/relay-roster.json
Environment=ENVOYMESH_RELAY_JOIN_TOKEN=your-long-random-secret
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart envoymesh-relay
```

**Also automatic in the relay binary:** if the live path is missing, it copies once from `ENVOYMESH_RELAY_ROSTER_SEED` or `$WorkingDirectory/relay-roster.json` (never overwrites an existing file).

Manual one-shot (if you are not using systemd Pre):

```bash
sudo mkdir -p /var/lib/envoymesh-relay
sudo cp -n /opt/EnvoyMesh/relay-roster.json /var/lib/envoymesh-relay/relay-roster.json
```

Check:

```bash
curl -sf http://127.0.0.1:15432/relay-roster.json | head
```

Open TCP **15432** (and **4001**) on relays homes or peers must reach.

### 4. Homes

Ship a Path C DMG/EXE once (includes seed `resources/node/relay-roster.json` + poller). Usually nothing to configure. Opt out:

```json
{ "relayRosterEnabled": false }
```

---

## Every time you add a new relay

### 5. Start only the new relay

```bash
export ENVOYMESH_RELAY_JOIN_TOKEN='same-secret-as-cn-and-us'
# optional labels for the roster entry:
export ENVOYMESH_RELAY_ROSTER_ID='eu-relay'
export ENVOYMESH_RELAY_ROSTER_REGION='eu'

./scripts/run-relay.sh \
  --profile ./data/relay-NEWNAME \
  --port 4001 \
  --advertise YOUR_PUBLIC_IP_OR_DNS \
  --http-port 15432 \
  --public-mode
```

Open TCP **4001** and **15432**.

### 6. Confirm join + roster publish

New relay log:

```text
Community join accepted
[relay-roster-sync] published fleet=... pushOk=...
```

On an **existing** relay (no restart):

```bash
curl -sf http://127.0.0.1:15432/relay-roster.json | grep -E 'eu-relay|YOUR_IP|12D3KooW'
```

All fleet relays should converge on the **same** newest `issuedAt`. If one was offline, it catches up on pull (~15 min) or fanout.

### 7. Homes

Wait for the next home poll (~20 min), or restart one home to test sooner:

```text
[relay-roster] applied fleet=... via=http://...:15432/relay-roster.json
```

No new DMG. No manual copy of roster onto CN/US for each add.

---

## Quick checklist

| Step | Done? |
|------|--------|
| 1. Path C sync build on CN + US (once) | |
| 2. Token on CN + US (once) | |
| 3. Seed `relay-roster.json` on CN + US (once) | |
| 5. New relay up with same token | |
| 6. Join + published; peers show new entry | |
| 7. Home log: roster applied | |

---

## If something fails

| Problem | Fix |
|---------|-----|
| Join rejected | Same `ENVOYMESH_RELAY_JOIN_TOKEN` everywhere |
| `PUT` → 401 / pushFail | Receivers missing token or not on Path C sync build |
| Publish skipped | Need public `--advertise` multiaddrs; unset `ENVOYMESH_RELAY_ROSTER_PUBLISH=0` |
| Peer still old roster | Wait for pull, or confirm `:15432` reachable between relays |
| Home never updates | Home build predates Path C; or no reachable relay HTTP |

Disable auto-publish only if needed:

```bash
export ENVOYMESH_RELAY_ROSTER_PUBLISH=0
```

---

## One home only (no fleet)

1. Start relay (step 5).
2. Social → **Settings → Network → Add relay**.

---

## Design detail

See [dynamic-relay-roster.md](./dynamic-relay-roster.md).
