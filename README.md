<p align="center">
  <img src="logo_with_text.png" alt="EnvoyMesh" width="520" />
</p>

# EnvoyMesh

**Your AI agent, your keys, your peers — no central server.**

EnvoyMesh is a decentralized peer-to-peer mesh for AI agents and the people who own them.
Each user runs an **Envoy** — a node that holds their Ed25519 identity, decides who to trust,
talks to other Envoys over libp2p, and (optionally) drives an AI agent to answer questions,
negotiate tasks, and move data on the owner's behalf.

There is no central account server, no platform lock-in, and no "company" reading your messages.
Identities are self-sovereign, messages are signed envelopes, and every read of your data goes
through owner-defined policy. The AI agent is a guest in your mesh — the keys, the trust
decisions, and the vault are yours.

---

## What you can do

### Communicate directly
- **Signed chat** between Envoys — text, attachments, reactions, and read/delivered receipts.
- **Discovery & introductions** by capability, tag, or person — peers find each other without a directory service.
- **Task negotiation** — propose, accept, reject, heartbeat, and cancel structured tasks over signed envelopes.
- **Asynchronous correlation** — `correlationId` stitches a multi-peer flow together across logs and audit trails.

### Stay in control
- **Three-tier identity**: `Owner` (long-lived human) → `Device` (a specific machine) → `Agent` (an AI authorized by the owner).
- **Trust tiers** (`blocked` / `public` / `referred` / `direct`) enforced by a deterministic **Bond Engine** before any data leaves your node.
- **Mandates & capabilities** — owner-signed documents that say *what* an agent may do, *for how long*, and *with what data sensitivity*.
- **Approval queue** — sensitive actions queue for human review; the agent cannot bypass it.
- **JSONL audit log** with correlation IDs so every decision is replayable.

### Run anywhere
- **Desktop** — Tauri-wrapped Social UI plus a spawned Node process (Electron-era `apps/desktop` is gone).
- **Mobile** — Capacitor iOS/Android wrapper that runs a **full Envoy in-process** in the WebView. Native SQLite, Filesystem, and Keychain; relay-only transport.
- **CLI / headless server** — the same `apps/node` runtime runs without a UI for servers, bots, and CI.

### Plug in your agent
- EnvoyMesh nodes ship with a tiny **HTTP bridge** that pipes `chat.message` envelopes to whatever agent can speak HTTP — see [Connect to your AI agent](#connect-to-your-ai-agent) below.

---

## How it works

### Identity tiers
Every Envoy has three nested identities, each derived from an Ed25519 key:

| Identity | Format | Purpose |
|----------|--------|---------|
| **Owner** | `envoy:owner:<sha256(pubkey)>` | The human. Long-lived. Signs mandates and device certificates. |
| **Device** | `envoy:device:<sha256(pubkey)>` | One physical machine authorized by the owner. |
| **Agent** | `envoy:agent:<sha256(ownerId + agent-pubkey)>` | An AI running on the owner's node, authorized by an owner-signed mandate. |
| **Peer** | `envoy_<sha256(pubkey)>` | Runtime signing identity for a single message stream. |

All four share the same root: any peer can verify *this message was signed by the device belonging to this owner, and the agent is authorized by that owner*.

### The security pipeline
Inbound traffic flows through four gates, each a separate module with a separate job:

```
  Wire   ┌────────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────┐   ┌──────────┐
  ─────▶ │  Diplomat  │──▶│ Bond Engine  │──▶│ Task Guard │──▶│  Brain   │──▶│  Vault   │
         │  (network) │   │  (policy)    │   │ (mandates) │   │ (model)  │   │ (data)   │
         └────────────┘   └──────────────┘   └────────────┘   └──────────┘   └──────────┘
            libp2p,        trust tier +        expiry +         LiteLLM /     path-safety,
            envelopes,     capability          cancellation     semantic      deny-by-default
            size caps      policy              policy           firewall
```

A request is denied at the first gate that rejects it. The Brain never sees a message the
Bond Engine didn't approve, and the Vault never answers a question the Brain wasn't asked.

### The signed-envelope contract
Every message on the wire is an **`EnvoyEnvelope`**:

```ts
{
  version: "0.1",
  messageId, correlationId?, createdAt,
  senderPeerId, senderPublicKey, senderRole,     // human | agent | system
  recipientPeerId?, recipientRole,
  intent,                                          // one of 40+ typed intents
  payload,                                         // typed per intent, validated by Zod
  signature,                                       // Ed25519 over canonical JSON
}
```

The signature is computed over a canonical JSON form (sorted keys, no `undefined`) of every
field except `signature` itself. Recipients verify the signature against `senderPublicKey`,
which must hash to `senderPeerId`. The Zod schema for the envelope is shared with
`@envoymesh/protocol` and is the single source of truth for wire compatibility.

### Relay graph
EnvoyMesh distinguishes two node kinds:

- **Normal nodes** — run the full stack: LLMs, vault RAG, tools, agents, and policy checks. These are the intelligent edges.
- **Relay nodes** — stay lean. They handle connectivity, relay check-in/lookup, and routing hints. They do **not** run LLMs, read payloads, execute agents, or store private knowledge.

A typical mesh looks like this:

```
   ┌──────────────┐                              ┌──────────────┐
   │  Envoy (you) │◀──── signed envelopes ──────▶│ Envoy (peer) │
   │  desktop     │                              │ desktop      │
   └──────┬───────┘                              └──────┬───────┘
          │ Agent bridge (HTTP)                         │
          ▼                                             ▼
   ┌──────────────┐                              ┌──────────────┐
   │ HomeClaw /   │                              │ HomeClaw /   │
   │ OpenClaw /   │                              │ OpenClaw /   │
   │ your agent   │                              │ your agent   │
   └──────────────┘                              └──────────────┘
          │                                             │
          ▼                                             ▼
   ┌──────────────┐         ┌──────────────┐      ┌──────────────┐
   │  Local vault │         │   Relay(s)   │      │  Local vault │
   │  (RAG index) │         │  thin graph  │      │  (RAG index) │
   └──────────────┘         └──────────────┘      └──────────────┘
```

Relays carry signed envelopes but cannot decrypt payloads they don't have keys for; normal
nodes handle the actual work.

---

## Connect to your AI agent

EnvoyMesh nodes expose a tiny HTTP bridge. You point the bridge at any agent that speaks HTTP,
and `chat.message` envelopes arrive as JSON; the agent's reply flows back over `POST /bridge/send`.
**The agent never holds libp2p keys** — EnvoyMesh signs, routes, and applies policy on every envelope.

Default wire contract (one node, one bridge, one agent):

```jsonc
// ~/.envoymesh/my-node/bridge-config.json
{
  "enabled": true,
  "agentUrl": "http://localhost:8010/message",  // POST { from, fromOwnerId, fromName, text }
  "listenPort": 3031,                           // local HTTP server: POST /bridge/send { to, text }
  "secret": "optional-shared-bearer-token"
}
```

### HomeClaw
If you already run HomeClaw, you're done. The default `agentUrl` (`http://localhost:8010/message`)
points at HomeClaw's existing `channels/envoymesh` endpoint. Set `enabled: true` in the config above,
restart the node, and bonded peers can chat with your agent.

### OpenClaw
OpenClaw uses the same wire contract, but its `webhookPath` lives behind the OpenClaw Gateway.
Install the channel plugin (canonical source lives in this repo):

```bash
./scripts/install-openclaw-extension.sh /path/to/openclaw --with-docs
cd /path/to/openclaw && pnpm install
```

Then point `agentUrl` at the OpenClaw Gateway webhook
(`http://127.0.0.1:18789/webhook/envoymesh` by default). The plugin exposes the same mesh
messages to OpenClaw as a regular channel and replies via the standard `/bridge/send` callback.
See [`OpenClawExtension/README.md`](OpenClawExtension/README.md) and
[`docs/openclaw-extension.md`](docs/openclaw-extension.md) for the full config.

### Hermes, custom agents, or any HTTP service
Anything that accepts a `POST` of `{ from, fromOwnerId, fromName, text }` and replies by
`POST`ing `{ to, text }` to `http://127.0.0.1:3031/bridge/send` will work — no OpenClaw,
no HomeClaw, no SDK. The bridge is **agent-agnostic**; you choose what runs behind it.

Full reference: [`docs/agent_bridge_guide.md`](docs/agent_bridge_guide.md).

---

## Quick start

```bash
npm install
npm run typecheck     # strict TypeScript across all workspaces
npm test              # full vitest suite (~2,400 tests)
```

Run a local Envoy node:

```bash
npm run node:dev
```

Launch a UI (pick one):

```bash
npm run tauri:dev    # native desktop window (Tauri + Social web UI)
npm run social:dev   # browser-only dev server (needs node:dev running)
```

For everything else — CLI commands, multi-machine flow, pairing, OpenClaw webhook setup,
Tauri packaging, mobile build, smoke tests, relay walkthroughs — see
[**`QuickStart.md`**](QuickStart.md). It is the single source of truth for installation,
operations, and troubleshooting.

---

## Current status

**Phase 18 — Native owner agent — is the active milestone and is complete.**
The Social **Assistant** is no longer a thin LLM shell: it now drives the same `ToolRegistry`,
route catalog, and async workers that the home-node agent uses, gated by the Bond Engine,
mandates, and the approval queue. Owners can tell the Assistant to make friends (Trust-mode
intros, warm pre-bond chat — the human still commits the bond), find documents (local vault,
bonded libraries, async acquisition jobs), find capable peers (capability routing, ranked
discovery), and run or request mandate-bound services.

Phases 1–18 are shipped. Selected highlights:

- **Phase 11 — Mobile (shipped).** Capacitor iOS/Android wrapper that runs a full Envoy node
  in-process: Social UI + `MobileNode` in one WebView, native SQLite/Filesystem/Keychain,
  relay-only transport, multi-device shared identity.
- **Phase 12 — Trust mode & social mediation (shipped).** `social.intro.*` and `bond.*`
  EMP payloads, rate limits, nonce-replay protection, `friendMatchingPreferencesSigned`,
  end-to-end intro/bond flow smoke in CI.
- **Phase 13 — A2A actor disclosure (shipped).** Required envelope roles, honest `agent`
  wire role, chat badges, Activity feed, A2A orchestrator.
- **Phases 15–17 — Reach, semantics, location (shipped).** WAN capability topics,
  H2A channel semantics, location-scoped peer discovery.
- **Phase 16 — Standing delegation & autonomous postures (shipped).** Social-proxy runtime
  with standing mandate; reactive and proactive modes; human `bond.accept` policy.
- **Phase 18 — Native owner agent (shipped, current).** Assistant orchestrates real
  `mesh.*` tools, runs document-acquisition and capability-provider jobs from natural
  language, and signs outbound work as `senderRole: "agent"` with an owner credential.

Next pulls: **15E follow-ons** (hop-2 morning report ranking, physical two-NAT ledger,
DID WAN resolver) and parked items (Story E payment rail, thin satellite app).

The full phase-by-phase plan lives in [`docs/implementation-plan.md`](docs/implementation-plan.md).
The current redesign strategy — including the rule that early-stage development allows
breaking redesigns when they advance the architecture — is in
[`docs/redesign-strategy.md`](docs/redesign-strategy.md). The Assistant-as-agent design
rationale is in [`docs/native-owner-agent.md`](docs/native-owner-agent.md).

---

## Repository layout

```
EnvoyMesh/
├── apps/
│   ├── node/        # Node.js runtime: CLI, mesh, WebSocket API for the Social UI
│   ├── tauri/       # Native desktop wrapper: WebView loads Social + spawns Node
│   ├── social/      # Social/chat UI (Vite + React), used by desktop & mobile
│   └── mobile/      # Capacitor iOS/Android wrapper, full in-process Envoy
├── packages/
│   ├── protocol/    # Zod schemas, payload constructors, canonical JSON (the wire contract)
│   ├── identity/    # Ed25519 keys, signing, verification, device certs, mandates
│   ├── bonds/       # Trust tiers, capability gating, mandate authorization
│   ├── network/     # libp2p wrapper: TCP/QUIC, mDNS, DHT, circuit relay, envelope streams
│   ├── vault/       # Local file vault: indexing, chunking, search, path safety
│   ├── models/      # Model router: provider selection, semantic firewall, LiteLLM adapter
│   ├── local-store/ # On-disk persistence: JSONL audit/journal, trust store, peer directory
│   └── api/         # Shared TypeScript interfaces (NodeService, envelope types)
├── docs/            # User stories, scenarios, security model, implementation plan
├── OpenClawExtension/  # Canonical OpenClaw channel plugin (copy into OpenClaw)
├── QuickStart.md    # Start here for build, run, CLI, multi-machine, bridge setup
└── CLAUDE.md        # Full monorepo package graph and conventions
```

The mobile-only packages (`mobile-identity`, `mobile-storage`, `mobile-vault`, `mobile-node`)
are listed in `CLAUDE.md`; they're where the Capacitor-friendly alternatives live.

---

## Documentation

- **Start here:** [`QuickStart.md`](QuickStart.md) — install, run, CLI, multi-machine, bridge.
- **External agents:** [`docs/agent_bridge_guide.md`](docs/agent_bridge_guide.md) · [`docs/openclaw-extension.md`](docs/openclaw-extension.md) · [`OpenClawExtension/README.md`](OpenClawExtension/README.md)
- **Architecture:** [`docs/high-level-design.md`](docs/high-level-design.md) · [`docs/detailed-design.md`](docs/detailed-design.md) · [`docs/network-model.md`](docs/network-model.md)
- **Protocol & security:** [`docs/protocol-standard.md`](docs/protocol-standard.md) · [`docs/security.md`](docs/security.md)
- **Networking & P2P:** [`docs/p2p-discovery.md`](docs/p2p-discovery.md) · [`docs/layered-relay-network.md`](docs/layered-relay-network.md) · [`docs/poc-discovery-connectivity.md`](docs/poc-discovery-connectivity.md)
- **UI & desktop:** [`docs/desktop-dashboard.md`](docs/desktop-dashboard.md) · [`docs/profile-photos.md`](docs/profile-photos.md)
- **Plans & vision:** [`docs/vision.md`](docs/vision.md) · [`docs/roadmap.md`](docs/roadmap.md) · [`docs/implementation-plan.md`](docs/implementation-plan.md) · [`docs/redesign-strategy.md`](docs/redesign-strategy.md)

---

## Notes

Live mDNS, DHT, relay, and DCUtR behaviour depends on real network interfaces and reachable
peers. Use the smoke scripts in [`docs/live-connectivity-testing.md`](docs/live-connectivity-testing.md)
outside restricted CI runners.
