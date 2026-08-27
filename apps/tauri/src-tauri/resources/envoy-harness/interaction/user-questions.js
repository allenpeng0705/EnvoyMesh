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
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
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
export function createUserQuestionService() {
    let current;
    function ask(req) {
        if (current === undefined) {
            return Promise.resolve({
                value: "",
                cancelled: true,
                cancelledReason: "no-provider",
            });
        }
        // Pre-aborted: short-circuit before delegating. The
        // provider's pre-aborted check is a defensive
        // double-check; the service-level check is the
        // canonical place (matches the test contract).
        if (req.signal.aborted) {
            return Promise.resolve({
                value: "",
                cancelled: true,
                cancelledReason: "aborted",
            });
        }
        const provider = current;
        const timeoutMs = req.timeoutMs;
        if (timeoutMs === undefined || timeoutMs <= 0) {
            // No timeout — delegate, but wrap in a catch so
            // a provider throw doesn't bubble up to the
            // caller. The caller's outer try/catch is for
            // its own errors; user-question failures should
            // fall through to the model as a clean cancel.
            return provider.ask(req).catch(() => ({
                value: "",
                cancelled: true,
                cancelledReason: "aborted",
            }));
        }
        // Service-level timeout. We can't `req.signal.abort()`
        // — `AbortSignal` has no `abort` method; the controller
        // owns that. Instead, race the provider's promise
        // against a `setTimeout`. The provider may also
        // implement its own internal timeout (e.g. the REPL
        // provider's readline interface); the service-level
        // timeout is the safety net for providers that don't.
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve({
                    value: "",
                    cancelled: true,
                    cancelledReason: "timeout",
                });
            }, timeoutMs);
            provider
                .ask(req)
                .then((answer) => {
                clearTimeout(timer);
                resolve(answer);
            })
                .catch(() => {
                clearTimeout(timer);
                resolve({
                    value: "",
                    cancelled: true,
                    cancelledReason: "aborted",
                });
            });
        });
    }
    return {
        registerProvider(p) {
            if (current !== undefined) {
                throw new Error(`user-question service: a provider is already registered ` +
                    `("${current.name}"); unregister it first or compose the ` +
                    `two providers into one.`);
            }
            current = p;
            return () => {
                if (current === p) {
                    current = undefined;
                }
            };
        },
        hasProvider: () => current !== undefined,
        providerName: () => current?.name,
        ask,
    };
}
//# sourceMappingURL=user-questions.js.map