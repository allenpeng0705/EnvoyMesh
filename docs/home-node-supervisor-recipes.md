# Home Node Supervisor Recipes (24×7)

**Prefer the desktop Tauri app** for everyday home machines. Tauri’s guardian probes `GET /health`, kills a wedged child, and respawns (with backoff). A bare `tsx` / `npm run node:dev` terminal session does **not** survive overnight dial storms alone.

Use these recipes only when you need a **headless** home node (server, always-on Mac Mini without the UI, CI-like hosts).

Related: [relay-supervisor-recipes](./relay-supervisor-recipes.md) · [relay_server_deployment](./relay_server_deployment.md)

---

## What “healthy” means for EnvoyGo

| Probe | Meaning |
|-------|---------|
| `GET /health` | Process liveness — event loop answered. Supervisors kill on timeout. |
| `GET /readyz` | WAN ready — on `wan-default` / `quietWan` / `cgnat`, requires a **live circuit-relay reservation** (store ∩ open TCP to the hop). Returns **503** until reserved. |

`circuitPeers` in `[node-stats]` counts open `/p2p-circuit` connections (often hoppers dialing *you*). EnvoyGo reachability under CGNAT needs:

1. Live reservation on a public EnvoyMesh relay (community cn-relay or configured hop)
2. `advCircuits>0` in checkin (`…/p2p-circuit/p2p/<self>`)

Watch logs for: `liveReservation=1 advCircuits≥1 dialQueue` low.

---

## Operational watchlist (what is automated vs still yours)

| Guidance | Status |
|----------|--------|
| Don’t leave bare `tsx` overnight **without watchdog** | **Automated for kill:** sibling `/health` watchdog is on by default. Still **not** a full 24×7 story — kill ≠ respawn. Use Tauri, `npm run node:supervised:4030`, or launchd/systemd. |
| On CGNAT prefer `quietWan` until reachable | **Mostly automated:** CGNAT detection can auto-apply `quietWan`. Prefer watching **`liveReservation=1` / `advCircuits≥1`**, not `circuitPeers>0` (that counts hoppers dialing you). |
| Watch `[node-stats]` `dialQueue` / peers / RSS | **Still useful.** Prune starts at `dialQueue>20`; bootstrap reprobe defers at `>50`; stats warn at `>50`. If `dialQueue` stays high, storm mitigations are losing. |

---

## Built-in CLI protections

When you run `npm run node:dev` / `node:dev:4030`:

1. **Sibling `/health` watchdog** (on by default) — separate process; 3 timeouts after 90s grace → `SIGKILL`. Disable: `ENVOYMESH_LIVENESS_WATCHDOG=0`.
2. **`ENVOYMESH_GUARDIAN_EXIT_ON_LAG=1`** — auto-set when the liveness watchdog is enabled, so sustained event-loop lag exits for an outer supervisor.
3. Dial-storm guards (bootstrap hoppability cap, skip self/circuit probes, prune when `dialQueue` high).

These **kill** a wedge; they do **not** respawn. Pair with launchd / systemd / `scripts/supervise-home-node.sh`.

---

## Quick path: restart loop

```bash
chmod +x scripts/supervise-home-node.sh
./scripts/supervise-home-node.sh
# or default Social WS 3030:
HOME_NODE_NPM_SCRIPT=node:dev ./scripts/supervise-home-node.sh --profile ./apps/node/data/default
```

Optional external probe (same idea as Tauri, useful under systemd):

```bash
scripts/http-liveness-watch.sh \
  --url http://127.0.0.1:4030/health \
  --pid-file /path/to/home.pid
```

---

## macOS launchd

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.envoymesh.home</string>
  <key>WorkingDirectory</key>
  <string>/Users/YOU/Documents/mygithub/EnvoyMesh</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ENVOYMESH_GUARDIAN_EXIT_ON_LAG</key>
    <string>1</string>
    <key>ENVOYMESH_SOCIAL_WS_PORT</key>
    <string>4030</string>
    <key>ENVOYMESH_BRIDGE_PORT</key>
    <string>4031</string>
    <key>ENVOYMESH_TERMINAL_WS_PORT</key>
    <string>4032</string>
    <key>ENVOYMESH_GATEWAY_PORT</key>
    <string>19889</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npm</string>
    <string>run</string>
    <string>node:dev</string>
    <string>--</string>
    <string>--profile</string>
    <string>./apps/node/data/default</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/YOU/Library/Logs/envoymesh-home.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOU/Library/Logs/envoymesh-home.err</string>
</dict>
</plist>
```

Load: `launchctl load ~/Library/LaunchAgents/com.envoymesh.home.plist`

---

## Linux systemd

```ini
[Unit]
Description=EnvoyMesh Home Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/envoymesh
Environment=ENVOYMESH_GUARDIAN_EXIT_ON_LAG=1
Environment=ENVOYMESH_SOCIAL_WS_PORT=4030
Environment=ENVOYMESH_BRIDGE_PORT=4031
Environment=ENVOYMESH_TERMINAL_WS_PORT=4032
Environment=ENVOYMESH_GATEWAY_PORT=19889
ExecStart=/usr/bin/npm run node:dev -- --profile ./apps/node/data/default
Restart=always
RestartSec=3
KillMode=control-group

[Install]
WantedBy=multi-user.target
```

Optional companion unit for wedges that never exit:

```bash
scripts/http-liveness-watch.sh --url http://127.0.0.1:4030/health --systemctl envoymesh-home
```

---

## Verify

```bash
curl -sS http://127.0.0.1:4030/health
curl -sS http://127.0.0.1:4030/readyz   # 503 until live reservation on WAN profiles
# logs should show liveReservation=1 advCircuits≥1 after warmup
```
