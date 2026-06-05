# EnvoyMesh CLI

The `envoymesh` CLI is the primary interface for EnvoyMesh — manage your node, gateway, identity, vault, plugins, and P2P messaging from the terminal. No Social UI needed.

## Quick Start

```bash
./scripts/setup.sh          # first time only
npm run cli -- start         # start everything
npm run cli -- status        # check health
```

Or use directly:
```bash
npx tsx apps/cli/src/index.ts <command>
```

---

## Core Commands

| Command | Description |
|---------|-------------|
| `envoymesh setup` | Full setup: deps, build, link extension |
| `envoymesh start` | Start node + auto-start gateway |
| `envoymesh stop` | Graceful shutdown (SIGINT → SIGTERM) |
| `envoymesh restart` | Stop → wait 1s → start |
| `envoymesh status` | Health check for all services |

### `envoymesh status`
```
EnvoyMesh Status
============================================
  ✓ Node
  ✓ Bridge (:3031) (HTTP 200)
  ✓ Gateway (:18789) (HTTP 400)
  ✓ WebSocket (:3030)
  ✓ OpenClaw CLI (OpenClaw 2026.6.2)
  ✓ Bridge config (enabled=true, agent=My Agent)

Plugins:
  envoymesh
  tavily
```

- HTTP 400 = webhook registered and responding
- HTTP 000 = service not running
- HTTP 404 = envoymesh channel not registered → run `envoymesh setup`

---

## Identity & Messaging

| Command | Description |
|---------|-------------|
| `envoymesh identity` | Show owner, device, agent, bridge info |
| `envoymesh inbox` | Show recent chat messages |
| `envoymesh send <ownerId> <msg>` | Send P2P message to a peer |
| `envoymesh agent <prompt>` | Ask the AI agent a question |
| `envoymesh chat <to> <msg>` | Send test message via bridge |

### `envoymesh identity`
```
Identity
============================================
Owner:   envoy:owner:diBymBI4fBdIe0V...
Device:  envoy:device:1KoMqLW3ZC7LAhZ...
Agent:   My Agent (http://127.0.0.1:18789/webhook/envoymesh)
Bridge:  enabled (port 3031)
```

### `envoymesh inbox`
```
Recent messages (2 log(s)):

  [23:45] alice: hey, can you review my PR?
  [23:46] bob: sure, send me the link
  [23:47] alice: https://github.com/envoymesh/envoymesh/pull/42
```

### `envoymesh send`
```bash
envoymesh send envoy:owner:abc123 "hello from CLI"
```

### `envoymesh agent`
```bash
envoymesh agent "What is the current time?"
envoymesh agent "Summarize my vault contents"
```

---

## Vault

| Command | Description |
|---------|-------------|
| `envoymesh vault list` | List files in shared vault |
| `envoymesh vault search <query>` | Search vault contents |

```bash
envoymesh vault list
envoymesh vault search "architecture"
```

---

## Gateway Management

| Command | Description |
|---------|-------------|
| `envoymesh gateway start` | Start gateway independently |
| `envoymesh gateway stop` | Stop gateway process |
| `envoymesh gateway restart` | Restart gateway |
| `envoymesh gateway status` | Quick gateway health check |

```bash
envoymesh gateway restart    # restart without touching the node
envoymesh gateway status     # check if gateway is responding
```

---

## OpenClaw Passthrough

All OpenClaw CLI commands pass through via `envoymesh openclaw` or `envoymesh oc`.

### Plugin Management

```bash
envoymesh oc plugins search web-search
envoymesh oc plugins install tavily
envoymesh oc plugins list
envoymesh oc plugins remove tavily
envoymesh oc plugins update
```

### Gateway & Config

```bash
envoymesh oc gateway status --deep
envoymesh oc config get
envoymesh oc config set gateway.auth.mode none
envoymesh oc onboard
```

### Model & Agent

```bash
envoymesh oc models list
envoymesh oc models add openai-compatible --base-url http://localhost:8080/v1 --api-key sk-xxx
envoymesh oc agents list
envoymesh oc sessions list
envoymesh oc ask "What time is it?"
```

### Diagnostics

```bash
envoymesh oc doctor
envoymesh oc doctor --fix
envoymesh oc gateway status --deep
```

---

## Development

| Command | Description |
|---------|-------------|
| `envoymesh build` | Build EnvoyMesh TypeScript |
| `envoymesh test [args]` | Run tests (`vitest run`) |
| `envoymesh typecheck` | Type-check all packages |
| `envoymesh clean` | Remove dist, node_modules, temp dirs |

```bash
envoymesh test                          # run all tests
envoymesh test apps/node/test           # run specific test suite
envoymesh test -- --grep "bridge"       # filter by pattern
envoymesh clean                         # fresh start
```

### Smoke Tests

```bash
envoymesh smoke local    # two-node local smoke test
envoymesh smoke bridge   # OpenClaw bridge smoke test
```

---

## Apps

| Command | Description |
|---------|-------------|
| `envoymesh social dev` | Start Social UI dev server |
| `envoymesh social build` | Build Social UI for production |
| `envoymesh tauri dev` | Start Tauri desktop app |
| `envoymesh tauri build` | Build Tauri desktop app |
| `envoymesh relay` | Start relay node |

```bash
envoymesh social dev     # starts on localhost:5173
envoymesh tauri dev      # desktop app with WebView
```

---

## Debug & Diagnostics

| Command | Description |
|---------|-------------|
| `envoymesh doctor` | Run 11 diagnostic checks |
| `envoymesh config` | Show bridge configuration |
| `envoymesh discover [query]` | Search for peers on the mesh |
| `envoymesh peers` | List bridge tools/peers |
| `envoymesh logs` | Show process PIDs |
| `envoymesh version` | Show all version info |
| `envoymesh help` | Show command reference |

### `envoymesh doctor`
```
EnvoyMesh Doctor
============================================
  ✓ pnpm
  ✓ openclaw (OpenClaw 2026.6.2)
  ✓ Node >= 22 (v24.11.1)
  ✓ OpenClaw source
  ✓ dist/entry.js
  ✓ Extension linked
  ✓ Plugin onStartup
  ✓ Bridge config
  ✓ Bridge enabled
  ✓ agentUrl configured

✓ All checks passed
```

---

## Full Command Reference

```
envoymesh <command> [args]

Core:
  setup              Full setup (deps + build + link + typecheck)
  start              Start node + gateway
  stop               Stop node + gateway
  restart            Restart node + gateway
  status             Health check for all services

Identity & Chat:
  identity | id      Show owner, device, agent, bridge info
  inbox              Show recent chat messages
  send <owner> <msg> Send P2P message via bridge
  agent | ask <...>  Ask the AI agent a question
  chat <to> <msg>    Send test message via bridge

Vault:
  vault list         List files in shared vault
  vault search <q>   Search vault contents

Gateway:
  gateway | gw start|stop|restart|status

OpenClaw:
  openclaw | oc <...>  Full OpenClaw CLI passthrough

Development:
  build              Build TypeScript
  test [args]        Run vitest
  typecheck          Type-check all packages
  clean              Remove build artifacts
  smoke <local|bridge>  Run smoke tests

Apps:
  social dev|build   Social UI
  tauri dev|build    Desktop app
  relay              Relay node

Debug:
  doctor             Diagnose installation
  config             Show bridge config
  discover [query]   Search peers on mesh
  peers              List bridge tools
  logs               Show process info
  version | -v       Show versions
  help | -h          This help
```

---

## Architecture

```
envoymesh CLI
  ├── start/stop/restart  → npm run node:dev
  │                         node auto-starts gateway as child process
  ├── gateway *           → openclaw gateway --port 18789 ...
  ├── openclaw/oc *       → openclaw <args> (full passthrough)
  ├── identity/inbox/send → reads config + chat logs + curl to bridge
  ├── vault               → reads shared_vault/ filesystem
  ├── agent               → curl POST to gateway webhook
  ├── status/doctor       → curl probes + pgrep + config reads
  ├── build/test/typecheck → npm run scripts
  └── social/tauri/relay  → npm run scripts
```

---

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Gateway HTTP 404 | `envoymesh setup` to rebuild with envoymesh channel |
| Gateway not responding | `envoymesh gateway restart` |
| Bridge not responding | `envoymesh restart` |
| Plugins not found | `envoymesh oc plugins list` |
| pnpm install fails | `envoymesh clean && envoymesh setup` |
| Build fails | `cd packages/openclaw && CI=true pnpm install && CI=true pnpm run build` |
| Full reset | `envoymesh stop && envoymesh clean && envoymesh setup && envoymesh start` |
