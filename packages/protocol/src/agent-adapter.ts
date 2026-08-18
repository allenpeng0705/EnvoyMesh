/**
 * Mesh Adapter Pattern (MAP) — per-adapter wire surface.
 *
 * This file defines the wire schemas that flow between an agent runtime
 * (via its adapter) and the EnvoyMesh orchestrator. Three concerns:
 *
 * 1. **Capability advertisement** — what a node says it can do.
 *    `CapabilityManifest` + `SignedCapabilityManifest`.
 * 2. **Result delivery** — what a node returns for a specific subtask.
 *    `AgentResult` + `SignedAgentResult`, with typed `ContentBlock` content.
 * 3. **Verdict issuance** — the orchestrator's judgment on a result.
 *    `Verdict` + `VerdictEntry` (signed, append-only to ArbitrationStore).
 *
 * The adapter (`AgentAdapter`) interface that produces these artifacts lives
 * in a separate package: `packages/agent-adapter/src/agent-adapter.ts`.
 * envoy-harness's adapter lives in `packages/envoy-harness-adapter/`. This
 * file is the contract they implement against; both sides depend on the
 * same Zod schemas.
 *
 * **Design doc:** `docs/improving-agent-network.md` §4 (the three schemas)
 * and §5.1 (the adapter interface). The schemas here implement §4 verbatim.
 *
 * **Schema invariants (enforced at parse time, see agent-adapter.test.ts):**
 * - `SkillIdSchema` matches `^[a-z][a-z0-9_-]{1,63}$` — lowercase start, 2-64 chars.
 * - `CapabilityManifest.skills` is `.min(1)` — every node advertises at least one skill.
 * - `CapabilityManifest.reputationBySkill` is in `[0, 1]`.
 * - `AgentResult.content` is a non-empty array of `ContentBlock`s.
 *   The legacy `Promise<string | null>` shape is *replaced*, not aliased.
 * - `VerdictEntry.signature` is mandatory — every verdict is signed.
 * - `VerdictEntry.verifierModel` is required iff `source === 'llm'`.
 * - `VerdictEntry.verifierOwnerId` is required iff `source === 'human'`.
 *
 * **Versioning:** `SCHEMA_VERSION` starts at 0 with no compatibility promise
 * (matches the policy in `agent-network.ts` header). When bumping, write a
 * new field rather than changing existing ones; old readers ignore new fields.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// §4.1 CapabilityManifest
// ---------------------------------------------------------------------------

/**
 * Canonical, lowercase identifier for a runtime that can advertise on the mesh.
 *
 * `envoy-harness` is the first runtime whose adapter is canonical rather than
 * sketched. The other values are pre-existing runtimes; new runtimes are
 * added by extending this enum and bumping `SCHEMA_VERSION`.
 *
 * The mesh treats unknown runtime values as opaque (capability advertisement
 * only) — it won't refuse to relay a manifest with a runtime it doesn't
 * recognize, but the orchestrator will not assign tasks to a runtime it
 * can't verify.
 */
export const AgentRuntimeSchema = z.enum([
  "envoy-harness",
  "openclaw",
  "pi",
  "hermes",
  "codex",
  "codex-cli",
  "openhuman",
]);
export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>;

/**
 * A skill identifier. Lowercase, starts with a letter, 2-64 chars.
 * Same regex as the design doc §4.1.
 */
export const SkillIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/, {
    message:
      "skillId must be 2-64 chars, lowercase letter start, then [a-z0-9_-]",
  });
export type SkillId = z.infer<typeof SkillIdSchema>;

/**
 * A single skill that a node is willing to run. Listed by the adapter in
 * `describeSkills()`; the manifest is built from this list.
 *
 * `costCeilingUsd` is a soft signal — the orchestrator's chain-budget-ledger
 * is the authoritative gate. `maxSensitivity` mirrors `ChainMandate.maxSensitivity`
 * — the skill refuses to run on inputs above its ceiling.
 */
export const SkillDescriptorSchema = z.object({
  skillId: SkillIdSchema,
  /** Human-readable description for owner UX and marketplace UI. */
  description: z.string().min(1).max(280),
  /**
   * Cost envelope the adapter is willing to run this skill in.
   * Soft signal — orchestrator's chain-budget-ledger is the authoritative gate.
   */
  costCeilingUsd: z.number().positive().optional(),
  /**
   * The maximum sensitivity this skill may operate on.
   * Mirrors `ChainMandate.maxSensitivity` in `agent-network.ts`.
   */
  maxSensitivity: z.enum(["public", "friends", "private"]).default("friends"),
  /** Adapter-defined tags for marketplace filtering. */
  tags: z.array(z.string()).default([]),
});
export type SkillDescriptor = z.infer<typeof SkillDescriptorSchema>;

/**
 * A reputation score in `[0, 1]`. Computed from the ArbitrationStore verdicts
 * on this node; cached for the manifest's TTL window.
 */
export const ReputationScoreSchema = z.number().min(0).max(1);
export type ReputationScore = z.infer<typeof ReputationScoreSchema>;

/**
 * What a node exposes to the mesh. Stable across runs; changes only when
 * the adapter or its config changes. Replaces (does not delete) the current
 * `ChainProvider.capabilities: string[]`.
 */
export const CapabilityManifestSchema = z.object({
  /** Which agent runtime this adapter wraps. */
  runtime: AgentRuntimeSchema,
  /** Runtime version (semver-ish; owner-controlled). */
  runtimeVersion: z.string().min(1),
  /** The owning node's peerId. */
  peerId: z.string().min(1),
  /** Owner's ownerId (cross-checked via mandate). */
  ownerId: z.string().min(1),
  /** Skills the node is willing to run. At least one required. */
  skills: z.array(SkillDescriptorSchema).min(1),
  /**
   * Past reputation per skill. Computed from the ArbitrationStore verdicts
   * on this node; cached for the manifest's TTL window.
   */
  reputationBySkill: z
    .record(SkillIdSchema, ReputationScoreSchema)
    .default({}),
  /** ISO timestamp; manifests are valid for a TTL (default 5 min). */
  issuedAt: z.string().datetime(),
  /** TTL in seconds. */
  ttlSeconds: z.number().int().positive().default(300),
});
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

/**
 * A signed `CapabilityManifest`. The signature is an Ed25519 over the
 * canonical JSON of the unsigned manifest, signed with the **owner's**
 * signing key (not the adapter's). This is a load-bearing security property:
 * a compromised adapter cannot advertise capabilities on a node it does not
 * own, and the orchestrator can verify the manifest against the owner's
 * public key from the identity layer.
 */
export const SignedCapabilityManifestSchema = CapabilityManifestSchema.extend({
  signature: z.string().min(1),
});
export type SignedCapabilityManifest = z.infer<
  typeof SignedCapabilityManifestSchema
>;

// ---------------------------------------------------------------------------
// §4.2 AgentResult
// ---------------------------------------------------------------------------

/**
 * A typed block of content returned by an agent. Always an array of these
 * (never an opaque string). The orchestrator's merge step (`synthesizeChain`)
 * consumes this directly.
 *
 * `text` and `file` cover the common case; `structured` is for typed data
 * (e.g. a chain report sub-section); `image` is for visual content.
 */
export const ContentBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    text: z.string(),
    mimeType: z.string().optional(),
  }),
  z.object({
    kind: z.literal("file"),
    vaultPath: z.string().min(1),
    contentHash: z.string().min(1),
    displayName: z.string().optional(),
    mimeType: z.string().optional(),
  }),
  z.object({
    kind: z.literal("structured"),
    /** E.g. `'envoymesh://chain-report/v1'`. Schema reference is adapter-defined. */
    schemaRef: z.string().min(1),
    /** Typed data per `schemaRef`. Validated by the format adapter. */
    data: z.unknown(),
  }),
  z.object({
    kind: z.literal("image"),
    vaultPath: z.string().min(1),
    contentHash: z.string().min(1),
    mimeType: z.string().min(1),
    altText: z.string().optional(),
  }),
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

/**
 * A claim by the agent about a source for one of its content blocks.
 * Format adapter-defined; the orchestrator does not validate the ref
 * (it can be a vault path, a URL, a peer id, etc.).
 */
export const CitationSchema = z.object({
  /** What the agent claims is the source. Format adapter-defined. */
  source: z.string().min(1),
  /** The block in the result that the citation refers to (zero-indexed). */
  blockIndex: z.number().int().nonnegative(),
  /** Optional structured ref (e.g. a vault path, a URL, a peer id). */
  ref: z.unknown().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

/**
 * Operational metrics for one skill run. Required: durationMs and costUsd.
 * Token counts are optional — some adapters (rule-based, non-LLM) don't have
 * tokens to report.
 */
export const AgentMetricsSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative(),
});
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;

/**
 * What a node returns to the orchestrator after running a skill. Replaces
 * (does not delete) the current `Promise<string | null>` from `executeStep`.
 */
export const AgentResultSchema = z.object({
  /** What skill produced this result. Must match the manifest. */
  skillId: SkillIdSchema,
  /** What runtime produced it. */
  runtime: AgentRuntimeSchema,
  /** The owning node's peerId. */
  peerId: z.string().min(1),
  /** The chain this result belongs to (correlation). */
  correlationId: z.string().min(1),
  /**
   * The actual content. **Always a typed block array**, not an opaque string.
   * The orchestrator's merge step (`synthesizeChain`) consumes this directly.
   */
  content: z.array(ContentBlockSchema),
  /** Citations the agent claims for its content blocks. */
  citations: z.array(CitationSchema).default([]),
  /** Operational metrics. */
  metrics: AgentMetricsSchema,
  /**
   * Adapter-private raw output. **Never read by the orchestrator.**
   * Stored in the audit log for debugging; the signature covers it so a
   * malicious adapter cannot retroactively edit it.
   */
  raw: z.unknown().optional(),
  /** ISO timestamp at completion. */
  completedAt: z.string().datetime(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

/**
 * A signed `AgentResult`. The signature is an Ed25519 over the canonical
 * JSON of the unsigned result, signed with the **owner's** signing key
 * (not the adapter's, not the worker's).
 */
export const SignedAgentResultSchema = AgentResultSchema.extend({
  signature: z.string().min(1),
});
export type SignedAgentResult = z.infer<typeof SignedAgentResultSchema>;

// ---------------------------------------------------------------------------
// §4.3 Verdict
// ---------------------------------------------------------------------------

/**
 * A verifier's judgment on a result. Four kinds:
 *
 * - `pass` — result is acceptable.
 * - `partial` — result is acceptable for some blocks; the rest are unusable.
 * - `fail` — result is unacceptable; orchestrator may release the cost reserve.
 * - `disputed` — verifier is uncertain; needs a human.
 *
 * The orchestrator combines multiple verdicts on the same result with
 * OR-of-pass, AND-of-fail, default disputed (per design §6.2).
 */
export const VerdictSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pass"),
    /** Score in [0, 1]. 1.0 is full confidence pass. */
    score: z.number().min(0).max(1),
    confidence: z.enum(["low", "medium", "high"]).default("medium"),
    notes: z.string().optional(),
  }),
  z.object({
    kind: z.literal("partial"),
    /** Score in [0, 1] for the partial result. */
    score: z.number().min(0).max(1),
    reason: z.string().min(1),
    /** Which blocks (by index) are usable. */
    usableBlocks: z.array(z.number().int().nonnegative()).optional(),
  }),
  z.object({
    kind: z.literal("fail"),
    reason: z.string().min(1),
    /** Whether the orchestrator should release the cost reserve. */
    rollback: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("disputed"),
    needsHuman: z.literal(true),
    /** Reasons the verifier is uncertain. */
    signals: z.array(z.string().min(1)).min(1),
  }),
]);
export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Where a verdict came from. Four sources:
 *
 * - `rule` — deterministic rule engine. Fast, cheap, no LLM.
 * - `llm` — secondary verifier LLM. Slower, more expensive, probabilistic.
 * - `human` — owner or designated human reviewer.
 * - `cross` — two runtimes compared (cross-agent disagreement, §8).
 */
export const VerifierSourceSchema = z.enum([
  "rule",
  "llm",
  "human",
  "cross",
]);
export type VerifierSource = z.infer<typeof VerifierSourceSchema>;

/**
 * A signed verdict entry. Append-only; designed to slot into the existing
 * `ArbitrationStore` (`chain-arbitration.ts:35` defines
 * `type ArbitrationStore = Map<string, ChainArbitrationEntry>`).
 *
 * The existing store's `append-only` + `idempotent` invariants apply unchanged.
 *
 * Refinement on the design: `verifierModel` is required when `source === 'llm'`,
 * and `verifierOwnerId` is required when `source === 'human'`. This is enforced
 * via `superRefine` so a malformed verdict cannot be signed in the first place.
 */
export const VerdictEntrySchema = z
  .object({
    /** The chain this verdict is for. */
    chainId: z.string().min(1),
    /** The subtask within the chain. */
    subtaskId: z.string().min(1),
    /** Which worker's result is being judged. */
    workerPeerId: z.string().min(1),
    /** Which runtime the worker used. */
    workerRuntime: AgentRuntimeSchema,
    /** The skill that was run. */
    skillId: SkillIdSchema,
    /** The verdict. */
    verdict: VerdictSchema,
    /** Where this verdict came from. */
    source: VerifierSourceSchema,
    /** Required iff `source === 'llm'`. */
    verifierModel: z.string().optional(),
    /** Required iff `source === 'human'`. */
    verifierOwnerId: z.string().optional(),
    /** The orchestrator's peerId (issuing the verdict). */
    issuedBy: z.string().min(1),
    /** ISO timestamp. */
    issuedAt: z.string().datetime(),
    /** Ed25519 over canonical JSON of the unsigned entry. */
    signature: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.source === "llm" && !value.verifierModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verifierModel"],
        message: "verifierModel is required when source === 'llm'",
      });
    }
    if (value.source === "human" && !value.verifierOwnerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verifierOwnerId"],
        message: "verifierOwnerId is required when source === 'human'",
      });
    }
  });
export type VerdictEntry = z.infer<typeof VerdictEntrySchema>;
