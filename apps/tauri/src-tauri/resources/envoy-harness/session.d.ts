/**
 * Session — the transcript + (eventually) the persistence layer.
 *
 * **Design doc:** `docs/design.md` §3.2 (session lifecycle).
 *
 * **Phase 1 scope:** in-memory only. The session holds the
 * running transcript (a list of `Message`s) and a few metadata
 * fields. Persistence (writing to disk, projecting to other
 * formats) lands in Phase 2.
 *
 * **Why a class and not a plain object?** The class enforces
 * invariants: `id` is read-only, `messages` is append-only via
 * `appendMessage`, and the transcript never goes backward.
 * Plain objects can't enforce those rules without runtime checks
 * scattered through the code.
 *
 * **`appendMessage` is the only mutation.** The agent calls it
 * after every model response and every tool result. The session
 * is the source of truth for "what has happened so far" in
 * the loop.
 *
 * **Stability:** `id`, `messages`, `appendMessage`, `lastMessage`,
 * `clear` are the public API. Adding fields is additive.
 */
import type { ContentBlock, Message, Role } from "./tools/types.js";
/** Optional metadata about a session. */
export interface SessionMetadata {
    /** User-visible label (e.g. the first 60 chars of the prompt). */
    title?: string;
    /** Working directory for tool execution. */
    cwd: string;
    /** Permission mode at session start. */
    permissionMode?: "read-only" | "workspace-write" | "danger-full-access";
    /** ISO timestamp of session start. */
    startedAt: string;
    /**
     * Phase A / Item 6: the plan state. When `undefined`,
     * the session has no plan (the default). The plan
     * lifecycle is managed via `setPlan` / `getPlan`;
     * the field is `readonly` to preserve the Session
     * value-object contract (mutations go through the
     * setter; the metadata reference itself doesn't
     * change).
     */
    plan?: import("./plan/state.js").PlanState;
    /**
     * Phase D / Item 14b: cross-machine resume provenance.
     * Optional; local sessions omit it. Remote resume
     * (mesh adapter) stamps `originNode` / `resumedFrom`.
     */
    provenance?: SessionProvenance;
}
/** Provenance fields for cross-machine / checkpoint resume. */
export interface SessionProvenance {
    /** Node id that originally created the session (mesh). */
    originNode?: string;
    /** Session id this one was resumed/forked from. */
    resumedFrom?: string;
    /** ISO timestamp of the last checkpoint. */
    checkpointAt?: string;
}
export interface Session {
    /** Unique session id. Stable across the session's lifetime. */
    readonly id: string;
    /** Session metadata. */
    readonly metadata: SessionMetadata;
    /**
     * Read-only view of the transcript. The agent never mutates
     * this directly — it calls `appendMessage`. Exposed as
     * readonly so callers can't bypass the append-only invariant.
     */
    readonly messages: ReadonlyArray<Message>;
    /**
     * Append a message to the transcript. This is the only
     * mutation. Returns the new length so callers can sanity-check.
     *
     * `content` defaults to `[]` for system messages; callers can
     * pass an explicit array for assistant messages with text +
     * tool calls.
     */
    appendMessage(role: Role, content: ReadonlyArray<ContentBlock>): number;
    /** The most recent message, or `null` if the transcript is empty. */
    lastMessage(): Message | null;
    /** Remove all messages. Test-only utility. */
    clear(): void;
    /**
     * F-fix: flush any pending persistence writes. The in-memory
     * implementation is a no-op; `PersistedSession` awaits its
     * write chain so the transcript is durable before the CLI
     * returns (fire-and-forget appends would otherwise be lost on
     * an immediate process exit).
     */
    flush(): Promise<void>;
    /**
     * F14.1: update the session's display title. The
     * `metadata.title` field is the user-facing label
     * (e.g. shown by the REPL's `/session` command and
     * persisted to disk in F14's persisted session).
     *
     * **Why a setter, not a direct field write:** the
     * `metadata` field is `readonly` (the object
     * reference can't change), but the OBJECT's
     * properties are mutable. A dedicated method
     * documents the intent and lets `PersistedSession`
     * (F14) also write through to disk in the same call.
     *
     * **Add-on:** implementations that don't persist
     * (like the in-memory one) can just mutate
     * `metadata.title`. `PersistedSession` does the
     * same + flushes the header line.
     */
    setTitle(title: string): void;
    /**
     * Phase A / Item 6: set the session's plan state.
     * Pass `undefined` to clear the plan. The plan
     * rides on `metadata.plan`; the metadata object
     * itself is replaced (so `PersistedSession` can
     * write the new state through to disk).
     */
    setPlan(plan: import("./plan/state.js").PlanState | undefined): void;
    /**
     * Phase A / Item 6: read the current plan state, or
     * `undefined` when no plan has been set.
     */
    getPlan(): import("./plan/state.js").PlanState | undefined;
}
/**
 * In-memory session. The default implementation for v0. Phase 2
 * adds a `PersistedSession` that writes through to disk; the
 * `Session` interface stays the same.
 *
 * **Id generation:** `randomUUID()` is fine for v0 (we don't
 * need deterministic ids yet). Phase 2 may swap to a content-
 * hash-based id for reproducibility.
 */
export declare class InMemorySession implements Session {
    readonly id: string;
    readonly metadata: SessionMetadata;
    private _messages;
    constructor(id: string, metadata: SessionMetadata);
    get messages(): ReadonlyArray<Message>;
    appendMessage(role: Role, content: ReadonlyArray<ContentBlock>): number;
    lastMessage(): Message | null;
    clear(): void;
    /**
     * F14.1: set the session's display title. The
     * `metadata.title` field is mutable (the object
     * reference is `readonly` on the class field, but
     * the object's properties are not). Just assign
     * — no side effects (the in-memory session doesn't
     * persist; the persisted one does, separately).
     */
    setTitle(title: string): void;
    /**
     * Phase A / Item 6: set the session's plan state.
     * The in-memory implementation just mutates
     * `metadata.plan`; `PersistedSession` overrides
     * this to also write the new state through to
     * disk. Pass `undefined` to clear the plan.
     */
    setPlan(plan: import("./plan/state.js").PlanState | undefined): void;
    /** Phase A / Item 6: read the current plan state. */
    getPlan(): import("./plan/state.js").PlanState | undefined;
    /** No-op: nothing to flush for an in-memory session. */
    flush(): Promise<void>;
}
/**
 * Generate a new session id. Uses `crypto.randomUUID()` for
 * v0; deterministic ids can be added in a later chunk if needed
 * for replay / snapshot tests.
 */
export declare function newSessionId(): string;
//# sourceMappingURL=session.d.ts.map