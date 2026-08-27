# EnvoyMesh Deployment Scenarios

EnvoyMesh supports different deployment scenarios for different use cases.

---

## Scenario 1: End-user desktop (Tauri + Social web UI)

**Use case:** Someone runs EnvoyMesh like a normal desktop app. **Tauri is only a native wrapper** around the same **Social** frontend (HTML/CSS/JS) you can also open in a browser during development; the bundled app also spawns the Node process and **OpenClaw (EnvoyAI)** gateway.

```
┌─────────────────────────────────────────────────────────┐
│  Your Desktop                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Tauri window (WebView)                          │    │
│  │    → Social UI (React SPA)                      │    │
│  │  + child: Node (libp2p, WS API, vault, bridge)    │    │
│  │  + child: OpenClaw gateway (EnvoyAI assistant)  │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Characteristics:**
- User-facing surface is the **web** Social app; Tauri provides the window, menus, and lifecycle.
- Node + relay behavior matches other scenarios; profile for the packaged app is under the OS app-data path (see `apps/tauri/src-tauri/src/main.rs`).
- **EnvoyAI** is OpenClaw running as a child gateway on port **18789** with the **envoymesh** channel plugin and pre-seeded workspace/skills.
- Bundled **Node.js runtime** (`resources/node-runtime/`) — no system Node required for end users.

**How to run (development):**
```bash
npm run tauri:dev          # Development (native window)
```

**How to build (production installer):**
```bash
# Full (Pi + OpenClaw) — mac/linux
./scripts/build-desktop.sh macos

# Slim (no Pi)
STAGE_PI_BUNDLE=0 ./scripts/build-desktop.sh macos
```

**Signed mirror DMG (Gatekeeper / gpt4people.online):** fill `scripts/sign-macos-release.env`, then the same `./scripts/build-desktop.sh macos` — see [macos-mirror-signing.md](./macos-mirror-signing.md). Do not use `MAC_APP_STORE=1` for the website download.

Or step-by-step without the orchestrator:
```bash
npm run social:build
npm run node:build
npm run build -w @envoymesh/tauri
```

Windows (PowerShell twin — preferred):
```powershell
# Full (Pi + OpenClaw + fd/rg tools)
.\scripts\build-desktop.ps1

# Slim (no Pi) — also switches to tauri.conf.slim.json
.\scripts\build-desktop.ps1 -SkipPi
```

Windows via npm (from repo root):
```bash
npm run tauri:build:win        # full — includes Pi (same as build:win:full)
npm run tauri:build:win:slim   # slim — no Pi (NSIS size escape hatch)
```

Do **not** expect Pi in a slim Windows build. If Ext Agent Pi is required, use `build-desktop.ps1` (no `-SkipPi`) or `tauri:build:win` / `build:win:full`.

The build pipeline runs, in order:
1. `scripts/fetch-node-sidecar.sh` — bundled Node.js binary
2. `scripts/stage-tauri-openclaw-bundle.sh` — OpenClaw gateway + envoymesh extension
3. `scripts/stage-tauri-pi-bundle.sh` — Pi coding agent (skipped when `STAGE_PI_BUNDLE=0` / `-SkipPi`)
4. `scripts/stage-tauri-node-bundle.sh` — compiled node + deps + **bundled skills**
5. `scripts/verify-tauri-resources.sh` — preflight check before `tauri build`

Slim builds omit Pi and use `tauri.conf.slim.json` (same effect as `-SkipPi` on Windows). Override the Pi pin with `ENVOYMESH_PI_VERSION` if needed.

CI release: tag `v0.2.2` (or legacy `desktop-v*` / `tauri-v*`) — see `.github/workflows/tauri-release.yml` and [ota.md](./ota.md).

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
- **OpenClaw gateway** auto-started for EnvoyAI (Assistant / @envoy turns)
- Good for local development and testing
- Can also act as bootstrap peer for others

**How to run:**
```bash
./scripts/setup.sh       # once: OpenClaw + envoymesh extension + build
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
| OpenClaw / EnvoyAI | bundled gateway | dev `packages/openclaw` | - |
| Pre-installed skills | bundled in app | `apps/node/skills/` | - |
| Relay client | ✓ | ✓ | - |
| Relay server | optional | optional | (pure) |
| DHT discovery | ✓ | ✓ | ✓ |
| App logic | ✓ | ✓ | - |
| Runs 24/7 | No | No | Yes |
| Public IP needed | No | No | Yes |
| Resource usage | Medium–High | Medium | Low |
| Best for | End users | Developers | Infrastructure |

---

## OpenClaw + EnvoyAI (built-in agent)

EnvoyMesh bundles **OpenClaw** as the default assistant brain. The node spawns an OpenClaw **gateway** child process; Social/H2A sends turns to `http://127.0.0.1:18789/webhook/envoymesh`.

| Component | Dev path | Tauri bundle path |
|-----------|----------|-------------------|
| OpenClaw source tree | `packages/openclaw/` | `resources/openclaw/` |
| EnvoyMesh channel plugin | `OpenClawExtension/` → `extensions/envoymesh/` | same (staged at build) |
| Gateway state | `<profile>/openclaw-gateway/openclaw.json` | app data profile dir |
| Agent workspace | `<profile>/openclaw-workspace/` | app data profile dir |
| Bridge config | `<profile>/bridge-config.json` or `apps/node/data/default/` | profile dir |

**First-time dev setup:**
```bash
./scripts/setup.sh
# Installs deps, clones/builds packages/openclaw, copies OpenClawExtension, smoke-tests gateway
```

**Verify in node logs:**
```
[openclaw] Built-in OpenClaw gateway at http://127.0.0.1:18789/webhook/envoymesh
[gateway] Registered EnvoyMesh HTTP route
```

**Runtime path resolution** (`apps/node/src/bundled-paths.ts`):

| Env var | Purpose |
|---------|---------|
| `ENVOYMESH_OPENCLAW_DIR` | OpenClaw tree (Tauri sets from `TAURI_RESOURCE_DIR/openclaw`) |
| `ENVOYMESH_BUNDLED_SKILLS_DIR` | Pre-installed skills source (Tauri: `resources/node/skills`) |
| `ENVOYMESH_NODE_EXE` | Node binary used to run `tsx openclaw.mjs gateway` |
| `TAURI_RESOURCE_DIR` | Tauri app Resources folder |

Gateway spawn order: bundled **tsx + openclaw.mjs** → standalone binary fallback → dev **pnpm exec tsx**.

See also: [openclaw-extension.md](./openclaw-extension.md), Phase 29 in [implementation-plan.md](./implementation-plan.md).

---

## Bundled OpenClaw skills

Skills ship in **`apps/node/skills/<slug>/`** (repo) and are copied into the Tauri node bundle at **`resources/node/skills/`**.

On first profile init, the node copies bundled skills into the user's workspace:

```
apps/node/skills/tavily/     ──seed──►  <profile>/openclaw-workspace/skills/tavily/
```

Existing workspace skills are **not overwritten** — delete `<profile>/openclaw-workspace/skills/<slug>/` to re-seed.

### Install a skill for packaging

Use the helper script (installs via ClawHub into the canonical bundled path):

```bash
npm i -g clawhub
clawhub login
./scripts/install-bundled-skill.sh tavily
# → apps/node/skills/tavily/
```

Manual equivalent:

```bash
STAGE="$(pwd)/.bundled-skills-staging/openclaw-workspace"
mkdir -p "$STAGE/skills"
clawhub install tavily --workdir "$STAGE"
cp -R "$STAGE/skills/tavily" apps/node/skills/
```

Each bundled skill needs:
- `SKILL.md` (required)
- Optional `scripts/`, `references/`, `.clawhub/origin.json`

**Do not commit API keys.** Configure at runtime in `bridge-config.json`:

```json
{
  "skillApiKeys": {
    "tavily": "tvly-..."
  },
  "webSearchEnabled": true
}
```

Keys flow into the generated OpenClaw gateway config (`skills.entries` + web search plugins). See `apps/node/src/openclaw-gateway-config.ts`.

### Runtime vs bundled skill paths

| Action | Target path |
|--------|-------------|
| Ship with EnvoyMesh / Tauri | `apps/node/skills/<slug>/` |
| User installs via Social Skill Manager | `<profile>/openclaw-workspace/skills/<slug>/` (ClawHub `--workdir`) |
| Agent reads skills | OpenClaw workspace `skills/` |

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

# Dev: OpenClaw + envoymesh extension (once)
./scripts/setup.sh

# Build for all scenarios
npm run node:build     # Node runtime for scenarios 1, 2
npm run relay:build    # Relay server for scenario 3
npm run social:build   # Social UI (required for Tauri)
npm run build -w @envoymesh/tauri   # Desktop installer (stages OpenClaw + skills)
```

### Tauri staging scripts

| Script | Output |
|--------|--------|
| `scripts/fetch-node-sidecar.sh` | `apps/tauri/src-tauri/resources/node-runtime/` |
| `scripts/stage-tauri-openclaw-bundle.sh` | `apps/tauri/src-tauri/resources/openclaw/` |
| `scripts/stage-tauri-pi-bundle.sh` / `fetch-pi-sidecar.sh` | `apps/tauri/src-tauri/resources/pi/` (full builds) |
| `scripts/stage-tauri-node-bundle.sh` | `apps/tauri/src-tauri/resources/node/` (+ `skills/`) |
| `scripts/fetch-kubo-sidecar.sh` | `resources/kubo/` (full build only) |
| `scripts/install-bundled-skill.sh` | `apps/node/skills/<slug>/` |
| `scripts/build-desktop.sh` | Runs sidecar + staging + `tauri build` (mac/linux) |
| `scripts/build-desktop.ps1` | Windows twin (`-SkipPi` for slim) |

**Tauri config variants:**

| Config | Kubo IPFS | OpenClaw | Pi | Skills |
|--------|-----------|----------|----|--------|
| `tauri.conf.json` | optional | ✓ | ✓ | ✓ |
| `tauri.conf.full.json` | ✓ | ✓ | ✓ | ✓ |
| `tauri.conf.slim.json` | ✗ (Helia only) | ✓ | ✗ | ✓ |

---

## Cloud Relay Server Deployment

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
node --version  # Must be 18+ (dev only; Tauri bundles its own Node)
```

### EnvoyAI / OpenClaw not starting

1. **Dev:** run `./scripts/setup.sh` — ensures `packages/openclaw` is built and `OpenClawExtension` is copied.
2. **Desktop:** rebuild with staging scripts; check logs for `[openclaw] Built-in OpenClaw gateway`.
3. **Port 18789 in use:** stop other OpenClaw instances.
4. **Gateway exits immediately:** check `[gateway]` stderr — often missing `tsx` in staged `resources/openclaw/node_modules`.

### Bundled skills not appearing

1. Confirm skill exists under `apps/node/skills/<slug>/SKILL.md`.
2. Rebuild Tauri so `stage-tauri-node-bundle.sh` copies skills into `resources/node/skills/`.
3. Delete `<profile>/openclaw-workspace/skills/<slug>/` and restart node to re-seed from bundled copy.

### Skill API keys

Set `skillApiKeys` in profile `bridge-config.json` — never commit keys into `apps/node/skills/`.

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
| Node Profile (dev) | `./data/default/` or `ENVOYMESH_PROFILE` |
| Bundled skills (repo) | `apps/node/skills/<slug>/` |
| Bundled skills (Tauri) | `resources/node/skills/<slug>/` (inside app bundle) |
| OpenClaw source (dev) | `packages/openclaw/` |
| OpenClaw bundle (Tauri) | `resources/openclaw/` |
| User OpenClaw workspace | `<profile>/openclaw-workspace/` |
| User skill installs (runtime) | `<profile>/openclaw-workspace/skills/` |
| Gateway config (generated) | `<profile>/openclaw-gateway/openclaw.json` |
| Relay Profile | `./data/relay/` or `--profile <dir>` |
| App Data (macOS) | `~/Library/Application Support/dev.envoymesh.app/profile/` |
| App Data (Linux) | `~/.config/envoymesh/` |
| App Data (Windows) | `%APPDATA%\envoymesh\` |

---

## TODO

- [x] Bundle Node.js into Tauri app (`resources/node-runtime/`)
- [x] Bundle OpenClaw gateway + envoymesh extension (`stage-tauri-openclaw-bundle.sh`)
- [x] Bundle pre-installed skills (`apps/node/skills/` → `resources/node/skills/`)
- [x] Auto-update support (wired: [ota.md](./ota.md) — generate keys + GitHub Secrets, then tag `v0.2.2`)
- [ ] System tray icon
- [ ] Auto-start on login
- [ ] Native notifications
- [ ] Proper app icons