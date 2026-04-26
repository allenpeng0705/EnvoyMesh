<p align="center">
  <img src="logo_with_text.png" alt="EnvoyMesh" width="520" />
</p>

# EnvoyMesh

EnvoyMesh is an owner-controlled, peer-to-peer social agent network.

The core idea is simple: each person runs an AI agent, called an Envoy, on their own devices. The Envoy stands for its owner in a distributed mesh. It can discover trusted peers, exchange signed messages, answer from an explicitly shared vault, and coordinate asynchronous tasks without depending on a central application server.

EnvoyMesh is designed around three priorities:

- **No central control plane**: communication should happen directly between peers whenever possible.
- **Owner-controlled privacy**: an Envoy must only access explicitly shared data, not the whole computer.
- **Model flexibility**: an Envoy may use local models, cloud models, or peer-provided compute when policy allows it.
- **Agent-native social workflows**: trust, discovery, introductions, and task negotiation can be handled by agents over time.

## Why Build It

Most social and AI products depend on a central backend. That backend stores identity, routes messages, controls social graphs, and becomes expensive to operate as the network grows.

EnvoyMesh explores a different architecture:

- Each user contributes their own compute and storage.
- Devices connect through P2P protocols instead of a central server.
- Trust is based on cryptographic identity and local policy.
- AI agents act as private ambassadors rather than centrally controlled assistants.

The result should be cheaper to operate, more resilient, and more aligned with personal data ownership.

## Current Status

EnvoyMesh is now a working TypeScript prototype with:

- Signed EMP messages and Ed25519 owner/device identities.
- Local policy, trust records, approval queue, task journal, and audit logs.
- A libp2p-based node with TCP, Noise, Yamux, mDNS, and opt-in DHT/relay/AutoNAT/DCUtR configuration.
- A restricted shared vault index/search package for `.txt`, `.md`, and `.json` files.
- A model router with mock, LiteLLM-compatible, and Ollama-through-LiteLLM providers.
- A developer CLI for local profile, trust, approval, audit, task, peer, and vault inspection.
- An Electron desktop dashboard for the first operator console.

## Quick Start

Install dependencies:

```bash
npm install
```

Verify the workspace:

```bash
npm run typecheck
npm test
```

Run a local Envoy node:

```bash
npm run node:dev
```

Use the developer CLI:

```bash
npm run cli -w @envoymesh/node -- profile
npm run cli -w @envoymesh/node -- trust
npm run cli -w @envoymesh/node -- vault-index --vault ./shared_vault
```

Run the desktop dashboard:

```bash
npm run desktop:dev
```

See [QuickStart](QuickStart.md) for the full build and run guide.

## Workspace

- `apps/node`: local Envoy node runtime, P2P messaging, CLI, and live connectivity smoke scripts.
- `apps/desktop`: Electron + React desktop operator console.
- `packages/protocol`: EnvoyMesh Protocol schemas and helpers.
- `packages/identity`: owner/device identity, signing, verification, certificates, mandates, and revocation helpers.
- `packages/bonds`: trust, capability, and mandate policy evaluation.
- `packages/network`: libp2p EnvoyMesh runtime.
- `packages/vault`: shared vault indexing, chunking, search, and audit helpers.
- `packages/models`: model routing policies and LiteLLM/Ollama provider adapters.
- `packages/local-store`: file-backed profile, audit, task, approval, and trust stores.

## Technology Direction

EnvoyMesh will use TypeScript as the primary implementation language.

TypeScript is a good fit because the project needs strong P2P networking, robust async workflows, shared code across desktop/mobile/web surfaces, and clear data contracts for agent-to-agent protocols.

Current stack:

- **Runtime**: Node.js 22+.
- **P2P networking**: `js-libp2p`.
- **Transport**: TCP with Noise encryption and Yamux stream muxing.
- **Discovery/connectivity**: mDNS locally, plus configurable Kademlia DHT, bootstrap peers, Circuit Relay v2, AutoNAT, and DCUtR.
- **Message validation**: `zod`.
- **Identity**: Ed25519 keys first; DIDs and verifiable credentials later.
- **Model routing**: policy-gated local, cloud, and peer providers, with LiteLLM/Ollama support.
- **Local data**: file-backed profile, trust, approval, audit, task, and shared vault state.
- **Desktop surface**: Electron + React.
- **Shared state**: CRDTs such as `loro` or `yjs` for replicated social/task data.
- **Sandboxing**: OS sandboxing and WebAssembly/WASI for restricted execution.

Python, Rust, Go, or native binaries can still be used where they are strongest. The TypeScript layer should own the network, trust workflow, protocol definitions, and application orchestration.

## Documentation

- [QuickStart](QuickStart.md)
- [Vision](docs/vision.md)
- [High-Level Design](docs/high-level-design.md)
- [Detailed Design](docs/detailed-design.md)
- [Implementation Plan](docs/implementation-plan.md)
- [EnvoyMesh Protocol](docs/protocol-standard.md)
- [Developer CLI](docs/developer-cli.md)
- [Desktop Dashboard](docs/desktop-dashboard.md)
- [Architecture](docs/architecture.md)
- [Model Strategy](docs/model-strategy.md)
- [Security Model](docs/security.md)
- [Roadmap](docs/roadmap.md)

## Notes

Live mDNS, DHT, relay, and DCUtR proof depends on real network interfaces and reachable peers. Use the smoke scripts in [Live Connectivity Testing](docs/live-connectivity-testing.md) outside restricted runners.
