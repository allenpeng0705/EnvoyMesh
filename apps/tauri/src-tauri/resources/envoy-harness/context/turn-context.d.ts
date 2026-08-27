/**
 * Assemble per-turn contextual fragments (skills, memories, plan)
 * before the model call — DeepSeek / Codex pattern.
 */
import type { MemoryStore } from "../memories/store.js";
import type { PlanState } from "../plan/state.js";
import { skillCatalogDigest } from "../skills/catalog.js";
import type { SkillRegistry } from "../skills/registry.js";
export interface AssembleTurnContextOptions {
    cwd: string;
    signal: AbortSignal;
    memoryStore?: MemoryStore;
    skills?: SkillRegistry;
    /** Previous skill catalog digest (stable KV-cache prefix). */
    skillCatalogDigest?: string;
    plan?: PlanState;
    /** Token budget for assembled fragments (default 40_000). */
    budget?: number;
}
export interface AssembledTurnContext {
    /** Text to prepend as a user message (empty if nothing to inject). */
    text: string;
    /** Updated skill catalog digest. */
    skillCatalogDigest: string | undefined;
    included: ReadonlyArray<string>;
    dropped: ReadonlyArray<string>;
}
/**
 * Build budgeted turn context from memory index, skill catalog, and plan.
 */
export declare function assembleTurnContext(options: AssembleTurnContextOptions): Promise<AssembledTurnContext>;
export { skillCatalogDigest };
//# sourceMappingURL=turn-context.d.ts.map