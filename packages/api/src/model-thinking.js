const THINKING_TAG = "(?:think|redacted_thinking|thinking)";
const THINKING_BLOCK_PATTERN = new RegExp(`<${THINKING_TAG}>[\\s\\S]*?<\\/${THINKING_TAG}>`, "i");
function thinkingBlockRegex() {
    return new RegExp(`<${THINKING_TAG}>[\\s\\S]*?<\\/${THINKING_TAG}>`, "gi");
}
function stripTagWrapper(block) {
    return block
        .replace(new RegExp(`^<${THINKING_TAG}>`, "i"), "")
        .replace(new RegExp(`<\\/${THINKING_TAG}>$`, "i"), "")
        .trim();
}
function extractThinkingBlocks(text) {
    const blocks = [];
    for (const match of text.matchAll(thinkingBlockRegex())) {
        const inner = stripTagWrapper(match[0]);
        if (inner)
            blocks.push(inner);
    }
    return blocks;
}
/** Split model output into optional reasoning vs user-visible reply text. */
export function parseModelThinking(text) {
    const blocks = extractThinkingBlocks(text);
    const visibleText = text.replace(thinkingBlockRegex(), "").replace(/\n{3,}/g, "\n\n").trim();
    return {
        thinking: blocks.length > 0 ? blocks.join("\n\n") : null,
        visibleText,
    };
}
/** Remove model reasoning blocks — use before sending chat over the network. */
export function stripModelThinking(text) {
    return parseModelThinking(text).visibleText;
}
export function hasModelThinking(text) {
    return THINKING_BLOCK_PATTERN.test(text);
}
//# sourceMappingURL=model-thinking.js.map