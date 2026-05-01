# Packaging EnvoyMesh

EnvoyMesh can be packaged in two ways:

1. **Tauri Desktop App** - For end users (one-click install, all-in-one)
2. **Standalone Node + Web UI** - For developers/advanced users (CLI-based)

## Option 1: Tauri Desktop App (Recommended for End Users)

### Architecture

```
EnvoyMesh App (Tauri)
├── Node Process (Node.js + TypeScript compiled)
│   └── EnvoyMesh networking, libp2p, WebSocket server
├── Social UI (React + Vite)
│   └── Web UI served from local embedded files
└── Tauri Runtime (Rust)
    └── Native window, tray, notifications, auto-start
```

### Prerequisites

| Platform | Requirements |
|----------|-------------|
| macOS | macOS 10.13+, Xcode Command Line Tools |
| Windows | Windows 10/11, Visual Studio Build Tools |
| Linux | Ubuntu/Debian: `libssl-dev libwebkit2gtk-4.0-dev libgtk-3-dev` |
| All | Node.js 18+, npm 9+, Rust 1.70+ |

### Build

```bash
# Build node + UI first
npm run node:build
npm run social:build

# Build Tauri app
npm run tauri:dev      # Development mode
npm run tauri:build    # Build for current platform
npm run tauri:build:mac  # macOS .dmg/.zip
npm run tauri:build:win  # Windows .exe
npm run tauri:build:linux # Linux .AppImage/.deb
```

### Output Locations

| Platform | Output |
|----------|--------|
| macOS | `src-tauri/target/release/bundle/dmg/envoymesh-*.dmg` |
| Windows | `src-tauri/target/release/bundle/nsis/envoymesh-*-setup.exe` |
| Linux | `src-tauri/target/release/bundle/appimage/envoymesh-*.AppImage` |

---

## Option 2: Standalone Node + Web UI (For Developers)

For developers who prefer CLI, the node can run standalone with the web UI served from the node itself.

### Architecture

```
User Terminal
├── Node Process (npm run node:dev)
│   └── EnvoyMesh networking + WebSocket server on port 3030
│   └── HTTP server on port 5173 serving Social UI
└── Browser
    └── http://localhost:5173 (Social UI connects to ws://localhost:3030)
```

### Quick Start

```bash
# Terminal 1: Start node + serve UI
npm run node:dev

# Browser: Open http://localhost:5173
```

### With Custom Profile

```bash
# Use a specific profile directory
ENVOYMESH_PROFILE=./my-profile npm run node:dev

# With custom bootstrap peers
ENVOYMESH_BOOTSTRAP_PEERS=/ip4/1.2.3.4/tcp/4001/p2p/Qm... npm run node:dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVOYMESH_PROFILE` | `./data/default` | Profile directory |
| `ENVOYMESH_BOOTSTRAP_PEERS` | - | Comma-separated peer multiaddrs |
| `ENVOYMESH_DISCOVERY_PROFILE` | `wan-default` | `lan-fast` or `wan-default` |
| `ENVOYMESH_VAULT` | `./shared_vault` | Vault directory |

### Build for Standalone Use

```bash
# Compile node to JavaScript
npm run node:build

# Run standalone
node apps/node/dist/src/index.js

# Or use tsx (TypeScript runner)
npm run node:dev
```

---

## Uninstalling

### Remove Electron (legacy, no longer used)

```bash
npm uninstall electron electron-builder -w @envoymesh/desktop
rm -rf apps/desktop
```

### Verify No Electron Remains

```bash
grep -r "electron" package.json apps/*/package.json 2>/dev/null
# Should return nothing
```

## Package Sizes (Approximate)

| Package | Size |
|--------|------|
| Electron (old) | ~150 MB |
| Tauri (new) | ~10 MB |
| Social UI (JS/CSS/HTML) | ~300 KB |
| Node.js (system-installed) | varies |

## Troubleshooting

### "Failed to spawn node process"
Make sure Node.js is installed: `node --version`

### "WebView not found" on Linux
```bash
sudo apt install libwebkit2gtk-4.0-dev
```

### "EADDRINUSE" on port 3030
Another node is already running. Kill it:
```bash
lsof -ti:3030 | xargs kill -9
```

## TODO

- [ ] Bundle Node.js into the Tauri app (no external dependency)
- [ ] Auto-update support via Tauri's updater
- [ ] System tray icon with quick actions
- [ ] Auto-start on system login
- [ ] Native notifications
- [ ] Proper app icons (generate from source image)
- [ ] Installer for Linux (.deb, .AppImage)