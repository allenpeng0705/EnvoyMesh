# EnvoyMesh Deployment Scenarios

EnvoyMesh supports different deployment scenarios for different use cases.

---

## Scenario 1: Personal Desktop App

**Use case:** End user running EnvoyMesh on their computer.

```
┌─────────────────────────────────────────┐
│  Your Desktop                            │
│  ┌─────────────────────────────────┐    │
│  │  EnvoyMesh App (Tauri)           │    │
│  │  ├── Social UI (React)           │    │
│  │  ├── Node (libp2p + app logic)   │    │
│  │  └── Relay Client + Server       │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Characteristics:**
- Social node + relay server combined
- May be behind NAT (limited relay server capability)
- Runs only when app is open
- Uses relays from cloud VPS or public relays

**How to run:**
```bash
npm run tauri:dev          # Development
npm run tauri:build        # Production build
```

---

## Scenario 2: Developer Standalone Node

**Use case:** Developer running node + UI locally via CLI.

```
┌─────────────────────────────────────────┐
│  Your Terminal                           │
│  $ npm run node:dev                      │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  Node (port 3030)               │    │
│  │  ├── WebSocket server           │    │
│  │  ├── Social UI (port 5173)      │    │
│  │  ├── Relay Client + Server     │    │
│  │  └── DHT discovery              │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Characteristics:**
- Node + UI served from same process
- All features enabled by default
- Good for local development and testing
- Can also act as bootstrap peer for others

**How to run:**
```bash
npm run node:dev
# Open http://localhost:5173
```

---

## Scenario 3: Cloud Relay Server (Pure Relay)

**Use case:** Cloud VPS acting as relay only - no app/social logic.

```
┌─────────────────────────────────────────┐
│  Cloud VPS (Ubuntu, AWS, etc.)          │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  Relay Server Binary            │    │
│  │  ├── Circuit Relay Transport    │    │
│  │  ├── DHT (for peer discovery)   │    │
│  │  └── AutoNAT + DCUtR            │    │
│  │                                  │    │
│  │  NO: WebSocket server           │    │
│  │  NO: Social UI                  │    │
│  │  NO: App logic                  │    │
│  └─────────────────────────────────┘    │
│                                          │
│  Public IP: /ip4/X.X.X.X/tcp/4001       │
│  Peer ID: 12D3KooW...                    │
└─────────────────────────────────────────┘
```

**Characteristics:**
- **Minimal binary** - Only relay routing, no app logic
- **Always-on** - Runs 24/7 as infrastructure
- **Public IP required** - Must be reachable from internet
- **Low resource usage** - Just libp2p relay transport
- **Stable identity** - Persistent key for consistent peer ID

**When to use:**
- Peers behind NAT/firewall need to communicate
- Building relay infrastructure for the network
- Contributing to network reliability

**Setup (Ubuntu 22.04):**

```bash
# 1. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone and build
git clone https://github.com/your/envoymesh.git
cd EnvoyMesh
npm install
npm run relay:build

# 3. Create dedicated user
sudo useradd -m -s /bin/false envoymesh
sudo mkdir -p /var/lib/envoymesh-relay
sudo chown envoymesh:envoymesh /var/lib/envoymesh-relay

# 4. Create systemd service
sudo tee /etc/systemd/system/envoymesh-relay.service <<'EOF'
[Unit]
Description=EnvoyMesh Relay Server
After=network.target

[Service]
ExecStart=/usr/bin/env node /opt/envoymesh/apps/relay/dist/index.js \
  --profile /var/lib/envoymesh-relay \
  --advertise-addr /ip4/YOUR_PUBLIC_IP/tcp/4001 \
  --bootstrap /ip4/EXISTING_RELAY/tcp/4001/p2p/PEER_ID
Restart=always
RestartSec=10
User=envoymesh

[Install]
WantedBy=multi-user.target
EOF

# 5. Start
sudo systemctl enable envoymesh-relay
sudo systemctl start envoymesh-relay

# 6. Check logs
sudo journalctl -u envoymesh-relay -f
```

**Relay server options:**
```bash
--profile <dir>           Profile directory (default: ./data/relay)
--listen <multiaddr>      Listen address (default: /ip4/0.0.0.0/tcp/0)
--advertise-addr <addr>   REQUIRED: Public IP/DNS for relay paths
--bootstrap <addr>        Connect to other relays for mesh
--no-dht                  Disable DHT (not recommended)
```

**Get relay address for sharing:**
After starting, the relay shows its address:
```
[relay] Peer ID: 12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
[relay] Listen addresses: /ip4/1.2.3.4/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q
```

Share as: `/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWSJXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q`

---

## Scenario 4: Social Node + Dedicated Relay Server

**Use case:** Home user with stable relay server for better connectivity.

```
┌─────────────────────────┐    ┌─────────────────────────┐
│  Home Computer          │    │  Cloud VPS              │
│  (behind NAT)           │    │  (Pure Relay)           │
│                         │    │                         │
│  EnvoyMesh App         │◀──▶│  Relay Server           │
│  ├── Social UI          │    │  ├── Circuit Relay      │
│  ├── Node               │    │  ├── DHT                │
│  └── Relay Client ─────┼────┼──► No Social UI        │
│        │               │    │  No App Logic          │
│        ▼               │    │                         │
│  (connects via relay)   │    │                         │
└─────────────────────────┘    └─────────────────────────┘
```

**Characteristics:**
- Home computer runs social node (may be behind NAT)
- Cloud VPS runs pure relay server (always-on, public IP)
- Home computer uses relay to communicate with other peers
- Cloud relay does NOT run social/app logic - just routing

**How to configure:**
1. Deploy relay server (Scenario 3)
2. Get relay's multiaddr
3. Add relay to app settings: Settings > Configured Relays

---

## Comparison Matrix

| Aspect | Desktop App | Standalone Node | Cloud Relay |
|--------|-------------|-----------------|-------------|
| Social UI | (bundled) | (port 5173) | - |
| WebSocket server | (port 3030) | (port 3030) | - |
| Relay client | | | |
| Relay server | | | (pure) |
| DHT discovery | | | |
| App logic | | | - |
| Runs 24/7 | No | No | Yes |
| Public IP needed | No | No | Yes |
| Resource usage | Medium | Medium | Low |
| Best for | End users | Developers | Infrastructure |

---

## Network Architecture

```
                    +-----------------+
                    |  Cloud Relay    |
                    |  (Scenario 3)   |
                    |  Pure routing   |
                    +--------+--------+
                             |
          +------------------+------------------+
          |                  |                  |
          v                  v                  v
   +-------------+    +-------------+    +-------------+
   |  Desktop    |    |  Standalone |    |  Standalone |
   |  App        |    |  Node       |    |  Node       |
   |(Scenario 1) |    |(Scenario 2) |    |(Scenario 2) |
   +-------------+    +-------------+    +-------------+
```

All can connect to the cloud relay. The relay routes traffic between peers who cannot directly connect.

---

## Prerequisites

- **Node.js** 18+ ([Installation](https://nodejs.org/en/download/package-manager))
- **npm** 9+ (comes with Node.js)
- **Git** ([Installation](https://git-scm.com/downloads))
- For cloud relay: **Public IP** and **open ports**

## Build All Components

```bash
git clone https://github.com/your/envoymesh.git
cd EnvoyMesh
npm install

# Build for all scenarios
npm run node:build     # Node + UI for scenarios 1, 2
npm run relay:build    # Relay server for scenario 3
npm run social:build   # UI (if needed separately)
npm run tauri:build    # Desktop app installer
```

---

## Cloud Relay Server Deployment

For detailed step-by-step instructions on deploying a pure relay server on cloud VPS, see [install-relay-server.md](./install-relay-server.md).

For quick start with scripts, see [run-relay-scripts.md](./run-relay-scripts.md).

**Quick start with scripts:**
```bash
# Linux/macOS
chmod +x ./scripts/run-relay.sh
./scripts/run-relay.sh --advertise YOUR_PUBLIC_IP

# Windows
scripts\run-relay.bat --advertise YOUR_PUBLIC_IP
```

---

## Understanding DHT vs Relay

### DHT (Distributed Hash Table)
- **Purpose:** Peer and data discovery
- **Function:** "Where is peer X?" - finds peer IDs on the network
- **Example:** Bootstrap peers stored in DHT so new nodes can find entry points

### Relay (Circuit Relay)
- **Purpose:** Traffic routing when direct connection is impossible
- **Function:** "Connect me to peer Y through Z" - forwards traffic between peers
- **Example:** Two peers both behind NAT use a relay to communicate

### Key Differences

| Aspect | DHT | Relay |
|--------|-----|-------|
| **Purpose** | Discovery (finding peers/content) | Connectivity (traffic routing) |
| **Function** | "Where is peer X?" | "Connect me to peer Y through Z" |
| **Resource cost** | Storage + queries | Bandwidth forwarding |

### Can One Node Be Both?
**Yes!** A social node can also act as relay server. This is enabled by default in `wan-default` profile:
- EnableRelay: Can use relays to connect
- EnableRelayServer: Can act as relay for others
- AutoNAT: Knows its NAT status
- DCUtR: Hole punching support

---

## Troubleshooting

### "Failed to spawn node process"
```bash
node --version  # Must be 18+
```

### "WebView not found" on Linux
```bash
sudo apt install libwebkit2gtk-4.0-dev
```

### "EADDRINUSE" on port 3030
```bash
# macOS/Linux
lsof -ti:3030 | xargs kill -9
```

### Relay not reachable
1. Check firewall - port must be open
2. Check advertise-addr - must be public IP
3. Check peer ID format: `/ip4/X.X.X.X/tcp/PORT/p2p/PEER_ID`

---

## File Locations

| Component | Path |
|-----------|------|
| Node Profile | `./data/default/` or `ENVOYMESH_PROFILE` |
| Relay Profile | `./data/relay/` or `--profile <dir>` |
| App Data (macOS) | `~/Library/Application Support/dev.envoymesh.app/` |
| App Data (Linux) | `~/.config/envoymesh/` |
| App Data (Windows) | `%APPDATA%\envoymesh\` |

---

## TODO

- [ ] Bundle Node.js into Tauri app (no external dependency)
- [ ] Auto-update support
- [ ] System tray icon
- [ ] Auto-start on login
- [ ] Native notifications
- [ ] Proper app icons