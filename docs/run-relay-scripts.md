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

## Script Options

| Option | Description | Default |
|--------|-------------|---------|
| `--profile <dir>` | Profile directory for relay identity | `./data/relay` |
| `--port <port>` | TCP listen port | `4001` |
| `--advertise <IP>` | Public IP address for advertise | (none) |
| `--http-port <port>` | HTTP port for /info endpoint | (disabled) |
| `--help`, `-h` | Show help message | - |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVOYMESH_PROFILE` | Profile directory | `./data/relay` |
| `ENVOYMESH_BOOTSTRAP` | Comma-separated bootstrap peers | (none) |
| `RELAY_PORT` | Default port | `4001` |

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

Create a service instead:

```bash
sudo tee /etc/systemd/system/envoymesh-relay.service <<'EOF'
[Unit]
Description=EnvoyMesh Relay Server
After=network.target

[Service]
ExecStart=/usr/bin/env node /path/to/envoymesh/apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/YOUR_PUBLIC_IP/tcp/4001
Restart=always
RestartSec=10
User=envoymesh

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable envoymesh-relay
sudo systemctl start envoymesh-relay
```

Then manage with:
```bash
sudo systemctl stop envoymesh-relay
sudo systemctl start envoymesh-relay
sudo systemctl restart envoymesh-relay
sudo journalctl -u envoymesh-relay -f
```

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