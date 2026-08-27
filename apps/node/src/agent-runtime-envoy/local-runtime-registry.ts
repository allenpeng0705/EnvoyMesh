/**
 * Phase 8 Step 2 / b1 — `LocalRuntimeRegistry` (the host-side
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
 *     workerRuntime: "openclaw" (rewritten by the
 *                   submitter; the bridge may also set
 *                   it — both are fine)
 *     verdict:    "pass" if non-empty + non-aborted
 *
 * **Phase 8 b1 — the symmetric direction is now real:**
 * `submitToEnvoyHarness` delegates to a host-injected
 * `LocalMeshSubmitter` (from `@envoymesh/envoy-harness`).
 * The factory (`buildSubagent: (input) => Agent`) is host-
 * injected, mirroring the `askOpenClaw` DI shape on the
 * other side. The registry is the one place that knows
 * how to construct a sub-agent on either runtime.
 *
 * **Why a `LocalMeshSubmitter` instance per registry, not
 * per call:** the submitter is stateful (it owns a
 * `SubagentRecord[]` for the `/agents` command). One
 * instance per `NodeServiceImpl` matches the per-process
 * registry lifetime; constructing per call would lose
 * the record between `submit()` calls.
 *
 * **Why the bridge DOESN'T set `workerPeerId` for
 * openclaw:** the submitter rewrites it to the configured
 * peer (the same node, since cross-runtime sub-agents are
 * local). The bridge returning `workerPeerId: ""` is fine.
 * The LocalMeshSubmitter stamps its own `workerPeerId`
 * for the envoy-harness direction.
 *
 * **Stability:** the public surface is
 * `LocalRuntimeRegistry` (class) +
 * `CreateLocalRuntimeRegistryOptions` (constructor opts).
 * Additive; new methods on the registry are backward-
 * compatible. New required options are major version
 * (the b1 change adds 2 required options: `buildSubagent`
 * and `workerPeerId`).
 */

import {
  type Agent,
  LocalMeshSubmitter,
  type LocalMeshSubmitterOptions,
} from "@envoymesh/envoy-harness";
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
   * Phase 8 b1 — factory: build a fresh `Agent` for an
   * envoy-harness sub-agent. The factory's responsibility
   * is to construct a NEW session (id, AGENTS.md, hooks)
   * per call. The host decides the sub-agent's model,
   * tools, permission, system prompt.
   *
   * **Symmetric to `askOpenClaw`:** the host injects both
   * seams. The registry doesn't know about model adapters
   * or `defaultBuildSubagentFactory`; the chain-worker-
   * executor (or a future step) wires them up.
   *
   * **Required because:** `submitToEnvoyHarness` calls
   * `this.envoyHarnessSubmitter.submit()`, which calls
   * the factory. A test that only exercises
   * `submitToOpenClaw` can pass a stub factory (it will
   * never be called).
   */
  buildSubagent: (input: SubagentInput) => Agent;

  /**
   * Phase 8 b1 — this node's peerId. Stamped into every
   * `SubagentResult.workerPeerId` produced by the
   * `LocalMeshSubmitter` so the parent (and any downstream
   * verifier) can tell where the sub-agent ran. Mirrors
   * `LocalMeshSubmitterOptions.workerPeerId`.
   */
  workerPeerId: string;

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
 * (singleton). The internal state is the injected
 * closures + an optional logger + the inner
 * `LocalMeshSubmitter` (stateful — owns the
 * `SubagentRecord[]` for `/agents`). The host creates one
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
  /**
   * Phase 8 b1 — the inner `LocalMeshSubmitter` for
   * envoy-harness sub-agents. Constructed once in the
   * constructor (not per call) so the `SubagentRecord[]`
   * registry persists across `submitToEnvoyHarness`
   * calls. The `LocalMeshSubmitter` is from
   * `@envoymesh/envoy-harness` (Package 1) — this is the
   * one place the registry imports the harness runtime.
   */
  private readonly envoyHarnessSubmitter: LocalMeshSubmitter;

  constructor(options: CreateLocalRuntimeRegistryOptions) {
    this.askOpenClaw = options.askOpenClaw;
    this.isOpenClawReady = options.isOpenClawReady;
    this.log = options.log;
    // Phase 8 b1 — wire the inner submitter. We construct
    // it once so the sub-agent record list is process-
    // lifetime (matches the registry's lifetime). The
    // factory is host-injected; this is the seam that
    // keeps the registry ignorant of model adapters.
    const submitterOptions: LocalMeshSubmitterOptions = {
      buildSubagent: options.buildSubagent,
      workerPeerId: options.workerPeerId,
    };
    this.envoyHarnessSubmitter = new LocalMeshSubmitter(submitterOptions);
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
   * Phase 8 b1 — the symmetric direction is now real.
   *
   * **What this does:** delegates to the host-injected
   * `LocalMeshSubmitter` (constructed in this registry's
   * constructor). The submitter:
   *
   * 1. Calls `buildSubagent(input)` to construct a fresh
   *    `Agent` (new session, BUILTIN tools, the host's
   *    model).
   * 2. Wires the parent's `signal` to the agent's
   *    `abort()` so a parent cancel propagates.
   * 3. Calls `agent.run(input.objective)`.
   * 4. Synthesizes a `SubagentResult` from the
   *    `AgentResult` (`stopReason`-based verdict; v0
   *    simple synthesis).
   * 5. Returns the result with `workerPeerId` +
   *    `workerRuntime: "envoy-harness"` stamped.
   *
   * **Why no translation:** the `MeshSubmitter` interface
   * IS the contract. The parent's `task` tool sees a
   * `SubagentResult` with the same shape regardless of
   * which runtime produced it. The `LocalCrossRuntimeSubmitter`
   * (in the bridge) routes to either this method or
   * `submitToOpenClaw` based on `input.preferredRuntime`,
   * then normalizes the result (rewrites `workerRuntime` +
   * `workerPeerId`).
   *
   * **Abort:** forwarded unchanged to the
   * `LocalMeshSubmitter`. The submitter wires it to the
   * sub-agent's abort and enforces the deadline via a
   * `Promise.race` (the harness's own deadline-safety
   * pattern).
   *
   * **Error handling:** the `LocalMeshSubmitter` catches
   * `agent.run` errors and converts them to a failed
   * `SubagentResult` (does NOT propagate throws). The
   * registry passes the result through unchanged.
   */
  async submitToEnvoyHarness(
    input: SubagentInput,
    signal: AbortSignal,
  ): Promise<SubagentResult> {
    this.log?.("envoy_harness.cross_runtime.envoy_harness.start", {
      capabilityTag: input.capabilityTag,
      objective: input.objective.slice(0, 80),
    });
    const result = await this.envoyHarnessSubmitter.submit(input, signal);
    this.log?.("envoy_harness.cross_runtime.envoy_harness.done", {
      status: result.status,
      durationMs: result.durationMs,
    });
    return result;
  }
}
