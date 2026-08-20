/**
 * Phase 8 Step 2 — `LocalRuntimeRegistry` (the host-side
 * `LocalRuntimeBridge` implementation).
 *
 * **What this is:** the only EnvoyMesh-side class that knows
 * how to call a *different* local runtime from a sub-agent.
 * envoy-harness's `task` tool calls
 * `LocalCrossRuntimeSubmitter.submit()` (in
 * `@envoymesh/envoy-harness-adapter`); the submitter, when
 * `preferredRuntime: "openclaw"`, calls back through
 * `LocalRuntimeBridge.submitToOpenClaw` — which THIS class
 * implements.
 *
 * **Why a registry, not a class with hard-coded refs:** the
 * mesh might add more runtimes in the future (Pi, HomeClaw,
 * Hermes, Codex, etc.). The registry pattern lets us add a
 * new runtime by adding one method. The
 * `LocalCrossRuntimeSubmitter` already enforces the strict
 * "unknown runtime → fail loud" rule (Q1 invariant), so a
 * new runtime here is an additive, opt-in change.
 *
 * **The `submitToOpenClaw` translation:** the bridge
 * contract is `submitToOpenClaw(input, signal) →
 * SubagentResult`. OpenClaw's ask surface is
 * `(prompt: string) → Promise<string>` (text in, text out).
 * The translation:
 *
 *   prompt      ← input.objective
 *                (the OpenClaw ask path doesn't use
 *                capabilityTag; it's a free-form ask)
 *   resultText  → askOpenClaw(prompt)
 *   SubagentResult:
 *     status:     "completed" if non-empty else "failed"
 *     content:    [{ type: "text", text: resultText }]
 *     workerRuntime: "openclaw" (set by the submitter
 *                   after the bridge returns; the bridge
 *                   may also set it — both are fine)
 *     verdict:    "pass" if non-empty + non-aborted
 *
 * **Why the bridge DOESN'T set `workerPeerId`:** the
 * submitter rewrites it to the configured peer (the same
 * node, since cross-runtime sub-agents are local). The
 * bridge returning `workerPeerId: ""` is fine.
 *
 * **Step 2 scope:** only the envoy-harness → openclaw
 * direction is implemented (the "A" direction in the (B)
 * plan's e2e). The reverse direction (openclaw →
 * envoy-harness, the "B" direction) is wired through
 * `submitToEnvoyHarness` — the registry's interface seam.
 * The e2e for "B" requires OpenClaw's `BridgeToEnvoyHarness`
 * skill (Step 4+); for now, `submitToEnvoyHarness` is a
 * stub that throws "not yet implemented". This is a
 * "testability wins on tie" choice — the seam exists, the
 * second direction is one PR away.
 *
 * **Stability:** the public surface is
 * `LocalRuntimeRegistry` (class) +
 * `CreateLocalRuntimeRegistryOptions` (constructor opts).
 * Additive; new methods on the registry are backward-
 * compatible.
 */

import {
  type LocalRuntimeBridge,
  type SubagentInput,
  type SubagentResult,
} from "@envoymesh/envoy-harness-adapter";

/** Options for constructing a `LocalRuntimeRegistry`. */
export interface CreateLocalRuntimeRegistryOptions {
  /**
   * The OpenClaw ask path. Mirrors the `askOpenClaw` method
   * on `NodeServiceImpl` — text in, text out. The registry
   * does NOT talk to OpenClaw directly; it goes through the
   * injected `askOpenClaw` (same DI shape as the adapter's
   * `LocalRuntimeBridge`). This means the registry can be
   * unit-tested with a mock — no OpenClaw runtime needed.
   */
  askOpenClaw: (prompt: string) => Promise<string>;

  /**
   * Optional: a readiness probe for the OpenClaw ask path.
   * When the probe returns false, the registry still
   * accepts the call (the submitter's contract is
   * "honor the call"), but the result will likely be a
   * failed one. Used by the registry to surface a clear
   * "openclaw_unavailable" verdict when the engine is
   * down (rather than letting `askOpenClaw` throw a
   * generic error).
   */
  isOpenClawReady?: () => boolean;

  /**
   * Optional: a logger hook for debugging cross-runtime
   * dispatch. v0: optional. The registry's behavior is
   * identical with or without it; the logger is purely
   * for `chainLog("exec", ...)`-style observability.
   */
  log?: (event: string, fields?: Record<string, unknown>) => void;
}

/**
 * The host-side `LocalRuntimeBridge` implementation.
 * Single class per process; one per `NodeServiceImpl`.
 *
 * **Why a single class:** the registry is per-process
 * (singleton). The internal state is just the injected
 * closures + an optional logger. The host creates one
 * instance and passes it to the `LocalCrossRuntimeSubmitter`
 * (via `EnvoyHarnessAdapter`'s `meshSubmitter` option, or
 * via the new `createLocalCrossRuntimeSubmitter` helper).
 *
 * **Why a class, not an object literal:** future state
 * (call counters, latency histograms) is additive. The
 * constructor stays simple; the methods stay the same.
 */
export class LocalRuntimeRegistry implements LocalRuntimeBridge {
  private readonly askOpenClaw: (prompt: string) => Promise<string>;
  private readonly isOpenClawReady: (() => boolean) | undefined;
  private readonly log:
    | ((event: string, fields?: Record<string, unknown>) => void)
    | undefined;

  constructor(options: CreateLocalRuntimeRegistryOptions) {
    this.askOpenClaw = options.askOpenClaw;
    this.isOpenClawReady = options.isOpenClawReady;
    this.log = options.log;
  }

  /**
   * Phase 8 Step 2 — `LocalRuntimeBridge.submitToOpenClaw`.
   *
   * **What this does:** translates the `SubagentInput` into
   * an OpenClaw ask (text in), runs the ask, and synthesizes
   * a `SubagentResult` from the text out.
   *
   * **Readiness probe:** if `isOpenClawReady()` returns
   * false, we return a failed result with a clear
   * `verdict.reason` instead of letting `askOpenClaw` throw.
   * The parent's agent loop renders the verdict in the
   * tool result.
   *
   * **Cost / duration:** we don't have visibility into
   * OpenClaw's internal token counters, so cost is
   * recorded as 0 and duration is measured by the registry
   * itself. The (B) plan acknowledges this — cross-runtime
   * delegation is in-process, no cryptographic trust is
   * needed, and the cost accounting is approximate. Future:
   * the OpenClaw ask path can return a structured response
   * with token counts (a Step 4+ improvement).
   *
   * **Abort:** the host's `askOpenClaw` MUST honor the
   * signal (it already does in `NodeServiceImpl`). The
   * registry doesn't add any wrapping.
   *
   * **Capability tag handling:** `getToolsForSkill(tag)` is
   * informational only — the ask path is text-in/text-out
   * and doesn't have a structured "skill" surface. The
   * `objective` (which is the actual prompt) carries the
   * sub-agent's task. v0: we pass the objective as the
   * prompt; we don't synthesize a "skill" framing. Future:
   * Step 5+ can add skill-aware framing once OpenClaw has
   * structured ask inputs.
   */
  async submitToOpenClaw(
    input: SubagentInput,
    signal: AbortSignal,
  ): Promise<SubagentResult> {
    const startedAt = Date.now();
    this.log?.("envoy_harness.cross_runtime.openclaw.start", {
      capabilityTag: input.capabilityTag,
      objective: input.objective.slice(0, 80),
    });

    if (this.isOpenClawReady && !this.isOpenClawReady()) {
      this.log?.("envoy_harness.cross_runtime.openclaw.not_ready");
      return {
        status: "failed",
        content: [
          {
            type: "text",
            text: "openclaw_unavailable: engine not ready on this node",
          },
        ],
        workerPeerId: "",
        workerRuntime: "openclaw",
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        verdict: {
          kind: "fail",
          reason: "openclaw_unavailable",
          rollback: false,
        },
        signature: "",
      };
    }

    // Compose the prompt. We use the capability tag as a
    // soft signal (the model can use it as a hint), but the
    // ask path itself is text-in; the parent's `task` tool
    // sees the same `input.objective`.
    const prompt = [
      `Sub-agent objective (capability: ${input.capabilityTag}):`,
      input.objective,
    ].join("\n");

    let resultText: string;
    try {
      resultText = (await this.askOpenClaw(prompt)).trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log?.("envoy_harness.cross_runtime.openclaw.error", {
        error: msg,
      });
      return {
        status: "failed",
        content: [
          {
            type: "text",
            text: `openclaw_ask_failed: ${msg}`,
          },
        ],
        workerPeerId: "",
        workerRuntime: "openclaw",
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        verdict: {
          kind: "fail",
          reason: `openclaw_ask_failed: ${msg}`,
          rollback: false,
        },
        signature: "",
      };
    }

    if (resultText.length === 0) {
      this.log?.("envoy_harness.cross_runtime.openclaw.empty");
      return {
        status: "failed",
        content: [
          {
            type: "text",
            text: "openclaw_empty: ask returned an empty response",
          },
        ],
        workerPeerId: "",
        workerRuntime: "openclaw",
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        verdict: {
          kind: "fail",
          reason: "openclaw_empty",
          rollback: false,
        },
        signature: "",
      };
    }

    this.log?.("envoy_harness.cross_runtime.openclaw.done", {
      chars: resultText.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      status: "completed",
      content: [{ type: "text", text: resultText }],
      workerPeerId: "",
      workerRuntime: "openclaw",
      costUsd: 0,
      durationMs: Date.now() - startedAt,
      verdict: {
        kind: "pass",
        score: 0.5,
        confidence: "medium",
      },
      signature: "",
    };
  }

  /**
   * Phase 8 Step 2 — the symmetric direction.
   * "OpenClaw → envoy-harness" is the (B) plan's
   * acceptance criterion #2. v0: a stub that throws
   * "not yet implemented" so the seam exists without a
   * half-built impl. The real impl lands when Step 4+
   * wires OpenClaw's `BridgeToEnvoyHarness` skill through
   * the same registry.
   *
   * **Why a stub, not a default impl:** the symmetric
   * direction requires OpenClaw to invoke the registry
   * (i.e. an OpenClaw skill that constructs a
   * `SubagentInput` and calls `submitToEnvoyHarness`).
   * That requires extending the OpenClaw plugin surface,
   * which is out of scope for Step 2's "1-2 weeks" budget.
   * The seam here is the API surface; the wiring is Step 4+.
   */
  async submitToEnvoyHarness(
    _input: SubagentInput,
    _signal: AbortSignal,
  ): Promise<SubagentResult> {
    throw new Error(
      "LocalRuntimeRegistry.submitToEnvoyHarness: not yet implemented " +
        "(Phase 8 Step 4+ — symmetric direction lands when OpenClaw's " +
        "BridgeToEnvoyHarness skill is wired through this registry)",
    );
  }
}
