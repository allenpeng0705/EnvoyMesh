# Changelog

All notable changes to EnvoyMesh are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-13

### Added

**Core Platform**
- Decentralized P2P mesh networking (libp2p) with Ed25519 identity, signed envelopes, and policy-based trust tiers (blocked / public / referred / direct)
- Relay nodes for connectivity bootstrapping and peer lookup (no LLMs, no payload access)
- Inbound guard with size limits, schema validation, signature verification, and replay dedup
- JSONL audit trail with correlation IDs for multi-peer flow stitching
- Terminal (chat-integrated remote shells for home node access)

**Communication**
- Direct P2P chat with signed messages
- Group chat with delivery tracking and acks
- File sharing with content addressing and policy enforcement
- Real-time voice/video calls (WebRTC, signaling over the mesh, no new ports)
- Voice messages (record-and-send voice notes inline in chat)
- 7 language UI (English, 简体中文, 한국어, 日本語, Français, Deutsch, Italiano)

**AI Agent & External Agents**
- Built-in AI agent EnvoyAI (OpenClaw) — runs in-process, auto-starts with node
- External Agent Bridge for HTTP-speaking agents (HomeClaw, Hermes, OpenHuman, custom)
- Dual-engine modes: Built-in only, Built-in + Ext, Ext only, None
- A2A typed Artifact union on the wire (`text` / `file` / `structured`)
- Agent Network membership as first-class config in Settings → AI

**Agent Network**
- Multi-device shared identity across desktop and mobile
- Fleet onboarding: Company Invites, LAN auto-bond, Pairing Kiosk, Fleet Manifest
- Multi-agent task chains with multi-round negotiation (3-round cap)
- Budget execution with per-subtask tracking
- Configurable cost rebalance (manual / auto / never)
- Composite artifacts with structured merge strategies
- Cross-orchestrator handoff and cross-home-node relay
- LLM-powered task decomposition
- Chain reports with citations, cost breakdown, downloadable artifacts

**Knowledge Base**
- Built-in Markdown note creation with per-item sensitivity (public / friends / private)
- Folder navigation, auto RAG re-index on save
- Obsidian-compatible plugin (`@envoymesh/kb-obsidian`): YAML frontmatter, `[[wiki-links]]`, bidirectional backlinks
- MCP write-back from agent discoveries to vault notes
- Public knowledge mesh queryable by all peers (rate-limited for strangers)
- Federated RAG distributing queries across bonded nodes
- Plugin architecture for knowledge providers

**Mobile & Desktop**
- Capacitor iOS/Android app (full P2P node, SQLite + Filesystem storage)
- EnvoyGo Flutter thin client (remote access, native WebRTC voice calls, terminal)
- Tauri native desktop wrapper (WebView + in-process Node)
- QR code pairing between mobile and desktop

**Security**
- Three-tier identity (Owner / Device / Agent) with Ed25519 and self-sovereign DIDs
- Diplomat → Bond Engine → Brain → Vault isolation pipeline
- Semantic firewall (empty prompt rejection, 48K char limit, control character filtering)
- Mandate-based task authorization with bounds, expiry, and approval gates
- Network-wide document and capability discovery

[0.1.0]: https://github.com/allenpeng0705/EnvoyMesh/releases/tag/v0.1.0
