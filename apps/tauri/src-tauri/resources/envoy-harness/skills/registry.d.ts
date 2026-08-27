/**
 * Skill registry — multiple providers, last-write-wins on name
 * conflicts. A second provider with the same skill name
 * shadows the first.
 *
 * **Why a registry (vs. one provider):** deepseek and codex
 * ship different root layouts; the Agent Skills spec adds a
 * third. The registry is the seam that lets all three roots
 * coexist in one runtime without forcing a fork in fs-provider.
 */
import type { SkillDefinition, SkillProvider, SkillSummary } from "./types.js";
export interface SkillRegistry {
    registerProvider(provider: SkillProvider): () => void;
    list(opts: {
        cwd: string;
        signal: AbortSignal;
    }): Promise<ReadonlyArray<SkillSummary>>;
    get(name: string, opts: {
        cwd: string;
        signal: AbortSignal;
    }): Promise<SkillDefinition | undefined>;
    /** Names of every registered provider, in registration order. */
    providers(): ReadonlyArray<string>;
}
export declare function createSkillRegistry(): SkillRegistry;
//# sourceMappingURL=registry.d.ts.map