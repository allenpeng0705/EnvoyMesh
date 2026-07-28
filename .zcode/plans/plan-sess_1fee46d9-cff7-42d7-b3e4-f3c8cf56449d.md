# Plan: Pi Integration as a Built-in Local Coding Agent

## What gets produced

Two documents (no implementation code in this pass — design first, execute after your review):

1. **`docs/pi-integration-design.md`** — the detailed standalone design doc (new file).
2. **`docs/implementation-plan.md`** — a new Phase entry appended (e.g. "Phase 46 — Pi as Built-in Local Coding Agent"), matching the existing phase format with goals, slices, checkboxes, and file paths.

After you approve the design, subsequent turns execute the slices.

---

## Design doc outline (`docs/pi-integration-design.md`)

The doc will contain these sections, each grounded in the verified findings below:

### 1. Overview & goals
Pi (earendil-works, MIT, TypeScript, ~12 MB unpacked at v0.82.1) becomes EnvoyMesh's **third agent engine**, alongside Built-in OpenClaw (mesh/social) and Remote Ext Agent (HomeClaw/Hermes/OpenHuman). Pi is the **built-in default local coding agent** — runs filesystem + shell operations on the user's machine, no mesh access.

### 2. Non-goals (locked decisions recap)
- Pi is **not** wired into OpenClaw (no `delegate_to_pi` tool). Two independent lanes.
- Pi gets **no `mesh.*` tools** (Option B). OpenClaw stays the sole network boundary per `AGENTS.md:213`.
- Pi does **not** inherit or extend OpenClaw's mandate/approval/Bond-Engine machinery.
- Pi is built and packaged **separately** from OpenClaw (no shared-deps entanglement, no fork sync).

### 3. The three-engine model (resolves "Ext Agent slot" tension)
The existing `ExtAgentDefinition { id, name, adapter, url, enabled }` slot is shaped for **remote HTTP** agents. Pi is **local** (filesystem + shell + terminal), so it doesn't fit that shape. Instead, Pi becomes a **third engine** in `AiEngineMode`:

- Current: `AiEngineMode = "off" | "openclaw-only" | "ext-only" | "both"` (from `packages/api/src/agent-network-mode.ts`)
- Extended: add `pi` as a first-class engine. New modes: `"pi-only"`, and the active-engine selector in Settings → AI shows three toggles: **EnvoyAI (OpenClaw) / Pi / Remote Ext Agent**. Pi can run alongside OpenClaw simultaneously (per your "work at the same time" requirement) — they don't conflict because their domains don't overlap.

The doc will spell out: config field additions (`piEnabled: boolean`, `piSettings`), the UI layout (3 blocks mirroring the existing Built-in OpenClaw + Ext Agent blocks), and why Pi is a sibling engine rather than a 4th `extAgents[]` entry.

### 4. Bundle & packaging strategy (separate sidecar)
Mirror the proven OpenClaw sidecar pattern exactly:
- **New script `scripts/fetch-pi-sidecar.sh`** — downloads `@earendil-works/pi-coding-agent` (and its 3 transitive deps `pi-ai`, `pi-agent-core`, `pi-tui`) into `apps/tauri/src-tauri/resources/pi/`. Template: `scripts/fetch-openclaw-sidecar.sh`.
- **New script `scripts/stage-tauri-pi-bundle.sh`** — stages the Pi CLI + node_modules into the resources tree. Template: `scripts/stage-tauri-openclaw-bundle.sh`.
- **`apps/tauri/src-tauri/tauri.conf.json`** — add `"resources/pi/**/*"` to the resources array (line ~43-46).
- **`scripts/verify-tauri-resources.sh`** — add a Pi presence check.
- **`scripts/stage-bundle-node-runtime.sh` + `.ps1`** — no changes (Pi is its own bundle, not part of the node runtime).
- Bundle cost: ~12 MB unpacked. Some overlap with OpenClaw's existing `pi-tui@0.78.0` dep (~1 MB), but Pi at `0.82.1` is 4 versions ahead, so sharing isn't safe — accept the duplication.

### 5. Model config handoff (Pi-specific, idiomatic)
**Key finding:** Pi has no `PI_CONFIG_PATH`-style "point at a config file" mechanism. Provider config is via TypeScript extensions (`pi.registerProvider()`) and API keys use `$ENV_VAR` interpolation by design (`apiKey: "$ENVOY_MODEL_API_KEY"`).

**Recommended approach — env-var interpolation (Pi-idiomatic, mirrors OpenClaw's "no key in CLI args" principle):**
- EnvoyMesh reads `nodeConfig.modelProviders` (`ModelProviderConfig` from `packages/api/src/ws-protocol.ts:976` — `{ mode, endpoint, modelName, apiKey }`).
- Map to Pi-native env vars when spawning the Pi subprocess:
  - `mode: "anthropic-compatible"` → `ANTHROPIC_API_KEY=<apiKey>`, Pi invoked with `--model anthropic/claude-...`
  - `mode: "openai-compatible"` → `OPENAI_API_KEY=<apiKey>`, `OPENAI_BASE_URL=<endpoint>`, `--model openai/<modelName>`
  - `mode: "ollama"` / `"litellm"` → custom provider via a tiny generated Pi extension that reads `$ENVOY_MODEL_API_KEY` etc.
- The user can override per-session in the Pi chat panel (model picker) — **default inherits EnvoyMesh config**, switchable at runtime. This matches your requirement and mirrors how OpenClaw inherits + can be advised to reconfigure.

The doc will contrast this with OpenClaw's `openclaw.json` + `OPENCLAW_CONFIG_PATH` file-based approach and explain why Pi's `$ENV_VAR` design makes env vars the idiomatic equivalent (same security property: no key in CLI args or generic env pollution; key is scoped to the Pi subprocess env).

### 6. UI surfaces

**(a) New Pi chat panel** (`apps/social/src/components/views/PiChatPanel.tsx`)
- Lightweight — copy `TerminalAgentBar.tsx`'s pattern (`turns: AgentTurn[]`, `busy`, `pending`, single-RPC-per-submit), NOT `AIChatPanel.tsx`'s 830-line approval/chain/CRDT machinery.
- Drops: approval cards, chain decomposition, structured `AnswerRenderer`, Yjs CRDT draft sync, turn-meta chips.
- Keeps: prompt → response → tool-call proposals with confirm flow.
- New nav entry alongside the existing EnvoyAI thread.

**(b) Terminal agent mode** — add "Pi" as an agent-mode option in `TerminalAgentBar.tsx` (alongside the current OpenClaw-driven assist). Pi proposals use the existing `TerminalCommandProposal` shape unchanged.

**(c) Settings → AI** (`apps/social/src/components/views/settings/AgentSettings.tsx`)
- New "Pi" block alongside the existing Built-in OpenClaw + Ext Agent blocks.
- Toggle: enable/disable Pi engine.
- Model picker: shows EnvoyMesh's current model with "use EnvoyMesh default" preselected; allows override.
- Permission policy: `autoRunPolicy` selector (`off` / `safe-only` / `always-confirm`), defaulting to `always-confirm`.

### 7. Permission model (locked: confirm-destructive + opt-in trust)
Reuse the existing Phase 30 terminal-agent confirm flow verbatim:
- Pi tool calls (file read/write, bash, edit) map to `TerminalCommandProposal` with `riskTier: "safe" | "moderate" | "destructive"`.
- Risk classification reuses `resolveProposalRisk()` from `packages/models/src/terminal-command-proposal.ts:170` (deterministic patterns + model-hint upgrade + owner allow/deny patterns).
- `autoRunPolicy: "always-confirm"` is the default; `"off"` (= trust mode) is opt-in for power users.
- Server-side enforcement mirrors `terminal-agent-assist.ts:716`.

Tool→risk mapping the doc will specify:
- `read`, `ls`, `grep`, `glob` → `safe`
- `write`, `edit`, `mkdir`, `touch` → `moderate`
- `bash` matching destructive patterns (`rm`, `mv`, `sudo`, `>`, `chmod`) → `destructive`

### 8. Audit trail
Pi actions bypass the mesh tool registry, so they don't flow through `createAuditEvent` the way OpenClaw's mesh ops do. The doc specifies a **lighter local-action audit**:
- New audit event types: `pi.tool.proposed`, `pi.tool.executed`, `pi.tool.denied`.
- Records: tool name, parameters (with file paths), risk tier, outcome, `source: "pi"`, attributable to the owner (Pi runs as the human user, not under an agent mandate).
- Persists to the existing JSONL audit log via `createSerialJsonlAppender`.

### 9. Identity & attribution
- Pi runs as the **human user** (it's their local coding tool), not under an owner-signed agent mandate. This keeps the mesh identity model untouched.
- Audit events tagged `source: "pi"` for attribution.
- No new peer identity, no mandate, no `envoy_agent_*` derivation.

### 10. File/code layout
```
scripts/
  fetch-pi-sidecar.sh              (new — mirrors fetch-openclaw-sidecar.sh)
  stage-tauri-pi-bundle.sh         (new — mirrors stage-tauri-openclaw-bundle.sh)
  verify-tauri-resources.sh        (edited — add Pi check)
apps/tauri/src-tauri/
  tauri.conf.json                  (edited — add "resources/pi/**/*")
  resources/pi/                    (new — staged Pi CLI)
packages/api/src/
  pi-agent.ts                      (new — PiAgentSession types, mirroring terminal-agent.ts)
  agent-network-mode.ts            (edited — add "pi" to AiEngineMode)
  ws-protocol.ts                   (edited — add Pi RPC methods + events)
apps/node/src/
  pi-runtime.ts                    (new — spawn + manage Pi subprocess, model handoff)
  pi-tool-bridge.ts                (new — Pi tool calls → TerminalCommandProposal)
  node-service-pi.ts               (new — JSON-RPC handlers for Pi chat)
apps/social/src/components/
  views/PiChatPanel.tsx            (new — lightweight chat panel)
  views/settings/AgentSettings.tsx (edited — add Pi block)
  terminals/TerminalAgentBar.tsx   (edited — add "Pi" agent-mode option)
docs/
  pi-integration-design.md         (new — this design doc)
  implementation-plan.md           (edited — add Phase 46 entry)
```

### 11. Phased delivery (also the impl-plan entry's slices)
- **Slice 1 — Bundle & spawn**: `fetch-pi-sidecar.sh` + `stage-tauri-pi-bundle.sh` + tauri.conf.json + a minimal `pi-runtime.ts` that spawns Pi and confirms it responds. Verifiable: `pi --version` works inside the bundled terminal.
- **Slice 2 — Model handoff**: read `modelProviders`, map to env vars, spawn Pi with the right provider. Verifiable: Pi responds using EnvoyMesh's configured model.
- **Slice 3 — Pi chat panel**: `PiChatPanel.tsx` + JSON-RPC + plain prompt/response (no tools yet). Verifiable: user can chat with Pi in the new panel.
- **Slice 4 — Tool calling + permission flow**: Pi tool calls → `TerminalCommandProposal` → confirm UI. Verifiable: file edits and bash commands surface as confirmable proposals.
- **Slice 5 — Terminal agent mode**: "Pi" option in `TerminalAgentBar.tsx`. Verifiable: terminal agent mode works with Pi backend.
- **Slice 6 — Settings UI + audit**: Pi block in AgentSettings, audit events wired. Verifiable: full end-to-end.

### 12. Open questions / risks (explicitly flagged)
- **Pi subprocess transport**: RPC (JSON over stdio) vs SDK (in-process `createAgentSession()`) vs webhook (OpenClaw-style). Doc recommends RPC for parity with OpenClaw's isolation, but notes SDK gives tighter tool-call event streaming. Decision deferred to Slice 1 spike.
- **Bundle size on Windows**: memory note says Windows already trims OpenClaw extensions for size. Pi adds ~12 MB on all platforms — may need a "Pi optional" toggle for Windows slim builds. Flagged for Slice 1.
- **Pi version pinning**: lock to a specific `0.82.x` and bump deliberately (supply-chain hygiene matching OpenClaw's pinned approach).

### 13. Testing strategy
- Unit: model-config mapping, tool→risk classification, audit event shape.
- Integration: spawn real Pi subprocess in test, send a prompt, assert response.
- E2E: bundle includes Pi, terminal can invoke it, chat panel round-trips.
- Reuse the existing test orchestrator (`scripts/test.sh`).

---

## Implementation-plan.md entry (Phase 46)

Will be appended in the existing format — goal, status marker `[~] designed`, slices 1–6 as checkboxes with file paths, success bar, ordering-rule note. Mirrors Phase 29 (OpenClaw integration) and Phase 30 (Terminals) structure for consistency.

---

## What I will NOT do in this pass
- No code implementation (slices 1–6 execute after you approve the design).
- No changes to OpenClaw, the mesh tool registry, Bond Engine, or mandate schemas.
- No removal or modification of the existing Ext Agent / HomeClaw / Hermes / OpenHuman support.

## Tools needed to execute this plan
- Bash (read-only verification of existing patterns already done; will need write access when implementing slices later)
- Edit/Write (to create the design doc and edit implementation-plan.md)