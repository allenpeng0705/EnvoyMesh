/**
 * envoy-harness local type system (Phase 1).
 *
 * **Design doc:** `docs/design.md` §5. These types are the *local* surface
 * envoy-harness uses internally. They mirror the *wire* types in
 * `@envoymesh/protocol/agent-adapter` (which envoy-harness-adapter,
 * Package 3, will translate to) but are NOT a dependency of this package
 * — design target #2 (independently runnable) and #4 (self-contained
 * testable) require zero EnvoyMesh-internal deps in Package 1.
 *
 * **What lives here:**
 * - §5.1 Permission and approval (two axes: 3 × 4 = 12 distinct states)
 * - §5.2 Sandbox (backends + resolved policy)
 * - §5.3 Bash validators (the 6-validator composition)
 * - §5.4 Hook events (the 12 hook event names)
 * - §5.5 AGENTS.md (the discovery + assembly types)
 * - §5.6 Verdict (the verifier result; mirrors the wire type)
 *
 * **What is NOT here:**
 * - §5.7 Sub-agent (mesh-native). Lives in envoy-harness-adapter
 *   (Package 3) because it requires mesh connection.
 * - Wire-format signatures (Ed25519). Those are in `@envoymesh/protocol`.
 *   envoy-harness Package 1 is local-only; no signing required.
 *
 * **Stability:** every public export is documented. New fields go at the
 * end of objects; existing fields do not change shape. Per design §4
 * (the 13 invariants), the API surface is the contract.
 */
import { z } from "zod";
// ---------------------------------------------------------------------------
// §5.1 Permission and approval (two axes)
// ---------------------------------------------------------------------------
/**
 * What the agent can do. Maps to OS-level capability.
 * 3 levels, in increasing privilege.
 *
 * `read-only` is the **default** (per design invariant #1). The agent
 * can read files and the network, but cannot write. Switching to
 * `workspace-write` or `danger-full-access` is opt-in per session.
 */
export const PermissionModeSchema = z.enum([
    "read-only", // Default. Read files, network, no writes.
    "workspace-write", // Write inside cwd (and explicit writable_roots).
    "danger-full-access", // All writes, all network. Owner-key-signed escape hatch.
]);
/**
 * When the user is asked. 4 levels.
 *
 * - `unless-trusted`: strict mode. Only commands that pass `is_safe_command()`
 *   AND only read files are auto-approved. Everything else prompts.
 * - `on-request`: the default. The model decides when to ask.
 * - `granular`: per-tool on/off via config.
 * - `never`: unattended operation; never escalate, fail-closed.
 */
export const AskForApprovalSchema = z.enum([
    "unless-trusted",
    "on-request",
    "granular",
    "never",
]);
/**
 * A named profile, loaded from `$ENVOY_HOME/<name>.config.toml`.
 * Built-in profiles: `read-only`, `workspace-write`, `danger-full-access`.
 * Users can override any of them, or add their own.
 *
 * Lowercase, starts with letter or digit, 1-64 chars, `[a-z0-9-]`.
 */
export const PermissionProfileNameSchema = z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, {
    message: "profile name must be 1-64 chars, [a-z0-9-], must start with letter or digit",
});
// ---------------------------------------------------------------------------
// §5.2 Sandbox
// ---------------------------------------------------------------------------
/**
 * Concrete sandbox backends. envoy-harness ships with:
 *
 * - `linux-landlock` (Linux-only, OS-level syscall filter)
 * - `process-fs-namespace` (POSIX-only, mount namespace)
 *
 * `none` is opt-in and is only valid when `PermissionMode` is
 * `danger-full-access`. The orchestrator should refuse `none` for any
 * other mode.
 */
export const SandboxBackendSchema = z.enum([
    "linux-landlock",
    "darwin-sandbox",
    "windows-sandbox",
    "process-fs-namespace",
    "none", // PermissionMode=DangerFullAccess only
]);
// ---------------------------------------------------------------------------
// §5.4 Hook events (the 12 names)
// ---------------------------------------------------------------------------
/**
 * The 12 hook event names. Same names as codex-rs/core/src/hook_runtime.rs
 * (design §8.1, mental-model portability).
 */
export const HookEventNameSchema = z.enum([
    "PreToolUse", // before a tool call
    "PostToolUse", // after a tool call
    "PreCompact", // before context compaction
    "PostCompact", // after context compaction
    "SessionStart", // session begins
    "SessionEnd", // session ends
    "Stop", // main agent stops (user can intervene)
    "SubagentStop", // a sub-agent stops
    "UserPromptSubmit", // user submits a message
    "Notification", // permission request, idle timeout, etc.
    "PermissionRequest", // a permission decision is needed
    "Setup", // initial setup hooks (run once)
]);
// ---------------------------------------------------------------------------
// §5.5 AGENTS.md
// ---------------------------------------------------------------------------
/** The standard AGENTS.md filename. */
export const AGENTS_MD_FILENAME = "AGENTS.md";
/** The local override filename. Takes precedence on conflicts. */
export const AGENTS_OVERRIDE_FILENAME = "AGENTS.override.md";
/** Default markers that stop the upward walk during AGENTS.md discovery. */
export const DEFAULT_PROJECT_ROOT_MARKERS = [".git"];
/** Default cap on total AGENTS.md bytes (32 KB). */
export const DEFAULT_PROJECT_DOC_MAX_BYTES = 32 * 1024;
// ---------------------------------------------------------------------------
// §5.6 Verdict (the verifier result)
// ---------------------------------------------------------------------------
/**
 * A runtime value that envoy-harness advertises. Mirrors the wire
 * `AgentRuntimeSchema` from `@envoymesh/protocol/agent-adapter` but is
 * defined locally per design target #2 (independently runnable).
 *
 * When envoy-harness-adapter (Package 3) integrates, it translates
 * between this local enum and the wire enum (they have the same values).
 */
export const AgentRuntimeSchema = z.enum([
    "envoy-harness", // the home-team runtime; first value by design
    "openclaw", // pre-existing
    "pi", // pre-existing
    "hermes", // pre-existing
    "codex", // pre-existing
    "codex-cli", // pre-existing
    "openhuman", // pre-existing
]);
/**
 * A skill identifier. Lowercase, starts with a letter, 2-64 chars.
 * Mirrors the wire `SkillIdSchema` from `@envoymesh/protocol/agent-adapter`.
 */
export const SkillIdSchema = z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,63}$/, {
    message: "skillId must be 2-64 chars, lowercase letter start, then [a-z0-9_-]",
});
/**
 * A verifier's judgment on a result. Four kinds:
 *
 * - `pass` — result is acceptable.
 * - `partial` — result is acceptable for some blocks; the rest are unusable.
 * - `fail` — result is unacceptable.
 * - `disputed` — verifier is uncertain; needs a human.
 *
 * Mirrors the wire `VerdictSchema`. The two definitions are
 * structurally identical by design; the adapter (Package 3) is the
 * bridge.
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
/**
 * Where a verdict came from. Four sources:
 *
 * - `rule` — deterministic rule engine. Fast, cheap, no LLM.
 * - `llm` — secondary verifier LLM. Slower, more expensive, probabilistic.
 * - `human` — owner or designated human reviewer.
 * - `cross` — two runtimes compared (cross-agent disagreement).
 */
export const VerifierSourceSchema = z.enum([
    "rule",
    "llm",
    "human",
    "cross",
]);
/**
 * A signed verdict entry (in the local surface; signing happens in
 * the adapter when crossing the mesh). Mirrors the wire `VerdictEntrySchema`.
 *
 * Refinement on the design: `verifierModel` is required when
 * `source === 'llm'`, and `verifierOwnerId` is required when
 * `source === 'human'`. Enforced via `superRefine` so a malformed
 * verdict cannot be signed in the first place.
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
/**
 * The public API version. Bumped when the local type surface changes
 * in a non-additive way. The wire surface has its own version in
 * `@envoymesh/protocol`.
 */
export const ENVOY_HARNESS_LOCAL_VERSION = "0.1.0";
//# sourceMappingURL=types.js.map