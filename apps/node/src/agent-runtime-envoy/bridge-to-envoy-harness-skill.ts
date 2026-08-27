/**
 * Phase 8 Step 2 / b2 — `createBridgeToEnvoyHarnessSkill`.
 *
 * **What this is:** the OpenClaw → envoy-harness bridge
 * skill. Takes an OpenClaw ask (text prompt) and a
 * `LocalRuntimeBridge`, returns a `(prompt) => Promise<string>`
 * closure that:
 * 1. Translates the prompt to a `SubagentInput`
 *    (objective = prompt, capabilityTag =
 *    `"envoy-harness-bridge"`, costCeilingUsd,
 *    deadlineMs).
 * 2. Calls `bridge.submitToEnvoyHarness(input, signal)`.
 * 3. Translates the `SubagentResult` back to text
 *    (first text content block).
 *
 * **Why this lives in `apps/node/src/agent-runtime-envoy/`:**
 * the bridge is already a dep of `apps/node` (Step 0+).
 * The skill is a thin translation layer that uses the
 * bridge as the seam; it doesn't need a new dep on the
 * OpenClaw runtime package. This matches the existing
 * skill pattern (`setupSponsorFriend` in
 * `apps/node/src/node-service-setup-sponsor-friend.ts` —
 * cross-package skills live in `apps/node/src/`, not
 * in the OpenClaw runtime package itself which is a
 * thin subprocess wrapper).
 *
 * **Why a text-in/text-out shape:** OpenClaw's `ask`
 * method is text-in/text-out (see
 * `packages/openclaw-runtime/src/index.ts:ask()`). The
 * skill matches that shape so the host (EnvoyMesh's AN
 * engine dispatch or a future signal-based router) can
 * swap `askOpenClaw` with `skill.ask` without changing
 * the call site.
 *
 * **v0 cost policy: `costCeilingUsd: 0` (= "no cap" per
 * the harness's `AgentOptions.maxCostUsd` contract).**
 * Early adoption shouldn't be blocked by an arbitrary
 * $0.50 limit. The DI seam
 * (`opts.defaultCostCeilingUsd`) lets Step 5+ inject a
 * per-node ceiling from `settings.json` without changing
 * the skill's signature.
 *
 * **v0 deadline: 5 minutes (safety net).** The harness's
 * `LocalMeshSubmitter` enforces the deadline as a hard
 * timer (Promise.race). A 5-min default is long enough
 * for most LLM sub-agents + short enough to bound a
 * hanging sub-agent. Also DI-overridable.
 *
 * **Why the skill is exposed but not auto-wired:** the
 * b2 v0 scope is "expose the seam"; the actual wiring
 * into OpenClaw's ask path (when does the host call this
 * skill instead of the real `askOpenClaw`?) is a Step 5
 * concern (signal-based opt-in). v0 just provides the
 * function; future Step 5+ adds the router.
 *
 * **Stability:** the public surface is
 * `createBridgeToEnvoyHarnessSkill` (function) +
 * `CreateBridgeToEnvoyHarnessSkillOptions` (input) +
 * `OpenClawToEnvoyHarnessBridge` (output). Additive;
 * new options on the input are optional; the output's
 * `ask` signature is closed (matches OpenClaw's
 * `(prompt) => Promise<string>` contract).
 */

import {
  type LocalRuntimeBridge,
  type SubagentInput,
  type SubagentResult,
} from "@envoymesh/envoy-harness-adapter";

/** The default capability tag. v0 is a literal — see
 *  the b1.5 follow-up plan §5 question 1. */
const DEFAULT_CAPABILITY_TAG = "envoy-harness-bridge";

/** v0 default: 0 means "no cap" per the harness's
 *  `AgentOptions.maxCostUsd` contract (0 is the
 *  well-defined "free" sentinel, distinct from a
 *  positive $0 ceiling that would abort on the first
 *  token). User feedback 2026-08-20: "at the beginning,
 *  we may ignore it" — early adoption shouldn't be
 *  blocked by an arbitrary limit. */
const DEFAULT_COST_CEILING_USD = 0;

/** v0 deadline: 5 minutes. Long enough for most LLM
 *  sub-agents, short enough to bound a hanging
 *  sub-agent. The harness's `LocalMeshSubmitter`
 *  enforces the deadline as a hard timer (Promise.race). */
const DEFAULT_DEADLINE_MS = 5 * 60 * 1000;

/** Options for `createBridgeToEnvoyHarnessSkill`. */
export interface CreateBridgeToEnvoyHarnessSkillOptions {
  /**
   * The host's `LocalRuntimeBridge` (typically
   * `LocalRuntimeRegistry.submitToEnvoyHarness`). The
   * skill calls `bridge.submitToEnvoyHarness(input, signal)`
   * per ask. The host injects this so the skill is
   * decoupled from the registry implementation.
   */
  bridge: LocalRuntimeBridge;

  /**
   * Optional: default cost ceiling in USD. v0 default
   * is `0` (no cap, per the harness's contract). Step 5+
   * (Tauri settings UI) can inject a per-node ceiling.
   * The caller can override per-call via `ask(opts.costCeilingUsd)`.
   */
  defaultCostCeilingUsd?: number;

  /**
   * Optional: default deadline in ms. v0 default is
   * `5 * 60_000` (5 min). The caller can override per-call
   * via `ask(opts.deadlineMs)`.
   */
  defaultDeadlineMs?: number;

  /**
   * Optional: default capability tag for the
   * `SubagentInput`. v0 default is `"envoy-harness-bridge"`
   * (a literal — see b1.5 plan §5 question 1). The
   * caller can override per-call via
   * `ask(opts.capabilityTag)`.
   */
  defaultCapabilityTag?: string;

  /** Optional: logger for observability. */
  log?: (event: string, fields?: Record<string, unknown>) => void;
}

/** Per-call options for the `ask` closure. All optional. */
export interface BridgeToEnvoyHarnessSkillAskOptions {
  /** Abort signal — forwarded to the bridge. */
  signal?: AbortSignal;
  /** Per-call cost ceiling override. */
  costCeilingUsd?: number;
  /** Per-call deadline override. */
  deadlineMs?: number;
  /** Per-call capability tag override. */
  capabilityTag?: string;
}

/** The skill object returned by
 *  `createBridgeToEnvoyHarnessSkill`. */
export interface OpenClawToEnvoyHarnessBridge {
  /**
   * Send a prompt to envoy-harness and return the text
   * response. The text is extracted from the first text
   * content block in the `SubagentResult.content`.
   *
   * **Error behavior:**
   * - Empty result (no text in content) → throws
   *   `bridge_to_envoy_harness_empty: no text in result`.
   *   Matches the openclaw / ext engine's behavior
   *   (clean failure, not a silent empty string).
   * - `verdict.kind === "fail"` → throws with the
   *   verdict's reason. OpenClaw's surface is
   *   text-in/text-out; failures are errors.
   * - The bridge's `submitToEnvoyHarness` itself
   *   catches `agent.run` errors and converts them
   *   to failed `SubagentResult` (does NOT throw);
   *   the skill maps those to a throw here.
   */
  ask: (
    prompt: string,
    opts?: BridgeToEnvoyHarnessSkillAskOptions,
  ) => Promise<string>;
}

/**
 * Build the OpenClaw → envoy-harness bridge skill.
 * Returns a text-in/text-out `ask` closure that
 * translates prompts to `SubagentInput` and back.
 *
 * **v0 cost policy:** `defaultCostCeilingUsd: 0`
 * (no cap). The DI seam keeps the door open for
 * Step 5+ to inject a per-node ceiling from
 * `settings.json` without changing the skill's
 * signature.
 *
 * **v0 deadline:** `defaultDeadlineMs: 5 * 60_000`
 * (5 min safety net). The harness's
 * `LocalMeshSubmitter` enforces the deadline as a
 * hard timer; the skill passes the deadline through
 * unchanged.
 *
 * **Why pass `signal` through:** the parent's abort
 * signal (e.g. the chain worker's `onPartial` abort)
 * flows through to the bridge, which forwards it to
 * the `LocalMeshSubmitter`, which forwards it to the
 * sub-agent's `agent.abort()`. A parent cancel
 * propagates correctly.
 */
export function createBridgeToEnvoyHarnessSkill(
  opts: CreateBridgeToEnvoyHarnessSkillOptions,
): OpenClawToEnvoyHarnessBridge {
  // The bridge's `submitToEnvoyHarness` is optional on
  // the `LocalRuntimeBridge` interface (it's only
  // required for the symmetric direction in Step 4+).
  // The skill requires it — fail loud at construction
  // if the host didn't wire it. This is the right time
  // to catch a misconfiguration (a host that wants the
  // b2 skill must have wired the bridge to support
  // envoy-harness delegation).
  if (typeof opts.bridge.submitToEnvoyHarness !== "function") {
    throw new Error(
      "createBridgeToEnvoyHarnessSkill: bridge.submitToEnvoyHarness " +
        "is not implemented. The OpenClaw → envoy-harness skill " +
        "requires the bridge to support the envoy-harness direction. " +
        "Check the registry's configuration (LocalRuntimeRegistry " +
        "always implements it; a custom LocalRuntimeBridge stub " +
        "may need to opt in).",
    );
  }

  const defaultCostCeilingUsd =
    opts.defaultCostCeilingUsd ?? DEFAULT_COST_CEILING_USD;
  const defaultDeadlineMs =
    opts.defaultDeadlineMs ?? DEFAULT_DEADLINE_MS;
  const defaultCapabilityTag =
    opts.defaultCapabilityTag ?? DEFAULT_CAPABILITY_TAG;

  // Capture the bridge method as a non-optional
  // reference. We've already checked it's a function
  // at construction (the throw above); TypeScript
  // doesn't narrow the optional property, so we
  // capture it explicitly to avoid `?.()` in the
  // hot path.
  const submitToEnvoyHarness = opts.bridge.submitToEnvoyHarness;

  const ask = async (
    prompt: string,
    askOpts?: BridgeToEnvoyHarnessSkillAskOptions,
  ): Promise<string> => {
    const startedAt = Date.now();
    const capabilityTag =
      askOpts?.capabilityTag ?? defaultCapabilityTag;
    opts.log?.("envoy_harness.bridge.openclaw.start", {
      capabilityTag,
      promptChars: prompt.length,
    });

    // Translate the OpenClaw ask (text prompt) to a
    // `SubagentInput`. v0 ignores the OpenClaw ask's
    // metadata (it has no cost ceiling / deadline
    // concept); the defaults come from the
    // `CreateBridgeToEnvoyHarnessSkillOptions` + the
    // per-call `ask(opts)` overrides.
    const input: SubagentInput = {
      objective: prompt,
      capabilityTag,
      costCeilingUsd:
        askOpts?.costCeilingUsd ?? defaultCostCeilingUsd,
      deadlineMs: askOpts?.deadlineMs ?? defaultDeadlineMs,
      // preferredRuntime: undefined → same-runtime
      // sub-agent (envoy-harness). The bridge's
      // `submitToEnvoyHarness` is the envoy-harness
      // direction; the LocalCrossRuntimeSubmitter's
      // routing is irrelevant for this skill (we go
      // direct to the bridge, not through the
      // cross-runtime submitter).
    };

    // Use an AbortController if no signal was passed —
    // the bridge's contract is `(input, signal)`;
    // `signal` is required.
    const signal =
      askOpts?.signal ?? new AbortController().signal;

    const result: SubagentResult = await submitToEnvoyHarness(
      input,
      signal,
    );

    // The result is the LocalMeshSubmitter's synthesis
    // of the sub-agent's `AgentResult`. The first text
    // block in `content` is the text we return. A
    // failed result is surfaced as a clean error
    // (matches the openclaw / ext engine's behavior).
    //
    // **ContentBlock shape:** the bridge's
    // `submitToEnvoyHarness` returns a `SubagentResult`
    // whose `content` is the LOCAL shape (from
    // `@envoymesh/envoy-harness`): `{ type: "text",
    // text: string }`. This is different from the
    // adapter's `execute` return shape (which is the
    // WIRE shape `{ kind: "text", text: string }`).
    if (result.status === "failed") {
      const reason =
        result.verdict.kind === "fail"
          ? result.verdict.reason
          : "unknown failure";
      opts.log?.("envoy_harness.bridge.openclaw.failed", {
        reason,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(
        `bridge_to_envoy_harness_failed: ${reason}`,
      );
    }
    const firstText = result.content.find(
      (b): b is { type: "text"; text: string } =>
        b.type === "text",
    );
    if (!firstText || firstText.text.length === 0) {
      opts.log?.("envoy_harness.bridge.openclaw.empty", {
        durationMs: Date.now() - startedAt,
      });
      throw new Error(
        "bridge_to_envoy_harness_empty: no text in result",
      );
    }
    opts.log?.("envoy_harness.bridge.openclaw.done", {
      chars: firstText.text.length,
      durationMs: Date.now() - startedAt,
    });
    return firstText.text;
  };

  return { ask };
}
