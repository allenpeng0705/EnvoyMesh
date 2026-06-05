# EnvoyMesh Packaging Guide

## Quick Start

```bash
# Install everything (developer setup)
./scripts/setup.sh

# If you already have OpenClaw locally:
./scripts/install-openclaw.sh --local /path/to/openclaw

# Run
npm run node:dev      # Start the P2P node
npm run social:dev    # Start the Social UI (http://localhost:5173)
```

**What you should see when OpenClaw is found:**
```
[openclaw-runtime] Starting OpenClaw from packages/openclaw-runtime/bin/openclaw
[openclaw-runtime] v2.3.1, protocol envoy-openclaw/1.0
[openclaw] Agent ready
```

**If not found (harmless — falls back to Ollama/OpenAI):**
```
[openclaw] Not found — using fallback model providers
```

### OpenClaw Installation Methods

| Method | Command | When to use |
|--------|---------|-------------|
| Already on PATH | Just run `npm run node:dev` | You have `openclaw` installed globally |
| Local build | `./scripts/install-openclaw.sh --local /path/to/openclaw` | You built OpenClaw from source locally |
| GitHub binary | `./scripts/install-openclaw.sh` | OpenClaw has published releases |
| Source build | `./scripts/install-openclaw.sh` | OpenClaw repo is public, no releases yet. Build runs from `packages/openclaw/` with `OPENCLAW_ROOT` set. |

## Build Options

### 1. Developer Setup (you are here)

```bash
./scripts/setup.sh
# What you get: npm dependencies + OpenClaw auto-discovered + TypeScript compiled
# No platform packages — runs from source with hot-reload
```

### 2. Local Desktop App Build

```bash
# macOS .dmg
./scripts/build-desktop.sh macos

# Linux .AppImage
./scripts/build-desktop.sh linux

# All platforms
./scripts/build-desktop.sh all

# With/without Kubo (IPFS file sharing)
./scripts/build-desktop.sh macos --with-kubo    # default
./scripts/build-desktop.sh macos --without-kubo  # skip IPFS

# Output: apps/tauri/src-tauri/target/release/bundle/
```

### 3. CI Release (GitHub Actions)

```bash
git tag tauri-v0.2.0 && git push
# GitHub Actions builds for macOS, Windows, Linux
# Publishes .dmg, .exe, .AppImage to GitHub Releases
```

## What's Inside Each Build

| Component | dev (`setup.sh`) | Desktop App (`build-desktop.sh`) | CI Release |
|-----------|:---:|:---:|:---:|
| EnvoyMesh Node | ✅ source | ✅ bundled | ✅ bundled |
| Social UI | ✅ dev server | ✅ Vite build | ✅ Vite build |
| OpenClaw Agent | auto-discovered (PATH/bundled) | ✅ bundled binary | ✅ bundled binary |
| Node.js Runtime | local install | ✅ bundled | ✅ bundled |
| Kubo (IPFS) | — | ✅ opt-in flag | ✅ opt-in flag |
| Helia (pure-JS IPFS) | ✅ npm package | ✅ npm package | ✅ npm package |

## Kubo Build Flags

Kubo is **optional** in the desktop build. Control inclusion:

```bash
# Include Kubo (default)
./scripts/build-desktop.sh macos --with-kubo
# App size: ~120MB (Node.js + EnvoyMesh + OpenClaw + Kubo)

# Skip Kubo
./scripts/build-desktop.sh macos --without-kubo
# App size: ~80MB (Node.js + EnvoyMesh + OpenClaw only)

# Skip OpenClaw too
./scripts/build-desktop.sh macos --without-kubo --without-openclaw
# App size: ~60MB (Node.js + EnvoyMesh only, uses Ollama/OpenAI)
```

Even when Kubo is bundled, it's **off by default** at runtime. Users enable it in Settings → Storage.

## Docker

Run EnvoyMesh as a relay node or full node in a container:

```bash
# Build image
docker build -t envoymesh:latest .

# Run as relay node
docker run -d \
  --name envoymesh-relay \
  -p 4001:4001 \
  -p 4001:4001/udp \
  -v envoymesh-data:/data \
  envoymesh:latest relay

# Run as full node with Ollama
docker run -d \
  --name envoymesh-node \
  -p 4001:4001 \
  -p 4001:4001/udp \
  -p 5173:5173 \
  -v envoymesh-data:/data \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  envoymesh:latest node
```

## Mobile Build

Build Capacitor mobile app (iOS / Android):

```bash
# Prerequisites
# iOS: Xcode 15+ on macOS
# Android: Android Studio + SDK 34

cd apps/mobile

# Install dependencies
npm install

# Build web assets
npx vite build

# iOS
npx cap add ios
npx cap open ios          # Opens Xcode → Run (⌘R)

# Android
npx cap add android
npx cap open android      # Opens Android Studio → Run
```

The mobile app is a **full EnvoyMesh node** — not a thin client. It connects to the P2P mesh via relay (WebSocket), shares the same identity as the desktop node via QR pairing, and runs the full Social UI. OpenClaw is auto-discovered if available; falls back to home node's agent.

## Prerequisites by Platform

### macOS

```bash
# Xcode Command Line Tools
xcode-select --install

# Rust (for Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js 20+
brew install node@20

# Ollama (for AI)
brew install ollama
ollama pull llama3.2
```

### Linux

```bash
# Tauri prerequisites
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
```

### Windows

```powershell
# Visual Studio Build Tools (install "Desktop development with C++")
# https://visualstudio.microsoft.com/downloads/

# Rust
winget install Rustlang.Rustup

# Node.js 20+
winget install OpenJS.NodeJS.LTS

# Ollama
winget install Ollama.Ollama
ollama pull llama3.2
```

## Example Configurations

### Local development with Ollama

```yaml
# envoymesh.node.yaml
models:
  mode: ollama
  ollamaBaseUrl: http://localhost:11434
  ollamaModel: llama3.2

discovery:
  relay: false
  dht: true
  mdns: true
```

### WAN with relay + optional IPFS

```yaml
# envoymesh.node.yaml
models:
  mode: ollama
  ollamaBaseUrl: http://localhost:11434
  ollamaModel: llama3.2

discovery:
  relay: true
  dht: true
  mdns: false
  configuredRelays:
    - multiaddr: /ip4/47.93.11.212/tcp/4001/p2p/12D3KooW...

ipfs:
  enabled: true
  repoDir: ~/.envoymesh/ipfs

# Agent autonomy policy (what your AI can do)
postures:
  bond_autonomy:
    maxAutoBondsPerDay: 3
    requireReferralProof: true
    maxAutoBondTier: direct
  capability_provider:
    searchBondedOnly: false
    maxHops: 3
    allowUnbondedTaskExecution: false
```

### Production relay node

```yaml
# envoymesh.node.yaml (relay)
discovery:
  relay: true
  relayServer: true
  dht: true
  mdns: false

models:
  mode: off

ipfs:
  enabled: false
```

## Release Versioning

| Tag | CI | Output |
|-----|----|--------|
| `tauri-v0.2.0` | tauri-release.yml | macOS .dmg, Windows .exe, Linux .AppImage |
| `tauri-v0.2.0-slim` | tauri-release.yml (`build_slim: true`) | Without Kubo sidecar |
| `relay-v0.2.0` | manual | Relay-only Docker image |
| `mobile-v0.2.0` | manual | iOS/Android Capacitor builds |

## Directory Layout After Build

```
EnvoyMesh.app/
├── Contents/
│   ├── MacOS/envoymesh          # Tauri Rust binary
│   └── Resources/
│       ├── node/                # EnvoyMesh source + packages
│       ├── node-runtime/        # Bundled Node.js 20.x
│       ├── openclaw/            # OpenClaw binary
│       ├── kubo/                # Kubo IPFS binary (optional)
│       └── social/              # Compiled React frontend
```

## Run Commands

```bash
# All development commands (unchanged)
npm run node:dev         # Start node with hot-reload
npm run social:dev       # Start Social UI (http://localhost:5173)
npm run relay:dev        # Start relay node
npm test                 # Run all tests
npm run typecheck        # TypeScript check
```

After installing via desktop app, the app auto-starts everything — no commands needed.

## Configuration

```yaml
# envoymesh.node.yaml
# Copy from envoymesh.node.example.yaml

# Required: model provider for AI
models:
  mode: ollama              # ollama | openai | anthropic | custom
  ollamaBaseUrl: http://localhost:11434
  ollamaModel: llama3.2

# Optional: IPFS for large file sharing (off by default)
ipfs:
  enabled: false
  # kuboPath: ""          # auto-discovered from app bundle
  # repoDir: ~/.envoymesh/ipfs

# Optional: relay for WAN connectivity
discovery:
  relay: true
  configuredRelays:
    - multiaddr: /ip4/relay.example.com/tcp/4001/p2p/12D3KooW...
```

## Platform Support

| Platform | Development | Desktop App | Mobile |
|----------|:----------:|:-----------:|:------:|
| macOS | ✅ | ✅ .dmg | ✅ Capacitor |
| Linux | ✅ | ✅ .AppImage | — |
| Windows | ✅ | ✅ .exe | — |
| iOS | — | — | ✅ Capacitor |
| Android | — | — | ✅ Capacitor |

## CI Pipeline

```
git push
  ├─ ci-smoke-local.yml     — TypeScript + unit tests + two-node smoke
  ├─ ci-social-ui.yml        — Social UI component tests
  ├─ ci-ipfs-kubo.yml        — Kubo parity tests (if IPFS enabled)
  ├─ ci-ipfs-helia-parity.yml — Helia parity tests
  └─ ci-openclaw-live.yml    — OpenClaw integration tests
```

```
git tag tauri-v0.X
  └─ tauri-release.yml     — Builds .dmg/.exe/.AppImage → GitHub Releases
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "OpenClaw not found" | `./scripts/install-openclaw.sh` or add OpenClaw to PATH |
| "NO_RESERVATION" | Ensure relay node is running. Check `relay: true` in config. |
| Social app blank | Check browser console (F12). Clear vite cache: `rm -rf apps/social/node_modules/.vite` |
| Tests failing | Pre-existing failures: relay/bridge E2E (needs infrastructure). Our tests: all green. |
