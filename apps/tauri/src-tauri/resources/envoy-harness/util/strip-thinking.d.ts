/**
 * Strip model "thinking" / chain-of-thought wrappers from assistant text.
 *
 * Providers and local models often emit `<think>…</think>`,
 * `<thinking>…</thinking>`, or `<redacted_thinking>…</redacted_thinking>`
 * around private reasoning. Hosts must not show that as the user-facing
 * answer, and the agent loop must not treat a thinking-only `end_turn`
 * as a completed reply.
 */
/** Remove closed + trailing unclosed thinking blocks; trim leftover blank lines. */
export declare function stripThinking(text: string): string;
/** True when `text` still has user-visible content after stripping thinking. */
export declare function hasVisibleText(text: string): boolean;
//# sourceMappingURL=strip-thinking.d.ts.map