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
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { hashRuleset, readScoreboard, signEntry, } from "./index.js";
import { combineVerdicts, runVerifierRules } from "../verifier/index.js";
// ---------------------------------------------------------------------------
// Default implementations
// ---------------------------------------------------------------------------
/**
 * A model-backed `HypothesisProvider`. The model receives the
 * prompt built by `buildHypothesisPrompt` (the contamination
 * guard) and returns a JSON-serialized hypothesis.
 *
 * **Why JSON output?** Easier to parse than free-form text.
 * The model is told to return a specific shape; failures
 * to parse are caught and treated as "no actionable hypothesis".
 */
export class ModelHypothesisProvider {
    model;
    constructor(model) {
        this.model = model;
    }
    async proposeHypothesis(input) {
        const prompt = buildHypothesisPrompt(input);
        const response = await this.model.complete({
            messages: [
                { role: "user", content: [{ type: "text", text: prompt }] },
            ],
            tools: [],
        });
        return parseHypothesisFromLlm(response, input.currentRules);
    }
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
export function buildHypothesisPrompt(input) {
    const rulesJson = JSON.stringify(input.currentRules.map((r) => ({ name: r.name, description: r.description })), null, 2);
    const failuresJson = JSON.stringify(input.recentFailures.map((f) => ({
        version: f.version,
        hypothesis: f.hypothesis,
        status: f.status,
        passRateBefore: f.passRateBefore,
        passRateAfter: f.passRateAfter,
    })), null, 2);
    return `You are the self-evolution optimizer for envoy-harness.

# Current ruleset
${rulesJson}

# Recent scoreboard entries
${failuresJson}

# Task
Propose ONE specific, falsifiable change to the RULE SET that would catch
more of the failures above. Be conservative: small, targeted changes only.

Output JSON only, in this exact shape:
{ "text": "<one-sentence hypothesis>", "ruleChanges": [ <full new ruleset> ] }

Constraints:
- ruleChanges is a FULL new ruleset, not a patch: a list of rule names
  chosen from the CURRENT ruleset above. You may reorder, subset, or
  keep the full set — but you MUST NOT invent new rule names (the
  implementation lives in TypeScript; unknown names are rejected).
- Each entry has the shape { "name": "<existing rule name>" }.
- If you cannot propose a meaningful change, output { "text": "no actionable
  hypothesis", "ruleChanges": [] } and the cycle will be recorded as a no-op.`;
}
/**
 * Parse the model's response into a Hypothesis. Tolerant of bad shape.
 *
 * **Rule-name resolution:** every proposed rule name MUST exist in
 * `currentRules`; unknown names reject the whole hypothesis (the model
 * cannot create rule bodies). The `check` implementation is inherited
 * from the current ruleset, so candidates are always executable.
 */
export function parseHypothesisFromLlm(response, currentRules) {
    // Concatenate all text blocks.
    const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    // Find the JSON object in the text (defensive against leading / trailing prose).
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start)
        return null;
    try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (typeof parsed.text !== "string")
            return null;
        if (!Array.isArray(parsed.ruleChanges))
            return null;
        if (parsed.ruleChanges.length === 0) {
            // Explicit "no actionable hypothesis".
            return null;
        }
        // Validate each rule references an EXISTING rule by name and
        // inherit its `check` implementation.
        const byName = new Map(currentRules.map((r) => [r.name, r]));
        const rules = parsed.ruleChanges.map((r) => {
            if (typeof r !== "object" || r === null) {
                throw new Error("rule must be an object");
            }
            const obj = r;
            if (typeof obj.name !== "string" || obj.name.length === 0) {
                throw new Error("rule must have a name");
            }
            const existing = byName.get(obj.name);
            if (!existing) {
                throw new Error(`rule "${obj.name}" is not in the current ruleset (rule bodies are code; only existing rules can be selected)`);
            }
            // Inherit the real implementation. A proposed description
            // (when provided) is kept as metadata; the check is the
            // current rule's check.
            return {
                name: existing.name,
                ...(existing.description !== undefined
                    ? { description: existing.description }
                    : {}),
                check: existing.check,
            };
        });
        return { text: parsed.text, ruleChanges: rules };
    }
    catch {
        return null;
    }
}
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
export class DefaultBenchmarkRunner {
    async run(rules, benchmark) {
        const results = [];
        let scoreSum = 0;
        let scoreCount = 0;
        for (const task of benchmark.tasks) {
            const result = buildStubResult(task);
            const verdicts = await runVerifierRules(result, task.objective, rules);
            const combined = combineVerdicts(verdicts);
            // Pass = verdict.kind === 'pass' AND (no expectedVerdict OR
            // verdict.kind === expectedVerdict). For negative tests
            // (expectedVerdict: 'fail'), the candidate must FAIL.
            const pass = task.expectedVerdict
                ? combined.kind === task.expectedVerdict
                : combined.kind === "pass";
            results.push({ id: task.id, pass });
            if (combined.kind === "pass") {
                scoreSum += combined.score;
                scoreCount++;
            }
        }
        const passed = results.filter((r) => r.pass).length;
        return {
            passRate: results.length === 0 ? 0 : passed / results.length,
            meanScore: scoreCount === 0 ? 0 : scoreSum / scoreCount,
            nRuns: results.length,
            tasks: results,
        };
    }
}
/** Build an `AgentResult` from a `BenchmarkTask.stubKind`. */
function buildStubResult(task) {
    // The metrics field is required (F7.1) but stubs have no
    // cost data — 0 across the board is the safe default.
    const baseMetrics = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    switch (task.stubKind) {
        case "empty":
            return {
                content: [],
                stopReason: "end_turn",
                iterations: 1,
                toolCalls: 0,
                messages: [],
                sandboxPolicy: {
                    mode: "workspace-write",
                    approval: "on-request",
                    backend: "linux-landlock",
                    writableRoots: ["/tmp"],
                    networkAccess: false,
                    slashTmpWritable: true,
                },
                metrics: baseMetrics,
            };
        case "ok":
            return {
                content: [
                    { type: "text", text: `deployed the ${task.objective.split(" ")[0] ?? "thing"} successfully` },
                ],
                stopReason: "end_turn",
                iterations: 1,
                toolCalls: 0,
                messages: [],
                sandboxPolicy: {
                    mode: "workspace-write",
                    approval: "on-request",
                    backend: "linux-landlock",
                    writableRoots: ["/tmp"],
                    networkAccess: false,
                    slashTmpWritable: true,
                },
                metrics: baseMetrics,
            };
        case "off-topic":
            return {
                content: [{ type: "text", text: "completely unrelated content" }],
                stopReason: "end_turn",
                iterations: 1,
                toolCalls: 0,
                messages: [],
                sandboxPolicy: {
                    mode: "workspace-write",
                    approval: "on-request",
                    backend: "linux-landlock",
                    writableRoots: ["/tmp"],
                    networkAccess: false,
                    slashTmpWritable: true,
                },
                metrics: baseMetrics,
            };
        case "forbidden-path":
            return {
                content: [{ type: "text", text: "wrote to /etc/passwd" }],
                stopReason: "end_turn",
                iterations: 1,
                toolCalls: 0,
                messages: [],
                sandboxPolicy: {
                    mode: "workspace-write",
                    approval: "on-request",
                    backend: "linux-landlock",
                    writableRoots: ["/tmp"],
                    networkAccess: false,
                    slashTmpWritable: true,
                },
                metrics: baseMetrics,
            };
    }
}
export class SelfEvolve {
    paths;
    currentRules;
    hypothesisProvider;
    benchmarkRunner;
    feedbackProvider;
    shadowMode;
    recentFailureWindow;
    /** Cap on feedback signals loaded per cycle. */
    feedbackLimit;
    constructor(options) {
        this.paths = options.paths;
        this.currentRules = options.currentRules;
        this.hypothesisProvider = options.hypothesisProvider;
        this.benchmarkRunner = options.benchmarkRunner;
        this.feedbackProvider = options.feedbackProvider;
        this.shadowMode = options.shadowMode ?? true; // default: shadow mode
        this.recentFailureWindow = options.recentFailureWindow ?? 20;
        this.feedbackLimit = 50;
    }
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
    async loadFeedbackSignals() {
        if (this.feedbackProvider === undefined)
            return [];
        try {
            const events = await this.feedbackProvider.list({ limit: this.feedbackLimit });
            return events.map((e) => {
                const score = e.score ??
                    (e.polarity === "up" ? 1 : e.polarity === "down" ? -1 : 0);
                const base = {
                    polarity: e.polarity,
                    score,
                    sessionId: e.sessionId,
                    ts: e.ts,
                };
                return e.messageIndex !== undefined
                    ? { ...base, messageIndex: e.messageIndex }
                    : base;
            });
        }
        catch {
            return [];
        }
    }
    /**
     * Run one cycle of the 5-step protocol. Returns the result
     * (kept, entry, before, after) and writes a `ScoreboardEntry`
     * to the scoreboard file.
     *
     * **Throws:** if the scoreboard file is malformed. Network
     * / model errors propagate to the caller; the cycle is
     * NOT recorded (a partial cycle shouldn't pollute history).
     */
    async runOneCycle() {
        return this.runOneCycleInner({ externalHypothesis: null });
    }
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
    async runOneCycleAgainst(externalHypothesis) {
        return this.runOneCycleInner({ externalHypothesis });
    }
    /**
     * The shared inner loop. `externalHypothesis: null` means
     * "ask the provider"; a non-null value means "use this
     * hypothesis and skip the provider call" (federated path).
     */
    async runOneCycleInner(input) {
        // 1. SNAPSHOT
        const version = await this.nextVersion();
        const snapshotPath = path.join(this.paths.snapshotDir, `v${version}.json`);
        await this.snapshot(snapshotPath);
        // 2. HYPOTHESIZE — skip if external hypothesis given.
        let hypothesis = input.externalHypothesis;
        if (hypothesis === null) {
            const recent = await this.recentFailures(this.recentFailureWindow);
            // F16.2: feed user feedback signals as a scored input to
            // the proposal. The provider MAY ignore them; for
            // headless CI runs (no feedback wired) this is an empty
            // array and the proposal falls back to recent-failures
            // only, which preserves the pre-feedback behavior.
            const feedbackSignals = await this.loadFeedbackSignals();
            hypothesis = await this.hypothesisProvider.proposeHypothesis({
                currentRules: this.currentRules,
                recentFailures: recent,
                feedbackSignals,
            });
            if (!hypothesis) {
                const entry = await this.recordNoOp(version, recent);
                const { readBenchmark } = await import("./storage.js");
                const bench = await readBenchmark(this.paths.benchmark);
                const before = await this.benchmarkRunner.run(this.currentRules, bench);
                return { kept: false, entry, before, after: before };
            }
        }
        // Tag the hypothesis text for federated cycles so the
        // audit trail shows the origin.
        const hypothesisText = input.externalHypothesis !== null
            ? `[federated] ${hypothesis.text}`
            : hypothesis.text;
        // 3. CANDIDATE — write the candidate ruleset.
        const candidatePath = path.join(this.paths.snapshotDir, `v${version}.candidate.json`);
        await this.writeCandidate(candidatePath, hypothesis.ruleChanges);
        // 4. EVALUATE
        const { readBenchmark } = await import("./storage.js");
        const bench = await readBenchmark(this.paths.benchmark);
        const before = await this.benchmarkRunner.run(this.currentRules, bench);
        const after = await this.benchmarkRunner.run(hypothesis.ruleChanges, bench);
        // 5. COMMIT / REVERT — federated cycles NEVER commit, even
        //    when the local gate says "kept". Adoption is a separate
        //    step (§13.3).
        const kept = after.passRate > before.passRate;
        const isFederated = input.externalHypothesis !== null;
        if (kept && !this.shadowMode && !isFederated) {
            await this.commitCandidate(hypothesis.ruleChanges);
        }
        const rulesetHash = await hashRuleset(hypothesis.ruleChanges.map((r) => ({ name: r.name, description: r.description })));
        const baseEntry = {
            version,
            hypothesis: hypothesisText,
            rulesetHash,
            meanScore: after.meanScore,
            passRateBefore: before.passRate,
            passRateAfter: after.passRate,
            nRuns: after.nRuns,
            status: kept ? "kept" : "reverted",
            createdAt: new Date().toISOString(),
        };
        const ownerSignature = await signEntry(baseEntry);
        const entry = { ...baseEntry, ownerSignature };
        await this.appendEntry(entry);
        return { kept, entry, before, after };
    }
    /** Read the most recent N scoreboard entries. */
    async recentFailures(n) {
        const board = await readScoreboard(this.paths.scoreboard);
        return board.slice(-n);
    }
    /** Snapshot the current state to `dest`. */
    async snapshot(dest) {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        // Snapshot the rules (names + descriptions), the scoreboard
        // (audit trail), and the user AGENTS.md (when present) so a
        // future cycle can roll back to this exact state.
        let scoreboard = [];
        try {
            const { readScoreboard } = await import("./storage.js");
            scoreboard = await readScoreboard(this.paths.scoreboard);
        }
        catch {
            // No scoreboard yet — snapshot with an empty one.
        }
        let agentsMd;
        try {
            agentsMd = await fs.readFile(this.paths.agentsMd, "utf8");
        }
        catch {
            // No AGENTS.md yet — omit.
        }
        const payload = {
            timestamp: new Date().toISOString(),
            rules: this.currentRules.map((r) => ({
                name: r.name,
                description: r.description,
            })),
            scoreboard,
            ...(agentsMd !== undefined ? { agentsMd } : {}),
        };
        await fs.writeFile(dest, JSON.stringify(payload, null, 2), "utf8");
    }
    /** The current version (max + 1, or 1 if empty). */
    async nextVersion() {
        const board = await readScoreboard(this.paths.scoreboard);
        if (board.length === 0)
            return 1;
        return Math.max(...board.map((e) => e.version)) + 1;
    }
    /** Commit a candidate ruleset to the live location. */
    async commitCandidate(rules) {
        // v0: ruleset is a code artifact; "committing" means writing
        // the candidate to the ruleset path. Phase 2 may swap this
        // for a git commit or a different storage backend.
        //
        // T1.3: the file format is now versioned. v1 is the
        // current format (an object with `formatVersion` + `rules`).
        // The loader treats a missing `formatVersion` as v0
        // (a bare array) for backward compat with files written
        // before this commit.
        await fs.mkdir(path.dirname(this.paths.ruleset), { recursive: true });
        await fs.writeFile(this.paths.ruleset, JSON.stringify({
            formatVersion: RULESET_FORMAT_VERSION,
            rules: rules.map((r) => ({ name: r.name, description: r.description })),
        }, null, 2), "utf8");
    }
    /** Write the candidate to a snapshot file. */
    async writeCandidate(dest, rules) {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(rules.map((r) => ({ name: r.name, description: r.description })), null, 2), "utf8");
    }
    /** Append an entry to the scoreboard. */
    async appendEntry(entry) {
        const { appendEntry } = await import("./storage.js");
        await appendEntry(this.paths.scoreboard, entry);
    }
    /** Record a no-op cycle (no actionable hypothesis). */
    async recordNoOp(version, _recent) {
        const baseEntry = {
            version,
            hypothesis: "no actionable hypothesis",
            rulesetHash: await hashRuleset(this.currentRules.map((r) => ({ name: r.name, description: r.description }))),
            meanScore: 0,
            passRateBefore: 0,
            passRateAfter: 0,
            nRuns: 0,
            status: "reverted",
            createdAt: new Date().toISOString(),
        };
        const ownerSignature = await signEntry(baseEntry);
        const entry = { ...baseEntry, ownerSignature };
        await this.appendEntry(entry);
        return entry;
    }
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
export const RULESET_FORMAT_VERSION = 1;
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
export async function loadRulesetFromFile(filePath, knownRules) {
    let raw;
    try {
        raw = await fs.readFile(filePath, "utf8");
    }
    catch {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        // T1.3: detect the file format. A bare array is v0
        // (legacy); an object with formatVersion is v1+.
        // Any other shape is malformed.
        let entries;
        if (Array.isArray(parsed)) {
            // v0: bare array.
            entries = parsed;
        }
        else if (typeof parsed === "object" &&
            parsed !== null &&
            "rules" in parsed) {
            // v1: object with formatVersion + rules.
            const obj = parsed;
            if (obj.formatVersion !== undefined &&
                obj.formatVersion !== RULESET_FORMAT_VERSION) {
                const msg = obj.formatVersion === undefined
                    ? "missing formatVersion"
                    : `unsupported formatVersion ${String(obj.formatVersion)} (this build supports version ${RULESET_FORMAT_VERSION})`;
                throw new Error(`loadRulesetFromFile: ${msg} in ${filePath}`);
            }
            if (!Array.isArray(obj.rules)) {
                return null; // malformed v1 (no rules array)
            }
            entries = obj.rules;
        }
        else {
            return null; // unknown shape
        }
        const byName = new Map(knownRules.map((r) => [r.name, r]));
        const resolved = [];
        for (const entry of entries) {
            if (typeof entry !== "object" || entry === null)
                return null;
            const name = entry.name;
            if (typeof name !== "string")
                return null;
            const rule = byName.get(name);
            if (!rule)
                return null; // incompatible with the code ruleset
            resolved.push(rule);
        }
        return resolved.length > 0 ? resolved : null;
    }
    catch (err) {
        // T1.3: forward the formatVersion mismatch error
        // (re-throw); swallow all other errors (return null).
        if (err instanceof Error &&
            err.message.startsWith("loadRulesetFromFile:")) {
            throw err;
        }
        return null;
    }
}
//# sourceMappingURL=self-evolve.js.map