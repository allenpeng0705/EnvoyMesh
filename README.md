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
- **Take it on your phone.** Install the mobile app, scan a QR code on your computer, and
  the same identity, contacts, and chat history show up on your phone — same person, two
  devices.
- **Use the assistant you already have.** EnvoyMesh has a small "bridge" to **HomeClaw**
  and **OpenClaw** so you can keep using your favorite agent.

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
translates between the mesh and whatever agent you choose:

```
   Mesh peer ──chat──▶ EnvoyMesh node ──HTTP──▶ Your agent (HomeClaw, OpenClaw, custom)
                              ▲                          │
                              │                          │
                              └──── HTTP reply ──────────┘
                            (assistant's response goes
                             back out as a signed message)
```

**The agent never holds your identity keys.** EnvoyMesh signs everything, applies your
policy, and the agent just answers plain HTTP requests.

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

…and replies by `POST`ing `{ "to": "...", "text": "Hi back!" }` to
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
├── packages/        # The building blocks — protocol, identity, network, vault, …
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

Phases 1–18 are shipped (Phases 11 mobile, 12 trust mode, 13 actor disclosure, 15–17
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
