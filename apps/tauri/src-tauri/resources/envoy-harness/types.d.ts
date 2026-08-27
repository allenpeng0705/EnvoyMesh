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
/**
 * What the agent can do. Maps to OS-level capability.
 * 3 levels, in increasing privilege.
 *
 * `read-only` is the **default** (per design invariant #1). The agent
 * can read files and the network, but cannot write. Switching to
 * `workspace-write` or `danger-full-access` is opt-in per session.
 */
export declare const PermissionModeSchema: z.ZodEnum<["read-only", "workspace-write", "danger-full-access"]>;
export type PermissionMode = z.infer<typeof PermissionModeSchema>;
/**
 * When the user is asked. 4 levels.
 *
 * - `unless-trusted`: strict mode. Only commands that pass `is_safe_command()`
 *   AND only read files are auto-approved. Everything else prompts.
 * - `on-request`: the default. The model decides when to ask.
 * - `granular`: per-tool on/off via config.
 * - `never`: unattended operation; never escalate, fail-closed.
 */
export declare const AskForApprovalSchema: z.ZodEnum<["unless-trusted", "on-request", "granular", "never"]>;
export type AskForApproval = z.infer<typeof AskForApprovalSchema>;
/**
 * A named profile, loaded from `$ENVOY_HOME/<name>.config.toml`.
 * Built-in profiles: `read-only`, `workspace-write`, `danger-full-access`.
 * Users can override any of them, or add their own.
 *
 * Lowercase, starts with letter or digit, 1-64 chars, `[a-z0-9-]`.
 */
export declare const PermissionProfileNameSchema: z.ZodString;
export type PermissionProfileName = z.infer<typeof PermissionProfileNameSchema>;
/**
 * A reference to a profile (name + whether the profile is built-in or
 * user-defined). Used in `SandboxPolicy` and config parsing.
 */
export interface ProfileRef {
    name: PermissionProfileName;
    /** Built-in profiles are not user-editable. User profiles live under `$ENVOY_HOME`. */
    source: "built-in" | "user";
}
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
export declare const SandboxBackendSchema: z.ZodEnum<["linux-landlock", "darwin-sandbox", "windows-sandbox", "process-fs-namespace", "none"]>;
export type SandboxBackend = z.infer<typeof SandboxBackendSchema>;
/**
 * Combined sandbox policy. Resolved at session start from
 * `PermissionMode` + `AskForApproval` + `SandboxBackend` + `writable_roots`.
 *
 * **Invariant:** the policy must satisfy
 * `mode === 'danger-full-access' || backend !== 'none'`. The loader
 * enforces this; the type does not (it would couple too tightly to
 * the loader logic).
 */
export interface SandboxPolicy {
    mode: PermissionMode;
    approval: AskForApproval;
    backend: SandboxBackend;
    /** Paths writable in workspace-write mode. Empty = cwd only. */
    writableRoots: ReadonlyArray<string>;
    /** If true, network access is allowed in workspace-write mode. */
    networkAccess: boolean;
    /** If true, /tmp is also writable (default true). */
    slashTmpWritable: boolean;
}
/**
 * Input to a bash validator. The 6 validators in §6 all take this shape.
 */
export interface BashValidationInput {
    /** The bash command string. */
    command: string;
    /** Tokenized argv (post-shell-parsing). May be empty for empty commands. */
    argv: ReadonlyArray<string>;
    /** Environment at the time of the call. */
    env: Readonly<Record<string, string>>;
    /** Current working directory. Used by `pathValidation` to resolve paths. */
    cwd: string;
    /** Current sandbox policy. */
    policy: SandboxPolicy;
}
/**
 * The verdict from one bash validator.
 *
 * - `allow`: proceed, no message.
 * - `allow-with-warning`: proceed, but show the warning to the user.
 * - `block`: do not run. `reason` is shown to the user.
 */
export type BashVerdict = {
    kind: "allow";
} | {
    kind: "allow-with-warning";
    warning: string;
} | {
    kind: "block";
    reason: string;
};
/**
 * One bash validator. Each of the 6 validators in §6 implements this.
 *
 * All 6 run on every bash call, in order. Any `kind: 'block'` short-circuits
 * the chain (the command is not run). The composition is the security
 * story, not any one validator.
 */
export interface BashValidator {
    readonly name: string;
    validate(input: BashValidationInput): Promise<BashVerdict>;
}
/**
 * The 12 hook event names. Same names as codex-rs/core/src/hook_runtime.rs
 * (design §8.1, mental-model portability).
 */
export declare const HookEventNameSchema: z.ZodEnum<["PreToolUse", "PostToolUse", "PreCompact", "PostCompact", "SessionStart", "SessionEnd", "Stop", "SubagentStop", "UserPromptSubmit", "Notification", "PermissionRequest", "Setup"]>;
export type HookEventName = z.infer<typeof HookEventNameSchema>;
/**
 * A hook handler declaration. May be a shell command or a TS module.
 *
 * If both `command` and `module` are present, the orchestrator runs the
 * shell command (cheaper) and falls back to the module on non-zero exit.
 * Per design §8: this is a startup-time decision; do not mix at runtime.
 */
export interface HookHandler {
    /** Filter: only fire if the tool name or pattern matches. */
    match?: {
        tool?: string;
        pattern?: string;
    };
    /** Shell command. `$TOOL_CALL` is interpolated as JSON. */
    command?: string;
    /** Path to a TS module. The module must export `default: HookFn`. */
    module?: string;
    /** Max time the hook is allowed to run. Default 5s. */
    timeoutMs?: number;
}
/**
 * A hook function (used when a handler is a TS module).
 */
export type HookFn = (event: HookEvent) => Promise<HookDecision>;
/**
 * The event payload passed to a hook function. The exact shape depends
 * on the event name; this is the discriminated base.
 */
export type HookEvent = {
    name: HookEventName;
    /** Event-specific payload. Schema varies by name; see §8.2. */
    payload: unknown;
};
/**
 * What a hook decides. Per design §8.1:
 *
 * - `continue`: hook is done, the orchestrator proceeds.
 * - `modify`: the hook has changed the post-tool result. `PostToolUse` only.
 * - `block`: the hook stops the action. `PreToolUse` / `PermissionRequest`.
 * - `add-context`: the hook has text to inject into the next prompt.
 *   `SessionStart` / `PreCompact`.
 * - `ask`: F9.1 — the hook wants the user (or host) to
 *   approve the action. The agent loop pauses and calls
 *   `AgentOptions.askHandler`; the handler returns an
 *   `AskDecision` (allow / deny / modify). `PreToolUse` only.
 */
export type HookDecision = {
    kind: "continue";
} | {
    kind: "modify";
    modified: unknown;
} | {
    kind: "block";
    reason: string;
} | {
    kind: "add-context";
    content: string;
} | {
    /** F9.1: ask the user / host to approve the action. */
    kind: "ask";
    /** A human-readable question. */
    question: string;
    /** Suggested options; the host may use them or replace. */
    options?: ReadonlyArray<{
        id: string;
        label: string;
    }>;
};
/**
 * F9.1 — the host's response to an `ask` decision.
 * Returned by `AgentOptions.askHandler`.
 */
export type AskDecision = {
    kind: "allow";
} | {
    kind: "deny";
    reason: string;
} | {
    kind: "modify";
    args: Record<string, unknown>;
};
/**
 * F9.1 — the request the agent loop sends to the host
 * when a hook returns `kind: "ask"`.
 */
export interface AskRequest {
    /** The tool the model wants to call. */
    tool: string;
    /** The model's args (the host shows these to the user). */
    args: unknown;
    /** A human-readable question (e.g. "Run bash with this command?"). */
    question: string;
    /** Suggested options; the host may use them. */
    options?: ReadonlyArray<{
        id: string;
        label: string;
    }>;
    /**
     * Abort signal. The host can wire this to its own
     * cancel button (e.g. a Tauri dialog's "Cancel").
     * If the signal fires, the host can return
     * `{ kind: "deny", reason: "cancelled" }`.
     */
    signal: AbortSignal;
}
/** F9.1 — the host's per-call approval handler. */
export type AskHandler = (req: AskRequest) => Promise<AskDecision>;
/** The standard AGENTS.md filename. */
export declare const AGENTS_MD_FILENAME = "AGENTS.md";
/** The local override filename. Takes precedence on conflicts. */
export declare const AGENTS_OVERRIDE_FILENAME = "AGENTS.override.md";
/** Default markers that stop the upward walk during AGENTS.md discovery. */
export declare const DEFAULT_PROJECT_ROOT_MARKERS: readonly [".git"];
/** Default cap on total AGENTS.md bytes (32 KB). */
export declare const DEFAULT_PROJECT_DOC_MAX_BYTES: number;
/**
 * One discovered AGENTS.md. May be from the user, the project, or a local
 * override. Order of precedence: `user` < `project` < `override`.
 */
export interface DiscoveredAgentsDoc {
    /** Absolute path to the file. */
    path: string;
    /** File contents (UTF-8, no BOM). */
    contents: string;
    /** Origin: 'user' (~/...), 'project' (cwd-relative), or 'override' (local). */
    origin: "user" | "project" | "override";
    /** Bytes; used for the budget check. */
    byteLength: number;
}
/**
 * The full assembled set, in concat order. Order is:
 *   1. user instructions (from settings or env)
 *   2. project docs (cwd upward, each AGENTS.md)
 *   3. project override (AGENTS.override.md, takes precedence on conflicts)
 *
 * Concatenated with a separator. Mirrors codex-rs/core/src/agents_md.rs:43.
 */
export interface LoadedAgentsMd {
    entries: ReadonlyArray<DiscoveredAgentsDoc>;
    totalBytes: number;
    /** Concatenated, ready to inject into the system prompt. */
    assembled: string;
}
/**
 * A runtime value that envoy-harness advertises. Mirrors the wire
 * `AgentRuntimeSchema` from `@envoymesh/protocol/agent-adapter` but is
 * defined locally per design target #2 (independently runnable).
 *
 * When envoy-harness-adapter (Package 3) integrates, it translates
 * between this local enum and the wire enum (they have the same values).
 */
export declare const AgentRuntimeSchema: z.ZodEnum<["envoy-harness", "openclaw", "pi", "hermes", "codex", "codex-cli", "openhuman"]>;
export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>;
/**
 * A skill identifier. Lowercase, starts with a letter, 2-64 chars.
 * Mirrors the wire `SkillIdSchema` from `@envoymesh/protocol/agent-adapter`.
 */
export declare const SkillIdSchema: z.ZodString;
export type SkillId = z.infer<typeof SkillIdSchema>;
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
export declare const VerdictSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"pass">;
    /** Score in [0, 1]. 1.0 is full confidence pass. */
    score: z.ZodNumber;
    confidence: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "pass";
    score: number;
    confidence: "low" | "medium" | "high";
    notes?: string | undefined;
}, {
    kind: "pass";
    score: number;
    confidence?: "low" | "medium" | "high" | undefined;
    notes?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"partial">;
    /** Score in [0, 1] for the partial result. */
    score: z.ZodNumber;
    reason: z.ZodString;
    /** Which blocks (by index) are usable. */
    usableBlocks: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    kind: "partial";
    score: number;
    reason: string;
    usableBlocks?: number[] | undefined;
}, {
    kind: "partial";
    score: number;
    reason: string;
    usableBlocks?: number[] | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"fail">;
    reason: z.ZodString;
    /** Whether the orchestrator should release the cost reserve. */
    rollback: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    kind: "fail";
    reason: string;
    rollback: boolean;
}, {
    kind: "fail";
    reason: string;
    rollback?: boolean | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"disputed">;
    needsHuman: z.ZodLiteral<true>;
    /** Reasons the verifier is uncertain. */
    signals: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    kind: "disputed";
    needsHuman: true;
    signals: string[];
}, {
    kind: "disputed";
    needsHuman: true;
    signals: string[];
}>]>;
export type Verdict = z.infer<typeof VerdictSchema>;
/**
 * Where a verdict came from. Four sources:
 *
 * - `rule` — deterministic rule engine. Fast, cheap, no LLM.
 * - `llm` — secondary verifier LLM. Slower, more expensive, probabilistic.
 * - `human` — owner or designated human reviewer.
 * - `cross` — two runtimes compared (cross-agent disagreement).
 */
export declare const VerifierSourceSchema: z.ZodEnum<["rule", "llm", "human", "cross"]>;
export type VerifierSource = z.infer<typeof VerifierSourceSchema>;
/**
 * A signed verdict entry (in the local surface; signing happens in
 * the adapter when crossing the mesh). Mirrors the wire `VerdictEntrySchema`.
 *
 * Refinement on the design: `verifierModel` is required when
 * `source === 'llm'`, and `verifierOwnerId` is required when
 * `source === 'human'`. Enforced via `superRefine` so a malformed
 * verdict cannot be signed in the first place.
 */
export declare const VerdictEntrySchema: z.ZodEffects<z.ZodObject<{
    /** The chain this verdict is for. */
    chainId: z.ZodString;
    /** The subtask within the chain. */
    subtaskId: z.ZodString;
    /** Which worker's result is being judged. */
    workerPeerId: z.ZodString;
    /** Which runtime the worker used. */
    workerRuntime: z.ZodEnum<["envoy-harness", "openclaw", "pi", "hermes", "codex", "codex-cli", "openhuman"]>;
    /** The skill that was run. */
    skillId: z.ZodString;
    /** The verdict. */
    verdict: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"pass">;
        /** Score in [0, 1]. 1.0 is full confidence pass. */
        score: z.ZodNumber;
        confidence: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "pass";
        score: number;
        confidence: "low" | "medium" | "high";
        notes?: string | undefined;
    }, {
        kind: "pass";
        score: number;
        confidence?: "low" | "medium" | "high" | undefined;
        notes?: string | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"partial">;
        /** Score in [0, 1] for the partial result. */
        score: z.ZodNumber;
        reason: z.ZodString;
        /** Which blocks (by index) are usable. */
        usableBlocks: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    }, "strip", z.ZodTypeAny, {
        kind: "partial";
        score: number;
        reason: string;
        usableBlocks?: number[] | undefined;
    }, {
        kind: "partial";
        score: number;
        reason: string;
        usableBlocks?: number[] | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"fail">;
        reason: z.ZodString;
        /** Whether the orchestrator should release the cost reserve. */
        rollback: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        kind: "fail";
        reason: string;
        rollback: boolean;
    }, {
        kind: "fail";
        reason: string;
        rollback?: boolean | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"disputed">;
        needsHuman: z.ZodLiteral<true>;
        /** Reasons the verifier is uncertain. */
        signals: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        kind: "disputed";
        needsHuman: true;
        signals: string[];
    }, {
        kind: "disputed";
        needsHuman: true;
        signals: string[];
    }>]>;
    /** Where this verdict came from. */
    source: z.ZodEnum<["rule", "llm", "human", "cross"]>;
    /** Required iff `source === 'llm'`. */
    verifierModel: z.ZodOptional<z.ZodString>;
    /** Required iff `source === 'human'`. */
    verifierOwnerId: z.ZodOptional<z.ZodString>;
    /** The orchestrator's peerId (issuing the verdict). */
    issuedBy: z.ZodString;
    /** ISO timestamp. */
    issuedAt: z.ZodString;
    /** Ed25519 over canonical JSON of the unsigned entry. */
    signature: z.ZodString;
}, "strip", z.ZodTypeAny, {
    chainId: string;
    subtaskId: string;
    workerPeerId: string;
    workerRuntime: "envoy-harness" | "openclaw" | "pi" | "hermes" | "codex" | "codex-cli" | "openhuman";
    skillId: string;
    verdict: {
        kind: "pass";
        score: number;
        confidence: "low" | "medium" | "high";
        notes?: string | undefined;
    } | {
        kind: "partial";
        score: number;
        reason: string;
        usableBlocks?: number[] | undefined;
    } | {
        kind: "fail";
        reason: string;
        rollback: boolean;
    } | {
        kind: "disputed";
        needsHuman: true;
        signals: string[];
    };
    source: "rule" | "llm" | "human" | "cross";
    issuedBy: string;
    issuedAt: string;
    signature: string;
    verifierModel?: string | undefined;
    verifierOwnerId?: string | undefined;
}, {
    chainId: string;
    subtaskId: string;
    workerPeerId: string;
    workerRuntime: "envoy-harness" | "openclaw" | "pi" | "hermes" | "codex" | "codex-cli" | "openhuman";
    skillId: string;
    verdict: {
        kind: "pass";
        score: number;
        confidence?: "low" | "medium" | "high" | undefined;
        notes?: string | undefined;
    } | {
        kind: "partial";
        score: number;
        reason: string;
        usableBlocks?: number[] | undefined;
    } | {
        kind: "fail";
        reason: string;
        rollback?: boolean | undefined;
    } | {
        kind: "disputed";
        needsHuman: true;
        signals: string[];
    };
    source: "rule" | "llm" | "human" | "cross";
    issuedBy: string;
    issuedAt: string;
    signature: string;
    verifierModel?: string | undefined;
    verifierOwnerId?: string | undefined;
}>, {
    chainId: string;
    subtaskId: string;
    workerPeerId: string;
    workerRuntime: "envoy-harness" | "openclaw" | "pi" | "hermes" | "codex" | "codex-cli" | "openhuman";
    skillId: string;
    verdict: {
        kind: "pass";
        score: number;
        confidence: "low" | "medium" | "high";
        notes?: string | undefined;
    } | {
        kind: "partial";
        score: number;
        reason: string;
        usableBlocks?: number[] | undefined;
    } | {
        kind: "fail";
        reason: string;
        rollback: boolean;
    } | {
        kind: "disputed";
        needsHuman: true;
        signals: string[];
    };
    source: "rule" | "llm" | "human" | "cross";
    issuedBy: string;
    issuedAt: string;
    signature: string;
    verifierModel?: string | undefined;
    verifierOwnerId?: string | undefined;
}, {
    chainId: string;
    subtaskId: string;
    workerPeerId: string;
    workerRuntime: "envoy-harness" | "openclaw" | "pi" | "hermes" | "codex" | "codex-cli" | "openhuman";
    skillId: string;
    verdict: {
        kind: "pass";
        score: number;
        confidence?: "low" | "medium" | "high" | undefined;
        notes?: string | undefined;
    } | {
        kind: "partial";
        score: number;
        reason: string;
        usableBlocks?: number[] | undefined;
    } | {
        kind: "fail";
        reason: string;
        rollback?: boolean | undefined;
    } | {
        kind: "disputed";
        needsHuman: true;
        signals: string[];
    };
    source: "rule" | "llm" | "human" | "cross";
    issuedBy: string;
    issuedAt: string;
    signature: string;
    verifierModel?: string | undefined;
    verifierOwnerId?: string | undefined;
}>;
export type VerdictEntry = z.infer<typeof VerdictEntrySchema>;
/**
 * The public API version. Bumped when the local type surface changes
 * in a non-additive way. The wire surface has its own version in
 * `@envoymesh/protocol`.
 */
export declare const ENVOY_HARNESS_LOCAL_VERSION: "0.1.0";
//# sourceMappingURL=types.d.ts.map