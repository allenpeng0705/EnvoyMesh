/**
 * Phase 41 / MAP — orchestrator-side verification loop (design §8.3).
 *
 * Called from `handleOrchestratorPartial` when a worker's final partial
 * arrives. It:
 *
 *   1. Re-packages the partial as a `SignedAgentResult` (the orchestrator's
 *      view; signed with the orchestrator key — the `VerdictEntry`, not the
 *      result, is the wire record).
 *   2. Runs the adapter's rule verifier for the worker's runtime
 *      (`adapter.verify`) and combines verdicts (OR-of-pass / AND-of-fail /
 *      default-disputed, §6.2).
 *   3. Writes a `VerdictEntry` (source: `"rule"`) into the chain's
 *      `ArbitrationStore` — the authoritative reputation write (§7.1:
 *      workers never self-report reputation, so the worker-side advisory
 *      `adapter.verify` must NOT record entries).
 *   4. Escalates to cross-agent verification (§8.1 / §8.3) when the rule
 *      verdict is `partial`/`disputed` AND the task is critical (owner
 *      `criticality: "high"` hint) or private-and-expensive: a second,
 *      distinct runtime executes the same subtask locally, the
 *      `CrossAgentDisagreementVerifier` compares the two results, and a
 *      second `VerdictEntry` (source: `"cross"`) is written.
 *   5. Bills the escalation against the chain's verification budget in
 *      `ChainBudgetLedger` (`verificationReservedUsd` /
 *      `verificationCommittedUsd`); a budget miss downgrades to rule-only
 *      verification (design §8.2).
 *
 * **Additive and inert without deps:** when the orchestrator has no
 * `chainVerify` deps (or no adapter for the worker's runtime), the loop
 * records nothing and changes nothing. Every failure inside the loop is
 * swallowed and audited (`chain.verify_error`), never thrown into the
 * orchestrator's state machine.
 */

import type {
  AgentRuntime,
  ChainMandate,
  ChainSubtask,
  ChainSubtaskAward,
  ChainSubtaskPartial,
  EnvoyEnvelope,
  SignedAgentResult,
  TaskChainPartialPayload,
  Verdict,
  VerdictEntry,
  VerifierSource,
} from "@envoymesh/protocol";
import {
  CrossAgentDisagreementVerifier,
  type AgentAdapter,
  type CrossAgentVerifyInput,
} from "@envoymesh/agent-adapter";
import { signCanonicalPayload } from "@envoymesh/identity";

import type { ChainBudgetLedger } from "./chain-budget-ledger.js";
import { chainLog, chainWarn } from "./chain-debug.js";
import type { ChainAuditSink } from "./chain-inbound-types.js";
import {
  mapChainSubtaskToExecuteInput,
  normalizeSkillId,
  resultArtifactsToContentBlocks,
} from "./chain-map.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { readEffectiveVerifyModeDefault } from "./node-config-loader.js";
import type { AgentGraphStore } from "./chain-graph/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * §8.1 — cross-agent verification triggers on private-sensitivity chains when
 * the mandated budget is at/above this. Below it, `partial`/`disputed` rule
 * verdicts still escalate via the owner `criticality: "high"` hint only.
 */
export const CROSS_AGENT_COST_THRESHOLD_USD = 20;

/** §8.1 — cross-agent verification is opt-in; default off. */
export const DEFAULT_VERIFY_WITH_CROSS = false;

/**
 * Phase 8 / v1.8 — the model family for each
 * AgentRuntime. The cross-verify loop uses this
 * to prefer a verifier with a different family
 * than the worker (Q1 of the v1.8 sub-plan).
 *
 * **Why a hardcoded table (not the node
 * config):** the model FAMILY is a per-runtime
 * default, not a per-node config. Different
 * nodes may run the same runtime on different
 * models (e.g. envoy-harness can be configured
 * with OpenAI / Anthropic / DeepSeek / Ollama
 * via `--provider`), so the FAMILY label here
 * is a **canonical default** used for the
 * "different family" preference and the
 * `verifierModel` audit field — it's the
 * runtime's *name-brand* family, not a
 * guarantee about the model the node is
 * actually running.
 *
 * **Why per-runtime families:** the v1.x
 * assumption is that each runtime has a
 * distinct canonical family. Cross-verify
 * with a different family is the v1.x proxy
 * for "cross-verify with a different model"
 * (the actual F9.5 primitive — cross-verify
 * with a different model on the SAME runtime
 * — is a v1.16 future when the EH runtime
 * supports per-call model overrides on the
 * cross-verify path). The "true model" audit
 * trail — recording the actual model the node
 * is running, not the canonical family — is a
 * v1.18 follow-up (the runtime needs to
 * surface its model).
 *
 * **End-user-first copy:** the model family
 * is an internal value (developer jargon). The
 * Tauri UI maps it to a user-friendly label
 * (e.g. "Claude" for envoy-harness, "Built-in
 * assistant" for OpenClaw).
 */
const MODEL_FAMILY: Record<AgentRuntime, string> = {
  "envoy-harness": "claude",
  "openclaw": "native",
  "pi": "pi",
  "hermes": "hermes",
  "codex": "codex",
  "codex-cli": "codex",
  "openhuman": "human",
};

/**
 * Phase 8 / v1.8 — the model family for a given
 * AgentRuntime. Exported so the Tauri team can
 * map the internal family to a user-friendly
 * label (e.g. "Claude" / "Built-in assistant").
 */
export function modelFamilyFor(runtime: AgentRuntime): string {
  return MODEL_FAMILY[runtime];
}

// ---------------------------------------------------------------------------
// Deps + result shapes
// ---------------------------------------------------------------------------

/**
 * The slice of `ChainState` the verification loop touches. Kept structural so
 * the module stays importable without pulling in the full orchestrator.
 */
export interface ChainVerifyLoopState {
  chainId: string;
  chainMandate: ChainMandate;
  subtasks: Map<string, ChainSubtask>;
  awards: Map<string, ChainSubtaskAward>;
  ledger: ChainBudgetLedger;
}

export interface ChainVerifyLoopDeps {
  audit: ChainAuditSink;
  /**
   * Append a signed verdict to the chain's arbitration store — the
   * authoritative reputation write. The runtime owns the per-chain store
   * registry; the loop hands it the entry to persist.
   */
  writeVerdictEntry: (chainId: string, entry: VerdictEntry) => void;
  /** Orchestrator peer id — the `issuedBy` on every `VerdictEntry`. */
  orchestratorPeerId: string;
  /** Orchestrator signing key — signs `VerdictEntry` + re-packaged results. */
  signingKeyPem?: string;
  /**
   * Build a ready-to-run adapter for a runtime, scoped to the subtask being
   * verified (mirrors the worker-side `runOpenClawMapPrimary` wiring, so the
   * cross run keeps the same prompt surface the worker used).
   */
  buildAdapter?: (runtime: AgentRuntime, subtask: ChainSubtask) => AgentAdapter | undefined;
  /** The runtimes this node can verify with / execute for cross-checks. */
  listRuntimes?: () => AgentRuntime[];
  /**
   * Resolve the runtime a worker used for its subtask result (wire manifest
   * pool when available). Absent / unresolved peers default to `"openclaw"`.
   */
  resolveWorkerRuntime?: (workerPeerId: string) => AgentRuntime | undefined;
  /** Injectable for tests; defaults to a fresh `CrossAgentDisagreementVerifier`. */
  crossVerifier?: CrossAgentVerifierLike;
  /**
   * Owner-flagged criticality hint (design §8.1 #1). Production value now
   * rides on the signed mandate (`state.chainMandate.criticality`); this
   * field remains the injectable fallback for tests / callers without a
   * mandate. Absent = `"normal"`.
   */
  criticality?: "normal" | "high";
  now?: () => Date;
  /**
   * Phase 8 / v1.4 — sync accessor for the persisted
   * node config. Used to resolve the effective
   * `verifyMode` default via
   * `readEffectiveVerifyModeDefault`. Sync because
   * the loop is invoked from sync code paths
   * (orchestrator handlers); the persisted config
   * is read via the store's in-memory `peek()`
   * (no disk I/O at this layer).
   *
   * **When absent (tests / older callers):** the
   * loop falls back to the per-runtime default
   * (`defaultVerifyModeForWorker(workerRuntime)`)
   * — the v0 behavior, preserved.
   */
  getNodeConfig?: () => PersistedNodeConfig | undefined;
  /**
   * Phase 8 / v2.0 — optional agent-graph store. When set, the
   * loop opens a parent/child edge at verification start and
   * closes it on each verdict write (the last verdict for the
   * subtask wins, mirroring `recordVerdictEntry`'s
   * re-verification semantics). Absent store = today's behavior
   * (no graph recording).
   */
  graphStore?: AgentGraphStore;
}

/** Structural stand-in for the cross-verifier so tests can stub it. */
export interface CrossAgentVerifierLike {
  verify(input: CrossAgentVerifyInput): Promise<Verdict>;
}

export interface ChainVerifyLoopResult {
  /** The rule-pass verdict (or the cross verdict when escalated). */
  verdict: Verdict;
  /** The `VerdictEntry` written after the rule pass. */
  verdictEntry: VerdictEntry;
  /** Present when the loop escalated to a second runtime. */
  escalated?: {
    secondRuntime: AgentRuntime;
    crossVerdict: Verdict;
    crossVerdictEntry: VerdictEntry;
  };
}

// ---------------------------------------------------------------------------
// Escalation decision (§8.1)
// ---------------------------------------------------------------------------

/**
 * Phase 8 / Step 6 — the per-worker-runtime
 * default for `verifyMode`. Q4 (a) says
 * envoy-writes jobs default to `cross-runtime`
 * (envoy-harness writes, OpenClaw verifies —
 * the novel features get cross-checked by the
 * mature runtime). OpenClaw is already mature;
 * cross-checking an OpenClaw-writes job with
 * envoy-harness is rare in v0.
 *
 * **v1.4 — operator override:** the
 * `PersistedNodeConfig.verifyModeDefault` field
 * (Q3 of the v1.4 sub-plan) overrides this
 * per-runtime default. The Tauri UI writes the
 * field; the loop reads the effective value via
 * `readEffectiveVerifyModeDefault(getNodeConfig(),
 * workerRuntime)`. When the field is unset, this
 * function is the final fallback. Per-job
 * `ChainMandate.verifyMode` still wins over
 * both — Team-job authors keep the per-mandate
 * override.
 *
 * **Re-exported from `node-config-loader.ts`**
 * so the settings API can call it without
 * pulling in the heavier chain-verify-loop
 * module. The function itself lives here
 * (where the per-runtime policy is defined).
 */
export function defaultVerifyModeForWorker(
  workerRuntime: AgentRuntime,
): "rule-only" | "cross-runtime" | "cross-runtime-strict" {
  return workerRuntime === "envoy-harness"
    ? "cross-runtime"
    : "rule-only";
}

export function shouldEscalateToCrossAgent(
  verdict: Verdict,
  opts: {
    mandate: ChainMandate;
    criticality?: "normal" | "high";
    /**
     * Phase 8 / v1.4 — the loop-resolved effective
     * verifyMode. Wins over `mandate.verifyMode`
     * when set. Typically passed in by
     * `runChainVerificationLoop` after reading
     * the per-node config + per-runtime default.
     * Tests + older callers omit it (v0 behavior
     * preserved: `mandate.verifyMode ?? "rule-only"`).
     */
    effectiveVerifyMode?: "rule-only" | "cross-runtime" | "cross-runtime-strict";
  },
): boolean {
  // Phase 8 / Step 6 — Q4 (a) + (b): when the
  // owner explicitly opted into cross-verify
  // (`verifyMode: "cross-runtime"` or
  // `"cross-runtime-strict"`), the cross runs
  // regardless of the rule verdict. The rule
  // pass still runs first; the cross is in
  // addition to it.
  //
  // Phase 8 / v1.4 — the effective verifyMode
  // (per-node config + per-runtime default) wins
  // over the per-mandate value when the loop
  // provided it. The per-mandate value is still
  // the v0 default when the loop didn't.
  const verifyMode =
    opts.effectiveVerifyMode ??
    opts.mandate.verifyMode ??
    "rule-only";
  if (verifyMode === "cross-runtime" || verifyMode === "cross-runtime-strict") {
    return true;
  }
  // `rule-only` (default) — existing logic.
  if (verdict.kind !== "partial" && verdict.kind !== "disputed") return false;
  if (opts.criticality === "high") return true;
  return (
    opts.mandate.maxSensitivity === "private" &&
    opts.mandate.maxChainCostUsd >= CROSS_AGENT_COST_THRESHOLD_USD
  );
}

// ---------------------------------------------------------------------------
// Verdict combining (§6.2 — full verdict object, not just the kind)
// ---------------------------------------------------------------------------

/**
 * Phase 8 / Step 6 — `verifyMode` parameter
 * for `combineToVerdict`. When
 * `verifyMode === "cross-runtime-strict"`, the
 * cross verdict (passed as the last element of
 * `verdicts` by `runChainVerificationLoop`) wins
 * over the rule verdict. The other modes use the
 * existing `pass > fail > partial > first`
 * precedence.
 *
 * **Why "the last verdict wins" in strict mode:**
 * `runChainVerificationLoop` concatenates the
 * rule verdicts first, then the cross verdicts:
 *
 * ```ts
 * verdicts = [...ruleVerdicts, ...crossVerdicts];
 * combineToVerdict(verdicts, verifyMode);
 * ```
 *
 * The last verdict is therefore the most recent
 * cross verdict. In strict mode, the cross is
 * the authority; the rule is the supporting
 * evidence. The two-step precedence
 * (existing `pass > fail > partial > first`)
 * also handles the agreement case correctly
 * — when both rule and cross pass, the result
 * is `pass` (because `pass` is in the list).
 */
export function combineToVerdict(
  verdicts: readonly Verdict[],
  verifyMode: ChainMandate["verifyMode"] = "rule-only",
): Verdict {
  if (verdicts.length === 0) {
    return { kind: "disputed", needsHuman: true, signals: ["verifier produced no verdicts"] };
  }
  if (verifyMode === "cross-runtime-strict") {
    // Cross verdict (last) wins. The other
    // verdicts are still in the store for
    // audit; the orchestrator's combined
    // verdict is the cross's.
    return verdicts[verdicts.length - 1];
  }
  const pass = verdicts.find((v) => v.kind === "pass");
  if (pass) return pass;
  const fail = verdicts.find((v) => v.kind === "fail");
  if (fail) return fail;
  const partial = verdicts.find((v) => v.kind === "partial");
  if (partial) return partial;
  return verdicts[0];
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

export async function runChainVerificationLoop(
  deps: ChainVerifyLoopDeps,
  state: ChainVerifyLoopState,
  envelope: EnvoyEnvelope,
  payload: TaskChainPartialPayload,
): Promise<ChainVerifyLoopResult | null> {
  const partial = payload.partial;
  if (!partial.isFinal) return null;

  const subtask = state.subtasks.get(partial.subtaskId);
  if (!subtask) return null;

  const award = state.awards.get(partial.subtaskId);
  const workerPeerId = award?.workerPeerId ?? partial.workerPeerId;
  const workerRuntime = resolveWorkerRuntime(deps, workerPeerId);
  // Phase 8 / v1.4 — resolve the effective
  // verifyMode for this subtask. Precedence
  // (Q3 of the v1.4 sub-plan):
  // 1. `state.chainMandate.verifyMode` (per-job,
  //    set by the Team-job author — wins).
  // 2. `PersistedNodeConfig.verifyModeDefault`
  //    (per-node, set by the Tauri UI owner).
  // 3. The per-runtime default
  //    (`defaultVerifyModeForWorker(workerRuntime)`).
  //
  // The `getNodeConfig?.()` is sync (in-memory
  // peek). When absent (tests / older callers),
  // step 2 is skipped and the loop falls back
  // to the per-runtime default — v0 behavior.
  const effectiveVerifyMode =
    state.chainMandate.verifyMode ??
    readEffectiveVerifyModeDefault(deps.getNodeConfig?.(), workerRuntime);
  const now = (deps.now ?? (() => new Date()))();
  const correlationId = envelope.correlationId ?? `${subtask.chainId}:${subtask.subtaskId}`;

  if (!deps.buildAdapter || !deps.listRuntimes) return null;
  const adapter = deps.buildAdapter(workerRuntime, subtask);
  if (!adapter) return null;

  // Phase 8 / v2.0 — open the parent/child edge for this
  // subtask when verification starts (the parent is the
  // orchestrator). The edge closes on each verdict write.
  if (deps.graphStore) {
    deps.graphStore.openEdge({
      parentPeerId: deps.orchestratorPeerId,
      childPeerId: workerPeerId,
      subtaskId: subtask.subtaskId,
      workerRuntime,
      skillId: normalizeSkillId(subtask.requiredSkill),
      openedAt: now.getTime(),
    });
  }

  const result = signedResultFromPartial({
    partial,
    subtask,
    runtime: workerRuntime,
    peerId: workerPeerId,
    signingKeyPem: deps.signingKeyPem,
    now,
  });

  // 1) Rule pass — the adapter's own verifier rules.
  let verdicts: Verdict[];
  try {
    verdicts = await adapter.verify({ result, objective: subtask.objective });
  } catch (err) {
    const summary = err instanceof Error ? err.message : String(err);
    chainWarn("verify", `rule pass failed subtask=${subtask.subtaskId} ${summary}`);
    deps.audit.record({
      type: "chain.verify_error",
      outcome: "record",
      intent: envelope.intent,
      remotePeerId: envelope.senderPeerId,
      correlationId,
      summary: `subtask=${subtask.subtaskId} stage=rule ${summary}`,
    });
    // v2.0 — close the open edge as `failed` (no verdict
    // payload) so the graph doesn't leak an open edge
    // when the rule verify crashes. The next openEdge for
    // the same (parent, subtask) would also self-heal, but
    // marking as `failed` preserves the operator-visible
    // "the verify crashed" signal until the next attempt.
    deps.graphStore?.failEdge(
      deps.orchestratorPeerId,
      subtask.subtaskId,
      now.getTime(),
    );
    return null;
  }
  // Phase 8 / Step 6 — the rule VerdictEntry's
  // verdict is based on the rule verdicts alone
  // (precedence). The `verifyMode` only matters
  // when the cross is also in the picture; the
  // final combined verdict is computed in the
  // escalation branch below.
  const combined = combineToVerdict(verdicts);
  const ruleEntry = writeVerdict(deps, state, subtask, {
    workerPeerId,
    workerRuntime,
    verdict: combined,
    source: "rule",
    now,
  });
  deps.audit.record({
    type: "chain.verify_rule",
    outcome: "record",
    intent: envelope.intent,
    remotePeerId: envelope.senderPeerId,
    correlationId,
    summary:
      `subtask=${subtask.subtaskId} worker=${workerPeerId} runtime=${workerRuntime} ` +
      `kind=${combined.kind} rules=${verdicts.length}`,
  });

  const resultOutcome: ChainVerifyLoopResult = { verdict: combined, verdictEntry: ruleEntry };

  // 2) Cross-agent escalation — second, distinct runtime runs the same step.
  // The owner-flagged `criticality` rides on the signed mandate (design §8.1 #1);
  // `deps.criticality` stays as the injectable fallback for tests.
  const criticality = state.chainMandate.criticality ?? deps.criticality;
  if (!shouldEscalateToCrossAgent(combined, {
    mandate: state.chainMandate,
    criticality,
    // Phase 8 / v1.4 — pass the loop-resolved
    // effective verifyMode so the per-node
    // override (Tauri UI) wins over the
    // per-mandate value when the mandate didn't
    // set it.
    effectiveVerifyMode,
  })) {
    return resultOutcome;
  }

  const secondRuntime = pickSecondRuntime(deps, workerRuntime);
  const secondAdapter = secondRuntime ? deps.buildAdapter(secondRuntime, subtask) : undefined;
  if (!secondRuntime || !secondAdapter) {
    chainLog("verify", `cross escalation skipped (no second runtime) subtask=${subtask.subtaskId}`, {
      chainId: state.chainId,
      workerRuntime,
      available: deps.listRuntimes(),
    });
    return resultOutcome;
  }

  // Budget the second run like a worker award (estimate ≈ the first run's cost).
  const estimateUsd = award?.acceptedCostUsd ?? 0;
  const reserved = await state.ledger.reserveVerification(subtask.subtaskId, estimateUsd);
  if (!reserved.ok) {
    deps.audit.record({
      type: "chain.verify_budget_denied",
      outcome: "record",
      intent: envelope.intent,
      remotePeerId: envelope.senderPeerId,
      correlationId,
      summary:
        `subtask=${subtask.subtaskId} downgrade=rule-only reason=${reserved.reason}`,
    });
    return resultOutcome;
  }

  try {
    const crossVerifier = deps.crossVerifier ?? new CrossAgentDisagreementVerifier();
    const { input } = mapChainSubtaskToExecuteInput({
      subtask,
      now: () => now,
    });
    // The execute-input signal aborts at the subtask deadline (unref'd timer);
    // a completed run just waits it out.
    const secondResult = await secondAdapter.execute(input);
    await state.ledger.tryCommitVerification(subtask.subtaskId);

    const crossVerdict = await crossVerifier.verify({
      objective: subtask.objective,
      resultA: result,
      resultB: secondResult,
    });
    const crossEntry = writeVerdict(deps, state, subtask, {
      workerPeerId,
      workerRuntime,
      verdict: crossVerdict,
      source: "cross",
      // v1.8 — record the verifier's model
      // family for the audit trail. The
      // existing `verifierModel` Zod field
      // is reused (it's optional for
      // `source === "cross"` per the schema
      // in `packages/protocol/src/agent-adapter.ts:347-389`).
      verifierModel: modelFamilyFor(secondRuntime),
      now,
    });
    deps.audit.record({
      type: "chain.verify_cross",
      outcome: "record",
      intent: envelope.intent,
      remotePeerId: envelope.senderPeerId,
      correlationId,
      summary:
        `subtask=${subtask.subtaskId} runtimes=${workerRuntime}+${secondRuntime} ` +
        `kind=${crossVerdict.kind} cost=${estimateUsd}`,
    });
    chainLog("verify", `cross verdict subtask=${subtask.subtaskId} ${workerRuntime}+${secondRuntime}`, {
      chainId: state.chainId,
      kind: crossVerdict.kind,
      score: "score" in crossVerdict ? crossVerdict.score : undefined,
    });
    // Phase 8 / Step 6 — final combined verdict.
    // The rule's `combined` is stored as
    // `verdictEntry` (the rule's view); the
    // combined rule + cross is the orchestrator's
    // view. `cross-runtime-strict` mode returns
    // the cross verdict (last wins); `cross-runtime`
    // and `rule-only` use the precedence (pass
    // wins; in `cross-runtime` with both rule and
    // cross in the list, a pass from either wins).
    //
    // Phase 8 / v1.4 — pass the loop-resolved
    // effective verifyMode so the per-node
    // override (Tauri UI) is honored by
    // `combineToVerdict` too. When the loop
    // didn't compute it (tests / older
    // callers), `state.chainMandate.verifyMode`
    // is the v0 fallback.
    const finalVerdict = combineToVerdict(
      [...verdicts, crossVerdict],
      effectiveVerifyMode,
    );
    return {
      verdict: finalVerdict,
      verdictEntry: ruleEntry,
      escalated: { secondRuntime, crossVerdict, crossVerdictEntry: crossEntry },
    };
  } catch (err) {
    const summary = err instanceof Error ? err.message : String(err);
    await state.ledger.releaseVerification(subtask.subtaskId, "escalation failed");
    deps.audit.record({
      type: "chain.verify_error",
      outcome: "record",
      intent: envelope.intent,
      remotePeerId: envelope.senderPeerId,
      correlationId,
      summary: `subtask=${subtask.subtaskId} stage=cross ${summary}`,
    });
    chainWarn("verify", `cross escalation failed subtask=${subtask.subtaskId} ${summary}`);
    return resultOutcome;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWorkerRuntime(
  deps: ChainVerifyLoopDeps,
  workerPeerId: string,
): AgentRuntime {
  return deps.resolveWorkerRuntime?.(workerPeerId) ?? "openclaw";
}

/**
 * Phase 8 / v1.8 — pick a verifier runtime.
 *
 * **Precedence** (Q3 of the v1.8 sub-plan):
 * 1. A runtime with a different model family
 *    than the worker (the F9.5 proxy for
 *    "different model"). The first such
 *    runtime in `listRuntimes()` wins.
 * 2. The first non-worker runtime (v1.7
 *    fallback — used when all non-worker
 *    runtimes have the same model family as
 *    the worker).
 * 3. `undefined` when no second runtime is
 *    available (single-runtime node; the
 *    cross-verify is skipped per Q4 of the
 *    v1.8 sub-plan).
 *
 * **Why prefer different family:** the
 * F9.5 design intent is "cross-verify with a
 * different model" (catches model-specific
 * biases). In v1.x, "different model" is
 * approximated by "different model family"
 * (each runtime has a hardcoded family in the
 * `MODEL_FAMILY` table). When the node has
 * multiple runtimes with different families,
 * we prefer the cross-family one.
 */
function pickSecondRuntime(
  deps: ChainVerifyLoopDeps,
  workerRuntime: AgentRuntime,
): AgentRuntime | undefined {
  const runtimes = deps.listRuntimes?.() ?? [];
  const workerFamily = MODEL_FAMILY[workerRuntime];
  // Prefer a different-family runtime.
  const differentFamily = runtimes.find(
    (r) =>
      r !== workerRuntime &&
      MODEL_FAMILY[r] !== workerFamily,
  );
  if (differentFamily) return differentFamily;
  // Fallback: any non-worker runtime.
  return runtimes.find((r) => r !== workerRuntime);
}

function writeVerdict(
  deps: ChainVerifyLoopDeps,
  state: ChainVerifyLoopState,
  subtask: ChainSubtask,
  input: {
    workerPeerId: string;
    workerRuntime: AgentRuntime;
    verdict: Verdict;
    source: VerifierSource;
    /**
     * Phase 8 / v1.8 — the model that produced
     * this verdict. Populated for cross
     * verdicts (the verifier's model family
     * from the `MODEL_FAMILY` table). The
     * existing `VerdictEntrySchema` field
     * (`verifierModel: z.string().optional()`)
     * is reused; no protocol change needed.
     *
     * **When undefined:** the verdict is
     * either rule (the adapter's own logic;
     * not model-different) or another source
     * that doesn't track the model. The
     * Zod schema is optional for non-`"llm"`
     * sources, so undefined is valid.
     */
    verifierModel?: string;
    now: Date;
  },
): VerdictEntry {
  const unsigned = {
    chainId: state.chainId,
    subtaskId: subtask.subtaskId,
    workerPeerId: input.workerPeerId,
    workerRuntime: input.workerRuntime,
    skillId: normalizeSkillId(subtask.requiredSkill),
    verdict: input.verdict,
    source: input.source,
    // v1.8 — only include `verifierModel`
    // when set, so the JSON serialization
    // omits the field for rule verdicts
    // (consistent with the v1.7 audit trail
    // shape). The Zod schema accepts both
    // shapes (the field is `optional()`).
    ...(input.verifierModel !== undefined && {
      verifierModel: input.verifierModel,
    }),
    issuedBy: deps.orchestratorPeerId,
    issuedAt: input.now.toISOString(),
  };
  const signature = deps.signingKeyPem
    ? signCanonicalPayload(unsigned, deps.signingKeyPem)
    : "unsigned";
  const entry = { ...unsigned, signature };
  deps.writeVerdictEntry(state.chainId, entry);
  // Phase 8 / v2.0 — close the edge (or update the closed
  // edge's verdict on re-verification) with the written entry.
  if (deps.graphStore) {
    deps.graphStore.closeEdge(
      deps.orchestratorPeerId,
      subtask.subtaskId,
      entry,
      input.now.getTime(),
    );
  }
  return entry;
}

/** Orchestrator-side view of the worker's delivered partial, as a result. */
function signedResultFromPartial(input: {
  partial: ChainSubtaskPartial;
  subtask: ChainSubtask;
  runtime: AgentRuntime;
  peerId: string;
  signingKeyPem?: string;
  now: Date;
}): SignedAgentResult {
  const blocks = resultArtifactsToContentBlocks(input.partial);
  const note = input.partial.note?.trim();
  if (note && !blocks.some((b) => b.kind === "text")) {
    blocks.unshift({ kind: "text", text: note });
  }
  const unsigned = {
    skillId: normalizeSkillId(input.subtask.requiredSkill),
    runtime: input.runtime,
    peerId: input.peerId,
    correlationId: `${input.subtask.chainId}:${input.subtask.subtaskId}`,
    content: blocks,
    citations: [],
    metrics: { durationMs: 0, costUsd: 0 },
    completedAt: input.now.toISOString(),
  };
  const signature = input.signingKeyPem
    ? signCanonicalPayload(unsigned, input.signingKeyPem)
    : "unsigned";
  return { ...unsigned, signature };
}
