export interface ParsedModelThinking {
    /** Combined inner text from all thinking blocks, trimmed; null if none. */
    thinking: string | null;
    /** Message text with thinking blocks removed. */
    visibleText: string;
}
/** Split model output into optional reasoning vs user-visible reply text. */
export declare function parseModelThinking(text: string): ParsedModelThinking;
/** Remove model reasoning blocks — use before sending chat over the network. */
export declare function stripModelThinking(text: string): string;
export declare function hasModelThinking(text: string): boolean;
//# sourceMappingURL=model-thinking.d.ts.map