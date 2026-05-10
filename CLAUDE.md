---
description: 
alwaysApply: true
---

---
description: 
alwaysApply: true
---

---
description: 
alwaysApply: true
---

# EnvoyMesh — CLAUDE.md

## Project Overview

EnvoyMesh is a **decentralized, peer-to-peer mesh for autonomous AI agents**. Agents discover each other, negotiate tasks, share data, and communicate without any central server or cloud dependency. Identity is cryptographic (Ed25519), messages are signed, security is policy-based, and everything is auditable.

**Core principles:**
- No central account server — identity is self-sovereign (Ed25519 keys → DIDs)
- Local-first / distributed — libp2p direct paths, optional CID-verifiable data
- Security by isolation — Diplomat (network) / Bond Engine (policy) / Brain (model) / Vault (data) separation
- Semantic consistency — typed intents agents can reason about, not opaque bytes
- Observability — JSONL audit with correlation IDs stitching multi-peer flows

**Active milestone: Phase 9 complete** — AI agent has its own peer identity (9A), tool registry (9B), memory/context (9C), mode controller (9D), session management (9E), style adapter (9F), proactive triggers (9G), approval workflow (9H), external agent gateway (9I), and digest/notifications (9J). See `docs/implementation-plan.md` for full roadmap.

---

## Repository Structure

```
EnvoyMesh/
├── apps/
│   ├── node/          # Node.js runtime: CLI, mesh, WebSocket API for Social
│   ├── relay/         # Relay node binary
│   ├── social/        # Social/chat UI (Vite + React)
│   │   ├── src/components/  # Header, ErrorBoundary, views/ (Chat, Search, Profile, Settings, etc.)
│   │   ├── src/context/     # NodeStateContext (shared state, event-driven)
│   │   ├── src/lib/         # storage.ts, display.ts (shared util)
│   │   └── test/            # Component + context tests (vitest + testing-library)
│   └── tauri/         # End-user native wrapper: WebView loads Social web UI + spawns Node (no Electron)
├── packages/
│   ├── protocol/      # Core protocol: Zod schemas, payload constructors, canonical JSON
│   ├── identity/      # Ed25519 keys, signing/verification, device certificates, mandates
│   ├── bonds/         # Policy engine: trust tiers, capability gating, mandate authorization
│   ├── network/       # libp2p wrapper: TCP/QUIC, mDNS, DHT, circuit relay, envelope streams
│   ├── vault/         # Local file vault: indexing, chunking, search, path safety
│   ├── models/        # Model router: provider selection, semantic firewall, LiteLLM adapter
│   ├── local-store/   # On-disk persistence: JSONL audit/journal, trust store, peer directory
│   └── api/           # API package (planned, tsconfig stub only)
├── docs/              # User stories, scenarios, security model, implementation plan
├── tsconfig.base.json # Shared TS configuration
├── tsconfig.json      # Project references (builds all packages & apps)
├── vitest.config.ts   # Vitest with path aliases matching tsconfig
└── CLAUDE.md          # This file
```

### Workspace package dependency graph

```
protocol  (Zod schemas, no deps beyond zod)
   ├── identity  (crypto ops on protocol types)
   ├── vault     (standalone file indexing)
   ├── models    (protocol deps only)
   └── bonds     (protocol deps only)
local-store  (depends on bonds, identity, protocol)
network      (depends on protocol + libp2p ecosystem)
apps/node    (depends on everything)
```

---

## Key Concepts & Architecture

### Identities (three-tier)

| Identity | Derivation | Purpose |
|----------|-----------|---------|
| **Owner** | `envoy:owner:<sha256(pubkey)>` | Long-lived human identity, signs mandates & device certificates |
| **Device** | `envoy:device:<sha256(pubkey)>` | A specific device (laptop, phone, server), authorized by owner |
| **Agent** | `envoy:agent:<sha256(ownerId + agent-pubkey)>` | AI agent running on owner's node, authorized by owner-signed mandate |
| **Peer** | `envoy_<sha256(pubkey)>` | Runtime identity for message signing (lasts as long as the key) |

**Agent identity** (Phase 9): The agent has its own peer ID derived from `sha256(ownerId + agent-pubkey)`. The owner signs a mandate/credential linking the agent to the owner. Peers can verify: "This agent is authorized by `envoy:owner:abc123`."

Every outbound message envelope is Ed25519-signed by the sender's private key. Recipients verify using the included public key, which must hash to the claimed `senderPeerId`.

### Envelopes (EnvoyEnvelope)

All communication uses a signed envelope:
```typescript
interface EnvoyEnvelope {
  version: "0.1";
  messageId: string;
  correlationId?: string;
  createdAt: string;          // ISO 8601
  senderPeerId: string;
  senderPublicKey: string;    // PEM
  senderRole: "human" | "agent" | "system";
  recipientPeerId?: string;
  recipientRole: "human" | "agent" | "system";
  intent: EnvoyIntent;        // one of 40+ typed intents
  payload: unknown;           // typed per intent
  signature: string;          // Ed25519 over canonical JSON of the rest
}
```

Role policy is enforced in the schema: `chat.message` requires senderRole=human + recipientRole=human. Task intents require senderRole=agent + recipientRole=agent. Agents can communicate directly (agent-to-agent) using any intent appropriate for agents (knowledge.query, discovery.request, etc.).

### Signing convention

All signed objects follow the same pattern:
1. Define an `Unsigned*` type (without `signature`)
2. Define a `*` type (with `signature`)
3. Provide `forSigning()` helper that strips the signature field
4. Sign using `signCanonicalPayload(unsigned, privateKey)` — signs the canonical JSON (sorted keys, no undefined values)
5. Verify using `verifyCanonicalPayload(unsigned, signature, publicKey)`

This applies to: Envelopes, Device Certificates, Device Revocation Records, Mandates, Proofs of Intent, Data Transfer Vouchers, Human Profiles.

### Mandates & Tasks

A **mandate** is an owner-signed authorization document that grants a device permission to perform a task within defined bounds:
- `taskIntent` — what task is authorized
- `allowedActions` / `disallowedActions` — what operations are OK
- `maxSensitivity` — data sensitivity ceiling
- `maxCost` — spending limit
- `expiresAt` — deadline
- `closeOnFirstCompletedResult` / `collectCompletedResults` — termination policy
- `requiresApprovalFor` — actions that need human approval

**Task lifecycle**: `created → planned → discovering → negotiating → waiting_for_peer|waiting_for_owner → running → partial → completed|failed|cancelled`

Peer-to-peer task negotiation uses `task.mandate → task.propose → task.negotiate → task.accept|task.reject → task.result` with heartbeat and cancel intents.

### Trust & Bonds

Trust has four tiers, enforced by `@envoymesh/bonds`:
- **blocked** — all requests denied
- **public** (stranger) — only bond request / ping allowed; everything else denied or requires challenge
- **referred** — knowledge queries get public sensitivity, most else requires approval
- **direct** — up to friends sensitivity; `knowledge.query` allowed

### Security Architecture

The **Diplomat → Bond Engine → Brain → Vault** pipeline:
1. **Diplomat** (network-facing `@envoymesh/network`) — libp2p connections, message parsing, rate limiting, size caps. No direct filesystem or model access.
2. **Inbound Guard** (`apps/node/src/inbound-guard.ts`) — checks size, schema, signature, replay dedup
3. **Bond Engine** (`@envoymesh/bonds`) — deterministic policy decisions based on trust tier, intent, requested sensitivity
4. **Task Runtime Guard** (`apps/node/src/task-runtime-guard.ts`) — enforces mandate expiry, cancellation, collect-N termination
5. **Brain** (`@envoymesh/models`) — receives only approved context, has semantic firewall guard
6. **Vault** (`@envoymesh/vault`) — path-safety enforced, deny-by-default

### Semantic Firewall

`@envoymesh/models` includes a deterministic pre-model filter:
- Empty prompt → reject
- Exceeds 48K chars → reject
- Contains disallowed control characters (code < 32 except tab/newline/CR, or DEL) → reject
- Collapses excessive newline runs (>50 consecutive) to prevent log spam

### Mobile as a Full Network Node

The mobile app is a **full EnvoyMesh node**, not a thin client. It participates in the P2P mesh directly:

- **Own peer identity**: generated from the owner's keys, distinct from the home node
- **Own signing key**: signs messages just like any other node
- **Direct P2P connectivity**: connects via relay when on different networks from home node
- **Full intent support**: sends/receives any EnvoyMesh intent (chat, knowledge, discovery, share, etc.)

**Pairing via QR code**: When mobile scans the home node's QR code, they create a direct bond. The mobile app sees the home node and its AI agent as contacts in the peer list. Communication with the AI agent is standard `chat.message` to the agent's peer ID — no separate control channel.

```
Mobile App (phone) ←P2P bond via QR→ Home Node (computer)
                                              │
                                              └── AI Agent (contact in mobile's peer list)
```

### Agentic Topology (Phase 9)

**Relay nodes stay lean** — they handle connectivity, relay check-in/lookup, and routing hints. They do not run LLMs, read payloads, execute agents, or store private knowledge.

**Normal nodes are intelligent edges** — they run LLMs, vault RAG, tools, agents, and policy checks.

**The AI agent runs on the home node** — it has its own peer identity (`envoy_agent_<hash>`), derived from the owner's identity and signed by a mandate. Peers can verify the agent is authorized by this owner.

**External agents (OpenClaw/HomeClaw) must not call libp2p directly** — they must use Envoy local tools (`mesh.findKnowledge()`, `mesh.findContact()`, `mesh.sendMessage()`, etc.). EnvoyMesh is the secure network extension of the local agent, not a raw socket handed to the agent.

**MCP compatibility** (future): Phase 9 tool registry could expose MCP endpoints, allowing MCP-compatible clients to use the agent's tools.

**Ordering rule for agentic work:**
1. Direct bonded-contact workflows first (`knowledge.query`, chat assist)
2. Contact-scoped discovery and sharing second
3. Tool/agent boundaries third
4. Stronger sandbox before anonymous discovery or broadcast
5. Broad autonomy last

---

## Development Commands

```bash
# Install all dependencies
npm install

# TypeScript type-check (uses project references for all packages)
npm run typecheck

# Run all tests (vitest)
npm test

# Run a single package's tests
npx vitest run packages/identity/test/

# Run tests in watch mode
npx vitest

# Build a specific package
npm exec -w @envoymesh/<package> -- tsc -p tsconfig.json

# Run the node app
npm run node:dev

# Local two-node smoke test (launches two nodes, runs scenarios)
npm run smoke:local

# View CLI help
npm run cli -w @envoymesh/node -- --help
```

### Test conventions

- Tests live in `packages/*/test/` and `apps/*/test/`
- Filename matches: `<module>.test.ts` or `<module>.test.tsx`
- React component tests use `@testing-library/react` with jsdom environment (`/** @vitest-environment jsdom */`)
- Uses Vitest with `describe`/`it`/`expect`
- Vitest config maps `@envoymesh/*` imports to source `.ts` files for direct testing without build
- Tests are run with `npm test` (CI) or `npx vitest` (watch mode)

---

## Code Conventions & Patterns

### General style

- **TypeScript**: Strict mode, ES2022 target, NodeNext module resolution
- **Module format**: ES modules (`"type": "module"`) — always use `.js` extensions in relative imports (per NodeNext conventions), e.g. `import { foo } from "./bar.js"`
- **Path aliases**: `@envoymesh/*` only for cross-package imports; in-package imports use relative paths
- **Formatting**: Consistent with the existing code — trailing commas in multiline, no semicolons, 2-space indentation
- **Naming**: camelCase for functions/variables, PascalCase for types/interfaces, kebab-case for files

### Package conventions

Each package follows:
- `src/index.ts` — public API (re-exports)
- `src/<module>.ts` — implementation
- `test/<module>.test.ts` — tests
- `package.json` with `"type": "module"`, `"main"`, `"types"`, `"exports"` fields per the existing pattern
- `tsconfig.json` referencing the base config

### Zod-driven design

Protocol schemas are defined in `@envoymesh/protocol` using Zod. **Every** payload type has:
1. A Zod schema (e.g. `TaskProposePayloadSchema`)
2. A TypeScript type derived from it (e.g. `type TaskProposePayload = z.infer<...>`)
3. A `parse*` function that validates and returns the typed payload
4. A `create*` function that constructs valid payloads with sensible defaults

This means runtime validation is always available — every inbound payload goes through its schema.

### Audit-first design

Almost every operation produces an audit event:
- Use `createAuditEvent()` from `@envoymesh/local-store`
- Audit events carry: `eventId`, `createdAt`, `type`, `intent`, `outcome` ("allow" | "deny" | "record"), `summary`, `remotePeerId`, `correlationId`, `latencyMs`
- JSONL append is serialized via `createSerialJsonlAppender()` to prevent interleaved writes
- Never store raw payloads in audit logs unless necessary

### Error handling

- Expected error cases return explicit discriminated union types (e.g. `{ ok: true } | { ok: false; reason: string }`)
- Schema validation errors (ZodError) are caught and converted to user-readable strings
- Filesystem "not found" errors are handled gracefully via `isMissingFileError()` helper
- Malformed A2A payloads in runtime guards are silently caught — the dispatcher already validated them

### File I/O patterns

- JSONL for append-only logs (audit, journal, approval queue, discovery events) — uses serial appender to prevent corruption
- JSON for state files (trust store, peer directory, profile, relay state) — write through atomic rename (write to `.tmp` then `rename`)
- File modes: `0o600` for all data files
- File reads: handle `ENOENT` gracefully with sensible defaults

### Canonical JSON

All signing uses `canonicalJson()` which:
1. Sorts object keys lexicographically
2. Filters out `undefined` values
3. Recurses into nested objects and arrays

This ensures deterministic serialization regardless of property insertion order.

---

## CI Pipeline

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci-smoke-local.yml` | PR + manual | Install → typecheck → unit tests → two-node smoke → generate/upload artifacts |
| `tauri-release.yml` | Tag `tauri-v*` / `desktop-v*` + manual | Build Tauri bundles from `apps/tauri`; uploads unsigned installers as CI artifacts |

---

## Important Nuances

- **`return` vs `return` in expressions**: The project uses early returns with no-semicolon style consistently.
- **`node:crypto` / `node:fs/promises` / `node:path`**: Always use the `node:` prefix for Node.js built-in imports.
- **`Uint8Array` vs `Buffer`**: `Buffer` is used in `@envoymesh/vault` for byte length; `Uint8Array` everywhere else. When converting, use `Buffer.from()` or `Buffer.byteLength()`.
- **libp2p streams**: Use `byteStream(stream)` from `@libp2p/utils` for reading/writing. The stream lifecycle must be managed carefully — always close or abort after use.
- **Relay protocol**: The relay subsystem has its own protocol schemas (`relay.checkin`, `relay.lookup`, `relay.join.request`, etc.) with a hierarchical relay graph (ancestor / parent / sibling / child). The relay manager runtime state is inspected via snapshots encoded as audit events.
- **`tsx` vs `tsc`**: Use `tsx` for running TypeScript directly in development. Use `tsc -b` for production builds and typechecking.
- **Workspace scripts**: Use `npm exec -w @envoymesh/<name> -- <command>` or `npm run <script> -w @envoymesh/<name>` to run scripts in a specific workspace.
