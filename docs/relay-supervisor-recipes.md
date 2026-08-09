# Relay Supervisor Recipes

**Full Linux + Windows deployment (systemd/NSSM, liveness watchdog, verification checklists):** see **[relay_server_deployment](./relay_server_deployment.md)**.

Relay nodes should run under an external supervisor. EnvoyMesh performs local health checks and bounded repairs, then exits non-zero only when the process should be restarted by the host.

**Event-loop lag:** a brief lag spike only marks the relay `degraded` (no libp2p recycle — that drops reservations and flaps clients). After **~90s of sustained lag** (3 health ticks), the process exits for the supervisor. Keep `Restart=always` / `KeepAlive` enabled.

**Alive-but-wedged:** exit-based supervisors alone are not enough. If the event loop is starved, the process stays running (ports LISTEN) and never exits. Pair `Restart=always` with an **external HTTP liveness probe**:

| Surface | Probe | Who kills/respawns |
|---------|-------|--------------------|
| Relay (`--http-port`) | `GET /health` | `scripts/http-liveness-watch.sh --systemctl …` (or `--pid`) |
| Home CLI | `GET http://127.0.0.1:3030/health` (or `:4030`) | same script + launchd/systemd |
| Desktop Tauri | `GET http://127.0.0.1:3030/health` | built into the Tauri guardian (3 fails → kill + respawn) |

**Headless home nodes** (CLI): set `ENVOYMESH_GUARDIAN_EXIT_ON_LAG=1`, wrap `node:dev` in launchd/systemd/`KeepAlive`, **and** run `scripts/http-liveness-watch.sh` against `/health`.

**Desktop Tauri:** sets `ENVOYMESH_GUARDIAN_EXIT_ON_LAG=1`, auto-respawns on `process.exit(2)`, **and** kills/respawns when `/health` times out while the child is still alive (max 3/hour, backoff). Intentional stops (quit, OTA, Social “Restart node”) suppress respawn.

The admin Web UI **Hard (process)** restart calls a graceful shutdown then `process.exit(0)`. That only comes back if the host restarts the process — use systemd `Restart=always`, Docker restart policies, or launchd `KeepAlive`. Soft restart from the UI only recycles libp2p and does not require a supervisor.

The relay health loop emits local audit traces:

- `relay.health.ok`
- `relay.health.warn`
- `relay.health.fail`
- `relay.health.repair`
- `relay.health.critical`

Inspect the latest health state with:

```bash
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay
```

## macOS launchd

Use `KeepAlive` so a critical relay exit restarts the process.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.envoymesh.relay</string>
  <key>WorkingDirectory</key>
  <string>/Users/YOU/Documents/mygithub/EnvoyMesh</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npm</string>
    <string>run</string>
    <string>node:dev</string>
    <string>--</string>
    <string>--profile</string>
    <string>./data/relay</string>
    <string>--discovery-profile</string>
    <string>wan-default</string>
    <string>--relay</string>
    <string>--relay-server</string>
    <string>--listen</string>
    <string>/ip4/0.0.0.0/tcp/64073</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

## Linux systemd

Use `Restart=always` and a short restart delay. Enable the HTTP admin/health port on the relay (`--http-port`, default **15432**) so an external probe can detect wedges. Full unit files + verification steps: [relay_server_deployment §4](./relay_server_deployment.md#4-linux-systemd--recommended-production-shape).

```ini
[Unit]
Description=EnvoyMesh Relay
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/envoymesh
ExecStart=/usr/bin/npm run node:dev -- --profile ./data/relay --discovery-profile wan-default --relay --relay-server --listen /ip4/0.0.0.0/tcp/64073 --http-port 15432
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Companion liveness unit (kills/restarts when `/health` stops answering — covers alive-but-wedged):

```ini
[Unit]
Description=EnvoyMesh Relay HTTP liveness watchdog
After=envoymesh-relay.service
Requires=envoymesh-relay.service

[Service]
# --systemctl kills MainPID (same User= as relay); systemd Restart=always respawns.
# Do not use --systemctl-restart unless this unit runs as root.
ExecStart=/opt/envoymesh/scripts/http-liveness-watch.sh --url http://127.0.0.1:15432/health --systemctl envoymesh-relay
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Windows

Use WinSW or NSSM for long-running relay nodes, plus `scripts/http-liveness-watch.ps1`. Full NSSM install + verification: [relay_server_deployment §5](./relay_server_deployment.md#5-windows--nssm-recommended--powershell-liveness). Terminal quick start (macOS/Windows): [§3](./relay_server_deployment.md#3-run-from-terminal-macos--windows).

Example NSSM shape:

```powershell
nssm install EnvoyMeshRelay "C:\Program Files\nodejs\node.exe"
nssm set EnvoyMeshRelay AppDirectory "C:\envoymesh\EnvoyMesh"
nssm set EnvoyMeshRelay AppParameters "apps\relay\dist\index.js --profile C:\envoymesh\relay-data --listen /ip4/0.0.0.0/tcp/4001 --advertise-addr /ip4/YOUR_PUBLIC_IP/tcp/4001 --http-port 15432 --relay-public-mode"
nssm set EnvoyMeshRelay AppExit Default Restart
nssm start EnvoyMeshRelay
```

Task Scheduler can also work for development machines if configured with "Restart on failure" and "Run whether user is logged on or not."

## Docker

Use Docker restart policy and keep relay health local through audit/CLI first.

```bash
docker run \
  --name envoymesh-relay \
  --restart unless-stopped \
  -p 64073:64073 \
  -v envoymesh-relay:/app/data \
  envoymesh:local \
  npm run node:dev -- --profile ./data/relay --discovery-profile wan-default --relay --relay-server --listen /ip4/0.0.0.0/tcp/64073
```

## Kubernetes

Run relays as a Deployment or StatefulSet and prefer a local readiness/liveness command until a loopback-only `/healthz` endpoint exists.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: envoymesh-relay
spec:
  replicas: 2
  selector:
    matchLabels:
      app: envoymesh-relay
  template:
    metadata:
      labels:
        app: envoymesh-relay
    spec:
      containers:
        - name: relay
          image: envoymesh:local
          args:
            - npm
            - run
            - node:dev
            - --
            - --profile
            - ./data/relay
            - --discovery-profile
            - wan-default
            - --relay
            - --relay-server
            - --listen
            - /ip4/0.0.0.0/tcp/64073
          ports:
            - containerPort: 64073
          livenessProbe:
            exec:
              command:
                - sh
                - -c
                - npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay --format json | grep '"status"'
            initialDelaySeconds: 30
            periodSeconds: 30
```
