# Running EnvoyMesh Relay Server

This guide explains how to run the EnvoyMesh relay server using the provided scripts.

---

## Prerequisites

- Node.js 18+ installed
- EnvoyMesh cloned or copied to your machine
- Relay built: `npm run relay:build`

---

## Quick Start (Linux/macOS)

### 1. Make the script executable

```bash
chmod +x ./scripts/run-relay.sh
```

### 2. Run with defaults

```bash
./scripts/run-relay.sh
```

This will run the relay with:
- Profile: `./data/relay`
- Port: `4001`
- No advertise address

### 3. Check the output

```
==========================================
  EnvoyMesh Relay Server
==========================================
  Profile: ./data/relay
  Listen:  /ip4/0.0.0.0/tcp/4001
==========================================

Running: node apps/relay/dist/index.js --profile ./data/relay --listen /ip4/0.0.0.0/tcp/4001
[relay] Starting EnvoyMesh Relay Server
[relay] Profile: ./data/relay
[relay] Listen: /ip4/0.0.0.0/tcp/4001
[relay] DHT: client mode
[relay] Relay server started.
[relay] Peer ID: 12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
[relay] Listen addresses: /ip4/127.0.0.1/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q, /ip4/YOUR_IP/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
[relay] Ready to accept relay connections.
```

---

## Quick Start (Windows)

### 1. Open Command Prompt

```cmd
cd EnvoyMesh
```

### 2. Run with defaults

```cmd
scripts\run-relay.bat
```

### 3. Or run in PowerShell

```powershell
.\scripts\run-relay.bat
```

---

## Common Usage Examples

### Example 1: Basic Local Testing

```bash
# Just run on default port, no advertise
./scripts/run-relay.sh
```

### Example 2: Cloud Server with Public IP

```bash
# Replace 123.45.67.89 with your actual public IP
./scripts/run-relay.sh --advertise 123.45.67.89
```

This creates the full multiaddr: `/ip4/123.45.67.89/tcp/4001/p2p/PEER_ID`

### Example 3: Cloud Server with HTTP Info Endpoint

```bash
# Enable HTTP /info endpoint on port 15432 for relay discovery
./scripts/run-relay.sh --advertise 123.45.67.89 --http-port 15432
```

Users can now discover this relay using domain name (e.g., `relay.example.com`) instead of full multiaddr.

### Example 4: Custom Port

```bash
# Listen on port 5000 instead of 4001
./scripts/run-relay.sh --port 5000
```

### Example 4: Custom Profile Directory

```bash
# Use a specific directory for identity
./scripts/run-relay.sh --profile /var/lib/envoymesh-relay
```

### Example 5: Full Options Combined

```bash
./scripts/run-relay.sh \
  --profile /var/lib/envoymesh-relay \
  --port 4001 \
  --advertise 123.45.67.89
```

### Example 6: Using Environment Variables

```bash
# Set profile via environment variable
ENVOYMESH_PROFILE=/var/lib/my-relay ./scripts/run-relay.sh

# Set port via environment variable
RELAY_PORT=5000 ./scripts/run-relay.sh
```

### Example 7: With Bootstrap Peers

```bash
# Connect to existing relay as bootstrap
ENVOYMESH_BOOTSTRAP=/ip4/1.2.3.4/tcp/4001/p2p/QmExistingRelay ./scripts/run-relay.sh --advertise 123.45.67.89
```

---

## When to Use Advertise Address

The `--advertise` parameter specifies the **public IP address** that external clients use to connect to your relay. It's only needed in certain scenarios:

| Scenario | Advertise Needed? | Reason |
|----------|-------------------|--------|
| Local machine testing | No | Clients on same machine use `127.0.0.1` |
| Same LAN network | No | Clients use local IP (e.g., `192.168.1.x`) |
| Cloud/VPS with public IP | **Yes** | External clients must know the public IP |
| Behind NAT | Recommended | Helps NAT traversal for peer discovery |

### Local Testing (No Advertise)

```bash
# Run relay locally - no advertise needed
./scripts/run-relay.sh

# Clients can connect via localhost
# /ip4/127.0.0.1/tcp/4001/p2p/PEER_ID
```

### Cloud Deployment (Advertise Required)

```bash
# On a cloud server with public IP 123.45.67.89
./scripts/run-relay.sh --advertise 123.45.67.89

# External clients connect using the public IP
# /ip4/123.45.67.89/tcp/4001/p2p/PEER_ID
```

### How It Works

When advertise is set, the relay announces its address to peers as `/ip4/<advertise>/tcp/<port>/p2p/<peer_id>` instead of using the detected local IP. This allows clients outside the local network to connect.

If no advertise is set, the relay uses its detected local addresses, which work for local/LAN clients but not for external internet clients.

---

## Script Options

| Option | Description | Default |
|--------|-------------|---------|
| `--profile <dir>` | Profile directory for relay identity | `./data/relay` |
| `--port <port>` | TCP listen port | `4001` |
| `--advertise <IP>` | Public IP address for advertise | (none) |
| `--http-port <port>` | HTTP port for `/info`, `/health`, and `/admin` | `15432` |
| `--help`, `-h` | Show help message | - |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVOYMESH_PROFILE` | Profile directory | `./data/relay` |
| `ENVOYMESH_BOOTSTRAP` | Comma-separated bootstrap peers | (none) |
| `RELAY_PORT` | Default port | `4001` |
| `ENVOYMESH_RELAY_ADMIN_USER` | Admin UI Basic Auth username | `admin` |
| `ENVOYMESH_RELAY_ADMIN_PASSWORD` | Admin UI Basic Auth password | `envoymesh123456` |

### Admin Web UI

Open (defaults enabled out of the box):

```
http://<relay-host>:<http-port>/admin/
```

Default credentials: **admin** / **envoymesh123456**. Change them via env or `--admin-user` / `--admin-password` before exposing the relay publicly.

The UI shows health, peers, circuit reservations, recent logs, and soft (libp2p) / hard (process exit) restart. Hard restart requires a supervisor with `Restart=always` (see [`docs/relay_server_deployment.md`](./relay_server_deployment.md) and [`docs/relay-supervisor-recipes.md`](./relay-supervisor-recipes.md)).

**Security:** put TLS (Caddy/nginx) in front for remote access — Basic Auth over plain HTTP leaks credentials on the wire. `/health` stays unauthenticated for probes; `/info`, `/version`, `/protocols`, and `/reservations` require the same Basic Auth when admin credentials are set (including the defaults).

---

## Getting Your Relay Address

After starting the relay, you'll see output like:

```
[relay] Peer ID: 12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
[relay] Listen addresses: /ip4/127.0.0.1/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q, /ip4/192.168.1.100/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
```

Your full relay multiaddr is:

```
/ip4/YOUR_PUBLIC_IP/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
```

### Share This Address With Users

They can add your relay in the EnvoyMesh app:
- Settings → Configured Relays → Add
- Paste the full multiaddr

---

## Stopping the Relay

### Linux/macOS
Press `Ctrl+C` to gracefully stop.

### With Systemd (Recommended for Cloud)

For long-running public relays, use the standalone relay under `systemd`. The relay performs local health checks and exits with a non-zero code when a clean process restart is safer than continuing. `systemd` then restarts it while journald keeps the logs.

```bash
sudo tee /etc/systemd/system/envoymesh-relay.service <<'EOF'
[Unit]
Description=EnvoyMesh Relay Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/envoymesh
ExecStart=/usr/bin/node /opt/envoymesh/apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/YOUR_PUBLIC_IP/tcp/4001 \
  --http-port 15432
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=10
User=envoymesh
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo useradd --system --home /var/lib/envoymesh-relay --create-home envoymesh
sudo mkdir -p /opt/envoymesh /var/lib/envoymesh-relay
sudo chown -R envoymesh:envoymesh /var/lib/envoymesh-relay
sudo systemctl enable envoymesh-relay
sudo systemctl start envoymesh-relay
```

Then manage with:
```bash
sudo systemctl stop envoymesh-relay
sudo systemctl start envoymesh-relay
sudo systemctl restart envoymesh-relay
sudo journalctl -u envoymesh-relay -f
curl http://127.0.0.1:15432/health
```

The `/health` endpoint returns JSON with the relay status (`healthy`, `degraded`, `unhealthy`, or `critical`), recent reasons, restart counters, uptime, memory usage, event-loop lag, and connected relay peer count. **`/health` always returns HTTP 200 when the event loop can answer** (liveness for watchdog / systemd wedge detection). Use **`GET /readyz`** for readiness — it returns **503** while `starting` / `unhealthy` / `critical` so load balancers can drain without conflating a soft libp2p repair with a dead process.

---

## Troubleshooting

### "command not found: node"

Node.js is not installed or not in PATH.
```bash
# Check Node.js
node --version

# If not found, install:
# Linux
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# macOS
brew install node
```

### "No such file or directory: apps/relay/dist/index.js"

The relay is not built. Run:
```bash
npm run relay:build
```

### "Permission denied" (Linux/macOS)

```bash
# Make executable
chmod +x ./scripts/run-relay.sh

# Or run as owner
sudo chown $USER:$USER ./scripts/run-relay.sh
```

### "Port already in use"

Another process is using port 4001. Choose a different port:
```bash
./scripts/run-relay.sh --port 5000
```

### Relay shows 127.0.0.1 instead of public IP

This is normal for local testing. For cloud deployment:
1. Ensure you're using `--advertise YOUR_PUBLIC_IP`
2. Check cloud provider's firewall/security groups allow the port

---

## Files Created

When running, the script creates:

| File | Description |
|------|-------------|
| `./data/relay/` | Profile directory (default) |
| `./data/relay/libp2p-key` | Private key for persistent peer ID |
| `./data/relay/node-config.json` | Node configuration |

---

## Security Notes

- Profile directory is created with permissions `700`
- Private key stored locally in profile directory
- No authentication on relay connections (P2P trust model)

---

## Summary Cheat Sheet

```bash
# Quick local test
./scripts/run-relay.sh

# Cloud VPS with public IP
./scripts/run-relay.sh --advertise 123.45.67.89

# Custom port
./scripts/run-relay.sh --port 5000 --advertise 123.45.67.89

# With bootstrap
ENVOYMESH_BOOTSTRAP=/ip4/1.2.3.4/tcp/4001/p2p/Qm... ./scripts/run-relay.sh --advertise 123.45.67.89

# Check help
./scripts/run-relay.sh --help
```