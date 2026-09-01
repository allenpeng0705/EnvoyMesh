# Changelog

All notable changes to EnvoyMesh are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-09-01

### Added

**Envoy Market**
- Per-owner **Shop** on the home node: create listings with photos, price, category, and `public` or `bonds` visibility
- **Market** tab in Social (desktop) — Browse mesh + bonded listings, My Shop CRUD, search history, category/price filters
- Public mesh search and stranger **listing-scoped inquire** chat (rate-limited; bond optional afterward)
- EnvoyAI **market shortlist** using the same search APIs as the UI
- Capture → draft listing path on desktop Social; public listing thumbnails via web mirror
- Soft close (**reserved** / **sold**); payments/escrow deferred (ADR hook only)

**Social & localization**
- Full Market locale strings for zh/de/fr/ja/ko/it on Social; Discover tab before Explore on desktop
- Social tab order: Chats · Feed · Blog · **Market** · Discover · Explore

### Changed
- Public site and guidebook refreshed to **0.4.0** (Market section, guidebook Part XVI, Appendix J)

## [0.3.0] - 2026-08-27

### Added

**Envoy Harness (Beta)**
- Coding-agent experience in Social desktop: semantic timeline, approvals, diff review, and recovery after disconnects
- Bundled harness TUI/peer resources in Tauri desktop build; integrates with home-node ACP host

**Agent Network**
- Team jobs UX refinements: worker discovery, chain reports, speculation / parallel attempts on steps (when enabled), stronger orchestration recovery

**Knowledge**
- Envoy Local embedding sidecar stability: conservative chunk sizing, automatic shrink/retry on context overflow, sidecar heal on wedge, partial reindex progress when individual documents fail

### Changed
- Public site and guidebook refreshed to **0.3.0** (Harness section, Team jobs copy, knowledge recovery, security page, guidebook subsections)

## [0.2.2] - 2026-08-05

### Added

**Content**
- Content tab UI in Social and EnvoyGo with three sub-tabs: Feed, Blog, and Explore
- Feed — chronological social feed of posts and updates from followed authors and topics (signed publish events, sensitivity-gated, no algorithmic ranking)
- Blog — long-form publishing with rich editor, visibility tiers (public / friends / trusted), and `envoy://` page sync to bonded peers
- Explore — metadata-first discovery of public/bonded authors, trending topics, and Bazaar listings (title, author, sensitivity, content hash before any bytes transfer)

**Family Network**
- Turn one home node into a private family social network — no cloud, no subscription
- Owner and family member roles: owner keeps full EnvoyMesh; members get a focused subset (profile, AI threads, bots, Ext Agent chat, family chat, push)
- Family invite QR (distinct from normal pairing QR) binds a device to a specific member profile
- Family direct and group chat (local to home node, push notifications via FCM/APNs)
- Shared AI agents with complete per-profile data isolation

### Changed
- Guidebook refreshed to v0.2.2 — added §20.9–20.14 (Family Network) and §33.11–33.13 (Content tab UI); no section renumbering

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
