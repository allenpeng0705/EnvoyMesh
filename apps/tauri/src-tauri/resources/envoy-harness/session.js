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
/**
 * In-memory session. The default implementation for v0. Phase 2
 * adds a `PersistedSession` that writes through to disk; the
 * `Session` interface stays the same.
 *
 * **Id generation:** `randomUUID()` is fine for v0 (we don't
 * need deterministic ids yet). Phase 2 may swap to a content-
 * hash-based id for reproducibility.
 */
export class InMemorySession {
    id;
    metadata;
    _messages = [];
    constructor(id, metadata) {
        this.id = id;
        this.metadata = metadata;
    }
    get messages() {
        return this._messages;
    }
    appendMessage(role, content) {
        this._messages.push({ role, content: [...content] });
        return this._messages.length;
    }
    lastMessage() {
        return this._messages[this._messages.length - 1] ?? null;
    }
    clear() {
        this._messages = [];
    }
    /**
     * F14.1: set the session's display title. The
     * `metadata.title` field is mutable (the object
     * reference is `readonly` on the class field, but
     * the object's properties are not). Just assign
     * — no side effects (the in-memory session doesn't
     * persist; the persisted one does, separately).
     */
    setTitle(title) {
        this.metadata.title = title;
    }
    /**
     * Phase A / Item 6: set the session's plan state.
     * The in-memory implementation just mutates
     * `metadata.plan`; `PersistedSession` overrides
     * this to also write the new state through to
     * disk. Pass `undefined` to clear the plan.
     */
    setPlan(plan) {
        if (plan === undefined) {
            delete this.metadata.plan;
        }
        else {
            this.metadata.plan = plan;
        }
    }
    /** Phase A / Item 6: read the current plan state. */
    getPlan() {
        return this.metadata.plan;
    }
    /** No-op: nothing to flush for an in-memory session. */
    async flush() {
        // nothing to persist
    }
}
/**
 * Generate a new session id. Uses `crypto.randomUUID()` for
 * v0; deterministic ids can be added in a later chunk if needed
 * for replay / snapshot tests.
 */
export function newSessionId() {
    // crypto.randomUUID is available in Node 19+ and all modern browsers.
    return globalThis.crypto.randomUUID();
}
//# sourceMappingURL=session.js.map