# EnvoyMesh — A2A + MCP Interop Bridges (Phase 48)

**Status:** **48A–48D.5 shipped** (2026-07-24)
**A2A spec target:** v1.0.0 (`TASK_STATE_*` ProtoJSON, `SendMessage`/`SendStreamingMessage` methods, unified `Part` model)
**MCP spec target:** 2025-06-18 (Streamable HTTP + stdio, `tools/list`/`tools/call`)
**Owner:** peng
**Roadmap:** [Phase 48 in implementation-plan.md](./implementation-plan.md#phase-48--a2a--mcp-interop-bridges-shipped--48a48d5)
**Related:** [agent_network.md](./agent_network.md) · [phase-33-a2a-tool-exposure.md](./phase-33-a2a-tool-exposure.md) · [web-content-browsing-design.md](./web-content-browsing-design.md) · [relay-server-design.md](./relay-server-design.md)

> **Shipped:** MCP tool consumer (SDK Client stdio/HTTP), MCP server adapter (stdio + bridge bearer), A2A Agent Card (`streaming: true`, optional Ed25519 signatures), A2A Task Bridge with production executor, relay `forwardToHome` home-tunnel, `message/stream` SSE, FileArtifact vault HTTP (`GET /vault/<path>`), live MCP stdio + card-fetch smokes ([phase-48-interop-smoke.md](./phase-48-interop-smoke.md)).

---

## 1. Problem

EnvoyMesh has a strong P2P transport (libp2p + Ed25519 signed envelopes + Bonds Engine) and a capable multi-agent protocol (`task.chain.*`). But it cannot interoperate with the broader agent ecosystem:

- **Google A2A agents** (Salesforce, ServiceNow, LangChain, etc.) cannot discover or delegate tasks to EnvoyMesh agents.
- **MCP-compatible clients** (Claude Desktop, Cursor, Windsurf) cannot use EnvoyMesh's `mesh.*` tools.
- **MCP-compatible servers** (GitHub, filesystem, databases) cannot be consumed by the built-in OpenClaw agent without custom adapters.

Two industry standards address different layers of this gap:
- **MCP** (Model Context Protocol, Anthropic) — model-to-tool function calling.
- **A2A** (Agent-to-Agent, Google) — agent-to-agent discovery and task lifecycle.

Neither replaces EnvoyMesh's unique value (P2P transport, self-sovereign identity, trust tiers, mandates). They operate **above** the transport layer.

## 2. Goals & non-goals

### Goals

- EnvoyMesh agents can **consume external MCP tools** (GitHub, databases, etc.) as `mesh.mcp.*` tools.
- EnvoyMesh tools can be **exposed as an MCP server** so Claude Desktop / Cursor can use them.
- EnvoyMesh agents can be **discovered by external A2A clients** via the standard Agent Card format.
- External A2A agents can **send tasks to EnvoyMesh agents** and receive typed artifacts back.
- All bridges are **opt-in** — pure P2P EnvoyMesh users need no HTTP server.
- Bridges **preserve** EnvoyMesh's security model: signed envelopes, trust tiers, mandates, audit.

### Non-goals

- **No replacement of libp2p transport.** EnvoyMesh's P2P mesh remains the primary inter-node transport.
- **No replacement of signed envelopes.** All internal communication stays Ed25519-signed.
- **No removal of `task.chain.*` protocol.** Team Jobs keep their native protocol with mandate/budget/policy.
- **No mandatory HTTP server.** Bridges run on opt-in relay/gateway nodes.
- **No A2A MCP transport multiplexing.** A2A and MCP are bridged independently.
- **No full OAuth 2.1 implementation in 48A.** The MCP server adapter uses bearer tokens initially.

## 3. Current state (verified 2026-07-24)

### 3.0 Phase 48 implementation (shipped)

| Area | Location | Status |
|------|----------|--------|
| MCP consumer | `mcp-client-adapter.ts` — `@modelcontextprotocol/sdk` Client (stdio + Streamable HTTP); `mesh.mcp.*` | `[x]` |
| MCP server adapter | `mcp-server-adapter.ts`, `npx envoymesh mcp-server` (+ `--bridge-token` / `ENVOYMESH_BRIDGE_SECRET`) | `[x]` |
| A2A Agent Card | `a2a-agent-card.ts` / relay `/.well-known/agent-card.json` (`streaming: true`, optional Ed25519 `signatures`) | `[x]` |
| A2A Task Bridge | JSON-RPC + maps; node `POST /a2a/jsonrpc` (production executor); relay `forwardToHome` home-tunnel | `[x]` |
| Config | `PersistedNodeConfig.mcpConsumers` / `a2aBridge` | `[x]` |
| Unit tests | 200+ dedicated cases across node + relay | `[x]` green |
| 48D.5 production path | mandate+`TaskDispatcher` + live `forwardToHome` + stream + vault HTTP | `[x]` shipped |

### 3.1 Pre-existing MCP touch points (still relevant)

- **`toMcpToolDescriptors()`** at `apps/node/src/tool-registry.ts` — translates `ToolDefinition[]` to MCP `Tool[]` (includes `title` / `annotations`).
- **MCP HTTP `tools/call` consumer** at `packages/api/src/ai-knowledge-base.ts` — KB system MCP HTTP endpoints for knowledge plugins.
- **`mcp-knowledge-plugin.ts`** at `apps/node/src/` — Phase 44E KB plugin registration for MCP-sourced notes.
- **Phase 48A** adds `@modelcontextprotocol/sdk` on `@envoymesh/node` for the consumer Client (stdio + Streamable HTTP).

### 3.2 Existing A2A touch points

- **`AgentCardSchema`** at `packages/protocol/src/index.ts:502-518` — EnvoyMesh's own card format. Shares `version` and `capabilities` field names with A2A (but different semantics: EnvoyMesh `version` = schema literal `"0.1"`, A2A `version` = agent version string).
- **A2A task dispatcher** at `packages/api/src/task-dispatcher.ts` — `createTaskDispatcher()` routes 9 task intents (`task.mandate` through `report.create`). Phase 48D maps EnvoyMesh lifecycle states ↔ A2A v1.0 `TASK_STATE_*` in `apps/node/src/a2a-state-map.ts`.
- **`agent-card-auto-fetcher.ts`** at `apps/node/src/` — fetches peer Agent Cards over libp2p signed envelopes (HTTP card discovery is the 48C relay route).
- **Phase 33** (`phase-33-a2a-tool-exposure.md`) — `mesh.task.propose/await_result/cancel` + `mesh.agent_card.request` tools already expose the A2A task flow to the built-in agent.

### 3.3 Existing artifact schemas

- **`ArtifactSchema`** (discriminated union on `kind`): `TextArtifact` / `FileArtifact` / `StructuredArtifact` (Phase 33) + `CompositeArtifact` (Phase 40 — weighted bundle of N worker contributions).
- Maps to A2A v1.0's unified `Part` model via `apps/node/src/a2a-artifact-map.ts` (48D): text → `Part.text`, file → `Part.file`, structured → `Part.data`. `CompositeArtifact` expands to multiple `Part`s.
- FileArtifact URIs: home bridge serves `GET /vault/<path>` with A2A bearer (48D.5).

## 4. Design (shipped 48A–48D)

### 4.1 Three-layer architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 3: Function Calling / Tools                             │
│   MCP (Anthropic) — tools/list, tools/call, resources        │
│   Direction A: EnvoyMesh ← consumes ← external MCP servers   │
│   Direction B: EnvoyMesh → exposes → MCP clients (Claude)    │
├──────────────────────────────────────────────────────────────┤
│ Layer 2: Inter-Agent Task Protocol                            │
│   A2A (Google) — Agent Card, tasks/send, artifacts           │
│   Direction C: External A2A → discovers → EnvoyMesh agents   │
│   Direction D: External A2A → delegates → EnvoyMesh agents   │
├──────────────────────────────────────────────────────────────┤
│ Layer 1: Transport + Identity + Trust (UNCHANGED)             │
│   EnvoyMesh — libp2p + Ed25519 + Bonds + Mandates + Audit   │
│   No standard competes here                                   │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 MCP Tool Consumer Adapter (Direction A)

Lets the built-in OpenClaw agent call any MCP-compatible tool server.

```
OpenClaw Agent → mesh.mcp.call_tool(server, tool, args) → MCP Client Adapter
    → stdio or Streamable HTTP → external MCP Server
    → returns Content[] → adapter wraps as text/file artifact
```

**Design:**
- New tool `mesh.mcp.list_tools` — calls `tools/list` on a configured MCP server, returns tool names + descriptions.
- New tool `mesh.mcp.call_tool` — calls `tools/call` with `{ name, arguments }`, returns content items mapped to EnvoyMesh artifacts.
- MCP servers configured via `node-config.json` → `mcpServers: [{ name, transport: "stdio"|"http", command?, url?, env? }]`.
- Adapter wraps the existing MCP runtime from `packages/openclaw/src/agents/`.
- Content mapping:
  - MCP `TextContent` → EnvoyMesh `TextArtifact`
  - MCP `ImageContent` → EnvoyMesh `FileArtifact` (base64 inline, mimeType set)
  - MCP `AudioContent` → EnvoyMesh `FileArtifact`
  - MCP `resource_link` → EnvoyMesh `StructuredArtifact` with `{ uri, name }`
  - MCP `structuredContent` → EnvoyMesh `StructuredArtifact` with the JSON data

### 4.3 MCP Server Adapter (Direction B)

Exposes EnvoyMesh's `mesh.*` tools to external MCP clients (Claude Desktop, Cursor, etc.).

```
Claude Desktop → MCP JSON-RPC over stdio/HTTP → MCP Server Adapter
    → translates tools/list → returns mesh.* tool descriptors
    → translates tools/call → invokes mesh.* tool → returns Content[]
```

**Design:**
- New module `apps/node/src/mcp-server-adapter.ts` (~300 lines).
- Implements MCP JSON-RPC 2.0 server: `initialize`, `tools/list`, `tools/call`.
- `tools/list` calls `toMcpToolDescriptors(toolRegistry.listTools())` (already exists — extend with `title` and `annotations`).
- `tools/call` invokes the tool via the existing tool execution path (switch in `index.ts`), then maps the result to MCP `Content[]`.
- Transport: **stdio** (primary — launched as subprocess by Claude Desktop) + **Streamable HTTP** (optional — for remote clients).
- No new npm dependency: reuse the MCP transport from `packages/openclaw/src/agents/`.
- Config: `node-config.json` → `mcpServer: { enabled, transport: "stdio"|"http", port? }`.
- Auth: bearer token for HTTP transport; none for stdio (local subprocess).

### 4.4 A2A Agent Card Bridge (Direction C)

Translates EnvoyMesh's `AgentCardSchema` to the A2A standard Agent Card format, published at `/.well-known/agent-card.json` on an opt-in HTTP endpoint.

**Field mapping:**

| EnvoyMesh `AgentCard` | A2A Agent Card | Notes |
|---|---|---|
| `displayName` | `name` | Direct |
| `version` (`"0.1"` schema literal) | `version` | EnvoyMesh version is schema version; A2A expects agent version string — use `node-config.json` version |
| — | `supportedInterfaces` | `[{ protocolVersion: "1.0", protocolBinding: "jsonrpc", url: "<gateway-url>" }]` |
| `capabilities` (string[] tags) | `capabilities` | `{ streaming: true, pushNotifications: false }` (48D.5 stream) |
| `capabilities` (names) | `skills` | Each `capability` → `{ id, name, description, tags }` |
| `trustPolicySummary` | `securitySchemes` | Bond-based trust → `HTTPAuth: { scheme: "bearer" }` |
| — | `defaultInputModes` | `["application/json", "text/plain"]` |
| — | `defaultOutputModes` | `["application/json", "text/plain"]` |
| `agentNetworkProfile.strengths` | `skills` (tags) | Each strength tag → skill `tags` |
| `agentNetworkProfile` (full) | `metadata` | Freshness, spend, context as structured metadata |
| — | `signatures` | Optional Ed25519 over canonical JSON (`withA2AAgentCardSignature`; relay signs with control identity) |
| — | `provider` | Optional: owner identity as provider |
| — | `documentationUrl` | Optional: link to EnvoyMesh docs |

**Design:**
- New function `toA2AAgentCard(envoyCard, gatewayUrl)` at `apps/node/src/a2a-bridge.ts`.
- Published at `/.well-known/agent-card.json` on the existing relay HTTP server (port 15432) or a dedicated gateway port.
- The HTTP endpoint is behind the same Basic Auth / bearer token gate as the admin API.
- Opt-in: only active when `node-config.json` → `a2aBridge: { enabled, gatewayUrl }`.

### 4.5 A2A Task Bridge (Direction D)

Translates A2A JSON-RPC `tasks/send` / `message/send` into EnvoyMesh's signed envelope `task.mandate + task.propose` flow.

**JSON-RPC method mapping (A2A v1.0.0):**

| A2A Method | EnvoyMesh Action | Notes |
|---|---|---|
| `SendMessage` | Sign + send `task.mandate` + `task.propose` over libp2p | A2A message → EnvoyMesh task |
| `SendStreamingMessage` | Same + SSE stream of `task.heartbeat` → `TaskStatusUpdateEvent` | Heartbeat → status event |
| `GetTask` | Read from task journal | Map status |
| `CancelTask` | Sign + send `task.cancel` | |
| `GetExtendedAgentCard` | Return translated Agent Card | Direction C; card also at well-known URI |

**Task state mapping (EnvoyMesh 12 states → A2A v1.0 9 `TASK_STATE_*` values):**

| EnvoyMesh State | A2A `TaskState` | Notes |
|---|---|---|
| `created` | `TASK_STATE_SUBMITTED` | Task created, mandate received |
| `planned` | `TASK_STATE_WORKING` | Orchestrator is planning |
| `discovering` | `TASK_STATE_WORKING` | Looking for workers |
| `negotiating` | `TASK_STATE_WORKING` | Bidding/assignment |
| `waiting_for_peer` | `TASK_STATE_INPUT_REQUIRED` | Waiting for worker response |
| `waiting_for_owner` | `TASK_STATE_INPUT_REQUIRED` | Waiting for owner decision |
| `running` | `TASK_STATE_WORKING` | Active execution |
| `partial` | `TASK_STATE_WORKING` | Partial results received |
| `synthesizing` | `TASK_STATE_WORKING` | Merging results |
| `completed` | `TASK_STATE_COMPLETED` | Terminal |
| `failed` | `TASK_STATE_FAILED` | Terminal |
| `cancelled` | `TASK_STATE_CANCELED` | Terminal (note: A2A uses single 'l') |
| *(task.reject intent)* | `TASK_STATE_REJECTED` | Agent declined the task |
| *(bond/auth failure)* | `TASK_STATE_AUTH_REQUIRED` | Trust tier too low or auth failed |

**Artifact mapping (EnvoyMesh artifacts → A2A v1.0 `Part`s):**

| EnvoyMesh `Artifact` | A2A `Part` | Notes |
|---|---|---|
| `TextArtifact` | `Part` with `text` field | `{ text: artifact.content }` |
| `FileArtifact` | `Part` with `file` field | `{ file: { uri: gatewayUrl + "/vault/" + encodeURIComponent(vaultPath) + "?hash=…", mimeType } }` — served by home bridge `GET /vault/<path>` |
| `StructuredArtifact` | `Part` with `data` field | `{ data: artifact.data }` |
| `CompositeArtifact` | Multiple `Part`s in one `Artifact` | Each weighted contribution → its own `Part`; aggregation metadata in `Artifact.metadata` |

**Security flow:**
1. A2A client sends `message/send` with bearer token.
2. Bridge validates token against configured auth (token → `ownerId`).
3. Executor resolves Bonds trust tier for that `ownerId` (`self` if home owner; else trust store) and runs `evaluatePolicy` for `task.mandate` (design §5.2: `self` / `direct` / `referred` only; deny → A2A `auth-required`).
4. Home owner mints + signs mandate; agent signs `task.mandate` then `task.propose` envelopes.
5. Both envelopes enter the daemon task inbound path (`handleDaemonTaskInbound`: runtime guard, journal, runtime store).
6. Bridge streams SSE events back to the A2A client (`message/stream`; post-hoc status/artifact frames today).
7. All actions audited via standard JSONL.

## 5. Security model

### 5.1 Bridge authentication

| Bridge | Auth Method | Default |
|--------|-------------|---------|
| MCP Server (stdio) | None (local subprocess) | Trusted |
| MCP Server (HTTP) | Bearer token | Required |
| MCP Client | Reuses MCP server's auth | Per-server |
| A2A Agent Card | Public (discovery only) | No auth |
| A2A Task Bridge | Bearer token + Bond check | Required |

### 5.2 Trust enforcement

All task delegation through the A2A bridge goes through the **Bonds Engine**:
- The A2A client's identity (from bearer token → mapped to owner ID) must be `self` (home owner), `direct`, or `referred` trust. `public` / `blocked` / unknown → `auth-required`.
- Referred peers get Bonds `approval_required` for most task intents; the A2A bridge treats a configured referred token as pre-approved for submit (no separate approval UI on JSON-RPC).
- The mandate is always minted and signed by the **home owner**; the bearer `ownerId` scopes `tasks/get` / `tasks/cancel` only.
- The mandate bounds (maxCost, expiresAt, maxSensitivity) are set by the bridge/executor, not the A2A client.
- The bridge refuses tasks that would exceed configured limits.

### 5.3 Threat model additions

| Threat | Mitigation |
|--------|------------|
| Unauthorized A2A task delegation | Bearer token + Bond tier gate + mandate bounds |
| MCP tool server compromise | `mesh.mcp.call_tool` runs in-process; no libp2p access; sensitivity ceiling enforced |
| A2A Agent Card spoofing | Optional Ed25519 signature on the card (`withA2AAgentCardSignature`; TLS for relay HTTP) |
| MCP server adapter SSRF | stdio transport only by default; HTTP requires explicit opt-in + token |

## 6. Phased rollout

### 6.1 Phase 48A — MCP Tool Consumer `[x]` shipped

**Goal:** Built-in agent can call any MCP tool.

- `[x]` `mesh.mcp.list_tools` tool — calls `tools/list` on configured MCP servers
- `[x]` `mesh.mcp.call_tool` tool — calls `tools/call`, maps Content[] → artifacts
- `[x]` `node-config.json` → `mcpConsumers: [{ name, transport, command?, url?, env?, bearerToken?, allowRemoteHttp? }]`
- `[x]` Content mapping: TextContent/ImageContent/AudioContent/resource_link/structuredContent → EnvoyMesh artifacts
- `[x]` Unit tests for content mapping + session-factory manager (no circular dispatch)

**Exit criteria:** Agent can call MCP tools via `mesh.mcp.call_tool` with typed content mapping. — **met (SDK Client + unit).**

### 6.2 Phase 48B — MCP Server Adapter `[x]` shipped

**Goal:** Claude Desktop / Cursor can use EnvoyMesh tools.

- `[x]` `apps/node/src/mcp-server-adapter.ts` — JSON-RPC 2.0 server (`initialize`, `tools/list`, `tools/call`)
- `[x]` Extend `toMcpToolDescriptors` with `title`, `annotations` (readOnly/destructive hints)
- `[x]` Tool result mapping: EnvoyMesh artifacts → MCP Content[]
- `[x]` stdio transport (primary) + Streamable HTTP (optional)
- `[x]` Config: `node-config.json` → `mcpServer: { enabled, transport, port? }`
- `[x]` Unit tests for tool listing + call translation
- `[x]` CLI: `npx envoymesh mcp-server`

**Exit criteria:** MCP clients can list and call EnvoyMesh `mesh.*` tools over the stdio adapter. — **met.**

### 6.3 Phase 48C — A2A Agent Card Bridge `[x]` shipped

**Goal:** External A2A clients can discover EnvoyMesh agents.

- `[x]` `apps/node/src/a2a-bridge.ts` — `toA2AAgentCard()` translator
- `[x]` HTTP endpoint `/.well-known/agent-card.json` on relay node
- `[x]` Config: `node-config.json` → `a2aBridge: { enabled, gatewayUrl }`
- `[x]` Unit tests for card translation + relay HTTP handler

**Exit criteria:** `curl http://relay:15432/.well-known/agent-card.json` returns a valid A2A card when enabled. — **met.**

### 6.4 Phase 48D — A2A Task Bridge `[x]` shipped

**Goal:** External A2A agents can send tasks and get results (protocol + auth path).

- `[x]` A2A JSON-RPC handler: `message/send`, `tasks/get`, `tasks/cancel`
- `[x]` Task state mapping (EnvoyMesh 12 states → A2A 9 states)
- `[x]` Artifact mapping (EnvoyMesh artifacts → A2A Parts)
- `[x]` Security: bearer token → owner resolution + Bonds gate + executor-enforced task scoping
- `[x]` Unit tests for state/artifact mapping + JSON-RPC + relay proxy
- `[x]` `A2ATaskBridgeExecutor` interface for inject-able dispatch

**Exit criteria:** Authenticated clients can exercise JSON-RPC task methods against the bridge with typed artifact translation. — **met.**

### 6.5 Phase 48D.5 — Production path + hardening `[x]` shipped

- `[x]` Production executor: Bonds gate → `task.mandate` + `task.propose` → `handleDaemonTaskInbound` (`a2a-task-executor.ts`)
- `[x]` Relay `forwardToHome` via home-tunnel HTTP to home `POST /a2a/jsonrpc`
- `[x]` SSE streaming for `message/stream` (`handleStreamRequest` + bridge `text/event-stream`; card `streaming: true`; relay home-tunnel SSE chunks)
- `[x]` Vault-serve HTTP endpoint for `FileArtifact` URIs (`GET /vault/<path>` on bridge + relay proxy)
- `[x]` Optional Ed25519 signed Agent Card (relay control identity)
- `[x]` Live MCP stdio integration + A2A card-fetch tests; Claude Desktop runbook — [phase-48-interop-smoke.md](./phase-48-interop-smoke.md)
- `[x]` Executor: default leave `running`; opt-in `autoCompleteLocal` / `waitForResultMs`; persist `a2a-bridge-tasks.json`
- `[x]` Relay↔home-tunnel HTTP E2E

**Smoke (automated):**

```bash
npx vitest run apps/node/test/a2a-task-executor.test.ts apps/node/test/a2a-task-bridge.test.ts apps/node/test/bridge-index.test.ts apps/relay/test/a2a-jsonrpc-proxy.test.ts apps/relay/test/agent-card-route.test.ts apps/node/test/mcp-stdio-live.test.ts apps/node/test/a2a-card-fetch-live.test.ts apps/relay/test/a2a-home-tunnel-http.test.ts
```

## 7. Alternatives considered

### 7.1 Replace libp2p with HTTP/WebSocket

**Rejected.** EnvoyMesh's value proposition is decentralized, NAT-traversing, self-sovereign P2P. Switching to HTTP would make it just another agent framework. HTTP requires public IPs / port forwarding / cloud hosting — exactly what EnvoyMesh eliminates.

### 7.2 Replace signed envelopes with bearer tokens

**Rejected.** A2A uses bearer tokens or no auth. EnvoyMesh's Ed25519-signed envelopes with trust-tier gating are the security model. Tokens can be leaked; signed envelopes can't be forged. The bridge translates at the boundary — internal communication stays signed.

### 7.3 Remove mandate/budget/policy layer

**Rejected.** A2A has no concept of "the owner authorized this task with a max cost of $5 and a deadline of 1 hour." EnvoyMesh mandates are essential for autonomous agent safety. Team Jobs keep the native `task.chain.*` protocol; A2A is only for interop with external agents.

### 7.4 Use `@modelcontextprotocol/sdk` as MCP dependency

**Not needed — already a dependency.** `packages/openclaw/package.json` already declares `"@modelcontextprotocol/sdk": "1.29.0"` as a direct dependency. The existing MCP runtime at `packages/openclaw/src/agents/` (client: `mcp-transport.ts`, `mcp-stdio-transport.ts`, `mcp-oauth.ts`, `mcp-http-fetch.ts`, `agent-bundle-mcp-runtime.ts`; server: `channel-server.ts`, `tools-stdio-server.ts`) imports directly from `@modelcontextprotocol/sdk/client/*` and `…/server/*`. Phase 48 reuses this existing runtime — no new npm dependency is added to the monorepo.

### 7.5 Use A2A as the primary inter-agent protocol (replace task.chain.*)

**Rejected.** A2A lacks mandate/budget/policy, multi-round iteration (Phase 47), chain handoff, and scoring. The native `task.chain.*` protocol carries richer semantics. A2A is for external interop only — internal Team Jobs keep `task.chain.*`.

## 8. Open questions

| # | Question | Resolution | Phase |
|---|---|---|---|
| 1 | How are MCP server processes managed (lifecycle, restart)? | `mcpServers` in node-config; adapter starts on demand / boot | **48A shipped** |
| 2 | Should the A2A bridge live on the relay node or the home node? | Relay publishes card + JSON-RPC proxy; home runs executor | **48C/D/D.5 shipped** |
| 3 | Should A2A artifact files be served via IPFS gateway or HTTP? | HTTP — home bridge `GET /vault/<path>` | **48D.5** |
| 4 | How deep should MCP resource/prompts bridging go? | Tools only in 48A/B; resources/prompts later | Future |
| 5 | Should the A2A bridge support push notifications? | No — polling via `tasks/get`; SSE via `message/stream` | **48D.5** / Future |
| 6 | OAuth 2.1 for the MCP HTTP server? | Bearer token in 48B; OAuth 2.1 when needed | Future |

## 9. File-by-file change map

### Phase 48A

| File | Change |
|---|---|
| `apps/node/src/tool-registry.ts` | Add `mesh.mcp.list_tools`, `mesh.mcp.call_tool` tools |
| `apps/node/src/mcp-client-adapter.ts` (new) | MCP client: connect via stdio/HTTP, call tools/list, tools/call, map Content[] |
| `apps/node/src/node-config-store.ts` | Add `mcpServers?: McpServerConfig[]` to `PersistedNodeConfig` |
| `packages/api/src/index.ts` | Export `McpServerConfig` type |
| `apps/node/src/index.ts` | Start MCP server processes on boot |
| `apps/node/test/mcp-client-adapter.test.ts` (new) | Unit tests for content mapping + tool descriptor |

### Phase 48B

| File | Change |
|---|---|
| `apps/node/src/mcp-server-adapter.ts` (new) | JSON-RPC 2.0 server: initialize, tools/list, tools/call |
| `apps/node/src/tool-registry.ts` | Extend `toMcpToolDescriptors` with title + annotations |
| `apps/node/src/node-config-store.ts` | Add `mcpServer?: { enabled, transport, port? }` |
| `apps/node/src/index.ts` | Start MCP server adapter on boot (stdio or HTTP) |
| `apps/node/test/mcp-server-adapter.test.ts` (new) | Unit tests for tool listing + call translation |
| `apps/social/src/components/views/SettingsAITab.tsx` | MCP server toggle in Settings → AI |

### Phase 48C

| File | Change |
|---|---|
| `apps/node/src/a2a-bridge.ts` (new) | `toA2AAgentCard()` translator + HTTP endpoint handler |
| `apps/relay/src/index.ts` | Add `/.well-known/agent-card.json` route |
| `apps/node/src/node-config-store.ts` | Add `a2aBridge?: { enabled, gatewayUrl }` |
| `packages/api/src/index.ts` | Export A2A card types |
| `apps/node/test/a2a-bridge.test.ts` (new) | Unit tests for card translation + signature |

### Phase 48D

| File | Change | Status |
|---|---|---|
| `apps/node/src/a2a-task-bridge.ts` | JSON-RPC: message/send, message/stream, tasks/get, tasks/cancel | `[x]` |
| `apps/node/src/a2a-state-map.ts` | EnvoyMesh 12-state → A2A 9-state mapping | `[x]` |
| `apps/node/src/a2a-artifact-map.ts` | EnvoyMesh Artifact[] → A2A Part[] mapping | `[x]` |
| `apps/node/src/a2a-task-executor.ts` | Production mandate + TaskDispatcher executor | `[x]` |
| `apps/relay/src/a2a-jsonrpc-proxy.ts` | Relay JSON-RPC proxy + bearer gate | `[x]` |
| `apps/node/test/a2a-*-*.test.ts` + relay proxy tests | Unit coverage | `[x]` |
| 48D.5 executor + `forwardToHome` + stream + vault | Production path | `[x]` shipped |

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| MCP server process crash | Supervised start with exponential backoff restart |
| A2A bridge leaks internal task state | Only expose terminal states + artifact summaries; never raw payloads |
| Bundle size increase from MCP runtime | Reuse `packages/openclaw/src/agents/` — no new npm dependency |
| A2A spec changes (still evolving) | Pin to protocol version "1.0"; add version negotiation in the card |
| Claude Desktop config complexity | Ship a `npx envoymesh mcp-server` one-liner in documentation |
| Relay node becomes a bottleneck | A2A bridge is stateless; SSE streams delegate to libp2p stream lifecycle |

## 11. References

### Standards
- A2A specification: https://a2a-protocol.org/latest/specification/
- A2A GitHub: https://github.com/a2aproject/A2A
- A2A Python SDK: `a2a-sdk`
- A2A TypeScript SDK: `@a2a-js/sdk`
- MCP specification: https://modelcontextprotocol.io/specification/2025-06-18
- MCP Tools spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP TypeScript SDK: `@modelcontextprotocol/sdk`
- MCP Python SDK: `mcp`

### EnvoyMesh source files
- `packages/protocol/src/index.ts` — `AgentCardSchema`, `ArtifactSchema`, `TaskLifecycleStateSchema`
- `apps/node/src/tool-registry.ts` — `ToolDefinition`, `toMcpToolDescriptors`, `mesh.*` tools
- `packages/api/src/task-dispatcher.ts` — A2A task intent routing
- `apps/node/src/agent-card-auto-fetcher.ts` — Agent Card fetch over libp2p
- `packages/openclaw/src/agents/` — existing MCP runtime
- `packages/api/src/ai-knowledge-base.ts` — existing MCP HTTP tools/call consumer
- `docs/phase-33-a2a-tool-exposure.md` — Phase 33 A2A tool design
- `docs/agent_network.md` — Agent Network design (Phase 40)
