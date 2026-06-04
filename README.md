<p align="center">
  <img src="logo_with_text.png" alt="EnvoyMesh" width="520" />
</p>

# EnvoyMesh

**A private social network that you — and your AI agent — actually own.**

Most social apps and AI assistants live on someone else's server. They hold your account,
read your messages, and decide who you can talk to. EnvoyMesh flips that around: the network
runs on **your** devices, your identity is a key only you have, and your AI agent works for
**you** — not a platform.

You install an **Envoy** on your computer (and optionally your phone), and from then on you
can chat, share, and work with friends directly — peer to peer, no central server, no
account to lose. If you already use **HomeClaw** or **OpenClaw**, EnvoyMesh plugs your AI
agent into the same private network so it can talk to your friends on your behalf.

> **In one sentence:** EnvoyMesh is a peer-to-peer app that lets you and your AI agent
> talk to people you trust, with no central server in the middle.

---

## What can I do with it?

- **Chat with friends, directly.** No platform, no algorithm, no ads. Messages are
  end-to-end signed between your devices and your friends'.
- **Run the same AI assistant on your own computer.** Tell it to summarize a document,
  find a recipe, draft a reply. It's running on your hardware, with your keys.
- **Let your AI talk to a friend's AI.** When both of you opt in, your assistants can
  negotiate tasks on your behalf (e.g. "find a time that works for both of us next week").

### AI-powered features (new in 2026)

Your Envoy AI agent can now do much more than draft replies:

- **Make friends for you.** Grant your agent bond autonomy — it can meet new people and
  establish connections within your safety rules (referral-proof, daily caps, trust tiers).
- **Search the whole network for documents.** Beyond your contacts, your agent broadcasts
  discovery queries across the mesh with stopping rules. Public documents from any node
  are returned; sensitive documents stay gated.
- **Find people by what they can do.** Need a code reviewer? A translator? Your agent
  discovers capability providers across the network and matches them to your tasks.
- **Ask the mesh, not just your vault.** Federated RAG fans out knowledge queries to your
  bonded peers' published libraries and synthesizes a single answer — no central index.
- **Agent-crafted group suggestions.** The agent watches shared interests, document topics,
  and chat patterns, then suggests creating group chats around affinity clusters.
- **Multi-agent task marketplace.** Your agent negotiates tasks with other agents —
  propose, negotiate, execute, review, and leave feedback. Reputation scores guide
  future provider selection.
- **Agent chains.** "Translate this, then have someone review it, then summarize" —
  your agent decomposes complex tasks, finds providers for each step, and orchestrates
  the chain.
- **Proactive mesh awareness.** While you're away, the agent monitors the mesh for
  relevant activity, surfaces dormant bonds, and predicts what you might want next.

All of this is **local-first** — computation runs on your device, policies are enforced
by the Bond Engine, and you can kill-switch everything instantly.

- **Take it on your phone.** Install the mobile app, scan a QR code on your computer, and
  the same identity, contacts, and chat history show up on your phone — same person, two
  devices. The full pairing handshake is in
  [Pairing the phone with the desktop](#pairing-the-phone-with-the-desktop) below.
- **Use the assistant you already have.** EnvoyMesh has a small "bridge" to **HomeClaw**
  and **OpenClaw** so you can keep using your favorite agent. The full bridge architecture
  (sync chat + async `mesh.async_reply`, security boundary, wire contract) is in
  [The agent bridge](#the-agent-bridge-homeclaw-openclaw-your-own) below.

If you've ever wished WhatsApp, Signal, Discord, or ChatGPT were run by *you* — that's
what this is.

---

## How does it actually work?

You don't need to read this section to use EnvoyMesh — but if you're curious, here's the
short version.

### What happens when you send a message

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

That's the whole network: your device, your friend's device, and a thin relay that helps
them find each other. There is no "EnvoyMesh server" holding your messages.

### The four checks every message goes through

Before your friend's device shows them a message, it answers four questions. If any answer
is "no," the message is dropped:

```
   Wire  ──▶  1. Is it really from you?        (signed with your key)
                 │
                 ▼
            2. Do I trust you?                (your trust list — public / friend / blocked)
                 │
                 ▼
            3. Is this message allowed?        (the assistant can do X but not Y)
                 │
                 ▼
            4. Has it been seen before?        (no replays, no duplicates)
                 │
                 ▼
              Delivered
```

You set the answers to those questions. The assistant can't bypass them.

### The agent bridge (HomeClaw, OpenClaw, your own)

Your AI agent doesn't speak the peer-to-peer language itself — that would mean giving it
your keys, which is risky. Instead, EnvoyMesh runs a small **bridge** on your computer that
translates between the mesh and whatever agent you choose. **HomeClaw** and **OpenClaw**
share the exact same wire contract — the only thing that changes is which HTTP endpoint the
bridge points at.

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

**The agent never holds your identity keys.** EnvoyMesh signs everything, applies your
policy, and the agent just answers plain HTTP requests.

#### Two flows on one bridge

The same bridge handles two different traffic shapes, picked by the inbound `intent`:

```
  ┌─────────── chat (real-time) ───────────┐    ┌────── async (later) ─────────────┐
  │                                        │    │                                   │
  │  friend ─chat.message─▶ node           │    │  friend ─knowledge.query─▶ node  │
  │  node ─HTTP POST {from, text}─▶ agent  │    │  node ─async_reply {intent,     │
  │  agent ─POST /bridge/send {to, text}─▶ │    │       correlationId, payload}─▶  │
  │  node ─signed chat.message─▶ friend   │    │  agent                            │
  │                                        │    │  agent ─POST /bridge/send        │
  │  Sync; the agent answers inline.       │    │       { to, replyTo, payload }─▶  │
  │  No payload in the HTTP response.      │    │  node ─signed response─▶ friend  │
  │                                        │    │                                   │
  │                                        │    │  Used for discovery / knowledge;  │
  │                                        │    │  the agent may answer minutes     │
  │                                        │    │  later. The `correlationId`       │
  │                                        │    │  stitches the two halves.         │
  └────────────────────────────────────────┘    └───────────────────────────────────┘
```

The `async` shape is the OpenClaw plugin's `mesh.async_reply` payload
(`type: "mesh.async_reply"`, `intent`, `correlationId`, `payload`). HomeClaw uses the
sync `chat` shape only; OpenClaw can do both.

#### Security boundary

```
  ┌─────────────────── trust zone: EnvoyMesh ───────────────────┐
  │  libp2p keys, Ed25519 signing, bond-tier policy, replay     │
  │  dedup, audit log, rate limit, schema validation            │
  │     ┌────────────────────────────────────────────────────┐  │
  │     │  localhost HTTP only  (127.0.0.1:<listenPort>)     │  │  ◀── single rule
  │     └────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘
                              │
                              │  plain JSON over HTTP,
                              │  optional bearer secret
                              ▼
  ┌─────────────────── untrusted zone: agent ────────────────────┐
  │  HomeClaw, OpenClaw, or your custom service                 │
  │  No keys. No P2P. Just answers `POST`s and makes `POST`s.  │
  └──────────────────────────────────────────────────────────────┘
```

A few rules keep the boundary clean:

- The bridge listens on **127.0.0.1 only** (default port `3031`); the agent never needs
  to be reachable from the network.
- The bridge signs every outbound message itself; the agent never sees the private key.
- Inbound `chat.message` from a stranger is **denied by policy** before it reaches the
  agent — only contacts at *direct* trust (or above your per-agent threshold) make it
  through.
- The agent's reply is **routed, not echoed**: the bridge looks at the inbound envelope's
  `senderPeerId` and sends the reply to *that* peer, not whoever called the webhook last.
- One bridge = one `agentUrl`. To A/B HomeClaw vs. OpenClaw, run two profiles.

The wire contract is the smallest thing that could possibly work:

```http
# inbound  — bridge → agent
POST <agentUrl>
Content-Type: application/json
{
  "from":        "envoy_<peer-id>",
  "fromOwnerId": "envoy:owner:<sha256>",
  "fromName":    "Alice",
  "text":        "hi"
}

# outbound — agent → bridge
POST http://127.0.0.1:3031/bridge/send
{ "to": "envoy_<peer-id>", "text": "hello back" }

# async    — OpenClaw → bridge (mesh.async_reply)
POST http://127.0.0.1:3031/bridge/send
{
  "to":       "envoy_<peer-id>",
  "replyTo":  "knowledge.query",
  "payload":  { "matches": [ ... ] }
}
```

That's the whole contract. No SDK, no library, no agent-side signing.

---

## Pairing the phone with the desktop

The mobile app is a **full EnvoyMesh node**, not a thin client. After pairing, the phone
participates in the same P2P mesh as the desktop: same `ownerId`, same contacts, same chat
log, same bonds — but a distinct `deviceId` and its own signing key.

### What "pairing" actually does

```
   ┌──────────── desktop (home node) ────────────┐
   │  Settings → "Show pairing QR"              │
   │  ┌──────────────────────────────────────┐  │
   │  │  envoy://pair?                       │  │      ┌────────── phone ──────────┐
   │  │     wsUrl=wss://relay.../ws            │──┼──▶   │  Scan QR with mobile app  │
   │  │     token=<10-min one-shot>          │  │  QR  │  (Capacitor scanner)      │
   │  │     ownerId=envoy:owner:<sha256>     │  │      └────────────┬─────────────┘
   │  │     ownerPublicKey=<PEM>             │  │                   │
   │  │     agentPeerId=envoy_agent_...        │  │                   ▼
   │  │     agentName=My Agent               │  │   parseEnvoyPairUri() → params
   │  │  └──────────────────────────────────────┘  │
   └──────────────────────────────────────────┘     │
                                                      │   generate:
                                                      │     • deviceKeypair (Ed25519)
                                                      │     • ecdhKeyPair   (X25519)
                                                      ▼
                          ws://relay/...?target=<home>&token=...
                                      │
                                      ▼   pairSharedIdentity RPC
                          home node  ─────────────────────▶  mobile
                          ─ validates token (10-min TTL)
                          ─ generates persistent sessionToken (no TTL)
                          ─ creates device trust record at "direct"
                          ─ registers device in peer directory
                          ─ encrypts owner private key with ECDH(shared)
                          ─ signs a Device Certificate (owner → device)
                          ─ returns: { encryptedOwnerKey, deviceCertificate,
                                       sessionToken, ownerId, ownerPublicKey,
                                       agentPeerId, agentPubKey, ... }
```

The mobile app then:

1. **Decrypts** the owner private key with the ECDH-derived shared secret.
2. **Imports** the owner identity — same `ownerId` as the desktop, different `deviceId`.
3. **Persists** the device cert + the long-lived `sessionToken` (so it can reconnect
   without re-scanning the QR).
4. Connects to the relay over WebSocket and starts sending signed envelopes.

### What ends up where

```
                            ┌──── shared ────┐    ┌──── per-device ────┐
   owner identity           │                │    │                   │
   (Ed25519 keypair)        │  same on both  │    │                   │
                            │                │    │                   │
   ownerId                  │  same          │    │                   │
                            │                │    │                   │
   contact list, bonds,     │  same          │    │                   │
   chat log, vault index    │  (synced)      │    │                   │
                            │                │    │                   │
   device keypair           │                │    │  distinct         │
   deviceId                 │                │    │  distinct         │
   device certificate       │                │    │  signed by owner  │
   libp2p peerId            │                │    │  distinct         │
                            │                │    │                   │
   storage backend          │  JSONL / JSON  │    │  SQLite + FS +    │
                            │  (node side)   │    │  Keychain (mobile)│
                            └────────────────┘    └───────────────────┘
```

Two devices, one identity, three separate signing keys (owner + device-A + device-B). The
phone can't read the desktop's session, and vice versa, even though they share the
underlying human identity.

### How messages flow once paired

```
   ┌───────── phone ─────────┐         ┌───── relay mesh ─────┐        ┌───────── desktop ─────────┐
   │  MobileNode             │  ws     │                       │  ws    │  NodeService              │
   │  (in WebView)           │ ──────▶ │  signed envelope      │ ─────▶ │  (child process)          │
   │                         │         │  → home-node peer id  │        │                           │
   │  DirectCallClient       │         │                       │        │  inbox guard              │
   │  (in-process calls)     │         │  on behalf of phone:  │        │  → policy                 │
   └─────────────────────────┘         │  • chat.message       │        │  → bridge → HomeClaw/     │
            ▲                         │  • knowledge.query    │        │    OpenClaw                │
            │                         │  • task.*             │        │                           │
            │                         │                       │        │  reply path:               │
            │                         │                       │ ◀───── │  agent → /bridge/send      │
            │                         │                       │        │  → signed reply            │
            │                         │                       │  ws    │                           │
            │                         │  signed reply         │ ──────▶│                           │
            │  displayed in Social    │                       │        └───────────────────────────┘
            │  UI (same React app)    │                       │               ▲
            └─────────────────────────┘                       │               │ same identity
                                                              │               │
                                          (also: phone ↔ friend directly
                                           if friend is on the same relay)
```

Two things worth noticing:

- **No central server holds messages.** The relay is dumb routing — it forwards signed
  envelopes; it can't read them.
- **The phone and the desktop can talk to the same friend independently.** Either one
  can answer a `chat.message`. If both are online, the friend's device will see two
  signed envelopes (one from each), each verifiable against the same `ownerId`.

### Two identity modes

The mobile app ships with a toggle for which mode you want:

| Mode | How it boots | When to use it |
|------|-------------|----------------|
| **Standalone** (default) | App generates its own owner keypair on first launch, persists to SQLite + Keychain. Restores on next launch. | A second person using the same device, or a quick test install. |
| **Shared** (after QR scan) | Imports the home node's owner private key (encrypted in the QR handshake), keeps its own device keypair, stores the device certificate. | Your phone, paired with your Mac. Same `ownerId`, same contacts. |

You can switch modes by uninstalling and re-pairing — the data is local, there's no
account to delete.

### What's actually portable

- ✅ Contacts, bonds, chat history, vault index — shared through `ownerId`
- ✅ Trust records and mandate credentials
- ✅ The agent's `peerId` and public key (so the phone can `chat.message` the agent)
- ❌ Running model state (LLM context windows) — phones start cold; the desktop's brain
  is its own
- ❌ In-flight WebSocket sessions — each device opens its own to the relay

Full step-by-step for building, running, and scanning is in
[**`QuickStart.md`**](QuickStart.md#mobile-app-capacitor--ios--android).

---

## Getting started

You only need three commands to try it locally:

```bash
# 1. Install dependencies (one time)
npm install

# 2. Make sure everything is healthy
npm test

# 3. Run a local Envoy
npm run node:dev
```

After that, open the Social app:

```bash
npm run tauri:dev     # native desktop window (recommended)
# or, for browser-only:
npm run social:dev
```

Want to run the **mobile** app, talk to **OpenClaw** or **HomeClaw**, pair two machines,
or do a real two-device test? The full step-by-step is in
[**`QuickStart.md`**](QuickStart.md) — start there once the basics above work.

---

## Plug it into your AI agent

If you already have an AI agent running locally, you can wire it to EnvoyMesh in about
a minute.

### HomeClaw
Already running? Open your profile's `bridge-config.json` and flip `enabled` to `true`.
The default URL (`http://localhost:8010/message`) points at HomeClaw's existing
EnvoyMesh channel — no extra install.

### OpenClaw
Run the install script and restart the OpenClaw Gateway:

```bash
./scripts/install-openclaw-extension.sh /path/to/openclaw --with-docs
cd /path/to/openclaw && pnpm install
```

Then point the bridge at the OpenClaw webhook
(`http://127.0.0.1:18789/webhook/envoymesh` by default). Full setup:
[`OpenClawExtension/README.md`](OpenClawExtension/README.md).

### Your own agent
Any HTTP service that accepts a `POST` of:

```json
{ "from": "...", "fromOwnerId": "...", "fromName": "...", "text": "Hello!" }
```

...and replies by `POST`ing `{ "to": "...", "text": "Hi back!" }` to
`http://127.0.0.1:3031/bridge/send` will work. No SDK, no library. The full reference
(including OpenClaw's advanced `mesh.async_reply` flow) is in
[`docs/agent_bridge_guide.md`](docs/agent_bridge_guide.md).

---

## Where things are in this repo

```
EnvoyMesh/
├── apps/
│   ├── node/        # The local Envoy runtime (CLI, mesh, WebSocket API)
│   ├── tauri/       # Native desktop window that bundles the Social app + node
│   ├── social/      # The Social/chat UI (Vite + React), used by desktop & mobile
│   └── mobile/      # Capacitor iOS/Android wrapper (full Envoy inside the app)
├── packages/        # The building blocks — protocol, identity, network, vault, ...
├── docs/            # Design, security model, phase-by-phase plan
├── OpenClawExtension/  # The OpenClaw channel plugin (canonical source)
├── QuickStart.md    # ← Step-by-step: build, run, mobile, multi-machine, bridge
└── CLAUDE.md        # Full package graph and developer conventions
```

You don't need to read any of this to use EnvoyMesh. It's here for people who want to
hack on it.

---

## Current status

**Phase 18 — Native owner agent — is the latest shipped milestone.**
The Social **Assistant** is now a real agent: it drives the same tool registry, route
catalog, and async workers the home-node agent uses, gated by your trust list, mandates,
and approval queue. You can tell the Assistant to make friends, find documents, find
capable peers, and run or request services — and the human still commits bonds.

Phases 1-18 are shipped (Phases 11 mobile, 12 trust mode, 13 actor disclosure, 15-17
reach & semantics, 16 standing delegation, 18 native agent). The full phase-by-phase
plan lives in [`docs/implementation-plan.md`](docs/implementation-plan.md); the
Assistant design rationale is in [`docs/native-owner-agent.md`](docs/native-owner-agent.md).

Next pulls: 15E follow-ons (hop-2 morning report, two-NAT ledger, DID resolver) and
parked items (payment rail, thin satellite app).

---

## Want to read more?

- **Start here:** [**`QuickStart.md`**](QuickStart.md) — install, run, mobile, multi-machine, bridge.
- **For the curious:** [How it works under the hood](docs/high-level-design.md) ·
  [Security model](docs/security.md) ·
  [Network & P2P](docs/network-model.md)
- **For developers:** [Protocol reference](docs/protocol-standard.md) ·
  [Roadmap & phases](docs/implementation-plan.md) ·
  [Redesign strategy](docs/redesign-strategy.md)
- **For agent authors:** [Bridge guide](docs/agent_bridge_guide.md) ·
  [OpenClaw setup](docs/openclaw-extension.md) ·
  [OpenClaw plugin README](OpenClawExtension/README.md)

---

## A note on running it

Live peer discovery (mDNS, DHT, relay, DCUtR) needs real network interfaces and reachable
peers. In restricted networks (some CI runners, locked-down Wi-Fi) only the local smoke
tests will work. For real multi-machine exercises, follow the
[live connectivity guide](docs/live-connectivity-testing.md).
