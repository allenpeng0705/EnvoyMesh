/**
 * Phase A / Item 5 — the `UserQuestionService` (open-ended
 * user questions + approval delegation, the deepseek
 * `ctx.userQuestions` shape ported).
 *
 * **Reference:** deepseek `interaction/user-questions` +
 * `multiline support` (gap-closure-plan item 5).
 *
 * **Why a primitive:** the agent's runtime needs to ask the
 * human things ("which option?", "allow this?", "what's the
 * project root?"). The REPL handles this today via ad-hoc
 * readline calls scattered through `tool-executor.ts`; the
 * Tauri / mesh hosts will need the same capability. A single
 * service interface lets every host register its own provider
 * (REPL stdin today, Tauri composer tomorrow, mesh tomorrow
 * tomorrow) without forking the agent loop.
 *
 * **One active provider at a time:** the service is a
 * multiplexer, not a fan-out. The first registered provider
 * wins; a second registration throws (Q5 of the v1 design
 * notes — matches the existing `LocalRuntimeRegistry` shape).
 * This keeps the human's interaction surface unambiguous: one
 * channel, not several competing for the user's attention.
 *
 * **No-provider behavior:** when no provider is registered,
 * `ask()` returns `{ value: "", cancelled: true }` instead of
 * throwing. The model can fall through to its default
 * (e.g. approval "deny" is the safe default when no human is
 * available). This matches deepseek's `defaultProvider`
 * behavior + the existing v0 fallback contract.
 *
 * **Stable:** the `UserQuestionService` interface is a
 * Package-1 surface; new fields are additive, removing one
 * is a major version bump.
 */
/**
 * A request to ask the human a question. Constructed by the
 * agent loop (the model-facing `ask_user` tool) or by the
 * approval shim (the existing `AskForApproval` flow).
 */
export interface UserQuestionRequest {
    /**
     * The prompt the human sees. Keep it short — REPL
     * users get a single line by default; multiline mode
     * is for diffs, error logs, etc.
     */
    prompt: string;
    /**
     * Optional fixed-choice options. When set, the REPL
     * renders a numbered picker; the answer carries the
     * `optionIndex`. When unset, the human types a free-form
     * answer (or a multi-line block in multiline mode).
     */
    options?: ReadonlyArray<string>;
    /**
     * 0-based index into `options` marked as recommended
     * (Claude/Codex-style hint). Providers may highlight it;
     * ignored when `options` is unset or the index is OOB.
     */
    recommendedIndex?: number;
    /**
     * Multiline mode: the human types until a sentinel
     * (default `"""` on its own line). Useful for diffs +
     * error logs + anything the LLM asks the human to paste
     * back. REPL-only; the Tauri composer may use a
     * different UX.
     */
    multiline?: boolean;
    /**
     * Abort signal. Cancellation maps to `{ cancelled: true }`;
     * the provider MUST honor the signal (close its readline
     * interface, drain the prompt, etc.).
     */
    signal: AbortSignal;
    /**
     * Optional timeout. When the timeout fires, the answer
     * is `{ cancelled: true, reason: "timeout" }`. Default
     * "no timeout" (the human may take as long as they want).
     */
    timeoutMs?: number;
}
/**
 * The human's answer (or a synthetic non-answer when the
 * service has no provider, the signal aborted, or the
 * timeout fired).
 */
export interface UserQuestionAnswer {
    /**
     * The answer text. Empty string when `cancelled` is true.
     * When `options` was set, this is the chosen option's
     * text (e.g. "yes" or "no"); `optionIndex` carries the
     * numeric choice.
     */
    value: string;
    /**
     * The 0-based index of the chosen option. `undefined`
     * when the request had no fixed options (free-form).
     */
    optionIndex?: number;
    /**
     * `true` when the service has no provider, the signal
     * aborted, or the timeout fired. The model SHOULD treat
     * cancelled as "no answer" and fall through to its
     * default.
     */
    cancelled: boolean;
    /**
     * Optional reason for the cancellation. Set when
     * `cancelled` is true. Currently: `"no-provider"`,
     * `"aborted"`, `"timeout"`. Stable string set — new
     * values are additive.
     */
    cancelledReason?: "no-provider" | "aborted" | "timeout";
}
/**
 * A provider renders a `UserQuestionRequest` to the human
 * and returns their answer. One provider per service.
 */
export interface UserQuestionProvider {
    /** Stable name, for the `/user-questions status` command. */
    readonly name: string;
    /** Ask the human. MUST honor `signal`. */
    ask(req: UserQuestionRequest): Promise<UserQuestionAnswer>;
}
/**
 * The user-question service. One active provider at a time;
 * `ask()` delegates to the registered provider, or returns
 * a synthetic "no provider" answer when none is registered.
 */
export interface UserQuestionService {
    /**
     * Register a provider. Returns a disposer that unregisters.
     * Throws when a provider is already registered (one-active
     * invariant).
     */
    registerProvider(p: UserQuestionProvider): () => void;
    /**
     * Whether a provider is currently registered. Cheap
     * (no I/O) — the Tauri UI polls this to render the
     * "human in the loop" badge.
     */
    hasProvider(): boolean;
    /**
     * The registered provider's name, or `undefined`.
     */
    providerName(): string | undefined;
    /**
     * Ask the human. Delegates to the registered provider.
     * When no provider is registered, returns
     * `{ value: "", cancelled: true, cancelledReason: "no-provider" }`
     * without throwing.
     *
     * **Timeout handling:** when `req.timeoutMs` is set, the
     * service starts a timer that aborts `req.signal` at the
     * timeout. The provider sees the abort and the answer
     * carries `cancelledReason: "timeout"`. The provider may
     * also implement its own internal timeout; the service-
     * level timeout is the safety net for providers that
     * don't.
     */
    ask(req: UserQuestionRequest): Promise<UserQuestionAnswer>;
}
/**
 * Create a `UserQuestionService`. The returned service has
 * no provider registered; the host calls
 * `registerProvider(...)` once at startup.
 *
 * @example
 *   const uq = createUserQuestionService();
 *   const dispose = uq.registerProvider(createReplStdinProvider({...}));
 *   // ...later, on shutdown:
 *   dispose();
 */
export declare function createUserQuestionService(): UserQuestionService;
//# sourceMappingURL=user-questions.d.ts.map