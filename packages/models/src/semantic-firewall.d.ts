/** Hard cap for model-bound prompts (characters, not bytes). */
export declare const MAX_MODEL_PROMPT_CHARS = 48000;
export type SemanticFirewallResult = {
    ok: true;
    text: string;
} | {
    ok: false;
    reason: string;
};
/**
 * Deterministic, non-LLM checks on text before it is passed to any model provider.
 * Intended as a first line of defense against trivial injection and malformed input.
 */
export declare function evaluateSemanticFirewall(input: {
    text: string;
}): SemanticFirewallResult;
//# sourceMappingURL=semantic-firewall.d.ts.map