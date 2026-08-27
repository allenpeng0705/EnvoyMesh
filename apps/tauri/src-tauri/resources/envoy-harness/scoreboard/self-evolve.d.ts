/**
 * SelfEvolve — the 5-step protocol (§13 of the design).
 *
 * **The 5 steps:**
 *
 * 1. **SNAPSHOT** — copy the current state (ruleset, scoreboard,
 *    AGENTS.md) into a versioned directory. The snapshot is the
 *    rollback target; a `reverted` entry leaves the snapshot
 *    untouched.
 *
 * 2. **HYPOTHESIZE** — the `HypothesisProvider` (a model, by
 *    default; a stub in tests) reads the recent failures from
 *    the scoreboard and proposes a new ruleset. The proposal is
 *    a FULL ruleset, not a patch — the protocol never operates
 *    on the live state.
 *
 * 3. **CANDIDATE** — write the proposed ruleset to
 *    `v<version>.candidate.json`. The candidate is immutable
 *    once written; if the cycle reverts, the live ruleset is
 *    unchanged.
 *
 * 4. **EVALUATE** — run the benchmark against both the current
 *    ruleset (baseline) and the candidate. The protocol keeps
 *    the candidate iff `candidate.passRate > baseline.passRate`
 *    (strict greater; ties are reverting to be conservative).
 *
 * **Candidates are rule SELECTIONS, not new rule bodies.** The
 * model proposes a (possibly reordered/subset) set of rule NAMES
 * from the current ruleset; `parseHypothesisFromLlm` resolves
 * them back to the real rule objects. v0 fabricated placeholder
 * always-pass `check` functions for names the model invented,
 * which made the "after" pass rate ~1.0 and the protocol always
 * "kept". Rule bodies remain code; evolution optimizes the rule
 * set, not the implementation.
 *
 * 5. **COMMIT / REVERT** — append a `ScoreboardEntry` to the
 *    scoreboard (the audit trail). If kept, copy the candidate
 *    over the live ruleset. If reverted, do nothing (the
 *    snapshot is the rollback target if a future cycle needs
 *    it).
 *
 * **Shadow mode:** the protocol can run without committing
 * changes. The scoreboard entry is still written (the entry's
 * `status: 'kept'` or `'reverted'` reflects what WOULD have
 * happened, not what did). This is how v0 lands: the operator
 * inspects the scoreboard to decide whether to enable
 * committing.
 *
 * **Contamination guard:** the hypothesis prompt is assembled
 * by `buildHypothesisPrompt`, which is tested explicitly to
 * confirm it does NOT include the benchmark or any private
 * data. The guard is enforced by the API — the prompt builder
 * is the only path to the model.
 *
 * **Stability:** the public API is `runOneCycle`, `snapshot`,
 * `proposeHypothesis`, `runBenchmark`, `commitCandidate`. All
 * are stable; new ones are additive.
 */
import { type Benchmark, type BenchmarkResult, type Scoreboard, type ScoreboardEntry } from "./index.js";
import { type VerifierRule } from "../verifier/index.js";
import type { ModelAdapter, ModelResponse } from "../index.js";
/** The paths SelfEvolve reads / writes. All under one peer dir. */
export interface SelfEvolvePaths {
    /** `~/.envoymesh/agent-state/<peer>/verifier-scoreboard.yaml` */
    scoreboard: string;
    /** `~/.envoymesh/agent-state/<peer>/snapshots/` */
    snapshotDir: string;
    /** `~/.envoymesh/agent-state/<peer>/benchmarks/<name>/frozen.yaml` */
    benchmark: string;
    /**
     * The current ruleset (read for snapshotting; written on commit).
     * v0: the ruleset lives in code (DEFAULT_RULES) and the file
     * is just a snapshot. Phase 2 makes this a real editable file.
     */
    ruleset: string;
    /** The user's AGENTS.md. v0: snapshotted, not edited. */
    agentsMd: string;
}
/**
 * The hypothesis provider. In production, this is a model
 * adapter wrapped in a prompt. In tests, it's a stub that
 * returns a predetermined ruleset.
 *
 * **The contamination guard is enforced here:** the input
 * to `proposeHypothesis` must NOT contain the benchmark or
 * any private data. The provider's prompt assembly is the
 * only place that sees both the scoreboard and the current
 * ruleset; the benchmark is never in that scope.
 */
export interface HypothesisProvider {
    proposeHypothesis(input: {
        currentRules: ReadonlyArray<VerifierRule>;
        recentFailures: ReadonlyArray<ScoreboardEntry>;
        /**
         * Optional user feedback signals (from `feedback/record.ts`'s
         * `toSelfEvolveSignals`). Wired in by `SelfEvolve` so the
         * model can see thumbs-up / thumbs-down events when
         * proposing rule changes. The hypothesis provider MAY
         * ignore this when present (e.g. for headless CI runs);
         * a missing field means "no feedback store wired."
         */
        feedbackSignals?: ReadonlyArray<SelfEvolveFeedbackSignal>;
    }): Promise<Hypothesis | null>;
}
/**
 * One user feedback signal (mirrors the shape produced by
 * `feedback/record.ts:toSelfEvolveSignals`). Duplicated here
 * as a structural type so the scoreboard module doesn't pull
 * in the feedback package; the constructor accepts signals of
 * the same shape from any source.
 */
export interface SelfEvolveFeedbackSignal {
    readonly polarity: "up" | "down" | "neutral";
    readonly score: number;
    readonly sessionId: string;
    readonly ts: string;
    readonly messageIndex?: number;
}
/** A hypothesis is a full new ruleset (not a patch). */
export interface Hypothesis {
    text: string;
    ruleChanges: VerifierRule[];
}
/**
 * The benchmark runner. Decoupled from the protocol so tests
 * can supply a stub that returns a predetermined pass rate.
 */
export interface BenchmarkRunner {
    run(rules: ReadonlyArray<VerifierRule>, benchmark: Benchmark): Promise<BenchmarkResult>;
}
/**
 * A model-backed `HypothesisProvider`. The model receives the
 * prompt built by `buildHypothesisPrompt` (the contamination
 * guard) and returns a JSON-serialized hypothesis.
 *
 * **Why JSON output?** Easier to parse than free-form text.
 * The model is told to return a specific shape; failures
 * to parse are caught and treated as "no actionable hypothesis".
 */
export declare class ModelHypothesisProvider implements HypothesisProvider {
    private model;
    constructor(model: ModelAdapter);
    proposeHypothesis(input: {
        currentRules: ReadonlyArray<VerifierRule>;
        recentFailures: ReadonlyArray<ScoreboardEntry>;
    }): Promise<Hypothesis | null>;
}
/**
 * Build the hypothesis prompt. **This is the contamination
 * guard.** The function is `export`ed specifically so the
 * test in 5d can assert that the prompt does not contain
 * the benchmark or any private data.
 *
 * **Safe inputs only:** the function takes only the current
 * ruleset (names + descriptions) and the recent scoreboard
 * entries. It does NOT take the benchmark; even if a caller
 * passes the benchmark, the prompt builder will silently
 * drop it.
 */
export declare function buildHypothesisPrompt(input: {
    currentRules: ReadonlyArray<VerifierRule>;
    recentFailures: ReadonlyArray<ScoreboardEntry>;
}): string;
/**
 * Parse the model's response into a Hypothesis. Tolerant of bad shape.
 *
 * **Rule-name resolution:** every proposed rule name MUST exist in
 * `currentRules`; unknown names reject the whole hypothesis (the model
 * cannot create rule bodies). The `check` implementation is inherited
 * from the current ruleset, so candidates are always executable.
 */
export declare function parseHypothesisFromLlm(response: ModelResponse, currentRules: ReadonlyArray<VerifierRule>): Hypothesis | null;
/**
 * The default benchmark runner. Loads each task's `stubKind`
 * and constructs an `AgentResult` from the corresponding
 * stub. v0: stubs are inline; Phase 2 can run real worker
 * loops for the benchmark.
 *
 * **Why stubs, not real workers?** A benchmark is supposed
 * to be FAST and DETERMINISTIC. A real worker is slow and
 * non-deterministic (model temperature, network, etc.).
 * Stubs give the same input each cycle so pass rates are
 * comparable.
 */
export declare class DefaultBenchmarkRunner implements BenchmarkRunner {
    run(rules: ReadonlyArray<VerifierRule>, benchmark: Benchmark): Promise<BenchmarkResult>;
}
export interface SelfEvolveOptions {
    /** Snapshot + commit target. */
    paths: SelfEvolvePaths;
    /** The current ruleset. v0: `DEFAULT_RULES` from the verifier module. */
    currentRules: ReadonlyArray<VerifierRule>;
    /** The hypothesis provider. v0: a model adapter via `ModelHypothesisProvider`. */
    hypothesisProvider: HypothesisProvider;
    /** The benchmark runner. v0: `new DefaultBenchmarkRunner()`. */
    benchmarkRunner: BenchmarkRunner;
    /**
     * Optional user-feedback provider. When set, the cycle
     * loads recent signals via `toSelfEvolveSignals(feedback.list())`
     * and passes them to the hypothesis provider as a scored
     * input. This is the wiring for the F16.2 "feedback → self-
     * evolution" half of the plan. When absent (e.g. headless
     * CI runs), the cycle falls back to recent-failures only.
     */
    feedbackProvider?: FeedbackSignalProvider;
    /**
     * Shadow mode: never commit, always record. v0 ships in
     * shadow mode by default; production turns this off once
     * the scoreboard history is clean.
     */
    shadowMode?: boolean;
    /**
     * Number of recent failures to feed the hypothesis prompt.
     * Default: 20 (per design §13.1).
     */
    recentFailureWindow?: number;
}
/**
 * Minimal contract for the feedback store. Matches the
 * relevant surface of `feedback/record.ts:createFeedbackStore`
 * so callers can wire it directly without a hard import.
 */
export interface FeedbackSignalProvider {
    list(opts?: {
        limit?: number;
    }): Promise<ReadonlyArray<{
        readonly polarity: "up" | "down" | "neutral";
        readonly score?: number;
        readonly sessionId: string;
        readonly messageIndex?: number;
        readonly ts: string;
        readonly note?: string;
    }>>;
    /**
     * Shadow mode: never commit, always record. v0 ships in
     * shadow mode by default; production turns this off once
     * the scoreboard history is clean.
     */
    shadowMode?: boolean;
    /**
     * Number of recent failures to feed the hypothesis prompt.
     * Default: 20 (per design §13.1).
     */
    recentFailureWindow?: number;
}
export interface RunOneCycleResult {
    /** Whether the candidate was kept (would have been, in shadow mode). */
    kept: boolean;
    /** The scoreboard entry written by this cycle. */
    entry: ScoreboardEntry;
    /** The benchmark result BEFORE applying the change. */
    before: BenchmarkResult;
    /** The benchmark result AFTER applying the change. */
    after: BenchmarkResult;
}
export declare class SelfEvolve {
    private paths;
    private currentRules;
    private hypothesisProvider;
    private benchmarkRunner;
    private feedbackProvider;
    private shadowMode;
    private recentFailureWindow;
    /** Cap on feedback signals loaded per cycle. */
    private feedbackLimit;
    constructor(options: SelfEvolveOptions);
    /**
     * Load recent feedback signals and map them to the
     * contamination-guarded shape. Returns an empty array
     * if no provider is wired or the load fails — feedback is
     * a soft signal; never fail a cycle because of it.
     *
     * The mapping is intentionally inline (vs. importing
     * `toSelfEvolveSignals`) to keep the scoreboard module
     * independent of the feedback package. The shape matches
     * `feedback/record.ts:toSelfEvolveSignals` output.
     */
    loadFeedbackSignals(): Promise<ReadonlyArray<SelfEvolveFeedbackSignal>>;
    /**
     * Run one cycle of the 5-step protocol. Returns the result
     * (kept, entry, before, after) and writes a `ScoreboardEntry`
     * to the scoreboard file.
     *
     * **Throws:** if the scoreboard file is malformed. Network
     * / model errors propagate to the caller; the cycle is
     * NOT recorded (a partial cycle shouldn't pollute history).
     */
    runOneCycle(): Promise<RunOneCycleResult>;
    /**
     * Run the 5-step protocol with a fixed (external) hypothesis.
     * Used by the federated layer (§13.3) to evaluate a peer's
     * candidate against the local benchmark.
     *
     * **Differs from `runOneCycle` in two ways:**
     *
     * 1. **No provider call.** The hypothesis is given; step 2
     *    (HYPOTHESIZE) is skipped entirely.
     * 2. **Never commits.** Even in non-shadow mode, a federated
     *    cycle does NOT replace the local ruleset. Adoption is
     *    a separate, opt-in step (F6.3 / F6.4).
     *
     * The result is still recorded as a regular `ScoreboardEntry`
     * (the cycle counter advances). The hypothesis text is
     * prefixed with `[federated]` so the audit trail shows the
     * origin.
     */
    runOneCycleAgainst(externalHypothesis: Hypothesis): Promise<RunOneCycleResult>;
    /**
     * The shared inner loop. `externalHypothesis: null` means
     * "ask the provider"; a non-null value means "use this
     * hypothesis and skip the provider call" (federated path).
     */
    private runOneCycleInner;
    /** Read the most recent N scoreboard entries. */
    recentFailures(n: number): Promise<Scoreboard>;
    /** Snapshot the current state to `dest`. */
    snapshot(dest: string): Promise<void>;
    /** The current version (max + 1, or 1 if empty). */
    nextVersion(): Promise<number>;
    /** Commit a candidate ruleset to the live location. */
    commitCandidate(rules: ReadonlyArray<VerifierRule>): Promise<void>;
    /** Write the candidate to a snapshot file. */
    private writeCandidate;
    /** Append an entry to the scoreboard. */
    private appendEntry;
    /** Record a no-op cycle (no actionable hypothesis). */
    private recordNoOp;
}
/**
 * The on-disk format version for committed rulesets.
 *
 * **v1 (T1.3):** `{ formatVersion: 1, rules: [{ name, description }, ...] }`.
 *
 * **v0 (legacy):** bare array `[{ name, description }, ...]`.
 *   The loader treats a missing `formatVersion` field as v0
 *   (the file is a bare array). This is a forward-compat
 *   concession for files written before this commit (none
 *   exist in production — the ruleset file just shipped
 *   in F14.1 / T1.3).
 *
 * **Why version the ruleset file:** the same forward-compat
 * argument as T1.2 (the persisted-session JSONL). v2+ may
 * add per-rule overrides (severity, weight, scope). v2+
 * may also embed the `check` body (instead of selecting
 * from `knownRules` by name). Pre-release is the right
 * time to add the field.
 */
export declare const RULESET_FORMAT_VERSION: 1;
/**
 * Load a committed ruleset file (list of `{ name, description }`
 * written by `commitCandidate`) and resolve the names back to real
 * rule objects from `knownRules`. Returns `null` when the file
 * doesn't exist or no names resolve (fresh install / incompatible
 * ruleset). This makes `envoy self-evolve` build on the committed
 * rule set instead of always starting from `DEFAULT_RULES`.
 *
 * **Format handling (T1.3):**
 * - v1 (current): `{ formatVersion: 1, rules: [...] }`
 * - v0 (legacy, pre-T1.3): bare array `[{ name, ... }, ...]`
 * - Any other `formatVersion` value: throw a clear error.
 */
export declare function loadRulesetFromFile(filePath: string, knownRules: ReadonlyArray<VerifierRule>): Promise<ReadonlyArray<VerifierRule> | null>;
//# sourceMappingURL=self-evolve.d.ts.map