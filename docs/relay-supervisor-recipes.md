# Relay Supervisor Recipes

Relay nodes should run under an external supervisor. EnvoyMesh performs local health checks and bounded repairs, then exits non-zero only when the process should be restarted by the host.

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

Use `Restart=always` and a short restart delay.

```ini
[Unit]
Description=EnvoyMesh Relay
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/envoymesh
ExecStart=/usr/bin/npm run node:dev -- --profile ./data/relay --discovery-profile wan-default --relay --relay-server --listen /ip4/0.0.0.0/tcp/64073
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Windows

Use WinSW or NSSM for long-running relay nodes. Configure the service to restart on non-zero exit and pass the same node flags used during manual testing.

Example NSSM shape:

```powershell
nssm install EnvoyMeshRelay "C:\Program Files\nodejs\npm.cmd"
nssm set EnvoyMeshRelay AppDirectory "C:\envoymesh\EnvoyMesh"
nssm set EnvoyMeshRelay AppParameters "run node:dev -- --profile C:\envoymesh\relay --discovery-profile wan-default --relay --relay-server --listen /ip4/0.0.0.0/tcp/64073"
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
