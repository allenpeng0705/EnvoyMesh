# Installing EnvoyMesh Relay Server on Cloud VPS

This guide covers how to deploy a **pure relay server** on a cloud VPS. This relay has no app logic - it only routes P2P traffic between peers.

---

## What You Get

```
┌─────────────────────────────────────────────────────────────┐
│  Cloud VPS (Public IP: x.x.x.x)                             │
│                                                             │
│  EnvoyMesh Relay Server                                     │
│  ├── Circuit Relay Transport (routes traffic)              │
│  ├── DHT (peer discovery)                                  │
│  ├── AutoNAT (NAT traversal detection)                     │
│  └── DCUtR (hole punching support)                         │
│                                                             │
│  NOT included: WebSocket, Social UI, App logic              │
└─────────────────────────────────────────────────────────────┘
```

**Purpose:** Help peers behind NAT/firewall communicate by relaying their traffic.

---

## Prerequisites

- **Cloud VPS** with public IP (AWS EC2, DigitalOcean, Vultr, etc.)
- **Ubuntu 22.04** (recommended, other Linux distros similar)
- **Port open:** TCP 4001 (or your chosen port)
- **SSH access** to the VPS

---

## Step-by-Step Installation

### 1. Connect to Your VPS

```bash
ssh root@YOUR_VPS_IP
```

### 2. Install Node.js 18+

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version
```

### 3. Create Dedicated User

```bash
# Create a non-root user for security
useradd -m -s /bin/bash envoymesh

# Create data directory
mkdir -p /var/lib/envoymesh-relay
chown envoymesh:envoymesh /var/lib/envoymesh-relay
```

### 4. Download and Build EnvoyMesh

```bash
# As envoymesh user
su - envoymesh
cd ~

# Clone repository (use your fork/repository)
git clone https://github.com/your/envoymesh.git
cd envoymesh

# Install dependencies
npm install

# Build relay server
npm run relay:build

# Verify built files
ls apps/relay/dist/
```

### 5. Configure Firewall

```bash
# Check if ufw is installed
apt install ufw -y

# Allow SSH (important!)
ufw allow 22/tcp

# Allow relay port (default 4001)
ufw allow 4001/tcp

# Enable firewall
ufw enable
```

### 6. Create Systemd Service

Create the service file:

```bash
sudo tee /etc/systemd/system/envoymesh-relay.service <<'EOF'
[Unit]
Description=EnvoyMesh Relay Server
Documentation=https://github.com/your/envoymesh/docs/packaging.md
After=network.target

[Service]
Type=simple
User=envoymesh
WorkingDirectory=/home/envoymesh/envoymesh
ExecStart=/usr/bin/env node /home/envoymesh/envoymesh/apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/YOUR_VPS_PUBLIC_IP/tcp/4001
Restart=always
RestartSec=10

# Security: limit resource usage
LimitNOFILE=65536
MemoryMax=256M

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=envoymesh-relay

[Install]
WantedBy=multi-user.target
EOF
```

**Important:** Replace `YOUR_VPS_PUBLIC_IP` with your VPS actual public IP.

### 7. Reload and Start Service

```bash
# Reload systemd to recognize new service
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable envoymesh-relay

# Start the service
sudo systemctl start envoymesh-relay

# Check status
sudo systemctl status envoymesh-relay
```

### 8. View Logs

```bash
# Follow logs in real-time
sudo journalctl -u envoymesh-relay -f

# Or view recent logs
sudo journalctl -u envoymesh-relay --no-pager -n 50
```

### 9. Verify Relay is Running

Check the logs for these messages:

```
[relay] Starting EnvoyMesh Relay Server
[relay] Profile: /var/lib/envoymesh-relay
[relay] Listen: /ip4/0.0.0.0/tcp/4001
[relay] DHT: client mode
[relay] Relay server started.
[relay] Peer ID: 12D3KooW...
[relay] Listen addresses: /ip4/x.x.x.x/tcp/4001/p2p/12D3KooW...
[relay] Ready to accept relay connections.
```

---

## Your Relay Address

Once running, your relay address will be:

```
/ip4/YOUR_PUBLIC_IP/tcp/4001/p2p/PEER_ID
```

Example:
```
/ip4/123.45.67.89/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
```

**Share this address** with users who need to connect through your relay.

---

## Managing the Relay

### Stop the relay
```bash
sudo systemctl stop envoymesh-relay
```

### Start the relay
```bash
sudo systemctl start envoymesh-relay
```

### Restart (after config changes)
```bash
sudo systemctl restart envoymesh-relay
```

### Check if running
```bash
sudo systemctl is-active envoymesh-relay
```

### View runtime info
```bash
sudo journalctl -u envoymesh-relay -n 20 --no-pager
```

---

## Configuration Options

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--profile <dir>` | Profile directory for identity | `./data/relay` |
| `--listen <addr>` | Listen address | `/ip4/0.0.0.0/tcp/0` |
| `--advertise-addr <addr>` | Public IP for relay paths (REQUIRED) | - |
| `--bootstrap <addr>` | Bootstrap peer or domain (optional) | - |
| `--no-dht` | Disable DHT discovery | DHT enabled |
| `--http-port <port>` | HTTP port for /info endpoint | (disabled) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ENVOYMESH_PROFILE` | Profile directory |
| `ENVOYMESH_ADVERTISE_ADDRS` | Advertise addresses (comma-separated) |
| `ENVOYMESH_BOOTSTRAP_PEERS` | Bootstrap peers (comma-separated) |

### Example with All Options

```bash
ExecStart=/usr/bin/env node /home/envoymesh/envoymesh/apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/123.45.67.89/tcp/4001 \
  --bootstrap /ip4/1.2.3.4/tcp/4001/p2p/QmExistingRelay
```

---

## Troubleshooting

### Port Not Accessible

Check if the port is listening:
```bash
sudo ss -tlnp | grep 4001
```

Check firewall:
```bash
sudo ufw status
sudo iptables -L -n | grep 4001
```

### Service Fails to Start

Check logs:
```bash
sudo journalctl -u envoymesh-relay -e
```

Common issues:
- Node.js not installed correctly
- Port already in use
- Permission denied on profile directory

### Relay Not Reachable from Outside

1. Check cloud provider's security groups/firewall
2. Verify port is open:
   ```bash
   # From another machine
   nc -zv YOUR_VPS_IP 4001
   ```

### High Resource Usage

Monitor resource usage:
```bash
sudo systemctl status envoymesh-relay
htop
```

---

## Updating the Relay

When you need to update to a new version:

```bash
# Stop service
sudo systemctl stop envoymesh-relay

# Pull new code
cd /home/envoymesh/envoymesh
git pull

# Rebuild
npm install
npm run relay:build

# Start service
sudo systemctl start envoymesh-relay
```

---

## Monitoring

### Set Up Monitoring (Optional)

Create a simple health check script:

```bash
#!/bin/bash
# /usr/local/bin/relay-health.sh

if systemctl is-active --quiet envoymesh-relay; then
    echo "Relay is running"
    exit 0
else
    echo "Relay is not running!"
    exit 1
fi
```

Add to crontab for monitoring:
```bash
chmod +x /usr/local/bin/relay-health.sh
crontab -e
# Add: */5 * * * * /usr/local/bin/relay-health.sh
```

---

## Security Recommendations

1. **Use non-root user** (already done above)
2. **Limit memory** (already in service file: MemoryMax=256M)
3. **Keep system updated:**
   ```bash
   apt update && apt upgrade -y
   ```
4. **Use fail2ban** to prevent brute force:
   ```bash
   apt install fail2ban -y
   systemctl enable fail2ban
   ```

---

## File Locations

| Item | Path |
|------|------|
| Service file | `/etc/systemd/system/envoymesh-relay.service` |
| Relay data | `/var/lib/envoymesh-relay/` |
| Relay code | `/home/envoymesh/envoymesh/` |
| Logs | `journalctl -u envoymesh-relay` |

---

## Quick Start with Scripts

For a simpler setup, use the provided scripts:

### Linux/macOS
```bash
cd EnvoyMesh

# Run with defaults (port 4001)
./scripts/run-relay.sh

# With options
./scripts/run-relay.sh --profile ./data/relay1 --port 4001 --advertise 123.45.67.89

# With environment variables
ENVOYMESH_PROFILE=./my-relay ./scripts/run-relay.sh
ENVOYMESH_BOOTSTRAP=/ip4/1.2.3.4/tcp/4001/p2p/Qm... ./scripts/run-relay.sh
```

### Windows
```cmd
cd EnvoyMesh

# Run with defaults (port 4001)
scripts\run-relay.bat

# With options
scripts\run-relay.bat --profile .\data\relay1 --port 4001 --advertise 123.45.67.89

# With environment variables
set ENVOYMESH_PROFILE=.\my-relay
scripts\run-relay.bat
```

### Script Options

| Option | Description | Default |
|--------|-------------|---------|
| `--profile <dir>` | Profile directory | `./data/relay` |
| `--port <port>` | Listen port | `4001` |
| `--advertise <IP>` | Public IP for advertise address | - |
| `--help` | Show help | - |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ENVOYMESH_PROFILE` | Profile directory |
| `ENVOYMESH_BOOTSTRAP` | Comma-separated bootstrap peers |
| `RELAY_PORT` | Default listen port (default: 4001) |

---

## Manual Setup (Without Scripts)

If you prefer manual setup or the scripts don't work:

### Step 1: Download and Build EnvoyMesh

```bash
# Connect to VPS
ssh root@YOUR_VPS_IP

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Clone and build
git clone https://github.com/your/envoymesh.git
cd envoymesh
npm install
npm run relay:build
```

### Step 2: Create Profile Directory

```bash
mkdir -p /var/lib/envoymesh-relay
chmod 700 /var/lib/envoymesh-relay
```

### Step 3: Run Relay

```bash
# Basic run
node apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/YOUR_PUBLIC_IP/tcp/4001

# With bootstrap peers
node apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/YOUR_PUBLIC_IP/tcp/4001 \
  --bootstrap /ip4/1.2.3.4/tcp/4001/p2p/QmExistingRelay
```

---

## Next Steps

```bash
# Complete setup commands (summary)
ssh root@YOUR_VPS_IP
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs ufw
useradd -m -s /bin/bash envoymesh
mkdir -p /var/lib/envoymesh-relay && chown envoymesh:envoymesh /var/lib/envoymesh-relay
su - envoymesh
git clone https://github.com/your/envoymesh.git
cd envoymesh && npm install && npm run relay:build
# Create systemd service, enable firewall port 4001, start service
```

Your relay server is now running 24/7, contributing to the EnvoyMesh network by helping peers behind NAT connect to each other.