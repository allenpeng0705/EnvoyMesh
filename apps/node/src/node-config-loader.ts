/**
 * Phase 8 / v1.4 — Node config resolution helpers for
 * the Agent Routing UI affordances (opt-in toggle +
 * signal-routed badge + verifyMode).
 *
 * **What this is:** the small set of pure helpers
 * that turn the persisted `NodeConfig` + the env-var
 * defaults + the per-runtime defaults into a single
 * effective value. Used by:
 *
 * 1. `node-service-impl-service-deps.ts` to build
 *    the `runOwnerAgentTurn` context (signal opt-in).
 * 2. `chain-verify-loop.ts` to resolve the verifyMode
 *    when the `ChainMandate` didn't set it explicitly
 *    (per-runtime default + per-node override).
 * 3. The v1.4 Tauri settings API
 *    (`getSignalOptIn` / `setSignalOptIn` /
 *    `getVerifyModeDefault` / `setVerifyModeDefault`)
 *    so the UI shows the effective value the runtime
 *    will use, not just the persisted field.
 *
 * **Why a separate module (vs. inline in the host):**
 * the helpers are pure (no I/O, no side effects).
 * Keeping them in their own file makes them:
 *
 * - Easy to test in isolation
 *   (`node-config-loader.test.ts`).
 * - Easy to share between the host wiring and the
 *   settings API without circular imports.
 * - Trivial to extend (new resolutions in v1.5 / v1.6
 *   just add helpers here).
 *
 * **Why not on `PersistedNodeConfig` itself:** the
 * persisted type is a data shape; resolution is
 * behavior. Mixing them makes the data shape
 * dependent on the env vars + per-runtime defaults,
 * which is hard to mock and easy to drift.
 */

import type { AgentRuntime, VerifyMode } from "@envoymesh/protocol";

import { defaultVerifyModeForWorker } from "./chain-verify-loop.js";
import { readSignalOptInEnv } from "./user-prompt-router.js";
import type { PersistedNodeConfig } from "./node-config-store.js";

// Re-export so callers can `import { defaultVerifyModeForWorker }
// from "./node-config-loader.js"` without pulling in the heavier
// chain-verify-loop module. The function itself lives there
// (where the per-runtime policy is defined).
export { defaultVerifyModeForWorker };

/**
 * Read the effective signal opt-in flag for the
 * current node. Order of precedence (Q2 — persisted
 * wins, env var as fallback):
 *
 * 1. `nodeConfig.signalOptIn` when set.
 * 2. The env var `ENVOY_HARNESS_SIGNAL_OPT_IN`
 *    (`readSignalOptInEnv` — v0 fallback for
 *    headless / dev / CI where the Tauri UI isn't
 *    available).
 * 3. The implicit default (`"enabled"` — owner
 *    has to explicitly opt out).
 *
 * **Why persisted wins:** the Tauri UI writes
 * the persisted field so the owner's choice
 * survives across restart + a future feature
 * flag change. The env var is still useful for
 * headless deploys that don't run the Tauri UI.
 *
 * **Why the env var is a fallback (not removed):**
 * some owners set the env var in their launch
 * config (`.plist` / systemd unit / shell rc) and
 * never open the Tauri UI. The env var keeps that
 * workflow alive — when the Tauri UI hasn't been
 * used yet, the env var is the active value.
 *
 * @param nodeConfig The persisted config (or
 *   `undefined` when the node hasn't loaded any
 *   config yet, e.g. first launch before
 *   `getNodeConfig` returns).
 * @returns `"enabled"` or `"disabled"`.
 */
export function readEffectiveSignalOptIn(
  nodeConfig: PersistedNodeConfig | undefined,
): "enabled" | "disabled" {
  if (nodeConfig?.signalOptIn !== undefined) {
    return nodeConfig.signalOptIn;
  }
  return readSignalOptInEnv();
}

/**
 * Read the effective verify-mode default for a
 * given worker runtime. Order of precedence
 * (Q3 — single value, all runtimes):
 *
 * 1. `nodeConfig.verifyModeDefault` when set.
 * 2. The per-runtime default
 *    (`defaultVerifyModeForWorker(runtime)` —
 *    v0 design policy: envoy-harness →
 *    `cross-runtime`, others → `rule-only`).
 *
 * **Why persisted wins over the per-runtime
 * default:** the per-runtime default is a v0
 * design decision, not an operator preference.
 * The Tauri UI writes this field to let owners
 * apply a node-wide posture (e.g. "always
 * strict" on a high-stakes setup, or "always
 * rule-only" on a low-cost setup).
 *
 * **What overrides the per-node default:** the
 * `ChainMandate.verifyMode` per-job value
 * (set by the Team-job author) wins over
 * BOTH the per-node default AND the per-runtime
 * default. This helper only applies when the
 * mandate left `verifyMode` undefined.
 *
 * @param nodeConfig The persisted config (or
 *   `undefined` when the node hasn't loaded any
 *   config yet).
 * @param runtime The worker runtime whose
 *   default we resolve (envoy-harness /
 *   openclaw / ext / pi / openhuman).
 * @returns The effective `VerifyMode`.
 */
export function readEffectiveVerifyModeDefault(
  nodeConfig: PersistedNodeConfig | undefined,
  runtime: AgentRuntime,
): VerifyMode {
  if (nodeConfig?.verifyModeDefault !== undefined) {
    return nodeConfig.verifyModeDefault;
  }
  return defaultVerifyModeForWorker(runtime);
}
