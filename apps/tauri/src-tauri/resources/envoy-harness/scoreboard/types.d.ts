/**
 * Scoreboard types (§13 of the design).
 *
 * **What is the scoreboard?** A peer-local, append-only log of
 * every self-evolution cycle's outcome. Each entry records what
 * hypothesis was tested, what the pass rate was before and after,
 * and whether the change was kept or reverted.
 *
 * **Why append-only?** The scoreboard is the audit trail. A peer
 * can replay their evolution history by reading the file from
 * the top. Truncation is a separate, explicit operation; cycle
 * writes never delete prior entries.
 *
 * **Why a separate module from `types.ts`?** The scoreboard is
 * specific to self-evolution; keeping it out of the core type
 * file means the core types stay small and don't drag in the
 * YAML / file I/O surface.
 *
 * **YAML, not JSON:** the design specifies `verifier-scoreboard.yaml`.
 * YAML is human-editable, supports comments, and round-trips
 * through git without noise.
 *
 * **Stability:** `ScoreboardEntry` is the on-disk format.
 * Adding optional fields is additive; renaming existing fields
 * is a major version bump.
 */
import { z } from "zod";
import type { VerifierRule } from "../verifier/index.js";
/**
 * One cycle's outcome. Written to `verifier-scoreboard.yaml` after
 * every cycle (kept or reverted). The `ownerSignature` is the
 * cryptographic anchor — without it, a malicious process could
 * rewrite the scoreboard.
 *
 * **v0 signature:** a SHA-256 of the canonical JSON payload.
 * Real Ed25519 signing is a follow-up (requires the owner key,
 * which is a separate concern; see `notes/pending/owner-key.md`).
 */
export declare const ScoreboardEntrySchema: z.ZodObject<{
    /** Monotonic version. Starts at 1; never resets. */
    version: z.ZodNumber;
    /** The hypothesis the model proposed, in plain English. */
    hypothesis: z.ZodString;
    /** SHA-256 hash of the ruleset that was applied for this cycle. */
    rulesetHash: z.ZodString;
    /** Mean verifier score across the benchmark, in [0, 1]. */
    meanScore: z.ZodNumber;
    /** Pass rate BEFORE applying the change, in [0, 1]. */
    passRateBefore: z.ZodNumber;
    /** Pass rate AFTER applying the change, in [0, 1]. */
    passRateAfter: z.ZodNumber;
    /** Number of benchmark tasks run. */
    nRuns: z.ZodNumber;
    /** Whether the candidate was adopted or rolled back. */
    status: z.ZodEnum<["kept", "reverted"]>;
    /** Cryptographic anchor. v0: SHA-256 hash. Phase 2+: Ed25519. */
    ownerSignature: z.ZodString;
    /** ISO 8601 timestamp. */
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "kept" | "reverted";
    version: number;
    hypothesis: string;
    rulesetHash: string;
    meanScore: number;
    passRateBefore: number;
    passRateAfter: number;
    nRuns: number;
    ownerSignature: string;
    createdAt: string;
}, {
    status: "kept" | "reverted";
    version: number;
    hypothesis: string;
    rulesetHash: string;
    meanScore: number;
    passRateBefore: number;
    passRateAfter: number;
    nRuns: number;
    ownerSignature: string;
    createdAt: string;
}>;
export type ScoreboardEntry = z.infer<typeof ScoreboardEntrySchema>;
/** The whole scoreboard is a list of entries. */
export declare const ScoreboardSchema: z.ZodArray<z.ZodObject<{
    /** Monotonic version. Starts at 1; never resets. */
    version: z.ZodNumber;
    /** The hypothesis the model proposed, in plain English. */
    hypothesis: z.ZodString;
    /** SHA-256 hash of the ruleset that was applied for this cycle. */
    rulesetHash: z.ZodString;
    /** Mean verifier score across the benchmark, in [0, 1]. */
    meanScore: z.ZodNumber;
    /** Pass rate BEFORE applying the change, in [0, 1]. */
    passRateBefore: z.ZodNumber;
    /** Pass rate AFTER applying the change, in [0, 1]. */
    passRateAfter: z.ZodNumber;
    /** Number of benchmark tasks run. */
    nRuns: z.ZodNumber;
    /** Whether the candidate was adopted or rolled back. */
    status: z.ZodEnum<["kept", "reverted"]>;
    /** Cryptographic anchor. v0: SHA-256 hash. Phase 2+: Ed25519. */
    ownerSignature: z.ZodString;
    /** ISO 8601 timestamp. */
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "kept" | "reverted";
    version: number;
    hypothesis: string;
    rulesetHash: string;
    meanScore: number;
    passRateBefore: number;
    passRateAfter: number;
    nRuns: number;
    ownerSignature: string;
    createdAt: string;
}, {
    status: "kept" | "reverted";
    version: number;
    hypothesis: string;
    rulesetHash: string;
    meanScore: number;
    passRateBefore: number;
    passRateAfter: number;
    nRuns: number;
    ownerSignature: string;
    createdAt: string;
}>, "many">;
export type Scoreboard = z.infer<typeof ScoreboardSchema>;
/**
 * A record of "we tried this peer's hypothesis, and the local
 * 5-step gate said yes/no." Append-only, separate from the
 * main `Scoreboard` so a federated pull can't pollute the
 * local cycle counter.
 *
 * **Why a separate file?** the main scoreboard is the local
 * cycle log. Federated evaluations are a different concern —
 * they record "peer X's hypothesis Y, evaluated locally, the
 * local gate said Z". Mixing them would make the local cycle
 * counter meaningless.
 *
 * **What `localEntry` references:** the LOCAL `ScoreboardEntry`
 * that the federated evaluation produced. The link is
 * `(localEntry.version, peerId, sourceEntry.version)` — three
 * fields, all unique together. v0 doesn't enforce uniqueness;
 * the operator inspects the file to deduplicate.
 */
export declare const FederatedAdoptionRecordSchema: z.ZodObject<{
    /** The peer that proposed the candidate. */
    peerId: z.ZodString;
    /** The peer's scoreboard entry (the source of the candidate). */
    sourceEntry: z.ZodObject<{
        version: z.ZodNumber;
        hypothesis: z.ZodString;
        rulesetHash: z.ZodString;
        passRateAfter: z.ZodNumber;
        ownerSignature: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    }, {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    }>;
    /** The local scoreboard entry produced by the evaluation.
     *  Absent when the local cycle errored before producing one. */
    localEntry: z.ZodOptional<z.ZodObject<{
        version: z.ZodNumber;
        passRateBefore: z.ZodNumber;
        passRateAfter: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    }, {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    }>>;
    /** Whether the local gate kept the candidate. */
    kept: z.ZodBoolean;
    /** ISO 8601 timestamp. */
    adoptedAt: z.ZodString;
    /**
     * Optional reason (for rejected cases). e.g.
     * "local-pass-rate-did-not-improve" or "local-cycle-error: ..."
     */
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kept: boolean;
    peerId: string;
    sourceEntry: {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    };
    adoptedAt: string;
    reason?: string | undefined;
    localEntry?: {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    } | undefined;
}, {
    kept: boolean;
    peerId: string;
    sourceEntry: {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    };
    adoptedAt: string;
    reason?: string | undefined;
    localEntry?: {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    } | undefined;
}>;
export type FederatedAdoptionRecord = z.infer<typeof FederatedAdoptionRecordSchema>;
export declare const FederatedAdoptionsSchema: z.ZodArray<z.ZodObject<{
    /** The peer that proposed the candidate. */
    peerId: z.ZodString;
    /** The peer's scoreboard entry (the source of the candidate). */
    sourceEntry: z.ZodObject<{
        version: z.ZodNumber;
        hypothesis: z.ZodString;
        rulesetHash: z.ZodString;
        passRateAfter: z.ZodNumber;
        ownerSignature: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    }, {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    }>;
    /** The local scoreboard entry produced by the evaluation.
     *  Absent when the local cycle errored before producing one. */
    localEntry: z.ZodOptional<z.ZodObject<{
        version: z.ZodNumber;
        passRateBefore: z.ZodNumber;
        passRateAfter: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    }, {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    }>>;
    /** Whether the local gate kept the candidate. */
    kept: z.ZodBoolean;
    /** ISO 8601 timestamp. */
    adoptedAt: z.ZodString;
    /**
     * Optional reason (for rejected cases). e.g.
     * "local-pass-rate-did-not-improve" or "local-cycle-error: ..."
     */
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kept: boolean;
    peerId: string;
    sourceEntry: {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    };
    adoptedAt: string;
    reason?: string | undefined;
    localEntry?: {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    } | undefined;
}, {
    kept: boolean;
    peerId: string;
    sourceEntry: {
        version: number;
        hypothesis: string;
        rulesetHash: string;
        passRateAfter: number;
        ownerSignature: string;
    };
    adoptedAt: string;
    reason?: string | undefined;
    localEntry?: {
        version: number;
        passRateBefore: number;
        passRateAfter: number;
    } | undefined;
}>, "many">;
export type FederatedAdoptions = z.infer<typeof FederatedAdoptionsSchema>;
/**
 * A versioned set of verifier rules. The `hash` is computed
 * deterministically from the rules' names and short summaries;
 * the full rule bodies live in code (TypeScript) and are not
 * serialized.
 *
 * **Why not serialize the rule bodies?** The rules are
 * deterministic TypeScript functions. Re-loading them from disk
 * is brittle (the file would have to re-execute the same code).
 * The scoreboard only needs to know "did the ruleset change?",
 * not the bodies themselves.
 */
export interface VerifierRuleset {
    /** SHA-256 hash of the rules (names + summaries + order). */
    hash: string;
    /** The rules in order. */
    rules: ReadonlyArray<VerifierRule>;
}
/**
 * One task in the frozen benchmark. The benchmark is the
 * evaluation set the self-evolution protocol runs against;
 * it must be FROZEN (no edits during a cycle) so the pass
 * rate is comparable across cycles.
 *
 * **Why the `goldOutput` is optional:** in v0 the benchmark
 * checks whether the verifier returns `kind: 'pass'`, not
 * whether the output matches gold. Gold comparison is a
 * Phase 4 concern.
 */
export declare const BenchmarkTaskSchema: z.ZodObject<{
    /** Stable task id. */
    id: z.ZodString;
    /** The user objective (what the worker was asked to do). */
    objective: z.ZodString;
    /**
     * Optional gold output. When present, the benchmark
     * compares the worker's `content` against this. v0: ignored.
     */
    goldOutput: z.ZodOptional<z.ZodString>;
    /**
     * Optional expected verdict. When present, the benchmark
     * requires `verdict.kind === expectedVerdict`. Useful for
     * negative tests (e.g. "this should be a fail").
     *
     * **Why an enum, not a `z.literal` union?** The discriminated
     * union's `kind` field doesn't have a `shape` (zod limitation).
     * The enum is the canonical list of `Verdict.kind` values.
     */
    expectedVerdict: z.ZodOptional<z.ZodEnum<["pass", "partial", "fail", "disputed"]>>;
    /**
     * Pre-built `AgentResult` to feed the verifier. If absent,
     * the benchmark runner constructs one from a stub. v0:
     * `stub` is the only supported value.
     */
    stubKind: z.ZodDefault<z.ZodEnum<["empty", "ok", "off-topic", "forbidden-path"]>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    objective: string;
    stubKind: "ok" | "empty" | "off-topic" | "forbidden-path";
    goldOutput?: string | undefined;
    expectedVerdict?: "pass" | "partial" | "fail" | "disputed" | undefined;
}, {
    id: string;
    objective: string;
    goldOutput?: string | undefined;
    expectedVerdict?: "pass" | "partial" | "fail" | "disputed" | undefined;
    stubKind?: "ok" | "empty" | "off-topic" | "forbidden-path" | undefined;
}>;
export type BenchmarkTask = z.infer<typeof BenchmarkTaskSchema>;
export declare const BenchmarkSchema: z.ZodObject<{
    /** Benchmark name. */
    name: z.ZodString;
    /** The frozen test set, in order. */
    tasks: z.ZodArray<z.ZodObject<{
        /** Stable task id. */
        id: z.ZodString;
        /** The user objective (what the worker was asked to do). */
        objective: z.ZodString;
        /**
         * Optional gold output. When present, the benchmark
         * compares the worker's `content` against this. v0: ignored.
         */
        goldOutput: z.ZodOptional<z.ZodString>;
        /**
         * Optional expected verdict. When present, the benchmark
         * requires `verdict.kind === expectedVerdict`. Useful for
         * negative tests (e.g. "this should be a fail").
         *
         * **Why an enum, not a `z.literal` union?** The discriminated
         * union's `kind` field doesn't have a `shape` (zod limitation).
         * The enum is the canonical list of `Verdict.kind` values.
         */
        expectedVerdict: z.ZodOptional<z.ZodEnum<["pass", "partial", "fail", "disputed"]>>;
        /**
         * Pre-built `AgentResult` to feed the verifier. If absent,
         * the benchmark runner constructs one from a stub. v0:
         * `stub` is the only supported value.
         */
        stubKind: z.ZodDefault<z.ZodEnum<["empty", "ok", "off-topic", "forbidden-path"]>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        objective: string;
        stubKind: "ok" | "empty" | "off-topic" | "forbidden-path";
        goldOutput?: string | undefined;
        expectedVerdict?: "pass" | "partial" | "fail" | "disputed" | undefined;
    }, {
        id: string;
        objective: string;
        goldOutput?: string | undefined;
        expectedVerdict?: "pass" | "partial" | "fail" | "disputed" | undefined;
        stubKind?: "ok" | "empty" | "off-topic" | "forbidden-path" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    tasks: {
        id: string;
        objective: string;
        stubKind: "ok" | "empty" | "off-topic" | "forbidden-path";
        goldOutput?: string | undefined;
        expectedVerdict?: "pass" | "partial" | "fail" | "disputed" | undefined;
    }[];
}, {
    name: string;
    tasks: {
        id: string;
        objective: string;
        goldOutput?: string | undefined;
        expectedVerdict?: "pass" | "partial" | "fail" | "disputed" | undefined;
        stubKind?: "ok" | "empty" | "off-topic" | "forbidden-path" | undefined;
    }[];
}>;
export type Benchmark = z.infer<typeof BenchmarkSchema>;
/**
 * What the benchmark runner returns. `passRate` is the ratio
 * of `verdict.kind === 'pass'` across all tasks; `meanScore`
 * is the mean of `verdict.score` for `pass` verdicts (or 0
 * for non-pass).
 *
 * **Why both?** `passRate` is what we optimize on (the cycle
 * keeps the change iff `after.passRate > before.passRate`).
 * `meanScore` is for human inspection — a 100% pass rate with
 * a 0.5 mean is suspicious.
 */
export interface BenchmarkResult {
    passRate: number;
    meanScore: number;
    nRuns: number;
    /** Per-task pass/fail, for diagnostics. */
    tasks: ReadonlyArray<{
        id: string;
        pass: boolean;
    }>;
}
//# sourceMappingURL=types.d.ts.map