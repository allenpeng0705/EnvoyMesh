/** Hard cap for model-bound prompts (characters, not bytes). */
export const MAX_MODEL_PROMPT_CHARS = 48_000;
/** Max consecutive newline characters after normalization (DoS / log spam guard). */
const MAX_CONSECUTIVE_NEWLINES = 50;
/**
 * Deterministic, non-LLM checks on text before it is passed to any model provider.
 * Intended as a first line of defense against trivial injection and malformed input.
 */
export function evaluateSemanticFirewall(input) {
    const text = input.text;
    if (text.trim().length === 0) {
        return { ok: false, reason: "prompt is empty" };
    }
    if (text.length > MAX_MODEL_PROMPT_CHARS) {
        return { ok: false, reason: `prompt exceeds max length (${MAX_MODEL_PROMPT_CHARS})` };
    }
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
            return { ok: false, reason: "prompt contains disallowed control characters" };
        }
        if (code === 127) {
            return { ok: false, reason: "prompt contains disallowed control characters" };
        }
    }
    const normalized = collapseLongNewlineRuns(text, MAX_CONSECUTIVE_NEWLINES);
    return { ok: true, text: normalized };
}
function collapseLongNewlineRuns(source, maxRun) {
    if (maxRun < 1) {
        return source;
    }
    const pattern = new RegExp(`\n{${maxRun + 1},}`, "g");
    return source.replace(pattern, "\n".repeat(maxRun));
}
//# sourceMappingURL=semantic-firewall.js.map