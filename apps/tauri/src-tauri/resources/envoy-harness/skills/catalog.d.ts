/**
 * Phase G — skill catalog projection (deepseek's model-facing catalog,
 * envoy-native).
 *
 * Deepseek injects a durable "available skills" message so the model can
 * discover skills before loading them, and re-publishes it only when the
 * catalog digest changes. Envoy mirrors that: `renderSkillCatalog` is the
 * canonical `<available_skills>` block, `skillCatalogDigest` is the change
 * key, and `nextCatalogMessage` returns the replacement text only on
 * membership/description changes (stable prompt prefix → cache friendly).
 *
 * `createSkillCatalogFragment` wraps the catalog as a bounded
 * `ContextualUserFragment` for hosts that inject it as a user-role
 * fragment in their prompt assembly.
 */
import { type ContextualUserFragment } from "../context/fragment.js";
import type { SkillSummary } from "./types.js";
export interface SkillCatalogOptions {
    /** Max catalog entries (default 200). */
    maxEntries?: number;
    /** Per-entry description truncation in chars (default 240). */
    maxDescriptionChars?: number;
    /** Token cap for the bounded fragment (default 10_000). */
    tokenCap?: number;
}
/** Render the canonical `<available_skills>` catalog block. */
export declare function renderSkillCatalog(summaries: ReadonlyArray<SkillSummary>, options?: SkillCatalogOptions): string;
/** Stable change key over the sorted name+description set. */
export declare function skillCatalogDigest(summaries: ReadonlyArray<SkillSummary>): string;
/**
 * Deepseek's digest-based re-publish semantics: returns the catalog text
 * only when the digest changed since `prevDigest`, else empty.
 */
export declare function nextCatalogMessage(summaries: ReadonlyArray<SkillSummary>, prevDigest: string | undefined, options?: SkillCatalogOptions): {
    text: string;
    digest: string;
    changed: boolean;
};
/** A bounded user-role fragment hosts can inject into prompt assembly. */
export declare function createSkillCatalogFragment(summaries: ReadonlyArray<SkillSummary>, options?: SkillCatalogOptions): ContextualUserFragment;
//# sourceMappingURL=catalog.d.ts.map