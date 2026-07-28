# Pi Integration Design — Pi as a Built-in Local Coding Agent

**Status:** Designed (2026-07-28) · Implementation tracked as Phase 49 in [implementation-plan.md](./implementation-plan.md)

This document is the standalone design for integrating [Pi](https://github.com/earendil-works/pi) (the earendil-works AI coding agent harness, MIT, TypeScript) into EnvoyMesh as a built-in local coding agent. It is the authoritative reference for Phase 49.

---

## 1. Overview & Goals

Pi becomes EnvoyMesh's **third agent engine**, complementing the two existing engines:

| Engine | Domain | Touches | Network access |
|---|---|---|---|
| **Built-in OpenClaw** (EnvoyAI, existing) | Mesh/social agent — knowledge, contacts, mandates, A2A | Network, peers, vault | ✅ Full mesh via `packages/openclaw-runtime/` |
| **Remote Ext Agent** (HomeClaw/Hermes/OpenHuman, existing) | Remote conversational agent | Remote HTTP endpoint only | ❌ None local; one HTTP pipe to mesh |
| **Pi** (new) | **Local coding agent** | User's filesystem + shell | ❌ **No mesh access** (Option B) |

**Pi's job:** the user's local coding brain — read/write files, run shell commands, refactor, debug. Pi is the **built-in default** for local coding work; it ships in the bundle, requires no configuration beyond what the user already configured for EnvoyMesh's model.

### Goals

1. **Out-of-the-box coding agent.** User installs EnvoyMesh, opens the Pi panel, starts coding. Zero extra setup.
2. **Inherits EnvoyMesh's model config by default** (provider, API key, endpoint, model name) — the same settings the user already configured for OpenClaw. Switchable per-session.
3. **Strict separation from OpenClaw.** Two independent lanes; neither knows about the other. Survives OpenClaw upstream churn.
4. **Reuses the existing permission model** (Phase 30 terminal-agent confirm flow) — no new mandate/Bond-Engine machinery for local actions.
5. **Available in two surfaces:** a dedicated Pi chat panel, and as a backend option in the existing Phase 30 terminal agent mode.

### Non-goals

- Pi is **not wired into OpenClaw**. No `delegate_to_pi` tool. OpenClaw stays unchanged.
- Pi gets **no `mesh.*` tools**. The mesh boundary stays owned by OpenClaw alone (`AGENTS.md:213`). If a coding task needs mesh context, the user uses OpenClaw.
- Pi does **not** inherit or extend OpenClaw's mandate/approval/Bond-Engine machinery. Those are for mesh operations; local file/shell actions use a lighter gate (§7).
- Pi is **built and packaged separately** from OpenClaw. No shared-deps entanglement, no fork synchronization.

---

## 2. Why Pi (and the OpenClaw relationship)

[Pi](https://pi.dev/) is a minimal, self-extensible AI coding agent harness — monorepo of four TypeScript packages:

| Package | Purpose | Size (v0.82.1 unpacked) |
|---|---|---|
| `@earendil-works/pi-coding-agent` | Interactive coding agent CLI | ~12 MB, 880 files |
| `@earendil-works/pi-ai` | Unified multi-provider LLM API | ~3 MB |
| `@earendil-works/pi-agent-core` | Agent runtime + tool calling + state | ~1 MB |
| `@earendil-works/pi-tui` | Terminal UI library | ~1 MB |

Model-agnostic (15+ providers: Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, Cerebras, xAI, OpenRouter, Ollama, LiteLLM, etc.). Four integration modes: interactive TUI, print/JSON, **RPC** (JSON over stdin/stdout), and **SDK** (`createAgentSession()` for embedding).

### The OpenClaw ancestry (and why it doesn't matter for this design)

OpenClaw historically **forked Pi's agent-core** — `packages/openclaw/packages/agent-core/` is `@openclaw/agent-core@0.2.0`, and OpenClaw pulls `@earendil-works/pi-tui@0.78.0` as a dependency. So Pi is not a stranger to the bundle.

**This design does not rely on that ancestry.** We ship **upstream Pi directly** (v0.82.x) as a separate sidecar. Whether OpenClaw keeps, drops, or rewrites its Pi-derived internals is irrelevant to the Pi lane — they are decoupled. Worst-case cost: some bundle duplication (~1 MB of `pi-tui` overlap, at different versions, so not safely shareable).

### Why Pi alongside OpenClaw (not instead of)

OpenClaw is a **mesh/social agent** — its value is the network bridge (`mesh.findKnowledge()`, `mesh.sendMessage()`, A2A, mandates). It is not optimized for local coding workflows. Pi is the opposite: a **local coding specialist** with no network story. The two are complementary, not competing. Mirrors the `AGENTS.md` ordering rule: low-risk local work first, network operations separately gated.

---

## 3. The Three-Engine Model

### Why Pi is a sibling engine, not a 4th Ext Agent entry

The existing **Ext Agent** abstraction (`packages/api/src/ext-agent.ts`) is shaped for **remote HTTP** agents:

```typescript
export interface ExtAgentDefinition {
  id: string;
  name: string;
  adapter: string;          // always "envoymesh-message" today
  url: string;              // HTTP endpoint
  enabled: boolean;
}
```

The contract is `POST { from, fromOwnerId, fromName, text, messageId } → { text }` — a remote conversational pipe. HomeClaw/Hermes/OpenHuman fit perfectly. Pi does not:

- Pi is **local** (filesystem + shell + terminal), not an HTTP endpoint.
- The Ext Agent bridge forwards **mesh inbound messages** to the active agent. Pi (Option B) doesn't want mesh traffic routed to it.
- Pi has capabilities the HTTP agents don't (terminal access, file edits, bash).

So Pi becomes a **third engine** in `AiEngineMode`, alongside Built-in OpenClaw and the Remote Ext Agent.

### `AiEngineMode` extension

Current (`packages/api/src/agent-network-mode.ts`):

```typescript
export type AiEngineMode = "off" | "openclaw-only" | "ext-only" | "both";
```

Extended:

```typescript
export type AiEngineMode =
  | "off"
  | "openclaw-only"
  | "ext-only"
  | "both"               // openclaw + ext
  | "pi-only"
  | "openclaw-pi"        // openclaw + pi (the common case: mesh agent + local coding agent)
  | "ext-pi"
  | "all";               // openclaw + ext + pi
```

The `computeAiEngineMode(bridgeEnabled, openclawEnabled, piEnabled)` helper gains a third boolean. The mode chip at the top of Settings → AI reflects all combinations.

**"Work at the same time":** Pi and OpenClaw run concurrently without conflict because their domains don't overlap. The user can be in an OpenClaw mesh conversation and a Pi coding session simultaneously.

### Config field additions

In `PersistedNodeConfig` (`apps/node/src/node-config-store.ts`) alongside `openclawEnabled` and the bridge config:

```typescript
piEnabled: boolean;                    // default: true (Pi is the built-in default)
piSettings?: {
  autoRunPolicy: TerminalAutoRunPolicy;  // default: "always-confirm"
  modelOverride?: {                     // omit → inherit EnvoyMesh modelProviders
    provider: string;
    model: string;
    endpoint?: string;
    apiKey?: string;
  };
  allowedPaths?: string[];              // optional cwd allowlist for Pi file ops
  terminalIntegrationEnabled: boolean;  // default: true
};
```

The model-override fields reuse the existing `ModelProviderConfig` shape (`packages/api/src/ws-protocol.ts:976`) so the same UI components can render them.

---

## 4. Bundle & Packaging Strategy

Pi ships as a **separate sidecar**, mirroring the proven OpenClaw pattern. No shared-deps entanglement with OpenClaw.

### New scripts (mirror the OpenClaw twins)

| New script | Mirrors | Purpose |
|---|---|---|
| `scripts/fetch-pi-sidecar.sh` | `scripts/fetch-openclaw-sidecar.sh` | Download upstream Pi CLI into `apps/tauri/src-tauri/resources/pi/` |
| `scripts/stage-tauri-pi-bundle.sh` | `scripts/stage-tauri-openclaw-bundle.sh` | Stage Pi CLI + node_modules into the resources tree |

### Tauri config

`apps/tauri/src-tauri/tauri.conf.json` (and `.slim.json` / `.full.json`) — add Pi to the resources array (currently lines 43-46):

```json
"resources": [
  "resources/node/**/*",
  "resources/node-runtime/**/*",
  "resources/openclaw/**/*",
  "resources/pi/**/*"
]
```

### Verification

`scripts/verify-tauri-resources.sh` gains a Pi presence check, mirroring the existing OpenClaw check:

```bash
require_dir_nonempty "$RES/pi" "Pi agent sidecar"
require_file "$RES/pi/dist/cli.js" "Pi CLI entry"
```

### Build-script integration (macOS + Windows)

The desktop build scripts must stage the Pi sidecar alongside Node and OpenClaw. Both scripts already have a "Step 1: stage sidecars" block; Pi is added as a new sub-step.

**`scripts/build-desktop.sh`** — add Pi between the OpenClaw and Node bundle staging calls (currently lines 175-179):

```bash
echo "[1/6] continued — Staging sidecars (Node.js, OpenClaw, Pi, EnvoyMesh node)..."
bash scripts/fetch-node-sidecar.sh
bash scripts/stage-tauri-openclaw-bundle.sh
bash scripts/stage-tauri-pi-bundle.sh        # ← new
bash scripts/stage-tauri-node-bundle.sh
bash scripts/verify-tauri-resources.sh
```

**`scripts/build-desktop.ps1`** — add a new `# 1d. Pi agent` block between the OpenClaw block (ends ~line 1285) and the existing `# 1d. Verify` step (renumber Verify to `1e`). Pattern mirrors the OpenClaw block: stage from source if available, else fall back to `fetch-pi-sidecar.ps1`, with a `-ForcePi` switch and a reuse gate.

```powershell
# 1d. Pi agent (local coding sidecar).
Write-Info "Staging Pi agent..."
$piSrc = Join-Path $RepoRoot "packages/pi"           # if we vendor Pi source later
$piDest = Join-Path $TauriResources "pi"
$piStaged = (Test-Path (Join-Path $piDest "dist")) -and `
            (Test-Path (Join-Path $piDest "package.json"))
if ($piStaged -and -not $ForcePi) {
    Write-Info "Reusing staged Pi at $piDest. Use -ForcePi to re-stage."
} else {
    # Fall back to fetch-pi-sidecar.ps1 (downloads pinned upstream Pi CLI).
    & (Join-Path $PSScriptRoot "fetch-pi-sidecar.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Pi sidecar staging failed — aborting build."
        exit 1
    }
}
```

A new `-ForcePi` switch is added to the `param()` block, mirroring `-ForceOpenClaw`. On Windows slim builds (`tauri.conf.slim.json`), Pi staging is skipped entirely via a `-SkipPi` switch (default `$false`; the slim build invocation sets it `$true`).

### Version pinning (supply-chain hygiene)

Pi version is **pinned** in `fetch-pi-sidecar.sh`, matching OpenClaw's pinned-deps approach:

```bash
PI_VERSION="${1:-0.82.1}"   # bump deliberately; never "latest" in production
```

A pre-commit hook (mirroring OpenClaw's lockfile blocks) prevents accidental drift.

### Bundle size budget

**Measured actual (Slice 1 smoke test, v0.82.1):** Pi adds **~170 MB unpacked** across all platforms. This is much larger than the npm tarball size (~12 MB) suggested, because `@earendil-works/pi-ai` declares the 5 major cloud SDKs as hard `dependencies`:

| Cloud SDK | Size | Used at runtime when... |
|---|---|---|
| `openai` | ~13 MB | `mode: "openai-compatible"` |
| `@google/genai` | ~14 MB | Google / Vertex provider |
| `@mistralai/mistralai` | ~24 MB | Mistral provider |
| `@aws-sdk/client-bedrock-runtime` (+ `@smithy/*`, `@aws-crypto/*`) | ~40 MB | AWS Bedrock provider |
| `@anthropic-ai/sdk` | ~6 MB | `mode: "anthropic-compatible"` |
| `@opentelemetry/*` | ~14 MB | Always (telemetry) |
| Other transitive (`typebox`, `web-streams-polyfill`, etc.) | ~30 MB | Always |
| `@earendil-works/{pi-ai,pi-agent-core,pi-tui}` | ~9 MB | Always |
| `@mariozechner/clipboard-*` (cross-platform native prebuilds) | ~7 MB → pruned to ~2 MB | Clipboard ops |

**Critical constraint:** all 5 cloud SDKs are **statically imported** at the top level of `pi-ai/dist/api/*.js` (e.g. `import Anthropic from "@anthropic-ai/sdk"`). They cannot be pruned at install time without crashing Pi on startup. Pruning is limited to:
- Source maps, TypeScript sources, test files (saves ~3 MB)
- Cross-platform native prebuilds — keep only the host OS+arch (saves ~5 MB)

**Implication for slim builds:** Pi is **omitted entirely** from `tauri.conf.slim.json` (Windows). The slim build's `-SkipPi` flag and the runtime `piEnabled: false` default disable the feature cleanly. Full builds (macOS DMG, Linux deb) include Pi.

**Future size-reduction path (out of Phase 49 scope):** if 170 MB ever proves unacceptable for full builds, the options are (a) fork `pi-ai` to convert the cloud SDK imports to dynamic `import()` (significant upstream-divergence cost), (b) ship only the SDK matching the user's configured provider (requires a post-install provider-detection step), or (c) accept the size and rely on installer compression (NSIS/DMG typically achieve ~3:1, so ~170 MB unpacked → ~55 MB in the installer).

**Decision (2026-07-28): accept ~170 MB unpacked.** EnvoyMesh targets home machines (desktop/laptop), where the size is a non-issue — comparable to OpenClaw's existing footprint. Installer compression brings the in-DMG size to ~55 MB. Forking `pi-ai` to dynamic imports is **not** worth the upstream-divergence cost. Windows slim builds still omit Pi (different constraint — NSIS installer cap).

### What does NOT change

- `scripts/stage-bundle-node-runtime.sh` / `.ps1` — Pi is its own bundle, not part of the node runtime.
- `scripts/sync-version.mjs` — Pi has its own version (pinned upstream), not tracked by the project VERSION file.
- OpenClaw's stage/fetch scripts — untouched.

### What DOES change (build orchestration)

- `scripts/build-desktop.sh` — adds `bash scripts/stage-tauri-pi-bundle.sh` to the sidecar-staging step.
- `scripts/build-desktop.ps1` — adds a `# 1d. Pi agent` staging block + `-ForcePi` / `-SkipPi` switches.
- `scripts/verify-tauri-resources.sh` — adds Pi presence check (see above).
- `apps/tauri/src-tauri/tauri.conf.{json,full.json,slim.json}` — adds Pi resource entry (slim omits).

---

## 5. Model Config Handoff

Pi inherits EnvoyMesh's model configuration by default (provider, API key, endpoint, model name from `node-config.json`'s `modelProviders` field), with optional per-session override in the Pi chat panel.

### How OpenClaw does it (for comparison)

OpenClaw receives the model config via a **generated `openclaw.json` file** + `OPENCLAW_CONFIG_PATH` env var (`apps/node/src/node-service-openclaw-runtime.ts:1302-1363`):

1. Read `nodeConfig.modelProviders` → build `{ provider, baseUrl, apiKey, model }` object.
2. Write `<gwStateDir>/openclaw.json` with the model in `models.providers.<id>` + `agents.defaults.model`.
3. Spawn the gateway with `OPENCLAW_CONFIG_PATH=<path>` env var. **No `--model` or `--api-key` CLI args; no `ANTHROPIC_API_KEY` env var.**

### How Pi does it (Pi-idiomatic)

**Key finding:** Pi has **no `PI_CONFIG_PATH`-style "point at a config file" mechanism**. Provider configuration is via TypeScript extensions (`pi.registerProvider()`) and API keys use **`$ENV_VAR` interpolation by design** ([Pi custom-provider docs](https://pi.dev/docs/latest/custom-provider)):

```javascript
pi.registerProvider("my-provider", {
  apiKey: "$MY_API_KEY",           // ← env-var interpolation is the idiomatic form
  baseUrl: "https://api.example.com",
  api: "openai-completions",
  models: [/* ... */]
});
```

So the Pi-idiomatic equivalent of OpenClaw's config-file approach is **scoped env vars on the Pi subprocess**:

| `modelProviders.mode` | Pi env vars set on subprocess | Pi `--model` arg |
|---|---|---|
| `"anthropic-compatible"` | `ANTHROPIC_API_KEY=<apiKey>` | `--model anthropic/<modelName>` |
| `"openai-compatible"` | `OPENAI_API_KEY=<apiKey>`, `OPENAI_BASE_URL=<endpoint>` | `--model openai/<modelName>` |
| `"ollama"` | `OLLAMA_BASE_URL=<endpoint>` (default `http://localhost:11434`) | `--model ollama/<modelName>` |
| `"litellm"` | `LITELLM_API_KEY=<apiKey>`, `LITELLM_BASE_URL=<endpoint>` | via generated Pi extension |
| `"mock"` / `"disabled"` | (Pi not spawnable; UI shows "configure a model first") | — |

**Security property preserved:** the API key lives only in the Pi subprocess's `env`, never in CLI args (which would be visible in `ps`/process listings) and never in the parent node's process env. This is the same property OpenClaw's file-based approach achieves — different mechanism, same guarantee.

### Per-session override

The Pi chat panel exposes a model picker. Selecting a different model writes to `piSettings.modelOverride` and restarts the Pi subprocess. "Use EnvoyMesh default" (the preselected option) clears the override and re-inherits. This mirrors how OpenClaw inherits + can be advised to reconfigure (per `tool-bridge.ts:373-378`).

### Implementation: `apps/node/src/pi-runtime.ts`

```typescript
export interface PiRuntimeConfig {
  piDir: string;                    // apps/tauri/src-tauri/resources/pi
  cwd: string;                      // user's workspace
  modelProviders: ModelProviderConfig;  // from node-config.json
  override?: PiModelOverride;       // from piSettings.modelOverride
}

export function buildPiEnv(config: PiRuntimeConfig): Record<string, string> {
  // Returns the scoped env var map per the table above.
  // NEVER includes the key in CLI args; only in the returned env object.
}

export class PiRuntime {
  async start(): Promise<void>          // spawn pi with buildPiEnv() + --model flag
  async prompt(text: string): Promise<PiResponse>
  subscribe(handler: (event: PiEvent) => void): Unsubscribe
  async stop(): Promise<void>
  async restartWithModel(override?: PiModelOverride): Promise<void>
}
```

---

## 6. UI Surfaces

### (a) New Pi chat panel — `apps/social/src/components/views/PiChatPanel.tsx`

**Lightweight by design.** Copy `TerminalAgentBar.tsx`'s pattern (`turns: AgentTurn[]`, `busy`, `pending`, single-RPC-per-submit), **not** `AIChatPanel.tsx`'s 830-line machinery.

**Drops from AIChatPanel:**
- ❌ Approval cards (`AiInlineApprovalCard` + `OwnerAgentApprovalSummary`) — Pi has no mesh ops to approve.
- ❌ Chain decomposition (`ChainStartDialog` / `ChainReportInlineCard` + `chain:report` WS event) — Pi doesn't run A2A chains.
- ❌ Structured `AnswerRenderer` with `format` / `blocks: StructuredBlock[]` — Pi renders markdown text.
- ❌ Yjs CRDT draft sync — Pi is single-device local; use plain `useState` for the composer.
- ❌ Turn-meta chips beyond `modelUsed` — no `domain`/`jobId`/`routeId`/`intent` to show.

**Keeps:**
- ✅ Prompt → response → tool-call proposal flow.
- ✅ A simple `turns: PiTurn[]` array (`role: "user" | "assistant" | "system"`, `text`, optional `toolCalls`).
- ✅ The `pending: TerminalCommandProposal | null` state and its confirm UI (see §7).
- ✅ A model picker (defaults to EnvoyMesh's configured model).

**New nav entry** alongside the existing EnvoyAI thread in the sidebar.

### (b) Terminal agent mode — Pi as a backend option

The existing Phase 30 terminal agent mode (`apps/social/src/components/terminals/TerminalAgentBar.tsx`) currently uses EnvoyMesh's LLM router to generate `TerminalCommandProposal`s. Add **"Pi" as an agent-mode option** in the toolbar:

- Current toggle: `Manual` / `Agent`
- New toggle: `Manual` / `Agent (EnvoyAI)` / `Agent (Pi)`

When "Agent (Pi)" is selected, natural-language inputs route to the Pi runtime instead of the EnvoyMesh LLM router. Pi proposals use the **existing `TerminalCommandProposal` shape unchanged** — the confirm UI, risk badges, and run/edit/cancel buttons all work as-is.

### (c) Settings → AI — new Pi block

`apps/social/src/components/views/settings/AgentSettings.tsx` gains a third block alongside Built-in OpenClaw and Ext Agent:

```
┌─ AI Engine ────────────────────────────────────────┐
│  Mode: [Built-in + Pi] ▼                           │
│                                                    │
│  ┌─ Built-in OpenClaw (EnvoyAI) ── [read-only] ─┐  │
│  │  Status: ● Running                            │  │
│  │  Model: anthropic/claude-sonnet-4-...         │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌─ Pi (Local Coding Agent) ──────── [toggle] ─┐   │
│  │  [✓] Enable Pi engine                        │   │
│  │  Model: [Use EnvoyMesh default ▼]            │   │
│  │  Auto-run policy: [Always confirm ▼]         │   │
│  │  Allowed paths: [/Users/.../repo] (optional) │   │
│  │  [✓] Terminal integration                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                    │
│  ┌─ Remote Ext Agent ────────────── [toggle] ──┐    │
│  │  Active: [HomeClaw ▼]                        │   │
│  └─────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

Unlike the Built-in OpenClaw block (which is read-only in the UI per Phase 32), the Pi block is **fully writable** — the owner can enable/disable, pick model, set permission policy, and configure the cwd allowlist without restarting the node.

---

## 7. Permission Model (Locked: Confirm-Dialog + Opt-In Trust)

Pi tool calls are surfaced to the user via a **confirm dialog**. EnvoyMesh does NOT execute Pi's tools — Pi executes them internally once we send `confirmed: true` via the `extension_ui_response` stdin message. This is the critical difference from the Phase 30 terminal agent (which writes commands to a PTY itself).

### How Pi's approval protocol works (verified against upstream)

When Pi is about to perform an action it deems worth confirming, it emits:

```typescript
// From packages/api/src/pi-agent.ts
interface PiExtensionUiRequest {
  type: "extension_ui_request"
  id: string             // unique per request; correlates the response
  method: "confirm"
  title: string          // short heading, e.g. "Clear session?"
  message: string        // supporting context, e.g. "All messages will be lost."
  timeout: number        // ms; Pi auto-resolves (usually skip) on expiry
}
```

Pi **BLOCKS** until the host sends back:

```typescript
interface PiExtensionUiResponse {
  type: "extension_ui_response"
  id: string             // matches the request id
  confirmed: boolean     // true = Pi proceeds; false = Pi skips the action
}
```

**Key facts (verified from Pi's RPC docs + source):**
- The `extension_ui_request` fires from inside the tool's logic (extensions call `ctx.ui.confirm(...)`), AFTER `tool_execution_start` and BEFORE `tool_execution_end`.
- Pi has **already classified the risk** itself — that's why it's asking. EnvoyMesh does not need to re-classify.
- On `timeout` expiry with no response, Pi auto-resolves (usually skip / `confirmed: false`). No retry.
- The `id` is a unique correlation key, separate from any `toolCallId`. Multiple requests can be in flight at once (parallel tool calls).
- The `title` and `message` are human-readable descriptions of the action — NOT raw command strings.

### Why NOT to reuse TerminalCommandProposal's execution path

The original design (§7 v1) proposed mapping Pi tool calls into `TerminalCommandProposal` and reusing `terminal-agent-assist.ts:executeProposal`. **This does not work** — `executeProposal` writes the command to a PTY via `this.manager.writeStdin(sessionId, ...)`. Pi doesn't expect EnvoyMesh to execute anything; it executes its own tools after we approve. Routing Pi through the PTY path would be wrong (no real command string) and dangerous (would execute arbitrary text in a shell).

We DO reuse the proposal **shape** for UI consistency (risk badges, dock styling), but the confirm/deny flow is dedicated: it calls `PiRuntime.respondendToUiRequest(id, confirmed)` instead of writing to a PTY.

### Confirm-dialog UI

When a `pi:proposal` event arrives, the Pi chat panel renders a docked card with:

```
┌─ Pi wants to: {title} ───────────────────────┐
│  {message}                                    │
│                              [Allow] [Deny]   │
└──────────────────────────────────────────────┘
```

- **Allow** → `nodeService.piRespondToProposal({ uiRequestId, confirmed: true })`
- **Deny** → `nodeService.piRespondToProposal({ uiRequestId, confirmed: false })`

Both unblock Pi immediately. No edit-in-terminal escape hatch (Pi's tool, not ours). No risk-tier badge (Pi already classified it).

### Default policy + opt-in escape hatch

- **Default:** every `extension_ui_request` surfaces the confirm dialog. Matches user expectations (cf. Claude Code, Cursor, Aider all confirm destructive ops).
- **Opt-in trust mode:** `piSettings.autoRunPolicy: "off"` → auto-respond `confirmed: true` to every request without surfacing the dialog. Power users who want raw CLI Pi feel. Available in Settings → AI → Pi block (Slice 49F). **Not the default.**

### Audit events

Every `extension_ui_request` and the user's response are audited (see §8 for the JSONL schema):

| Event | When |
|---|---|
| `pi.tool.proposed` | EnvoyMesh receives `extension_ui_request` and surfaces the dialog |
| `pi.tool.executed` | User clicks Allow (`confirmed: true`) |
| `pi.tool.denied` | User clicks Deny, or auto-deny on timeout |
| `pi.tool.failed` | `respondToUiRequest` throws (child exited, stdin closed) |

The audit captures: `title`, `message` (truncated + redacted of secrets via `evaluateEgressContent`), the `uiRequestId`, and the outcome. No raw command text (there isn't one).

### Egress-content scan

Although EnvoyMesh doesn't execute the tool, the `title` and `message` may contain sensitive data the user wouldn't want logged. Before writing audit events, run `evaluateEgressContent({ text: title + " " + message })` — if it detects PEM keys, AWS credentials, JWT tokens, or connection strings, redact the relevant portions before logging. The scan does NOT block the confirm dialog (the user needs to see the prompt to decide); it only affects what gets persisted to the audit log.

---

## 8. Audit Trail

Pi actions bypass the mesh tool registry, so they don't flow through `createAuditEvent` the way OpenClaw's mesh ops do. A **lighter local-action audit** is specified:

### New audit event types

| Event type | When | Recorded fields |
|---|---|---|
| `pi.tool.proposed` | Pi emits a tool call → mapped to `TerminalCommandProposal` | `toolName`, `params` (file paths redacted to basenames + hashes), `riskTier`, `source: "pi"` |
| `pi.tool.executed` | User confirms + tool runs successfully | + `outcome: "allow"`, `latencyMs` |
| `pi.tool.denied` | User cancels, or `requiresConfirmation` not satisfied | + `outcome: "deny"`, `reason` |
| `pi.tool.failed` | Tool execution threw | + `outcome: "record"`, `errorSummary` |

### Persistence

Persists to the existing JSONL audit log via `createSerialJsonlAppender` from `@envoymesh/local-store` — same append-only, serialized-write mechanism as all other audit events. No new storage path.

### Redaction

Following the existing pattern (`sanitizeToolResult` in `apps/node/src/tool-impl.ts`), file paths in audit records are redacted to basenames + hashes; raw file contents are never logged. Shell command text is hashed, not stored verbatim (matching `terminal.agent.*` audit behavior).

---

## 9. Identity & Attribution

Pi runs as the **human user** — it's their local coding tool. This deliberately keeps the mesh identity model untouched:

- ❌ No new peer identity (`envoy_agent_*` derivation).
- ❌ No owner-signed mandate.
- ❌ No `ExternalAgentSession` security record (that's for remote agents authenticating to call mesh tools).
- ✅ Audit events tagged `source: "pi"` for attribution.
- ✅ Pi's filesystem writes are attributable to the OS user running EnvoyMesh (no privilege separation beyond the existing Tauri/Node process model).

This matches Pi's native "no permission popups" philosophy being adapted for UI — Pi is treated as a power tool the user wields directly, not as an autonomous agent acting on the user's behalf across the network.

---

## 10. File / Code Layout

```
scripts/
  fetch-pi-sidecar.sh              (new — mirrors fetch-openclaw-sidecar.sh)
  fetch-pi-sidecar.ps1             (new — Windows twin, mirrors fetch-openclaw pattern)
  stage-tauri-pi-bundle.sh         (new — mirrors stage-tauri-openclaw-bundle.sh)
  verify-tauri-resources.sh        (edited — add Pi presence check)
  build-desktop.sh                 (edited — add stage-tauri-pi-bundle.sh to sidecar step)
  build-desktop.ps1                (edited — add # 1d. Pi agent block + -ForcePi/-SkipPi switches)

apps/tauri/src-tauri/
  tauri.conf.json                  (edited — add "resources/pi/**/*")
  tauri.conf.slim.json             (edited — Pi optional on slim builds, see §4)
  tauri.conf.full.json             (edited — add "resources/pi/**/*")
  resources/pi/                    (new — staged Pi CLI + node_modules)

packages/api/src/
  pi-agent.ts                      (new — PiAgentSession, PiEvent, PiResponse types)
  agent-network-mode.ts            (edited — add "pi" to AiEngineMode)
  ws-protocol.ts                   (edited — add Pi RPC methods + events)
  node-service.ts                  (edited — add Pi methods to NodeService interface)

apps/node/src/
  pi-runtime.ts                    (new — spawn + manage Pi subprocess, model handoff per §5)
  pi-tool-bridge.ts                (new — Pi extension_ui_request → PiToolProposal + audit)
  node-service-pi.ts               (new — JSON-RPC handlers for Pi chat / terminal)
  node-config-store.ts             (edited — add piEnabled + piSettings to PersistedNodeConfig)

apps/social/src/components/
  views/PiChatPanel.tsx            (new — lightweight chat panel per §6a)
  views/settings/AgentSettings.tsx (edited — add Pi block per §6c)
  terminals/TerminalAgentBar.tsx   (edited — add "Agent (Pi)" mode per §6b)

apps/social/src/i18n/messages/     (edited — Pi-related strings, all locales)

docs/
  pi-integration-design.md         (this file)
  implementation-plan.md           (edited — Phase 49 entry)
```

---

## 11. Phased Delivery

Implementation is sequenced into six slices. Each slice is independently verifiable and shippable.

### Slice 1 — Bundle & Spawn

- `scripts/fetch-pi-sidecar.sh` + `scripts/stage-tauri-pi-bundle.sh`
- `apps/tauri/src-tauri/tauri.conf.json` resource entry
- `scripts/verify-tauri-resources.sh` Pi check
- Minimal `apps/node/src/pi-runtime.ts` that spawns Pi and confirms it responds
- **Verifiable:** `pi --version` works inside the bundled terminal; Pi sidecar present in the DMG/exe.

### Slice 2 — Model Handoff

- `buildPiEnv(config)` mapping `ModelProviderConfig` → Pi env vars per §5
- Spawn Pi with the right provider/model
- Per-session override restart logic
- **Verifiable:** Pi responds using EnvoyMesh's configured model (e.g. send a prompt, get a real Anthropic/OpenAI response).

### Slice 3 — Pi Chat Panel (no tools yet)

- `packages/api/src/pi-agent.ts` types
- `apps/node/src/node-service-pi.ts` JSON-RPC handlers
- `apps/social/src/components/views/PiChatPanel.tsx` (plain prompt/response)
- New sidebar nav entry
- **Verifiable:** user can chat with Pi in the new panel; responses stream.

### Slice 4 — Tool Calling + Permission Flow

- `apps/node/src/pi-tool-bridge.ts` — Pi `extension_ui_request` → `PiToolProposal` (the confirm-dialog payload) + audit-event helpers. Does NOT map to `TerminalCommandProposal` — see §7 ("Why NOT to reuse").
- Risk-tier classification per §7
- Confirm UI in `PiChatPanel.tsx` (reuse Phase 30 patterns)
- Server-side enforcement + egress scan
- **Verifiable:** file edits and bash commands surface as confirmable proposals; destructive ops require explicit confirm; trust mode (`autoRunPolicy: "off"`) opt-in works.

### Slice 5 — Terminal Agent Mode

- "Agent (Pi)" option in `TerminalAgentBar.tsx`
- Route natural-language input to Pi runtime
- Pi proposals use existing `TerminalCommandProposal` shape
- **Verifiable:** terminal agent mode works with Pi backend; existing EnvoyAI mode unaffected.

### Slice 6 — Settings UI + Audit

- Pi block in `AgentSettings.tsx` (enable toggle, model picker, policy selector, allowlist)
- `piEnabled` + `piSettings` in `PersistedNodeConfig`
- Audit events wired (`pi.tool.proposed/executed/denied/failed`)
- i18n strings (all locales)
- **Verifiable:** full end-to-end — configure in Settings, use in chat panel + terminal, audit events appear in the log.

---

## 12. Open Questions & Risks

| Risk / open question | Mitigation / resolution path |
|---|---|
| **Pi subprocess transport:** RPC (JSON over stdio) vs SDK (in-process `createAgentSession()`) vs webhook (OpenClaw-style) | **Recommend RPC** for parity with OpenClaw's process isolation. SDK gives tighter tool-call event streaming but couples Pi lifecycle to the node process. **Decision deferred to Slice 1 spike** — try RPC first, fall back to SDK if event streaming proves too lossy. |
| **Bundle size on Windows slim builds** | Memory note: "for Windows, we just package the useful extension for bundle size limitation." Pi adds ~12 MB on all platforms. **Slice 1 action:** add a `tauri.conf.slim.json` variant that omits Pi; default `piEnabled: false` on slim builds. Document in the Windows build script. |
| **Pi version drift** | Pin to a specific `0.82.x` in `fetch-pi-sidecar.sh`. Bump deliberately with a manual changelog entry. Never use `"latest"` in production. |
| **Pi subprocess crash / hang** | Supervised start with exponential backoff restart (mirroring `apps/node/src/openclaw-gateway-spawn.ts` patterns). Crash logged as `pi.runtime.crashed` audit event. |
| **Concurrent Pi sessions** | Pi is single-session per spawn (like OpenClaw). Multiple chat panel instances share one Pi subprocess via session ID multiplexing, OR we spawn per-session (simpler, more memory). **Defer to Slice 3** — start with per-session, optimize later if memory pressure. |
| **Audit log volume** | Pi tool calls can be frequent. Mitigation: redact aggressively (file content never logged; paths hashed); consider a separate `pi-actions.jsonl` if the main audit log grows too fast. Monitor in Slice 6. |

---

## 13. Testing Strategy

Reuses the existing test orchestrator (`scripts/test.sh` / `npm run test:dev`).

### Unit tests

| Area | File | Coverage |
|---|---|---|
| Model-config mapping | `apps/node/test/pi-runtime.test.ts` | `buildPiEnv()` for each `ModelProviderMode`; override logic; env-var scoping (key not in parent env) |
| Tool-request mapping | `apps/node/test/pi-tool-bridge.test.ts` | `extension_ui_request` → `PiToolProposal`; egress scan redacts secrets in title/message before audit |
| Audit event shape | `apps/node/test/pi-audit.test.ts` | Event types; field redaction; JSONL append serialization |
| `AiEngineMode` extension | `packages/api/test/agent-network-mode.test.ts` | `computeAiEngineMode` with `piEnabled` for all 8 combinations |

### Integration tests

| Area | File | Approach |
|---|---|---|
| Pi subprocess spawn + prompt | `apps/node/test/pi-runtime-integration.test.ts` | Spawn real Pi (gated on `RUN_PI_TESTS=1`), send a mock-model prompt, assert response shape |
| Permission enforcement | `apps/node/test/pi-permission-integration.test.ts` | Proposals with each `riskTier`; verify `requiresConfirmation` respected; verify trust mode bypasses |

### E2E tests

| Area | File | Approach |
|---|---|---|
| Bundle includes Pi | `scripts/test.sh` bundle phase | `verify-tauri-resources.sh` passes with Pi present |
| Terminal Pi mode | `apps/social/test/terminals.test.tsx` (extended) | Render `TerminalAgentBar` with Pi mode; verify proposal UI |

### Test gates

- Pi tests gated on `RUN_PI_TESTS=1` (Pi sidecar must be staged; not available in pure-source CI runs).
- The orchestrator's `dev` phase runs Pi unit tests always; integration tests only when `RUN_PI_TESTS=1`.
- `npm run test:full` includes Pi integration tests after staging the sidecar.

---

## 14. References

- [Pi on GitHub](https://github.com/earendil-works/pi)
- [Pi documentation](https://pi.dev/)
- [Pi SDK docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [Pi custom-provider docs](https://pi.dev/docs/latest/custom-provider)
- [OpenClaw agent-runtime-architecture](https://docs.openclaw.ai/agent-runtime-architecture)
- Phase 29 (OpenClaw integration) in [implementation-plan.md](./implementation-plan.md)
- Phase 30 (Terminals) in [implementation-plan.md](./implementation-plan.md)
- Phase 32 (Agent Network Membership) in [implementation-plan.md](./implementation-plan.md)
- `AGENTS.md:213` — "External agents must not call libp2p directly"
