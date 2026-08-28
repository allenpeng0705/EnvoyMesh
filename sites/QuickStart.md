# EnvoyMesh QuickStart

This guide shows how to install, build, verify, run the node, use the CLI, validate relay discovery, and launch the **Social** UI (browser or **Tauri** native wrapper).

Requirements narrative: [docs/UserStory.md](docs/UserStory.md). Scenario backlog: [docs/scenarios.md](docs/scenarios.md). Design vs code: [docs/alignment-review.md](docs/alignment-review.md).

## Table of Contents

- [Requirements](#requirements)
- [Install](#install)
- [Build And Verify](#build-and-verify)
- [Local Data Layout](#local-data-layout)
- [Knowledge Base (Obsidian, MCP)](#knowledge-base-phase-44)
- [Run An Envoy Node](#run-an-envoy-node)
- [AI Agent & External Agents](#ai-agent--external-agents)
- [Agent Network Collaboration](#agent-network-collaboration-phase-40)
- [Terminals](#terminals-phase-30)
- [Voice, Video & Audio Messages](#voice-video--audio-messages)
- [Use The Developer CLI](#use-the-developer-cli)
- [Social Challenge Probe](#social-challenge-probe-untrusted-peer)
- [Run The Social UI (Tauri or Browser)](#run-the-social-ui-tauri-or-browser)
- [Mobile App (Capacitor)](#mobile-app-capacitor--ios--android)
- [Cross-Network Relay Walkthrough](#cross-network-relay-walkthrough-mac-relay--two-windows)
- [WAN Discovery Troubleshooting](#wan-discovery-troubleshooting-short)
- [End-to-End Verification Checklist](#end-to-end-verification-checklist-line-by-line)
- [Live Connectivity Smoke Tests](#live-connectivity-smoke-tests)
- [Useful Commands](#useful-commands)

## Requirements

- macOS, Linux, or Windows with a recent terminal.
- Node.js **22.13+** required (matches the repo's `engines.node` pin in `package.json`).
- npm (included with Node.js) and **pnpm** (setup installs pnpm if missing).
- **Sibling repo [envoy-harness](https://github.com/allenpeng0705/envoy-harness)** — coding-agent runtime. `setup` clones it next to EnvoyMesh when missing.

Layout after setup:

```text
parent/
  EnvoyMesh/       ← this repo
  envoy-harness/   ← auto-cloned by setup (or clone manually)
```

## Install

Both `scripts/setup.sh` (mac/Linux) and `scripts/setup.ps1` (Windows) do the
same steps in the same order. They are deliberately kept as twins — if
you change one, change the other in the same commit.

From the repository root (EnvoyMesh only is enough — setup fetches harness):

```bash
# macOS / Linux
./scripts/setup.sh
# or
npm run setup
```

```powershell
# Windows (PowerShell 5.1+ — built into Windows 10/11)
.\scripts\setup.ps1
# or
npm run setup:win
```

### Setup flags

Both scripts accept the same flags, with shell-native spelling:

| Purpose | mac/Linux | Windows PowerShell |
| --- | --- | --- |
| Use a local OpenClaw checkout (skip GitHub clone) | `--local /path/to/openclaw` | `-LocalOpenClawPath C:\path\to\openclaw` |
| Use an existing envoy-harness checkout | `--local-envoy-harness /path/to/eh` | `-LocalEnvoyHarnessPath D:\path\to\eh` |
| Skip harness build when `dist/` is already ready | `--skip-envoy-harness-build` | `-SkipEnvoyHarnessBuild` |
| Skip the long OpenClaw build + smoke test | `--skip-openclaw-build` | `-SkipOpenClawBuild` |
| Skip the final TypeScript typecheck | `--skip-typecheck` | `-SkipTypecheck` |
| Show usage and exit | `-h`, `--help` | `-?`, `-h`, `-Help` (PowerShell convention) |

Examples:

```bash
# Re-run quickly with harness + OpenClaw + typecheck already verified
./scripts/setup.sh --skip-envoy-harness-build --skip-openclaw-build --skip-typecheck

# Bootstrap from a local OpenClaw checkout (good when the GitHub repo is
# slow or you're developing openclaw in parallel)
./scripts/setup.sh --local ~/work/openclaw

# Point at a harness checkout that is not named ../envoy-harness
./scripts/setup.sh --local-envoy-harness ~/work/envoy-harness
```

```powershell
# Windows equivalent
.\scripts\setup.ps1 -LocalOpenClawPath C:\work\openclaw
.\scripts\setup.ps1 -LocalEnvoyHarnessPath D:\work\envoy-harness
.\scripts\setup.ps1 -SkipEnvoyHarnessBuild -SkipOpenClawBuild -SkipTypecheck
```

### OpenClaw bootstrap only

If you only need the OpenClaw (EnvoyAI) bootstrap without the full build:

```bash
# macOS / Linux
./scripts/install-openclaw.sh                # bundled copy
./scripts/install-openclaw.sh --local /path/to/openclaw   # external copy

# Windows PowerShell
.\scripts\install-openclaw.ps1
.\scripts\install-openclaw.ps1 -LocalOpenClawPath C:\path\to\openclaw
```

### envoy-harness bootstrap only

```bash
./scripts/install-envoy-harness.sh
./scripts/install-envoy-harness.sh --local /path/to/envoy-harness
./scripts/install-envoy-harness.sh --skip-build
```

```powershell
.\scripts\install-envoy-harness.ps1
.\scripts\install-envoy-harness.ps1 -LocalEnvoyHarnessPath D:\path\to\envoy-harness
.\scripts\install-envoy-harness.ps1 -SkipBuild
```

Override path without `--local`: `export ENVOY_HARNESS_DIR=/path/to/envoy-harness` (or `$env:ENVOY_HARNESS_DIR` on Windows). npm `file:` deps still expect a sibling at `../envoy-harness` — the install script creates a symlink/junction when needed.

### What the setup script does

Eight steps (0–7), in order:

0. **Clean stale artifacts** — drop an incomplete `packages/openclaw/dist`.
1. **Toolchain check** — verify Node 22+; install pnpm if missing.
2. **envoy-harness sibling** — clone `../envoy-harness` if missing, then `pnpm install` + build (skip with `--skip-envoy-harness-build` when `dist/` is ready).
3. **Install EnvoyMesh dependencies** — `pnpm install` at the root (needs the sibling for `file:` packages).
4. **OpenClaw bootstrap + extension copy** — clone (or use `--local`),
   copy `OpenClawExtension` into `packages/openclaw/extensions/envoymesh`.
5. **Build OpenClaw gateway** — `pnpm install --no-frozen-lockfile` + metadata
   generation + `pnpm run build` + smoke-test the webhook. Skipped if you
   pass `--skip-openclaw-build` / `-SkipOpenClawBuild`.
6. **Bridge config template** — copy
   `apps/node/data/default/bridge-config.openclaw.example.json` to
   `bridge-config.json` if no file exists yet.
7. **TypeScript typecheck** — `tsc -p tsconfig.json` for `@envoymesh/api` and
   `@envoymesh/node`. Skipped if you pass `--skip-typecheck` / `-SkipTypecheck`.

The plain `pnpm install` from a fresh clone also works **after** the harness
sibling exists; the setup scripts are an opinionated one-shot that also
bootstraps envoy-harness + OpenClaw, copies the envoymesh channel extension,
builds the OpenClaw gateway, and
smoke-tests the webhook.

## Build And Verify

Run the TypeScript build check (also runs as setup step 7):

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
```

Build what the **Tauri** app embeds (Social static UI + Node entrypoint):

```bash
npm run social:build
npm run node:build
```

Create a native installer / bundle:

```bash
npm run tauri:build
```

## Local Data Layout

EnvoyMesh defaults to:

- `./data/default` for local profile, audit, task, approval, and trust records.
- `./shared_vault` for owner-approved notes, documents, and inbox items the Envoy
  may index. **Phase 44 turned this into a pluggable knowledge base** — see the
  next section.

The Phase 44 vault layout (auto-created on first run; safe alongside the old
`shared_vault/`):

```
shared_vault/
├── .envoy/                  ← Internal metadata (never shared)
│   ├── sensitivity.json     ← Per-item sensitivity overrides (Published toggle)
│   └── plugins/
│       └── obsidian/        ← Link graph + frontmatter cache
├── notes/                   ← User-created Markdown notes (edit in Library UI)
│   ├── research/  tutorials/  personal/  work/
├── documents/               ← Imported files (PDF, Word, images, etc.)
├── inbox/                   ← Received files from peers
└── temp/                    ← Staging for imports
```

Supported file types: `.txt`, `.md`, `.json`, plus imported `.pdf` / `.docx` /
`.png` / `.jpg`. Legacy files dropped at the vault root continue to work.

### Knowledge base (Phase 44)

The Social app's **Library** tab is the in-app KB UI:

- **Native note creation** — Markdown editor with create / edit / preview / delete;
  notes are auto-indexed by the RAG pipeline on save (no restart).
- **Per-item sensitivity** — each note has a Published toggle (`public` / `friends`
  / `private`). Persisted to `.envoy/sensitivity.json` so it survives restarts and
  re-indexes. Sensitivity is per-item, not per-folder — the same folder can mix
  public and private notes.
- **Public knowledge mesh** — public notes are queryable by all peers via
  `knowledge.query`, not just bonded contacts. Strangers are rate-limited
  (5/min, 50/hour) and only see the public sub-graph of wiki-links.
- **Plug-in providers** — Settings → AI → Knowledge Base → Plugins installs and
  enables optional providers:
  - **`obsidian`** — frontmatter YAML, `[[wiki-links]]` graph, sensitivity auto-sync
    from `published: true/false`; sensitivity-aware link resolution so private
    `[[links]]` are stripped from stranger responses. The vault directory
    (`~/.local/share/envoymesh/default/vault/`) can be opened directly in
    Obsidian for rich editing while EnvoyMesh handles networking. EnvoyMesh
    never modifies notes — all writes go through the Social UI or the
    `createNote` RPC.
  - **`mcp`** — write-back: agent discoveries can be saved as vault notes with
    source attribution and `friends` sensitivity by default.

Full design: [`docs/knowledge-base-and-rag.md`](docs/knowledge-base-and-rag.md).
Programmatic access: `createNote` / `listKbPlugins` / `enableKbPlugin` /
`disableKbPlugin` JSON-RPC methods on `NodeService`.

## Run An Envoy Node

Start a local Envoy node:

```bash
npm run node:dev
```

Use a custom profile directory:

```bash
npm run node:dev -- --profile ./data/alice
```

Disable local mDNS discovery:

```bash
npm run node:dev -- --no-mdns
```

Enable advanced P2P options:

```bash
npm run node:dev -- --dht-client --bootstrap "<bootstrap-multiaddr>" --relay --autonat --dcutr
```

Use managed WAN defaults (recommended for non-LAN testing):

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --connectivity-strict --p2p-debug
```

Use a YAML config file instead of passing every flag or environment variable:

```bash
npm run node:dev -- --config ./envoymesh.node.yaml
```

Example `envoymesh.node.yaml`:

```yaml
profile: ./data/primary
listen:
  - /ip4/0.0.0.0/tcp/0
discovery:
  profile: wan-default
  connectivityStrict: true
  bootstrapPresets:
    - public-libp2p
    - public-libp2p-am6
    - public-libp2p-am7
  bootstrapPeers:
    - /dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN
  p2pDebug: true
```

Configuration precedence is: defaults, then YAML config file, then environment variables, then CLI flags.

Run a relay server:

```bash
npm run node:dev -- --profile ./data/relay --listen /ip4/0.0.0.0/tcp/4001 --discovery-profile wan-default --relay --relay-server --p2p-debug
```

Normal nodes can use that relay as a bootstrap/check-in target:

```bash
npm run node:dev -- --profile ./data/node-a --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap "<relay-multiaddr>" --relay --autonat --dcutr --p2p-debug
```

The relay stores short-lived `relay.checkin` rows, answers bounded `relay.lookup` requests, and can forward lookups across selected relay neighbors using summaries, `maxHops`, `maxFanout`, query IDs, and negative caching.

## AI Agent & External Agents

EnvoyMesh supports a **two-engine agent network** — a built-in AI (EnvoyAI/OpenClaw) and an optional external agent connected over HTTP.

### Built-in Agent: EnvoyAI (OpenClaw)

EnvoyAI ships with every EnvoyMesh node and starts automatically on port `:18789`:

- Runs in-process inside the node runtime — no separate install or config needed.
- Full mesh access — can search your vault, look up contacts, and send messages on your behalf.
- Policy-controlled — follows your bond rules, sensitivity labels, and approval settings.
- Toggled at startup via `node-config.json` (`openclawEnabled: true/false`).

### External Agent Bridge

The bridge makes the node act as a message pipe between P2P chat and an external agent (HomeClaw, Hermes, OpenHuman, or any HTTP endpoint). One node = one bridge = one configured agent.

**Ext Agent (Phase 32 — first-class config).** The External Agent Bridge is configured
in **Settings → AI → Agent Network**. Built-in OpenClaw remains the default engine
(`openclawEnabled: true` on fresh install); Ext Agent (`bridgeEnabled: true`) is
opt-in. Defaults: HomeClaw on `http://127.0.0.1:8010/message`, Hermes on `:8020`,
OpenHuman on `:8021`, or any custom HTTP endpoint. The mobile thin-client mirrors
the same state under **Me → Agent Network** as read-only.

#### Configuration

Create a `bridge-config.json` in your profile directory:

```json
{
  "enabled": true,
  "agentUrl": "http://localhost:8080/message",
  "listenPort": 3031,
  "secret": "optional-shared-secret"
}
```

Fields:
- `enabled` (boolean, default `false`) — enable the bridge
- `agentUrl` (string, default `http://localhost:8080/message`) — external agent HTTP endpoint
- `listenPort` (number, default `3031`) — local HTTP server port for agent callbacks
- `secret` (string, optional) — shared secret for Bearer auth on both sides

The bridge agent identity is automatically generated on first run and persisted as `bridge-identity.json` in the profile directory.

#### Agent Protocol

**P2P → Agent (forward):** When a `chat.message` arrives addressed to the bridge's agent peer ID, the bridge POSTs to the configured `agentUrl`:
```json
{
  "from": "12D3PeerId",
  "fromOwnerId": "envoy:owner:alice",
  "fromName": "Alice",
  "text": "Hello agent!"
}
```

**Agent → P2P (callback):** The external agent sends a reply to `POST http://127.0.0.1:<listenPort>/bridge/send`:
```json
{
  "to": "12D3PeerId or envoy:owner:alice",
  "text": "Hello back!"
}
```

The bridge signs the reply as a `chat.message` EMP envelope with `senderRole: "agent"` and sends it via P2P.

If `secret` is configured, both sides use `Authorization: Bearer <secret>`.

#### Supported Agents

Any HTTP-speaking agent works. All share the same `envoymesh-message` wire protocol and HTTP adapter. Only one external agent can be active at a time.

| Agent | Default URL | Description |
| --- | --- | --- |
| **HomeClaw** | `http://127.0.0.1:8010/message` | The original external agent. Python/FastAPI-based. |
| **Hermes** | `http://127.0.0.1:8020/message` | Alternative external agent with Obsidian-style knowledge tools. |
| **OpenHuman** | `http://127.0.0.1:8021/message` | Community external agent. Disabled by default — enable in Settings. |
| **Custom** | Your URL | Any HTTP server implementing the `envoymesh-message` wire contract. |

#### AI Engine Modes

The bridge supports four AI engine combinations (configured in **Settings → AI → AI Engine**):

| Mode | Built-in (EnvoyAI) | External Agent | Use case |
| --- | --- | --- | --- |
| Built-in only | ✅ | ❌ | Default on fresh install |
| Built-in + Ext | ✅ | ✅ | Both engines active; Ext handles overflow |
| Ext only | ❌ | ✅ | Full control of external agent |
| None | ❌ | ❌ | No AI; pure P2P chat |

#### Mesh Tools Available to External Agents

When the bridge is active, the external agent can call mesh tools through the bridge:

- `mesh.findKnowledge` — search the owner's vault and public knowledge mesh
- `mesh.findContact` — look up bonded contacts
- `mesh.sendMessage` — send chat messages to peers
- `mesh.listContacts` — list all bonded contacts
- `mesh.getProfile` — read the owner's profile

The external agent never holds Ed25519 identity keys — EnvoyMesh signs everything on the agent's behalf.

The bridge is agent-agnostic — it just pipes messages. The agent decides what to do with them.

Correlate outbound probes and A2A sends (optional `correlationId` on the wire envelope):

```bash
npm run node:dev -- --ping "<peer-multiaddr>" --correlation-id "demo-corr-1"
```

After a peer sends verified `system.signal`, you can target by stable owner id (LAN identity match baseline):

```bash
npm run node:dev -- --ping "envoy:owner:alice" --correlation-id "demo-owner-1"
```

Send a signed **`knowledge.query`** (mock handler on the peer: validates payload, logs, writes audit — no vault RAG yet):

```bash
npm run node:dev -- --knowledge-query "<peer-multiaddr>" --knowledge-text "Summarize the vault README." --correlation-id "kq-1"
```

Send a signed **`bond.request`** (peer runs `evaluatePolicy` on the payload and writes audit):

```bash
npm run node:dev -- --bond-request "<peer-multiaddr>" --bond-message "Let's connect" --bond-proof "Met at meetup" --correlation-id "bond-1"
```

Send a signed **`discovery.request`** (peer enforces trust tier + per-owner rate limit, then returns `discovery.response`):

```bash
npm run node:dev -- --discovery-request "<peer-multiaddr>" --discovery-tag-hash "hash:books" --discovery-capability "task.execute" --discovery-max-results 5 --correlation-id "disc-1"
```

Send a signed **`chat.message`**:

```bash
npm run node:dev -- --chat "<peer-multiaddr>" --chat-text "Hello from EnvoyMesh" --correlation-id "chat-1"
```

Emit libp2p connection/stream lifecycle telemetry into the local audit log as `p2p.trace` rows (no payload logging):

```bash
npm run node:dev -- --p2p-debug
```

## Agent Network Collaboration (Phase 40)

The Agent Network enables multi-agent task chains where your AI agent decomposes complex work and distributes it across bonded peers' agents.

### Key Features

- **Task trees** — explicit parent/child relationships for complex workflows (e.g., "translate → review → summarize").
- **Multi-round negotiation** — workers bid, counter-propose, split, and merge tasks (3-round hard cap).
- **Budget enforcement** — hard cost ceilings with per-subtask tracking via `ChainBudgetLedger`.
- **Configurable cost rebalance** — three policies:
  - `manual` — owner approves every rebid (full control).
  - `auto` — automatically rebid when a worker stalls.
  - `never` — no rebalancing; let the chain fail fast.
- **Composite deliverables** — bundled weighted worker contributions with structured merge (`weighted_concat`, `concatenate`, `merge_structured`, `owner_review`).
- **Cross-orchestrator handoff** — delegate sub-chains to peer orchestrators with re-signed sub-mandates.
- **Cross-home relay** — route chain envelopes through any home node; relay nodes are content-agnostic.
- **LLM-powered decomposition** — real LLM-driven task decomposer replaces keyword fallback.
- **Chain reports** — rich multi-section reports with citations, cost breakdown per worker, downloadable composite artifact.
- **End-to-end audit** — every chain action emits a typed `chain.*` audit event.
- **Mobile** — EnvoyGo thin client shows a read-only "Recent chains" view under **Me → Agent Network**.

### How It Works

1. You send a task request to your AI agent via chat.
2. Your agent (the **orchestrator**) decomposes the task into sub-tasks.
3. Sub-tasks are broadcast to bonded peers' agents (**workers**) via the mesh.
4. Workers bid on sub-tasks, negotiate terms, and execute.
5. Results flow back to the orchestrator, which synthesizes the final deliverable.
6. A chain report is generated with full cost and citation breakdown.

Full design: [`docs/agent_network.md`](docs/agent_network.md).

## Terminals (Phase 30)

EnvoyMesh Terminals provide chat-integrated remote shell access to your home node from anywhere — including from the mobile app.

### Architecture

- **Browser-based terminals** use xterm.js connecting to the home node's PTY over WebSocket.
- Dedicated WebSocket endpoint: `ws://127.0.0.1:3032/ws/terminal/{sessionId}` (separate from JSON-RPC).
- Binary frame protocol: 1-byte version + 1-byte type (stdin/stdout/resize/exit) + payload.
- Attachment flow: JSON-RPC `terminalAttach` → short-lived token (10 min) → WebSocket connection → buffered scrollback + live PTY output.
- Loopback-only in v1; mobile remote tunnels frames via HomeRemote using base64-wrapped payloads.

### Features

- **Chat-integrated** — launch a terminal from the chat thread; it appears inline.
- **Multiple sessions** — open multiple terminal sessions simultaneously.
- **Scrollback** — full scrollback history preserved and replayed on attach.
- **Agent mode** — AI agent can observe terminal output and execute commands (with approval).

### External Multiplexer Support

- **herdr** — optional external TUI multiplexer for local macOS/Linux power users (AGPL-3.0, not bundled).
- **TmuxAI** — optional external tool for tmux users; EnvoyMesh natively implements equivalent patterns (`/observe`, `/confirm`, `/pin`).

Terminal docs: [`docs/terminals-external-herdr.md`](docs/terminals-external-herdr.md), [`docs/terminals-wire-protocol.md`](docs/terminals-wire-protocol.md).

## Voice, Video & Audio Messages

### Voice & Video Calls (Phase 38)

Real-time voice calls between two bonded peers using WebRTC:

- **Dual-transport design:**
  - **Path 1 (LAN/direct P2P):** WebRTC audio over an existing libp2p data channel — no STUN/TURN needed.
  - **Path 2 (cross-NAT):** Standard ICE with STUN/TURN for peer-to-peer media when direct connection isn't possible.
- **Signaling over the mesh** — call invite, accept, ICE candidates, and hangup ride the existing P2P envelope layer. No new ports or servers required.
- **Peer-to-peer media** — Opus audio streams directly between peers. The home node handles signaling and trust only; it never touches media.
- **Trust-enforced** — calls are only allowed between bonded contacts.

Video calls, group calls, SFU, and in-call messaging are deferred to a future phase.

### Audio Messages (Phase 37)

Record-and-send voice notes that play inline in the chat thread:

- Tap the microphone icon in chat to record a voice message.
- Messages are delivered as P2P `chat.message` envelopes with audio payload.
- Playback is inline — no external app needed.

### Voice Calls on EnvoyGo (Phase 42)

The Flutter thin client supports native WebRTC voice calls:

- Bonded EnvoyGo users can place and receive real-time voice calls to other EnvoyGo phones or Social/desktop users.
- Media is peer-to-peer; the home node does signaling only.
- iOS: VoIP push notifications + CallKit integration for calls when the app is backgrounded.
- TURN credentials for symmetric NAT traversal.

Voice/video docs: [`docs/voice-video-call-support.md`](docs/voice-video-call-support.md), [`docs/voice-video-call-envoygo.md`](docs/voice-video-call-envoygo.md).

## Use The Developer CLI

Show profile summary:

```bash
npm run cli -w @envoymesh/node -- profile --profile ./data/default
```

Inspect audit events:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --limit 20
```

Filter audit rows by correlation/task id substring, and optionally include noisy `p2p.trace` rows:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --audit-correlation task-1 --include-p2p-trace
```

Inspect task journal:

```bash
npm run cli -w @envoymesh/node -- tasks --profile ./data/default --limit 20
```

List pending approvals:

```bash
npm run cli -w @envoymesh/node -- approvals --profile ./data/default --status pending
```

Approve or reject an approval request:

```bash
npm run cli -w @envoymesh/node -- approvals approve approval_123 --profile ./data/default
npm run cli -w @envoymesh/node -- approvals reject approval_123 --profile ./data/default
```

Manage trust records:

```bash
npm run cli -w @envoymesh/node -- trust --profile ./data/default
npm run cli -w @envoymesh/node -- trust set envoy:owner:alice --level direct --name Alice --profile ./data/default
npm run cli -w @envoymesh/node -- trust remove envoy:owner:alice --profile ./data/default
```

Show ranked morning discovery digest:

```bash
npm run cli -w @envoymesh/node -- morning-report --profile ./data/default --limit 10
```

Inspect relay-node state:

```bash
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay --format json
```

`relay-status` reads the local `relay.manager.snapshot` audit row and reports relay identity, roster freshness, relay-book neighbors, summaries, routing metrics, recent relay traces, and warnings.

Index and search the shared vault:

```bash
npm run cli -w @envoymesh/node -- vault-index --vault ./shared_vault
npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "P2P agent"
npm run cli -w @envoymesh/node -- vault-manifest --vault ./shared_vault --output ./shared_vault/manifest.json
```

Send a pairing request from CLI:

```bash
npm run node:dev -- --pair-request "<primary-peer-multiaddr>" --pair-note "Pair my satellite device"
```

Pairing-specific queue commands from developer CLI:

```bash
npm run cli -w @envoymesh/node -- pairing list --profile ./data/default
npm run cli -w @envoymesh/node -- pairing approve <approval-id> --profile ./data/default
npm run cli -w @envoymesh/node -- pairing reject <approval-id> --profile ./data/default
npm run cli -w @envoymesh/node -- pairing retry <peer-id> --profile ./data/default
npm run cli -w @envoymesh/node -- pairing timeline --profile ./data/default --limit 50
npm run cli -w @envoymesh/node -- pairing timeline --profile ./data/default --format json --output ./pairing-timeline.json
npm run cli -w @envoymesh/node -- pairing timeline --profile ./data/default --status deferred --query "Primary unavailable"
```

Generate a machine-to-machine smoke checklist:

```bash
npm run cli -w @envoymesh/node -- smoke-checklist --machine-a primary --machine-b satellite
npm run cli -w @envoymesh/node -- smoke-checklist --output ./docs/generated-smoke-checklist.md
npm run smoke:multimachine:guide
npm run smoke:local
```

## Social challenge probe (untrusted peer)

This script dials a victim multiaddr and sends a small set of intentionally hostile (but non-secret-exfiltrating) frames to validate inbound guard and dispatcher reject paths:

```bash
npm run social:challenge -w @envoymesh/node -- --target "<victim-multiaddr>" --scenario all
```

## Run the Social UI (Tauri or browser)

**Tauri (end-user style):** native window loading the same web UI as production.

```bash
npm run tauri:dev
```

The packaged app stores profile data under the Tauri app-data directory and sets `ENVOYMESH_PROFILE` for the spawned Node process (see `apps/tauri/src-tauri/src/main.rs`).

**Browser (full control of profile flags):** run the node with your profile, then open the Vite dev server.

```bash
ENVOYMESH_PROFILE=./data/alice ENVOYMESH_VAULT=./shared_vault npm run node:dev
# other terminal:
npm run social:dev
```

If the repo root is ambiguous to tooling, set `ENVOYMESH_WORKSPACE=/path/to/EnvoyMesh` where supported.

The **Social** app (Vite + React, served by the node) and the Tauri desktop wrapper are the only graphical surfaces — there is no Electron panel.

Use machine A as `primary`, machine B as `satellite`.

### Step 1: Start both nodes

Machine A:

```bash
npm run node:dev -- --profile ./data/primary --listen /ip4/0.0.0.0/tcp/0 --p2p-debug
```

Machine B:

```bash
npm run node:dev -- --profile ./data/satellite --listen /ip4/0.0.0.0/tcp/0 --p2p-debug
```

Copy each printed `Listening on:` multiaddr.

### Step 2: Pairing workflow

Machine B sends pairing request:

```bash
npm run node:dev -- --profile ./data/satellite --pair-request "<primary-multiaddr>" --pair-note "Request satellite pairing"
```

Machine A opens Social and approves (node must run with `./data/primary`):

```bash
ENVOYMESH_PROFILE=./data/primary ENVOYMESH_VAULT=./shared_vault npm run node:dev
# second terminal:
npm run social:dev
```

In Social:
- Open **Pairing Queue** (or equivalent flow in the current UI).
- Approve the pending `pairing:*` request.

Machine B verifies in audit:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/satellite --limit 40
```

### Step 3: Chat + task + data transfer

Machine B:

```bash
npm run node:dev -- --profile ./data/satellite --chat "<primary-multiaddr>" --chat-text "Hello primary" --correlation-id "chat-e2e-1"
npm run node:dev -- --profile ./data/satellite --task-propose "<primary-multiaddr>" --task-id task-e2e-1 --objective "Summarize notes" --requested-result "One bullet summary" --correlation-id "task-e2e-1"
npm run node:dev -- --profile ./data/satellite --data-send "<primary-multiaddr>" --data-relative-path notes.md
```

Machine A verifies in both CLI and dashboard:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/primary --limit 60 --include-p2p-trace
npm run cli -w @envoymesh/node -- tasks --profile ./data/primary --limit 40
```

## Mobile App (Capacitor — iOS / Android)

The mobile app runs the full EnvoyMesh node **in-process** inside a Capacitor WebView. The Social UI (React SPA) and `MobileNode` runtime share a single JavaScript context — no child process, no WebSocket server. Networking is relay-only (outbound WebSocket). Storage uses native Capacitor plugins (SQLite, Filesystem, Keychain).

### Architecture: Dependency Injection

Capacitor-native implementations live in `apps/mobile/src/`, NOT in the packages. Packages stay pure TypeScript — fully testable in Node.js without native deps.

```
apps/mobile/src/
  ├── capacitor-sqlite-database.ts   # MobileDatabase via @capacitor-community/sqlite
  ├── capacitor-filesystem-vault.ts  # MobileVault via @capacitor/filesystem
  ├── capacitor-secure-storage.ts    # SecureStorage via capacitor-secure-storage-plugin
  ├── bootstrap.ts                   # Wire everything, init MobileNode
  └── index.ts                       # Public exports
```

`MobileNode` accepts optional `database`, `vault`, and `secureStorage` in its config. When omitted, everything falls back to in-memory — perfect for dev and CI testing.

### Requirements

- Node.js 22+
- Xcode 16+ (iOS) or Android Studio (Android)
- Capacitor CLI: `npm install -g @capacitor/cli`

### Install & Build

```bash
# Install all workspace dependencies
npm install

# Type-check everything (including mobile packages)
npm run typecheck

# Run full test suite (mobile tests use in-memory fallbacks)
npm test

# Build the Social UI (shared with desktop app)
npm run social:build
```

### Run on Device

```bash
# Navigate to the Capacitor project
cd apps/mobile

# Add iOS platform
npx cap add ios

# Add Android platform
npx cap add android

# Sync web assets + plugin config into native projects
npx cap sync

# Open in Xcode
npx cap open ios

# OR open in Android Studio
npx cap open android
```

From Xcode/Android Studio, select your device and hit Run.

### Identity Modes

The mobile app supports two identity modes:

**Standalone** (default): The app generates its own owner keypair + identity on first launch. Auto-persisted to SQLite + SecureStorage. On next launch, restores automatically — no onboarding needed.

**Shared** (import from home node): Scan the home node's QR code to import the owner identity. Same `ownerId` on both devices — contacts, bonds, and chat history are shared. Each device keeps its own device keypair. The home node signs a device certificate authorizing the mobile device.

```typescript
// bootstrap.ts entry point
const node = await bootstrapMobileApp({
  relayUrls: ["wss://relay.example.com:9000"],
  // database, vault, secureStorage auto-detected on native;
  // fall back to in-memory in dev
});
```

### What works in CI (no device needed)

All packages are tested in Node.js with in-memory fallbacks:
- `packages/mobile-identity/` — Ed25519 keygen, signing, verification, identity derivation, PEM encode/decode
- `packages/mobile-storage/` — Peer directory, trust store, session tokens, chat log, identity state (all SQL-backed, tested with `createInMemoryDb()`)
- `packages/mobile-vault/` — File CRUD, search, path safety
- `packages/mobile-node/` — Full `NodeService` lifecycle, relay WebSocket transport, signed envelope send/receive, inbound routing, SecureStorage persistence, pairing flow

### What requires a real device

- Capacitor SQLite plugin (`@capacitor-community/sqlite`) — native SQLite on iOS/Android
- Capacitor Filesystem plugin (`@capacitor/filesystem`) — native file I/O
- Capacitor SecureStorage plugin — iOS Keychain / Android EncryptedSharedPreferences
- QR code scanning → `pairWithHomeNode()` E2E
- Real relay WebSocket connectivity
- Background app refresh / push notifications

## Cross-Network Relay Walkthrough (Mac Relay + Two Windows)

Use this flow when two Windows nodes can discover a Mac node but cannot discover each other directly. The Mac runs as the relay/address switcher; both Windows nodes check in, then use `relay.lookup` to learn `/p2p-circuit` addresses for each other.

### 1) Start the Mac relay

Mac:

```bash
npm run node:dev -- --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay" --listen /ip4/0.0.0.0/tcp/4001 --discovery-profile wan-default --relay --relay-server --p2p-debug
```

Copy the Mac `Listening on:` multiaddr that ends with `/p2p/<mac-peer-id>`.

### 2) Start both Windows nodes

Windows A:

```powershell
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_a" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap "<mac-relay-multiaddr>" --relay --autonat --dcutr --p2p-debug
```

Windows B:

```powershell
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_b" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap "<mac-relay-multiaddr>" --relay --autonat --dcutr --p2p-debug
```

Wait 30-60 seconds for check-in and lookup cycles.

### 3) Verify relay health before app traffic

Run on Mac:

```bash
npm run cli -w @envoymesh/node -- relay-status --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay"
```

Expected:

```text
roster total=2 fresh=2 stale=0
```

Run on both Windows machines:

```powershell
npm run cli -w @envoymesh/node -- connectivity-status --profile "<profile-path>"
```

Optional: append **`--rich`** for an ASCII snapshot panel. The **Social** app may surface similar connectivity context; deep relay diagnostics are also available via CLI (`relay-status`, audit with `--include-p2p-trace`).

Expect relay traces such as `relay.checkin.ok`, `relay.lookup.ok`, `relay.lookup.response`, and relay peer candidates using `/p2p-circuit/p2p/<other-windows-peer-id>`.

### 4) Exercise signal / ping / chat / task / data

After a Windows node learns the other Windows node's relay candidate address, use that address as the target for ping/chat/task/data. You can also first validate Windows -> Mac:

```powershell
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_a" --ping "<win-b-relay-circuit-multiaddr>" --correlation-id "ping-wina-winb-1"
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_a" --chat "<win-b-relay-circuit-multiaddr>" --chat-text "hello through mac relay" --correlation-id "chat-wina-winb-1"
```

### 5) Verify in CLI + Social

Mac CLI:

```bash
npm run cli -w @envoymesh/node -- audit --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay" --limit 80 --include-p2p-trace
npm run cli -w @envoymesh/node -- relay-status --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay"
```

Mac Social (browser): with the node already running for this profile, use a second terminal:

```bash
npm run social:dev
```

## WAN Discovery Troubleshooting (Short)

If non-LAN discovery is unstable, check these first:

1. **Bootstrap availability**
   - Run `connectivity-status` and confirm bootstrap peer count is non-zero.
   - Add at least one known-good relay/bootstrap with `--bootstrap "<multiaddr>"` in addition to `--bootstrap-preset public-libp2p`.
   - For the Mac relay flow, both Windows nodes should bootstrap to the Mac relay's current printed multiaddr.

2. **Strict mode startup failures**
   - `--connectivity-strict` intentionally fails startup when all bootstrap probes fail.
   - For diagnosis, temporarily remove `--connectivity-strict`, collect `p2p.trace`, then restore it.

3. **Firewall/NAT restrictions**
   - Ensure outbound TCP is allowed on both machines.
   - If possible, allow inbound on the selected node port or retry with a fixed listen port.

4. **Wrong profile path / split state**
   - Verify the same absolute profile path is used for node, CLI, and dashboard commands.
   - Mismatched paths make dashboard and CLI appear empty even when traffic exists.

5. **Stale peer address**
   - If a node restarts, recopy the latest printed `Listening on:` multiaddr.
   - Dynamic ports change; old multiaddrs will fail.

6. **Relay roster is empty**
   - Run `relay-status` on the relay profile.
   - If `roster total=0`, verify the Windows nodes were started with `--relay`, `--bootstrap "<mac-relay-multiaddr>"`, and are using the intended profile paths.

## End-to-End Verification Checklist (Line By Line)

Run in order. Replace placeholders before executing.

1) Start Mac primary node:

```bash
npm run node:dev -- --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap-preset public-libp2p --connectivity-strict --p2p-debug
```

2) Start Windows satellite node:

```bash
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap-preset public-libp2p --connectivity-strict --p2p-debug
```

3) Health check on Mac:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary"
```

4) Health check on Windows:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite"
```

5) Windows send signed signal to Mac:

```bash
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --signal "<mac-multiaddr>" --correlation-id "sig-w2m-1"
```

6) Windows send ping/chat/task/data to Mac:

```bash
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --ping "<mac-multiaddr>" --correlation-id "ping-w2m-1"
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --chat "<mac-multiaddr>" --chat-text "hello from windows" --correlation-id "chat-w2m-1"
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --task-propose "<mac-multiaddr>" --task-id task-w2m-1 --objective "Summarize notes" --requested-result "One bullet summary" --correlation-id "task-w2m-1"
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --data-send "<mac-multiaddr>" --data-relative-path notes.md
```

7) Verify Mac audit + tasks:

```bash
npm run cli -w @envoymesh/node -- audit --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary" --limit 100 --include-p2p-trace
npm run cli -w @envoymesh/node -- tasks --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary" --limit 40
```

8) Open **Social** on Mac for the same profile (node already running from step 1):

```bash
npm run social:dev
```

9) Confirm the UI shows:
- Recent Audit rows for `system.signal`, `system.ping`, `chat.message`, `task.propose`, and data transfer events (and/or use CLI `audit` for full detail).
- Chat thread entries and task updates for `task-w2m-1`.
- Connectivity / discovery indicators as implemented in Social (use CLI `connectivity-status --rich` for the full text panel).

## Live Connectivity Smoke Tests

Ordered POC steps (LAN → WAN bootstrap → relay) are summarized in [docs/poc-discovery-connectivity.md](./docs/poc-discovery-connectivity.md). You can use `npm run poc:discovery -w @envoymesh/node` as an alias for the smoke script (if `poc:discovery` is missing, use `npm run connectivity:smoke -w @envoymesh/node`). **On Windows**, if `--mode`/`--timeout-ms` get dropped by npm, use `npm run poc:discovery:mdns -w @envoymesh/node` or run `npx tsx src/connectivity-smoke.ts --mode mdns --timeout-ms 20000` from `apps/node`.

Prove local mDNS discovery on a real machine:

```bash
npm run poc:discovery -w @envoymesh/node -- --mode mdns --timeout-ms 20000
```

Prove advanced connectivity against a reachable bootstrap or relay peer:

```bash
npm run poc:discovery -w @envoymesh/node -- --mode advanced --bootstrap "<bootstrap-multiaddr>" --timeout-ms 60000
```

## Useful Commands

```bash
# Build / test
npm run typecheck
npm test
npm run test:orchestrator -- dev     # Fast dev loop (~35s, no E2E)
npm run test:orchestrator -- full    # All tests + libp2p E2E + smoke (~10 min)

# Run
npm run node:dev
npm run social:dev
npm run tauri:dev
npm run setup                        # mac/Linux first-time bootstrap
npm run setup:win                    # Windows first-time bootstrap

# Native installers (per-platform shortcut)
npm run tauri:build                  # auto-detect host
npm run tauri:build:mac
npm run tauri:build:win
npm run tauri:build:linux
bash scripts/bundle.sh               # portable bundle (mac/Linux .tar.gz)
pwsh scripts/bundle.ps1              # portable bundle (Windows .zip)

# CLI
npm run cli -w @envoymesh/node -- --help
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay

# Global `envoymesh` binary (after `npm i -g .` from repo root)
envoymesh start                      # start node + OpenClaw gateway
envoymesh status                     # check node / bridge / gateway / ws health
envoymesh doctor                     # self-diagnostic
envoymesh stop                       # stop node + gateway
```