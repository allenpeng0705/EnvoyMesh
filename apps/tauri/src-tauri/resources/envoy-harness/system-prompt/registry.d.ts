/**
 * Phase G — system-prompt section registry + ordered renderer.
 */
import type { PromptAssemblyContext, PromptSection } from "./types.js";
export interface SystemPromptRegistry {
    /** Register a section. Duplicate names throw. Returns a disposer. */
    register(section: PromptSection): () => void;
    /** Registered sections in ascending order. */
    sections(): readonly PromptSection[];
    /**
     * Render the assembled system prompt: resolve every section's text in
     * ascending order and join with a blank line. A single `complete`
     * section becomes the sole content; more than one throws.
     */
    render(ctx?: PromptAssemblyContext): Promise<string>;
}
export declare function createSystemPromptRegistry(): SystemPromptRegistry;
//# sourceMappingURL=registry.d.ts.map