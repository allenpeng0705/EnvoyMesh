/**
 * Strip model "thinking" / chain-of-thought wrappers from assistant text.
 *
 * Providers and local models often emit `<think>…</think>`,
 * `<thinking>…</thinking>`, or `<redacted_thinking>…</redacted_thinking>`
 * around private reasoning. Hosts must not show that as the user-facing
 * answer, and the agent loop must not treat a thinking-only `end_turn`
 * as a completed reply.
 */
const THINKING_TAG = "(?:redacted_thinking|thinking|think)";
const THINKING_BLOCK = new RegExp(`<${THINKING_TAG}>[\\s\\S]*?<\\/${THINKING_TAG}>`, "gi");
const UNCLOSED_THINKING = new RegExp(`<${THINKING_TAG}>[\\s\\S]*$`, "gi");
/** Remove closed + trailing unclosed thinking blocks; trim leftover blank lines. */
export function stripThinking(text) {
    return text
        .replace(THINKING_BLOCK, "")
        .replace(UNCLOSED_THINKING, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
/** True when `text` still has user-visible content after stripping thinking. */
export function hasVisibleText(text) {
    return stripThinking(text).length > 0;
}
//# sourceMappingURL=strip-thinking.js.map