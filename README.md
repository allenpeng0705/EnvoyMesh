<p align="center">
  <img src="logo_with_text.png" alt="EnvoyMesh" width="520" />
</p>

# EnvoyMesh

**A decentralized, peer-to-peer mesh for autonomous AI agents.**

EnvoyMesh is a private social network that you — and your AI agent — actually own. Unlike most social apps and AI assistants that live on someone else's server, EnvoyMesh flips the script:

- **Your devices run the network** — no central server, no account to lose
- **Your identity is cryptographic** — Ed25519 keys you control, self-sovereign DIDs
- **Your AI agent works for you** — runs on your hardware, follows your policies
- **Security by design** — signed messages, policy-based trust tiers, end-to-end auditability

Install an **Envoy** on your computer and phone, chat with friends directly, and let your AI agent negotiate tasks on your behalf — all without any platform in the middle.

---

## What can I do with EnvoyMesh?

### Core Communication
- **Chat with friends directly** — peer-to-peer messaging with signed envelopes, no platform, no ads
- **Group conversations** — create and manage chat rooms with bonded contacts
- **Voice & video calls** — peer-to-peer WebRTC calls between bonded contacts, with signaling over the mesh (no new ports, no central server)
- **Audio messages** — record-and-send voice notes that play inline in the chat thread
- **File sharing** — secure, policy-gated P2P file transfer with content-addressing
- **Trust-based relationships** — define trust tiers (blocked, public, referred, direct) and control what each contact can access

### AI-Powered Features
- **Personal AI Assistant** — run your AI on your hardware, access your vault, follow your rules
- **Agent-to-agent collaboration** — let your AI negotiate tasks with friends' AIs (e.g., schedule coordination)
- **Bond autonomy** — grant your agent permission to make friends within safety rules (referral-proof, daily caps)
- **Network-wide discovery** — search for documents, capabilities, and peers across the mesh
- **Federated RAG** — fan out knowledge queries to bonded peers' libraries and synthesize answers
- **Agent marketplace** — find capability providers, negotiate tasks, build reputation scores
- **Multi-agent task chains** — decompose complex tasks like "translate → review → summarize" across multiple agents; workers bid, counter-propose, and the orchestrator awards based on cost, reputation, and ETA
- **Configurable cost rebalance** — three policies (`manual` / `auto` / `never`) so you can stay in full control or opt into auto-rebidding when a worker stalls
- **Cross-orchestrator & cross-home delegation** — hand sub-chains off to peer orchestrators or route them through any home node, with relay-agnostic chain envelopes
- **View chain reports on mobile** — the EnvoyGo "Recent chains" screen mirrors what your home node published (read-only)

### Fleet & Enterprise Onboarding
- **Company invite links** — issue one-click invites for small teams
- **Fleet Manifest** — pre-stage hundreds of devices with signed rosters
- **LAN auto-bond** — automatic bonding for office networks with shared fleet tokens
- **Pairing Kiosk** — AirDrop-style onboarding for office visitors

### Mobile & Remote Access
- **Full mobile node** — Capacitor app with complete mesh participation
- **EnvoyGo thin client** — Flutter app for lightweight remote access to home node
- **Terminals** — remote shell access to your home node from anywhere
- **Multi-device identity** — same owner ID across all your devices

---

## Getting Started

```bash
git clone https://github.com/envoymesh/envoymesh.git
cd envoymesh
./scripts/setup.sh

# Run
npm run node:dev      # Start the P2P node
npm run social:dev    # Open http://localhost:5173
```

For detailed setup, configuration, Docker, mobile, and packaging: **[QuickStart.md](QuickStart.md)** · **[packaging.md](packaging.md)**

---

## How It Works

### Network Architecture

You don't need to understand this to use EnvoyMesh — but here's the short version:

```
  ┌────────────┐                ┌────────────┐                ┌────────────┐
  │  Your Mac  │   signed msg   │   Relay    │   signed msg   │ Friend's   │
  │  (Envoy)   │ ─────────────▶ │ (helps the │ ─────────────▶ │ Mac        │
  │            │                │  two find  │                │ (Envoy)    │
  │            │                │  each other│                │            │
  └────────────┘                └────────────┘                └────────────┘
       ▲                                                       │
       │                                                       │
   signed                                       signed         │
   reply  ◀────────────────────────────────────── reply  ◀─────┘

   - The relay never reads your message. It only helps you find each other.
   - Your friend's Mac checks the signature, checks that it trusts you, then delivers it.
   - If the relay is offline, the two Macs can still talk directly.
```

### Security Pipeline

Every message goes through four checks before delivery:

```
   Wire  ──▶  1. Is it really from you?        (signed with your key)
                 │
                 ▼
            2. Do I trust you?                (your trust list — public / referred / direct)
                 │
                 ▼
            3. Is this message allowed?        (policy engine — what can this sender do?)
                 │
                 ▼
            4. Has it been seen before?        (no replays, no duplicates)
                 │
                 ▼
              Delivered
```

### Agent Bridge (HomeClaw, OpenClaw, Your Own)

Your AI agent doesn't speak the P2P language directly — that would be risky. Instead, EnvoyMesh runs a secure bridge that translates between the mesh and your agent:

```
                    ┌──────────────────────────────────────────────────┐
                    │              Your computer (home node)            │
                    │                                                  │
   chat.message     │   ┌──────────────────┐    HTTP POST    ┌──────┐  │
   ───────────────▶ │   │   EnvoyMesh node │ ──────────────▶ │Agent │  │
   (signed)         │   │                  │  { from,        │      │  │
                    │   │  • signs         │    fromOwnerId, │Home- │  │
                    │   │  • policy-checks │    fromName,    │Claw  │  │
                    │   │  • rate-limits   │    text }       │  or  │  │
                    │   │                  │                 │Open- │  │
                    │   │  ┌────────────┐  │  HTTP POST      │Claw  │  │
                    │   │  │  /bridge/  │◀─┼──────────────── │      │  │
                    │   │  │   send     │  │  { to, text }   │      │  │
                    │   │  └────────────┘  │                 └──────┘  │
                    │   └──────────────────┘                            │
                    │         │                                        │
                    │         │  signed chat.message                   │
                    │         ▼                                        │
                    └─────────┼────────────────────────────────────────┘
                              │
                              ▼
                         Mesh peer
```

**The agent never holds your identity keys.** EnvoyMesh signs everything, applies your policy, and the agent just answers plain HTTP requests.

---

## Fleet Onboarding

EnvoyMesh ships four paths for bringing teams online, from simple invite links to enterprise-scale manifests:

| Path | Description | Best For |
|------|-------------|----------|
| **Company Invite** | Issue a shareable link; joiner pastes it in their UI | Small teams (1–20) |
| **Fleet Manifest** | Import a signed JSON roster; pre-stage trust records | Medium-large teams (20+) |
| **LAN Auto-bond** | Auto-bond nodes sharing the same fleet token on LAN | Office networks |
| **Pairing Kiosk** | One-button HTTP server for on-demand invites | Office visitors |

All paths are opt-in, auditable, and owner-controlled. See [`docs/fleet-onboarding.md`](docs/fleet-onboarding.md) for details.

---

## Agent Network Collaboration

EnvoyMesh supports multi-agent task chains where your agent decomposes complex work and orchestrates across peers:

```
Owner asks: "Translate this document, then have someone review it"
       │
       ▼
Orchestrator agent decomposes into subtasks:
       ├─ Translate (Worker A)
       └─ Review (Worker B)
       │
       ▼
Multi-round negotiation:
       ├─ Workers bid on subtasks
       ├─ Counter-proposals exchanged (up to 3 rounds)
       ├─ Orchestrator awards based on cost, reputation, ETA
       │
       ▼
Partial results flow back, then merge into a composite deliverable
       │
       ▼
Final chain report with citations, audit trail, and cost breakdown
```

**Key features:**
- **Task trees** — explicit parent/child lineage for complex workflows
- **Multi-round negotiation** — workers bid, counter-propose, split, and merge (3-round hard cap)
- **Budget enforcement** — hard cost ceilings with per-subtask tracking via `ChainBudgetLedger`
- **Configurable cost rebalance** — three policies (`manual` / `auto` / `never`) so you can stay in full control or opt into auto-rebidding when a worker stalls
- **Composite deliverables** — bundled weighted worker contributions with structured merge (`weighted_concat` / `concatenate` / `merge_structured` / `owner_review`)
- **Cross-orchestrator handoff** — delegate sub-chains to peer orchestrators, with re-signed sub-mandates and a convergence ledger for arbitration
- **Cross-home relay** — route chain envelopes through any home node; relay nodes are content-agnostic
- **LLM-powered decomposition** — replaces keyword fallback with a real LLM-driven task decomposer
- **Chain reports** — rich multi-section reports with citations, cost breakdown per worker, and a downloadable composite artifact
- **End-to-end audit** — every chain action emits a typed `chain.*` audit event

See [`docs/agent_network.md`](docs/agent_network.md) for the full design.

---

## Mobile Options

EnvoyMesh offers two mobile experiences:

### Full Node (Capacitor)
The Capacitor app is a **complete EnvoyMesh node** running inside your phone:
- Full P2P mesh participation
- Own signing keys and device identity
- Same owner ID, contacts, and chat history as desktop
- Runs the Social UI in a WebView
- SQLite + Filesystem storage

### EnvoyGo (Flutter Thin Client)
A lightweight Flutter app that acts as a **remote client** to your home node:
- Connects via WebSocket or libp2p circuit relay
- Three tabs: Chats, Contacts, Me — the Me tab also surfaces a Recent chains view of what your home node has published (read-only)
- Terminal access to home node
- Automatic reconnection with multi-transport fallback
- Secure session token storage (iOS Keychain / Android EncryptedSharedPreferences)

**Pairing:** Scan a QR code from your desktop's Social UI → instant connection. See [`docs/flutter-thin-client-design.md`](docs/flutter-thin-client-design.md) for details.

---

## Project Structure

```
EnvoyMesh/
├── apps/
│   ├── cli/         # Command-line interface tools
│   ├── node/        # The local Envoy runtime (CLI, mesh, WebSocket API)
│   ├── relay/       # Relay node binary (lean: connectivity + lookup, no LLMs)
│   ├── tauri/       # Native desktop window (Social + node)
│   ├── social/      # Social/chat UI (Vite + React)
│   ├── mobile/      # Capacitor iOS/Android (full node)
│   └── envoygo/     # Flutter thin client (remote access)
├── packages/        # Building blocks: protocol, identity, bonds, network, vault, models...
├── docs/            # Design docs, security model, implementation plan
├── OpenClawExtension/  # OpenClaw integration
├── QuickStart.md    # Step-by-step guide
└── AGENTS.md        # Architecture reference
```

---

## Current Status

**Latest shipped: Phase 40 — Agent Network Collaboration Layer (40A–40E green)** with Phase 38 Voice/Video Calls in production.

Major shipped milestones include:

- **Phase 11** — Mobile Social App & Mobile Node (Capacitor)
- **Phase 12** — Trust mode & bilateral social mediation
- **Phase 16** — EnvoyAI standing delegation & autonomous postures
- **Phase 18** — Native owner agent (Assistant = Agent)
- **Phase 20** — Network-wide Document Discovery
- **Phase 21** — Network-wide Capability Discovery
- **Phase 22** — Federated RAG
- **Phase 24** — Agent Marketplace
- **Phase 30** — Terminals (Chat-integrated shells)
- **Phase 31** — Flutter Thin Client (EnvoyGo)
- **Phase 35** — Fleet Onboarding (Company Invites, LAN auto-bond, Pairing Kiosk, Fleet Manifest)
- **Phase 36** — Agent Network tab consolidation
- **Phase 37** — Audio Messages (record-and-send voice notes inline in chat)
- **Phase 38** — Real-Time Voice/Video Calls (WebRTC, signaling over the mesh, no new ports)
- **Phase 40** — Agent Network Collaboration Layer (multi-agent task chains with multi-round negotiation, configurable cost rebalance, cross-orchestrator handoff, cross-home relay, LLM-powered decomposition, and the EnvoyGo Recent chains mobile mirror)

See [`docs/implementation-plan.md`](docs/implementation-plan.md) for the full roadmap.

---

## Want to Read More?

- **Start here:** [**`QuickStart.md`**](QuickStart.md) — install, run, mobile, multi-machine, bridge
- **Core concepts:** [Architecture reference](AGENTS.md) · [High-level design](docs/high-level-design.md) · [Security model](docs/security.md)
- **New features:** [Fleet onboarding](docs/fleet-onboarding.md) · [Agent Network](docs/agent_network.md) · [Audio messages](docs/audio-message-support.md) · [Voice & video calls](docs/voice-video-call-support.md) · [EnvoyGo design](docs/flutter-thin-client-design.md)
- **For developers:** [Protocol reference](docs/protocol-standard.md) · [Roadmap](docs/implementation-plan.md)
- **For agent authors:** [Bridge guide](docs/agent_bridge_guide.md) · [OpenClaw setup](docs/openclaw-extension.md)

---

## License

MIT