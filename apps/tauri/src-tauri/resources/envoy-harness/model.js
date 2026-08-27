/**
 * Model adapter — the pluggable surface for "the LLM".
 *
 * **Design doc:** `docs/design.md` §3.4 (runtime core, model call).
 *
 * **Why an interface?** envoy-harness is a harness, not a model
 * vendor. The user can wire it to OpenAI, Anthropic, DeepSeek,
 * Ollama, or a local stub. A `ModelAdapter` interface keeps the
 * runtime agnostic. (Per design target #2 — independently
 * runnable — the harness must work with a fake model for tests
 * and demos.)
 *
 * **`complete()` is the only required method.** Streaming is
 * optional and lives behind a separate method
 * (`completeStreaming`, added in a later chunk). The non-streaming
 * path is enough for v0: get the response, dispatch tool calls,
 * repeat. Streaming is a UX improvement, not a correctness one.
 *
 * **Wire compatibility:** `messages` and `tools` use the local
 * `Message` / `Tool` types from `../tools/types.js`. An adapter
 * for OpenAI / Anthropic translates to the vendor's wire format.
 * The local types are the canonical source of truth; vendor
 * types are derived.
 *
 * **Stability:** the interface is `complete()`. Adding a method
 * is additive; changing the signature is a major version bump.
 */
export {};
//# sourceMappingURL=model.js.map