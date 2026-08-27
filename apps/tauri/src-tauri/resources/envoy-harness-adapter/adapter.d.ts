/**
 * EnvoyHarnessAdapter — the reference `AgentAdapter` for
 * envoy-harness.
 *
 * **Design doc:** `docs/improving-agent-network.en.md` §5.2
 * (in the EnvoyMesh monorepo) + envoy-harness's own design
 * §11. The class is the **only** place that knows about both
 * envoy-harness (Package 1) and the mesh (Package 2 +
 * `@envoymesh/agent-adapter`).
 *
 * **Why dependency injection:** the adapter is
 * runtime-agnostic — it imports no app-level module. The
 * host provides:
 * - `buildAgent(skillId, objective, signal)`: a factory
 *   that produces a fresh `Agent` per `execute()` call.
 *   The agent is constructed with the skill's tool set,
 *   the orchestrator's cost ceiling, and the abort signal.
 *   In tests, the host injects a factory that returns
 *   an Agent with `FakeModel`.
 * - `signResult(unsigned)`: signs the wire `AgentResult`
 *   with the node's owner key. The adapter does NOT
 *   invent or hold a key (per the protocol contract).
 *   The host provides a closure that does the Ed25519
 *   sign over the canonical JSON.
 * - `workerPeerId`: the node's peerId. Stamped into every
 *   result and the manifest.
 *
 * **Skill → tool mapping:** `getToolsForSkill(skillId)`
 * returns the local tool set. The factory is responsible
 * for filtering the global tool registry; the adapter
 * only tells it the skill.
 *
 * **Manifest signing:** the manifest is *unsigned* by
 * the adapter. The orchestrator signs with the owner's
 * key. (See `AgentAdapter.buildManifest` doc: "The
 * adapter is **not** responsible for signing. The owner
 * signs because the manifest advertises the owner's
 * capabilities.")
 *
 * **Result signing:** the result is signed by the node
 * (not the adapter, not the worker). This is the
 * `signResult` closure. The signature is over the
 * canonical JSON of the unsigned wire `AgentResult`
 * (including `raw`, per the protocol doc: "the signature
 * covers it so a malicious adapter cannot retroactively
 * edit it").
 *
 * **Stability:** the public surface is `EnvoyHarnessAdapter`
 * (class) + `EnvoyHarnessAdapterInput` (constructor opts).
 * Additive; new fields don't break existing callers.
 */
import type { AgentAdapter, BuildManifestInput, ExecuteInput, VerifyInput } from "@envoymesh/agent-adapter";
import type { AgentResult as WireAgentResult, CapabilityManifest, SignedAgentResult, Verdict } from "@envoymesh/protocol";
import { Agent, type AskHandler, type MeshSubmitter, type ModelAdapter, type Tool } from "@envoymesh/envoy-harness";
import { type CrossVerifyFn } from "./verify.js";
/**
 * Factory that builds a fresh `Agent` per `execute()` call.
 * The factory is the only place that knows how to wire
 * the local harness to the adapter.
 */
export type BuildAgentFn = (input: {
    skillId: string;
    objective: string;
    costCeilingUsd: number;
    signal: AbortSignal;
    /**
     * v1.16 — per-call model override hint (the wire
     * `ExecuteInput.verifierModel`). Runtimes that support per-call
     * model overrides (envoy-harness's host factory) use this to
     * build an agent with a different model than the runtime default.
     * Runtimes that don't support overrides ignore it.
     */
    providerHint?: string;
}) => Agent;
/** Sign an unsigned wire `AgentResult` with the node's owner key. */
export type SignResultFn = (unsigned: WireAgentResult) => SignedAgentResult;
export interface EnvoyHarnessAdapterInput {
    /** Factory that builds a fresh `Agent` per `execute()`. */
    buildAgent: BuildAgentFn;
    /** Sign an unsigned wire `AgentResult`. The node provides the key. */
    signResult: SignResultFn;
    /** The node's agent peerId. Stamped into every result. */
    workerPeerId: string;
    /**
     * Optional: env's runtime version. Default:
     * `ENVOY_HARNESS_VERSION` ("0.0.0").
     */
    runtimeVersion?: string;
    /**
     * Optional: prompt builder. Default: a Team-job-shaped
     * prompt that mirrors the design §11 layout (skill hint
     * + objective + tool set + "produce a useful result").
     */
    buildPrompt?: (input: ExecuteInput) => string;
    /**
     * F9.5: optional cross-verify closure. When set,
     * `verify()` calls it AFTER the local verifier and
     * concatenates the cross verdicts with the local
     * ones. Returns the combined array (per the
     * `AgentAdapter.verify()` contract: `Verdict[]`).
     *
     * The orchestrator collapses the combined array
     * with `combineVerdicts(verdicts)` (envoy-harness's
     * `verifier/index.ts`).
     *
     * **Default factory:** `defaultCrossVerify(otherAdapter)`
     * re-runs the same skill on a different
     * `AgentAdapter` (typically a second
     * `EnvoyHarnessAdapter` with a different
     * `ModelAdapter`) and returns the local
     * verifier's verdicts for the new result.
     */
    crossVerifyWith?: CrossVerifyFn;
}
/**
 * The reference `AgentAdapter` for envoy-harness. The
 * adapter is the bridge between the local harness
 * (Package 1) and the mesh (Package 2 +
 * `@envoymesh/agent-adapter`).
 */
export declare class EnvoyHarnessAdapter implements AgentAdapter {
    readonly runtime: "envoy-harness";
    private readonly buildAgent;
    private readonly signResult;
    private readonly workerPeerId;
    private readonly runtimeVersion;
    private readonly buildPrompt;
    /** F9.5: optional cross-verify closure. */
    private readonly crossVerifyWith;
    constructor(input: EnvoyHarnessAdapterInput);
    /** The catalog of skills this adapter advertises. */
    describeSkills(): {
        skillId: string;
        description: string;
        maxSensitivity: "public" | "friends" | "private";
        tags: string[];
        costCeilingUsd?: number | undefined;
    }[];
    /**
     * Build an unsigned `CapabilityManifest` for broadcast.
     * The orchestrator signs with the owner's key (not the
     * adapter's). See `AgentAdapter.buildManifest` doc.
     */
    buildManifest(input: BuildManifestInput): Promise<CapabilityManifest>;
    /**
     * Run a skill. The adapter builds a local `Agent` via
     * the `buildAgent` factory, runs the skill's objective,
     * translates the result, and signs it.
     *
     * **Cancellation:** `input.signal` is forwarded to the
     * agent. The agent's `abort()` is called when the
     * signal fires. (The harness's agent loop respects the
     * signal at every iteration boundary.)
     *
     * **Cost ceiling:** the orchestrator's
     * `chain-budget-ledger` is the authoritative gate. The
     * adapter passes `costCeilingUsd` to the agent as
     * `maxCostUsd` (F7.5) so the harness aborts when the
     * accumulated cost exceeds the ceiling.
     */
    execute(input: ExecuteInput): Promise<SignedAgentResult>;
    /**
     * Runtime-specific verifier. Wires the local verifier
     * rules (F1.4d) to the wire `SignedAgentResult`:
     * decodes the content blocks (text + structured tool
     * calls/results) back to the local shape, runs the
     * 6 default rules, returns the verdicts.
     *
     * **Sandbox policy:** the wire doesn't carry the
     * worker's effective sandbox; `runLocalVerifier`
     * defaults to a safe `read-only` policy (the
     * `sandboxRespectedRule` is a no-op against that).
     * The full lossless local result is in
     * `SignedAgentResult.raw` for audit.
     *
     * **Cross-verify (F9.5):** when `crossVerifyWith` is
     * set, this method ALSO calls the cross-verify
     * closure and concatenates the cross verdicts with
     * the local ones. The orchestrator collapses the
     * combined array with `combineVerdicts(verdicts)`.
     */
    verify(input: VerifyInput): Promise<Verdict[]>;
}
/**
 * Build a default `buildAgent` factory. The factory:
 * 1. Creates a fresh `Session` per `execute()`.
 * 2. Builds a `ToolRegistry` with the skill's tool subset
 *    from `BUILTIN_TOOLS`.
 * 3. Constructs an `Agent` with the model, registry, and
 *    cost ceiling.
 *
 * The model is taken from the closure's `model` parameter
 * (the same `EnvoyHarnessAdapterInput.model`).
 *
 * **Optional `meshSubmitter`:** when provided, the
 * `Agent` is constructed with a `meshSubmitter` so the
 * sub-agent's `task` tool fires through the host's
 * sub-agent pipeline (typically a
 * `LocalCrossRuntimeSubmitter` + `LocalRuntimeRegistry`
 * for cross-runtime delegation). Default: no submitter →
 * no `task` tool (sub-agents can't spawn sub-sub-agents).
 * The mesh's design invariant #9 ("sub-agents are NEW
 * sessions, even local") still holds — the sub-agent's
 * session is fresh, the parent's session is not shared.
 *
 * **Optional `bClassTools`:** Phase 8 / Step 3 — the
 * 3 B-class skills (sponsor-friend / peer-list /
 * relay-status) are exposed as additional BUILTIN
 * tools. The host (EnvoyMesh's
 * `createRealEnvoyHarnessRuntime`) builds the deps
 * for each tool and passes them in. Per-skill
 * registration: the factory checks each tool's name
 * against the skill's tool set (per
 * `getToolsForSkill`); only matching tools are
 * registered for the current skill.
 *
 * **Why the per-skill filter:** the model sees a
 * different tool set per skill (e.g. `code-review`
 * gets `read_file`; `peer-list` gets `list_peers`).
 * The bClassTools are no exception: when the
 * orchestrator's `requiredSkill` is `code-edit`, the
 * model does NOT see `sponsor_friend`. The
 * registration is per-skill, not per-factory.
 */
export declare function defaultBuildAgentFactory(opts: {
    model: ModelAdapter;
    cwd?: string;
    /** Phase 8 Step 2 / b3 — sub-agent's `task` tool
     *  routes through this `MeshSubmitter`. Omit to
     *  skip the `task` tool. */
    meshSubmitter?: MeshSubmitter;
    /** Phase 8 / Step 3 — the 3 B-class tools
     *  (sponsor_friend / list_peers / relay_status).
     *  The host builds the deps (mesh / profile /
     *  config / audit) and passes them in. Omit
     *  to disable B-class tools for this agent. */
    bClassTools?: ReadonlyArray<Tool>;
    /**
     * Phase G / 12b — optional live AskHandler (e.g. ACP →
     * pi:proposal). Resolved per Agent construction so the
     * host can swap the bridge between asks.
     */
    getAskHandler?: () => AskHandler | undefined;
    /**
     * When `getAskHandler` is set, PreToolUse asks only when
     * this returns true. Default: ask for every tool.
     */
    shouldAskTool?: (toolName: string, args?: unknown) => boolean;
}): BuildAgentFn;
/**
 * Phase 8 / Step 6 — `buildEnvoyHarnessAdapterWithCrossVerify`.
 *
 * The EnvoyMesh host's `agent-runtime-envoy/factory.ts`
 * uses this factory to wire envoy-harness with cross-
 * verify on the OpenClaw runtime. The factory:
 * 1. Constructs the `EnvoyHarnessAdapter` with the
 *    usual inputs (buildAgent, signResult, workerPeerId).
 * 2. Adds `crossVerifyWith: defaultCrossVerify(openClawAdapter)`
 *    so `adapter.verify(input)` re-runs the same
 *    skill on the OpenClaw adapter and returns the
 *    local verifier's verdicts for the new result.
 *
 * **Why the factory lives in the bridge, not the host:**
 * the bridge is the seam that knows about both
 * envoy-harness's local verifier rules and the
 * `defaultCrossVerify` closure. The host just hands
 * in the OpenClaw adapter; the bridge composes.
 *
 * **Why the cross adapter is the OpenClaw runtime:**
 * the Q4 (a) design intent is "envoy-writes +
 * OpenClaw-verifies". The orchestrator's
 * `chain-verify-loop` does this at the orchestrator
 * level (escalation step); this factory provides
 * the same primitive at the adapter level (the
 * `verify()` method). The two paths are
 * complementary — the adapter-level path is for
 * callers that want a self-contained cross (e.g.
 * `node-service-impl`'s test seam); the
 * orchestrator-level path is for production Team
 * jobs.
 *
 * **v0 limits (inherited from F9.5 `defaultCrossVerify`):**
 * - `inputArtifacts` is NOT re-passed (the cross
 *   adapter may not have access to the same files;
 *   v0 trusts the worker to include any needed
 *   context in the result content).
 * - `costCeilingUsd: 0` (the orchestrator is the
 *   authoritative budget gate; v0 cross-verify
 *   runs for free to keep the cost predictable).
 * - `deadlineMs: 30_000` (tight; cross-verify
 *   should be fast or the orchestrator escalates).
 *
 * **Stability:** additive. Existing callers that
 * pass `crossVerifyWith` directly are unchanged.
 */
export interface BuildEnvoyHarnessAdapterWithCrossVerifyInput extends EnvoyHarnessAdapterInput {
    /**
     * The OpenClaw adapter (or any other
     * `AgentAdapter`) used as the cross-verifier.
     * The factory wires
     * `defaultCrossVerify(openClawAdapter)` so the
     * adapter's `verify()` re-runs the same skill
     * on the cross adapter.
     */
    openClawAdapter: AgentAdapter;
    /**
     * v1.16 — optional per-call model override hint for the cross
     * adapter (cross-model-on-same-runtime). When set, the factory's
     * `defaultCrossVerify` forwards it as `ExecuteInput.verifierModel`
     * so a same-runtime verifier (e.g. envoy-harness + claude-instant)
     * can honor it. Optional and additive; omit for the v1.8
     * cross-runtime behavior.
     */
    verifierProviderHint?: string;
}
export declare function buildEnvoyHarnessAdapterWithCrossVerify(input: BuildEnvoyHarnessAdapterWithCrossVerifyInput): EnvoyHarnessAdapter;
//# sourceMappingURL=adapter.d.ts.map