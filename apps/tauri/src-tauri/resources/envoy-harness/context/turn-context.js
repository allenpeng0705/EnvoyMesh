/**
 * Assemble per-turn contextual fragments (skills, memories, plan)
 * before the model call — DeepSeek / Codex pattern.
 */
import { assembleFragments, } from "./fragment.js";
import { buildMemoryIndex } from "../memories/inject.js";
import { buildPlanFragment } from "../plan/inject.js";
import { createSkillCatalogFragment, nextCatalogMessage, skillCatalogDigest, } from "../skills/catalog.js";
/**
 * Build budgeted turn context from memory index, skill catalog, and plan.
 */
export async function assembleTurnContext(options) {
    const fragments = [];
    let nextDigest = options.skillCatalogDigest;
    if (options.plan !== undefined) {
        fragments.push(...buildPlanFragment(options.plan));
    }
    if (options.memoryStore !== undefined) {
        try {
            fragments.push(...(await buildMemoryIndex(options.memoryStore)));
        }
        catch {
            // Best-effort: over-budget or store errors must not fail the turn.
        }
    }
    if (options.skills !== undefined) {
        try {
            const summaries = await options.skills.list({
                cwd: options.cwd,
                signal: options.signal,
            });
            const catalog = nextCatalogMessage(summaries, options.skillCatalogDigest);
            nextDigest = catalog.digest;
            // Skip the empty catalog: an empty registry must not inject
            // a `<available_skills>\n</available_skills>` stub into the
            // transcript (it would add a phantom user message on every
            // fresh session). The digest still advances so a later skill
            // addition triggers injection.
            if (catalog.changed &&
                catalog.text.length > 0 &&
                summaries.length > 0) {
                fragments.push(createSkillCatalogFragment(summaries));
            }
        }
        catch {
            // Best-effort.
        }
    }
    if (fragments.length === 0) {
        return {
            text: "",
            skillCatalogDigest: nextDigest,
            included: [],
            dropped: [],
        };
    }
    const assembled = assembleFragments(fragments, options.budget);
    return {
        text: assembled.text,
        skillCatalogDigest: nextDigest,
        included: assembled.included,
        dropped: assembled.dropped,
    };
}
export { skillCatalogDigest };
//# sourceMappingURL=turn-context.js.map