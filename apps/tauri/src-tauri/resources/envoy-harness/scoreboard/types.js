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
// ---------------------------------------------------------------------------
// ScoreboardEntry — the audit-trail record
// ---------------------------------------------------------------------------
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
export const ScoreboardEntrySchema = z.object({
    /** Monotonic version. Starts at 1; never resets. */
    version: z.number().int().positive(),
    /** The hypothesis the model proposed, in plain English. */
    hypothesis: z.string().min(1),
    /** SHA-256 hash of the ruleset that was applied for this cycle. */
    rulesetHash: z.string().min(1),
    /** Mean verifier score across the benchmark, in [0, 1]. */
    meanScore: z.number().min(0).max(1),
    /** Pass rate BEFORE applying the change, in [0, 1]. */
    passRateBefore: z.number().min(0).max(1),
    /** Pass rate AFTER applying the change, in [0, 1]. */
    passRateAfter: z.number().min(0).max(1),
    /** Number of benchmark tasks run. */
    nRuns: z.number().int().nonnegative(),
    /** Whether the candidate was adopted or rolled back. */
    status: z.enum(["kept", "reverted"]),
    /** Cryptographic anchor. v0: SHA-256 hash. Phase 2+: Ed25519. */
    ownerSignature: z.string().min(1),
    /** ISO 8601 timestamp. */
    createdAt: z.string().datetime(),
});
/** The whole scoreboard is a list of entries. */
export const ScoreboardSchema = z.array(ScoreboardEntrySchema);
// ---------------------------------------------------------------------------
// FederatedAdoptionRecord — the audit trail of federated pulls (§13.3)
// ---------------------------------------------------------------------------
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
export const FederatedAdoptionRecordSchema = z.object({
    /** The peer that proposed the candidate. */
    peerId: z.string().min(1),
    /** The peer's scoreboard entry (the source of the candidate). */
    sourceEntry: z.object({
        version: z.number().int().positive(),
        hypothesis: z.string().min(1),
        rulesetHash: z.string().min(1),
        passRateAfter: z.number().min(0).max(1),
        ownerSignature: z.string().min(1),
    }),
    /** The local scoreboard entry produced by the evaluation.
     *  Absent when the local cycle errored before producing one. */
    localEntry: z.object({
        version: z.number().int().positive(),
        passRateBefore: z.number().min(0).max(1),
        passRateAfter: z.number().min(0).max(1),
    }).optional(),
    /** Whether the local gate kept the candidate. */
    kept: z.boolean(),
    /** ISO 8601 timestamp. */
    adoptedAt: z.string().datetime(),
    /**
     * Optional reason (for rejected cases). e.g.
     * "local-pass-rate-did-not-improve" or "local-cycle-error: ..."
     */
    reason: z.string().optional(),
});
export const FederatedAdoptionsSchema = z.array(FederatedAdoptionRecordSchema);
// ---------------------------------------------------------------------------
// Benchmark — the frozen test set
// ---------------------------------------------------------------------------
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
export const BenchmarkTaskSchema = z.object({
    /** Stable task id. */
    id: z.string().min(1),
    /** The user objective (what the worker was asked to do). */
    objective: z.string().min(1),
    /**
     * Optional gold output. When present, the benchmark
     * compares the worker's `content` against this. v0: ignored.
     */
    goldOutput: z.string().optional(),
    /**
     * Optional expected verdict. When present, the benchmark
     * requires `verdict.kind === expectedVerdict`. Useful for
     * negative tests (e.g. "this should be a fail").
     *
     * **Why an enum, not a `z.literal` union?** The discriminated
     * union's `kind` field doesn't have a `shape` (zod limitation).
     * The enum is the canonical list of `Verdict.kind` values.
     */
    expectedVerdict: z.enum(["pass", "partial", "fail", "disputed"]).optional(),
    /**
     * Pre-built `AgentResult` to feed the verifier. If absent,
     * the benchmark runner constructs one from a stub. v0:
     * `stub` is the only supported value.
     */
    stubKind: z.enum(["empty", "ok", "off-topic", "forbidden-path"]).default("ok"),
});
export const BenchmarkSchema = z.object({
    /** Benchmark name. */
    name: z.string().min(1),
    /** The frozen test set, in order. */
    tasks: z.array(BenchmarkTaskSchema).min(1),
});
//# sourceMappingURL=types.js.map