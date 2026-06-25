# Phase 32 — Agent Network Membership (Built-in OpenClaw + Ext Agent)

**Status:** `[x]` designed (reframed 2026-06-16) — the original "kill the built-in OpenClaw" scope was reframed as "agent network membership." Code plumbing (config field, boot-time gate, status RPC, mode helper, mobile mirror) is shipped; the runtime `openclawEnabled` checkbox and D2A in-flight cancel were removed in the reframe.
**Date:** 2026-06-16 (reframed post-review)
**Author:** EnvoyMesh core team
**Implements:** US-AN1, US-AN2, US-AN3
**Related:** [implementation-plan.md#phase-32](./implementation-plan.md#phase-32--agent-network-membership-built-in-openclaw--ext-agent), Phase 29 (OpenClaw runtime), Phase 11 (mobile thin-client)

> **Reframe (2026-06-16, post-review):** the original framing of this phase as "you can turn off the built-in OpenClaw" was a misread of the original ask. The original question was *"can the user configure **which agent is in the agent network**, or both?"* — that is a **membership / advertisement** question, not a "kill the engine" question. The built-in OpenClaw is the **primary** agent on every EnvoyMesh home node and is **not** something the user is expected to disable in normal use. This doc has been rewritten to reflect that. The runtime gate and status RPC are still useful — a user running a pure relay node, or an external-only deployment, can opt out of the built-in at config-write time — but the UI surfaces this as a **secondary** option, not a primary action. The default-mode chip and mobile mirror remain; the dramatic "in-flight cancel" machinery has been removed (the gate runs at boot, not on every chat).

---

## 1. Problem

EnvoyMesh currently has **two distinct agents** that can be reachable through the home node's mesh:

| Agent | Where it runs | User config today |
|-------|---------------|-------------------|
| **Built-in OpenClaw** ("EnvoyAI") | In-process child process, talks to webhook `http://127.0.0.1:18789/webhook/envoymesh` | **None.** Auto-starts on every boot whenever `bridge-config.json` exists. Not surfaced in the UI. |
| **Ext Agent** ("Agent Bridge") | Out-of-process, sandboxed listener on port 3031, talks to HomeClaw / external agent | JSON field `bridgeEnabled` in `bridge-config.json` + UI toggle `nodeConfig.bridgeEnabled` (UI overrides JSON) |

The user's original ask was: *"We have two agents — built-in OpenClaw and Ext Agent. Can we allow the user to configure which agent is put into the agent network, or both of them?"*

That is a **network-membership** question. Today, the answer is partial: the Ext Agent can be turned on/off, but the built-in OpenClaw is silently *always* in the network. There is no single screen that tells the user *"here are the agents on my mesh, here is the state of each"*, and the mobile thin-client (EnvoyGo) has zero visibility into either.

The fix is to:

1. Make both flags first-class config (one each in `PersistedNodeConfig`), with sensible defaults: **built-in OpenClaw ships as the default**; **Ext Agent is opt-in**.
2. Surface both in a single `Settings → AI → Agent Network` section, with a derived "network mode" chip ("Built-in + Ext" / "Built-in only" / "Ext only" / "None") that reflects the configured state.
3. Mirror the configuration on the paired EnvoyGo thin-client, read-only.
4. Wire the existing orphaned `AgentSettings.tsx` so it is actually rendered.

This is a **config surfacing** change. It is **not** about routinely turning the built-in off — the built-in is the point of EnvoyMesh. The flag is exposed for the rare case where a user explicitly wants an external-only or relay-only deployment, and as a precondition for the follow-up A2A tool work (Phase 33) that will install tools on the agent.

---

## 2. Goals & non-goals

### Goals

- **G1.** Add `openclawEnabled?: boolean` to `PersistedNodeConfig`, symmetric to the existing `bridgeEnabled`.
- **G2.** The home node respects both flags **at boot**. A flag set to `false` means the corresponding subsystem does not start (gateway child not spawned; bridge listener not bound). There is no runtime "hot toggle" — the node restarts to apply.
- **G3.** A new `getOpenClawStatus()` RPC exposes the live state (`enabled`, `running`, webhook URL, child PID) — mirrors the existing `getBridgeStatus()`. The social UI and mobile thin-client use this to show the user what is actually running.
- **G4.** A new `Settings → AI → Agent Network` section in the social UI surfaces the configured state, shows a derived "network mode" chip, and lets the owner configure the **Ext Agent** bridge (URL, port, name) + persist the `bridgeEnabled` flag. The built-in OpenClaw's status is shown read-only — its configuration is a *boot-time* concern handled via `node-config.json` and the home-node installer, not a settings-UI concern.
- **G5.** Mobile thin-client (EnvoyGo) reads both flags via the home node's `getNodeConfig()` and displays a read-only mirror ("Built-in is present", "Ext Agent: configured / not configured") in `Me → Agent Network`.
- **G6.** i18n parity across all 7 locales (English-only added; other locales fall back to English per existing `translate.ts` behavior).
- **G7.** No wire-protocol change. A2A intents stay internal-only for now (one-way home→mobile).

### Non-goals

- **NG1.** No A2A tool exposure (`propose_task` / `await_task_result` / `cancel_task` / `request_agent_card`) — that is a **follow-up phase** (Phase 33, scoped separately). The plumbing must be ready for it, but those are not built here.
- **NG2.** No new routing policy for "if both agents, who answers first?" — the two-tier rule from Phase 29D stays (chat/auto-reply → native model; assistant / `@envoy` → OpenClaw if enabled else native). Ext Agent remains on its own bridge channel and is not auto-routed to chat. We are only making **which agents are in the network** configurable.
- **NG3.** No agent marketplace, no per-agent capability negotiation, no fan-out load balancing. One or two agents on a single home node, period.
- **NG4.** No change to `bridge-config.json` schema. We add the UI toggle pattern, we do not deprecate the JSON file.
- **NG5.** No runtime hot-toggle UI. The boot-time gate is sufficient. The home node owner who wants to flip `openclawEnabled` edits `node-config.json` and restarts; the social UI does not provide that control. This is a deliberate scope reduction from the earlier draft of this design.

---

## 3. Current state (verified 2026-06-16)

| Concern | Location | Today |
|---------|----------|-------|
| Built-in OpenClaw auto-start | `apps/node/src/index.ts:3406` | `void nodeService.startOpenClaw().then(...)` — unconditional. The runtime gate inside `startOpenClaw()` consults `openclawEnabled` from disk; default is `true`. |
| OpenClaw gate condition | `apps/node/src/node-service-impl.ts:4470` (`startOpenClaw`) | Returns `false` if `bridge-config.json` doesn't exist, URL not resolvable, **or `openclawEnabled === false`** (Phase 32). |
| OpenClaw gate helper | `apps/node/src/node-service-impl.ts:4201-4204` (`_isOpenClawEnabled`) | `await this._configStore.load()` → `cfg?.openclawEnabled ?? true`. No in-memory cache. |
| OpenClaw readiness | `apps/node/src/node-service-impl.ts` (`isOpenClawReady`) | In-memory; child process + webhook alive |
| OpenClaw watchdog | `apps/node/src/node-service-impl.ts` (`_startOpenClawWatchdog`) | Respawns gateway if it dies; gated by `startOpenClaw()` |
| Ext Agent bridge toggle | `apps/node/src/node-config-store.ts:89` (`bridgeEnabled`) | Persisted; fresh-install fallback at `node-service-impl.ts:7595` sets `false` (D1C: external bridge is opt-in). Existing installs with `bridgeEnabled: true` in their `node-config.json` are not rewritten (the per-load merge at line 7531 keeps `undefined → true`). |
| Bridge UI override | `apps/node/src/index.ts:313-323` | UI flag wins over JSON when UI = true (unchanged) |
| Bridge status | `packages/api/src/node-service.ts` (`getBridgeStatus`) | Exposed via RPC `getBridgeStatus` in `ws-protocol.ts` |
| Orphaned UI component | `apps/social/src/components/views/settings/AgentSettings.tsx` | Defined, has Built-in + Ext Agent sections, **never imported** → **Phase 32 wires it** into `SettingsAITab.tsx` |
| Persisted config round-trip | `node-service-impl.ts:7749-7753` (`updateNodeConfig`) | `bridgeEnabled` and `openclawEnabled` are both in the partial-update list |
| Mobile thin-client mirror | `apps/envoygo/lib/widgets/ai_engine_section.dart` | Reads `getOpenClawStatus()` and `getBridgeStatus()` via `NodeServiceClient`; renders read-only chip + rows. (Originally `agent_network_section.dart`; renamed to match the "AI Engine" terminology used in the social UI.) |
| Mobile RPC proxy | `packages/mobile-node/src/index.ts:4253` (`getOpenClawStatus`) | Delegates to home via `_homeRemoteCall` when paired; returns offline default when unpaired |

The plumbing for "two independent agents, one config flag each" is **already in place for the bridge**. We are **mirroring that exact pattern** for the built-in OpenClaw (config field + boot-time gate + status RPC), and **also wiring the orphaned UI component** that has been sitting unused.

---

## 4. Proposed design

### 4.1 Config model

Add a single new field to `PersistedNodeConfig` in `apps/node/src/node-config-store.ts` (next to `intentPredictionEnabled`):

```typescript
/**
 * Whether the built-in OpenClaw agent (EnvoyAI) is a member of the
 * home node's agent network. Read at boot by `startOpenClaw()`; when
 * false, the gateway child is not spawned. Default: true (built-in
 * is EnvoyMesh's primary agent). The mobile thin-client and the
 * social UI show the configured state read-only; flipping this
 * field at runtime via the social UI is intentionally not exposed
 * (the home-node owner edits `node-config.json` and restarts).
 */
openclawEnabled?: boolean;
```

**Defaults (D1C — revised):**
- **`openclawEnabled: true`** — built-in OpenClaw is the default AI on every EnvoyMesh home node.
- **`bridgeEnabled: false`** (fresh install only) — the Ext Agent bridge is opt-in. **Existing installs with `bridgeEnabled: true` persisted in their `node-config.json` are not retroactively rewritten** — they keep the `true` they have today. Only the default for *new* installs changes.

The `openclawEnabled` field is new, so its default is purely a code-level decision.

**No new enum.** Two booleans + a derived "mode" computed at read time:

```typescript
type AiEngineMode = "off" | "openclaw-only" | "ext-only" | "both";
function computeAiEngineMode(bridge: boolean, openclaw: boolean): AiEngineMode {
  if (bridge && openclaw) return "both";
  if (bridge) return "ext-only";
  if (openclaw) return "openclaw-only";
  return "off";
}
```

This lives in `packages/api/src` (new file `agent-network-mode.ts`) and is reused by the social app and the mobile client.

### 4.2 Runtime gate (boot-time only)

In `apps/node/src/node-service-impl.ts:4458`, modify `startOpenClaw()`:

```typescript
async startOpenClaw(): Promise<boolean> {
  if (!(await this._isOpenClawEnabled())) return false;  // NEW — boot-time gate
  if (this.isOpenClawReady()) return true;
  if (this._openclawStartPromise) return this._openclawStartPromise;
  // ... unchanged ...
}
```

Where `_isOpenClawEnabled()` reads the persisted config from disk (`await this._configStore.load()`) and returns `cfg?.openclawEnabled ?? true` (default `true`). It does NOT re-read `bridge-config.json` — that file controls webhook URL and bridge identity; the enablement flag is owned by `node-config.json` via `PersistedNodeConfig`.

**Scope of the gate:** boot-time only. The home node's `_isOpenClawEnabled()` helper reads `node-config.json` fresh on every call via `this._configStore.load()` — there is no in-memory cache. The earlier-draft "runtime hot toggle" (`setOpenClawEnabled(next)`) is **not** in the implementation — the design reframe removed the "kill the engine mid-flight" semantics. The gate runs at boot (`startOpenClaw()` is called once from `apps/node/src/index.ts:3406`); once the gateway child is spawned, the running flag does not change until the home node restarts. If the owner wants to change the flag, they edit `node-config.json` and restart the home node. This is a deliberate scope reduction: the social UI does not surface a checkbox to flip `openclawEnabled` at runtime. The flag's *configured* state is read-only in the social UI; the *live* state (running / stopped) is shown via the `getOpenClawStatus()` RPC.

The `updateNodeConfig` partial-update list at `apps/node/src/node-service-impl.ts:7749-7753` writes both fields (`bridgeEnabled` and the new `openclawEnabled`) — this is needed so a future installer / home-node-setup tool can write the value, but no in-UI action triggers it. After the reframe, `updateNodeConfig` no longer applies any runtime side-effect when `openclawEnabled` changes; the new flag value is read from disk on the next `startOpenClaw()` call (typically a home-node restart).

### 4.3 Status RPC

The home node already exposes `getBridgeStatus()` (`packages/api/src/node-service.ts:1627`, RPC at `ws-protocol.ts:199`). We add a thin sibling:

```typescript
// packages/api/src/node-service.ts
getOpenClawStatus(): Promise<OpenClawStatus>;

export interface OpenClawStatus {
  /** Persisted `openclawEnabled` flag from the home node. */
  enabled: boolean;
  /** Live state — child process + webhook reachable. */
  running: boolean;
  /** Resolved webhook URL (e.g. http://127.0.0.1:18789/webhook/envoymesh). */
  url: string;
  /** Gateway child PID, when running. */
  childPid?: number;
}
```

Added to `RpcMethods` union in `packages/api/src/ws-protocol.ts:199` adjacent to `getBridgeStatus`. `DirectCallClient` and `WsClient` get the matching method.

`MobileNode` (`packages/mobile-node/src/index.ts`) implements `getOpenClawStatus()` by calling the home node via `HomeRemoteClient` when paired, returning `{ enabled: false, running: false, url: "" }` when unpaired.

### 4.4 UI

`AgentSettings.tsx` (orphaned) is the right place. We:

1. **Import it** into `SettingsAITab.tsx`, mounting it under a new `<section>` titled "AI Engine" (i18n key `settings.ai.aiEngine.heading`).
2. **Built-in OpenClaw block: read-only.** Show the configured `enabled` flag and the live `running` state in a status badge (three states: "Disabled" / "Running" / "Stopped"). Show the webhook URL, model provider, and child PID (if running) as read-only fields. **No checkbox to flip** — the home-node owner edits `node-config.json` and restarts. A short hint explains this.
3. **Ext Agent block: writable.** The `enabled` checkbox (already in the orphan) is wired to the persisted `bridgeEnabled` flag. The existing edit form (name / URL / listen port) is preserved. Save handler calls `updateNodeConfigPartial({ bridgeEnabled: next.enabled })`. The optimistic-toggle pattern from `useOptimisticToggle` is reused.
4. **Derived `AiEngineMode` chip** at the top: "Built-in + Ext" / "Built-in only" / "Ext only" / "None" — one of these four states, computed from the **persisted flags**, not the live running state. (Originally `AgentNetworkMode`; renamed to disambiguate from the top-level "Agent Network" onboarding tab — the mode describes which AI engine is active on the home node.)

Data flow:

```text
SettingsAITab
  └─ <AgentSettings
       envoyAI={envoyAIInfo}                 // read-only display: { enabled, running, url }
       extAgent={extAgentConfig}             // ExtAgentConfig: { enabled, configured, name, url, port }
       onExtAgentSave={({ enabled, ... }) =>
         updateNodeConfigPartial({ bridgeEnabled: enabled })
       }
     />
```

No `onEnvoyAISave` prop — the built-in block is read-only in the UI. The `getOpenClawStatus()` RPC drives the live state; the persisted `openclawEnabled` flag is shown for reference.

### 4.5 Mobile mirror (read-only)

The EnvoyGo Flutter thin client (Phase 31, shipped) mirrors the home-node state via a `AiEngineSection` widget mounted in `Me → AI Engine`. It: (Originally `AgentNetworkSection` under "Agent Network"; renamed to disambiguate from the top-level "Agent Network" tab in the home-node settings — that tab is for onboarding other nodes.)

1. Reads `getOpenClawStatus()` and `getBridgeStatus()` from `NodeServiceClient` (which calls through `MobileNode` to the home node via `HomeRemoteClient`).
2. Renders a derived "Agent Network" chip ("Built-in + Ext" / "Built-in only" / "Ext only" / "None") and two rows: Built-in OpenClaw + External Agent Bridge. Each row shows the configured `enabled` flag plus the live `running` state via a 3-state badge (Disabled / Running / Stopped).
3. **AI Engine** is read-only (Built-in OpenClaw + Ext Agent Bridge status). **Model provider** is editable: EnvoyGo calls `updateNodeConfig` on the home node; Social and other clients receive `config:updated` with the new `modelProviders`. Cloud API modes only (OpenAI-compatible, Anthropic-compatible, mock, disabled).

No new Dart types are required beyond the two existing RPCs (`getOpenClawStatus`, `getBridgeStatus`). The home node is the source of truth; mobile mirrors engine status and syncs model settings to home.

**Dependency note:** The EnvoyGo thin client is now shipped (Phase 31 — see [flutter-thin-client-design.md](./flutter-thin-client-design.md)). The mobile smoke test in §8 (test case 6 — "Pair EnvoyGo on a phone") runs against the live `apps/envoygo/` binary; smoke-test results are deferred to live hardware verification.

### 4.6 i18n

The `agentNetwork` namespace under `settings.ai` in `en-settings-ai.ts`. The other 6 locales fall back to English per the existing `translate.ts` behavior:

```yaml
agentNetwork:
  heading: "Agent Network"
  desc: "Agents reachable through this home node. Built-in OpenClaw is always present; the External Agent Bridge is opt-in."
  loading: "Loading agent status…"
  envoyai: "Built-in OpenClaw"
  envoyaiDesc: "Runs in-process on this node. Has direct access to your vault, mesh, and tools. Best for chat, knowledge queries, and assistant turns. To disable, edit node-config.json and restart the home node."
  extAgent: "External Agent Bridge"
  extAgentDesc: "Forward chat and assistant turns to an external agent (e.g. HomeClaw). The external agent runs in its own process and is sandboxed."
  modeBoth: "Built-in + Ext"
  modeOpenclawOnly: "Built-in only"
  modeExtOnly: "Ext only"
  modeOff: "None"
  restartHint: "Configure the Ext Agent here. Built-in OpenClaw is configured via node-config.json on the home node."
  running: "Running"
  stopped: "Stopped"
  disabled: "Disabled"
  provider: "Provider"
  webhook: "Webhook"
  model: "Model"
  agentLabel: "Agent Label"
  webhookUrl: "Webhook URL"
  listenPort: "Listen Port"
  active: "Active"
  notConfigured: "Not configured"
  enableExtAgent: "Enable external agent bridge"
  configure: "Configure"
  save: "Save"
  saving: "Saving…"
  saved: "Saved"
  cancel: "Cancel"
```

### 4.7 Typing the Artifact payload (out-of-scope here, but mentioned for context)

This is the **first half** of the A2A work the user mentioned in the previous turn. It is explicitly **out of scope** for Phase 32. It will be done in **Phase 33 — A2A Tool Exposure** (scoped in a follow-up design doc). The `openclawEnabled` flag is needed before that work can land, which is why Phase 32 must ship first.

---

## 5. Data flow summary

```text
┌─────────────┐  updateNodeConfigPartial({ bridgeEnabled })   (UI action)
│  Social UI  │ ─────────────────────────────────────────────────────────►
│  (web)      │                              │ WebSocket JSON-RPC
└─────────────┘                              │
        │                                    ▼
        │                       ┌───────────────────────────────┐
        │                       │   node-config-store.ts        │  ← atomic JSON write
        │                       │   (home node)                 │     to node-config.json
        │                       └─────────────┬─────────────────┘
        │                                     │ persisted
        │  ◄─── getNodeConfig() ───────────────┤
        │                                     │
        │  ◄─── getOpenClawStatus() ───────────┤  live read at render time
        │                                     │  (enabled + running)
        │  ◄─── getBridgeStatus() ─────────────┤
        │                                     ▼
        │                       ┌───────────────────────────────┐
        │                       │   startOpenClaw()             │  ← boot-time gate
        │                       │   startBridge()               │     (apps/node/src/index.ts)
        │                       │   NodeServiceImpl             │
        │                       └─────────────┬─────────────────┘
        │                                     │
        │                                     ▼
        │                       (Gateway child process / HTTP bridge listener)
        │                       (re-read openclawEnabled from disk on every startOpenClaw call)
        │
        │   ┌────────────────────────────────────────────────┐
        └──►│   EnvoyGo (Flutter)                            │  ← read-only mirror
            │   MobileNode.getOpenClawStatus() → home RPC   │     via HomeRemoteClient
            │   AiEngineSection widget                   │
            └────────────────────────────────────────────────┘
```

**No runtime side-effect** when `bridgeEnabled` changes in the social UI — the new value is persisted and the next `getBridgeStatus()` reflects it; the actual bridge listener is gated at boot time (same boot-time pattern as OpenClaw). `openclawEnabled` has no UI mutation path at all (the social UI does not surface a checkbox for it; the home-node owner edits `node-config.json` and restarts).

---

## 6. Files to change

| File | Type | What |
|------|------|------|
| `apps/node/src/node-config-store.ts` | edit | Add `openclawEnabled?: boolean` to `PersistedNodeConfig` |
| `apps/node/src/node-service-impl.ts` | edit | (a) Default `openclawEnabled: true` in default config; (b) Round-trip in `updateNodeConfig`; (c) `_isOpenClawEnabled()` helper + early-return in `startOpenClaw()`; (d) new `getOpenClawStatus()` method |
| `apps/node/src/index.ts` | edit | Bridge UI-overrides-JSON merge at line 313-323 (unchanged — covers `bridgeEnabled` only) |
| `apps/node/src/json-rpc-router.ts` | edit | Register `getOpenClawStatus` RPC handler |
| `packages/api/src/node-service.ts` | edit | Add `getOpenClawStatus(): Promise<OpenClawStatus>` to interface; export `OpenClawStatus` |
| `packages/api/src/ws-protocol.ts` | edit | Add `"getOpenClawStatus"` to `RpcMethods` union; add `OpenClawStatus` / `GetOpenClawStatusParams` / `GetOpenClawStatusResult` types |
| `packages/api/src/index.ts` | edit | Re-export new types |
| `packages/api/src/agent-network-mode.ts` | new | `computeAiEngineMode()` + `AiEngineMode` type (originally `computeAgentNetworkMode` / `AgentNetworkMode`; renamed) |
| `packages/mobile-node/src/index.ts` | edit | Implement `getOpenClawStatus()` (delegate to home remote via `HomeRemoteClient`; offline default `{ enabled: false, running: false, url: "" }`) |
| `apps/social/src/components/views/settings/AgentSettings.tsx` | edit | **Built-in block is read-only** (no `onEnvoyAISave` prop). 3-state status badge. Webhook URL / provider / child PID as read-only fields. Ext Agent block is writable. Mode chip at top. |
| `apps/social/src/components/views/SettingsAITab.tsx` | edit | Import `AgentSettings`; pass live status props + Ext Agent save handler |
| `apps/social/src/hooks/useNodeService.tsx` | edit | Add `getOpenClawStatus()` to the React-tree `NodeServiceClient` |
| `apps/social/src/lib/direct-call-client.ts` | edit | Add `getOpenClawStatus` to client |
| `apps/social/src/i18n/messages/en-settings-ai.ts` | edit | Add `settings.ai.aiEngine.*` keys; other 6 locales fall back to English |
| `apps/social/src/styles.css` | edit | `.settings-agent` + `.settings-agent-mode` + `.status-badge.status-warn` for the 3-state badge |
| `apps/envoygo/lib/services/node_service_client.dart` | edit | Add `getOpenClawStatus()` wrapper |
| `apps/envoygo/lib/widgets/ai_engine_section.dart` | new | Read-only mirror; both rows `readOnly: true`; mode chip; refresh button. (Originally `agent_network_section.dart`; renamed.) |
| `apps/envoygo/lib/screens/me/me_screen.dart` | edit | Mount `AiEngineSection` under "AI Engine". (Originally `AgentNetworkSection` under "Agent Network"; renamed.) |
| `apps/social/test/components/AgentSettings.test.tsx` | new | 4 mode-chip states, 3-state status badge, Ext Agent save callback, read-only assertion |
| `apps/node/test/node-config-openclaw-enabled.test.ts` | new | Round-trip `openclawEnabled: true / false / undefined` |
| `packages/api/test/agent-network-mode.test.ts` | new | Truth table for `computeAiEngineMode` (originally `computeAgentNetworkMode`; renamed) |

**Net new code:** ~250 lines (most in tests + i18n).
**Net new dependencies:** zero.

---

## 7. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Owner edits `node-config.json` to flip `openclawEnabled` and forgets to restart the home node | Low | The runtime gate is read at boot. After restart, the new flag takes effect. The mobile thin-client and the social UI both show the *live* state via `getOpenClawStatus()`, so a stale `openclawEnabled: true` on disk with a not-running child will display as "Stopped" — visible signal that the restart is needed. |
| `bridge-config.json` and `node-config.json` get out of sync | Low | The two flags are independent. The `assistantAgentUrl` JSON field still controls **which** OpenClaw instance to dial (when enabled); `openclawEnabled` controls **whether** to dial at all. No conflict. |
| Mobile's home-online goes stale and shows the old `openclawEnabled` | Low | `getOpenClawStatus()` is called on every `AiEngineSection` mount and on a manual refresh button. No automatic background polling — minimal battery / network cost. |
| Orphaned `AgentSettings.tsx` was abandoned for a reason (regressions) | Low | The component is reviewed end-to-end as part of this phase; the EnvoyAI block is reduced to a read-only display (no state mutation), so the orphaned edit-form logic is the only live code and it is exercised by the existing 6-test snapshot suite. |
| Owner wants to flip the built-in flag at runtime and the UI does not support it | Low | Out of scope by design. The owner edits `node-config.json` and restarts; this is a documented step. A future phase could expose it; it is not needed for the A2A tool work (Phase 33). |

---

## 8. Test plan

| Test | File | What it asserts |
|------|------|-----------------|
| `computeAiEngineMode` truth table | `packages/api/test/agent-network-mode.test.ts` | 4 cases: both / openclaw-only / ext-only / off |
| `openclawEnabled` round-trip through `NodeConfigStore` | `apps/node/test/node-config-openclaw-enabled.test.ts` | Save with `openclawEnabled: true` / `false`, load, verify disk content. Omitting the field does not break the existing flow (backwards-compatible). |
| `getOpenClawStatus` shape | manual + status display | Status JSON includes `enabled`, `running`, `url`, optional `childPid`. |
| `AgentSettings` 4-state render | `apps/social/test/components/AgentSettings.test.tsx` | Snapshot per state: mode chip text + 3-state status badge (Disabled / Running / Stopped). Save callback for Ext Agent fires with the right payload. |
| Mode chip text | `apps/social/test/components/AgentSettings.test.tsx` | Chip shows "Built-in + Ext" / "Built-in only" / "Ext only" / "None" per booleans. |
| i18n parity | `tsc` clean | English-only added; other locales fall back to English per existing `translate.ts`. No missing-key warnings. |
| Mobile `AiEngineSection` renders | `flutter analyze` clean | Dart widget compiles; `getOpenClawStatus` / `getBridgeStatus` are called via the new methods on `NodeServiceClient`. |

**Smoke test (manual, to be run on live hardware before Phase 33 lands):**

1. Start home node with **fresh config** (no `node-config.json`). Open Settings → AI → Agent Network. Verify the chip shows "Built-in only" and the Built-in OpenClaw block shows "Running" (D1C: OpenClaw defaults on, bridge defaults off).
2. Click "Configure" on the Ext Agent block. Set name "HomeClaw" + URL + listen port. Save. Verify the chip flips to "Built-in + Ext" and the bridge listener starts (visible in the social UI status panel).
3. Send a chat message from the social UI. Verify the message reaches OpenClaw (logs show the webhook traffic).
4. Toggle the Ext Agent checkbox off. Verify the chip flips to "Built-in only" within ~1s. Verify the bridge listener stops.
5. Edit `node-config.json` on the home node: set `openclawEnabled: false`. Restart the home node. Verify the Built-in OpenClaw block now shows "Disabled" and the status badge says "Disabled".
6. **(Deferred — Phase 31):** Pair EnvoyGo on a phone. Verify the `Me → Agent Network` mirror shows the same configuration. No mutations possible from the phone in this phase.

---

## 9. Out-of-scope (forward references)

These are mentioned here so reviewers know the seams are intentional, not oversights.

- **Phase 33 — A2A Tool Exposure.** Register `propose_task`, `await_task_result`, `cancel_task`, `request_agent_card` as OpenClaw tools (under the `mesh.*` namespace: `mesh.task.propose`, `mesh.task.await_result`, `mesh.task.cancel`, `mesh.agent_card.request`); type the `Artifact` payload as a discriminated union (`text` / `file` / `structured`); auto-fetch the peer's `AgentCard` on bond establishment. The underlying A2A dispatcher (`packages/api/src/task-dispatcher.ts`) is already wired for all nine task intents + the `agent.card.*` pair; Phase 33 is mostly surface layer + a typed schema + an auto-fetch hook. Design doc: [phase-33-a2a-tool-exposure.md](./phase-33-a2a-tool-exposure.md).
- **A2A chat notifications flag.** `a2aChatNotifications` already exists on the config (line 113). Wiring it to the tool-exposure phase (Phase 33) is a separate concern; deferred.
- **Runtime `openclawEnabled` toggle in the social UI.** Intentionally not built. The owner edits `node-config.json` and restarts; the boot-time gate is sufficient. Not planned.

---

## 10. Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-16 | Two booleans, not an enum | Mirrors existing `bridgeEnabled`; the 4 derived modes are computed at read time. YAGNI. |
| 2026-06-16 | UI override JSON, not replace JSON | Existing pattern for `bridgeEnabled`; keeps `bridge-config.json` as the install-time config and the UI toggle as runtime intent. |
| 2026-06-16 | `getOpenClawStatus` as a new RPC, not a subfield on `getBridgeStatus` | Two distinct subsystems; one aggregate RPC would force both to fail together. |
| 2026-06-16 | Mobile reads from home, not local | Mobile is a thin client (Phase 31). The home node is the source of truth. Mobile never runs OpenClaw. |
| 2026-06-16 | **D1C — defaults:** `openclawEnabled: true`, `bridgeEnabled: false` on fresh install | Built-in OpenClaw is EnvoyMesh's default AI and should "just work." The Ext Agent bridge is an opt-in path for users with a HomeClaw-style external process. Existing installs are not retroactively rewritten — only the default for fresh `node-config.json` files changes. |
| 2026-06-16 | **D2A — refactored:** the runtime `setOpenClawEnabled(next)` + D2A "cancel in-flight" semantics were **removed** from this phase | The original ask was about *network membership*, not about *turning off the engine*. The boot-time gate is the only surface we need for the A2A tool work (Phase 33). A runtime hot-toggle would need a new cancellation token through the webhook and a UI surface that the user is never expected to use (built-in OpenClaw is the product). The gate, status RPC, mode chip, and mobile mirror remain; the `setOpenClawEnabled` method is not implemented in this phase. The doc has been re-scoped to reflect this. |
| 2026-06-16 | **D3A — ordering:** Phase 32 ships before Phase 33 | The `openclawEnabled` flag is a precondition for A2A tool exposure — there is no surface to install tools on if the agent's network-membership is not first-class in the config schema. Phase 33 will install the four A2A tools on the built-in OpenClaw; if the config flag is undeclared, an installer cannot write to it. |
| 2026-06-16 | **UI scope:** the social UI's "Agent Network" section makes the **Ext Agent** block writable; the **Built-in OpenClaw** block is read-only (status + configured state only) | The built-in OpenClaw is EnvoyMesh's primary agent. The product surface for changing its membership is `node-config.json` + a home-node restart, not a settings toggle. Keeping the UI focused on the *external* bridge matches the user's mental model and avoids surfacing a "kill the engine" control. |
