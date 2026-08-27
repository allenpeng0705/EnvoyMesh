/**
 * Model-facing `skill` tool — load a skill by name and return
 * the canonical `<skill_content>` block.
 *
 * **Why a tool, not a system prompt slice:** the catalog
 * projection (§"SKILL.md loader" in the gap-closure plan) is
 * the right long-term design, but it integrates with the
 * `context/fragment.ts` bounded-fragment system. Until the
 * fragment wiring lands, the model loads skills on demand via
 * this tool. The tool contract is stable: same input → same
 * output, regardless of which catalog projection is later
 * layered on top.
 *
 * **The catalog is hidden from the model** (matches codex /
 * deepseek). The model sees only `name` and `description` in
 * the tool's own description, not the full list.
 */
import { z } from "zod";
import { renderSkillCatalog } from "./catalog.js";
import { renderSkillContent } from "./render.js";
/** Build the `skill` tool bound to a registry. */
export function makeSkillTool(registry) {
    return {
        name: "skill",
        description: "Load a skill by name. Skills are reusable instruction " +
            "bundles (SKILL.md). Use `skill_list` first to discover " +
            "available skills; then call this tool with the chosen name " +
            "to receive the canonical skill body.",
        parameters: z.object({
            name: z
                .string()
                .min(1)
                .describe("Skill name (kebab-case). Use `skill_list` to discover."),
        }),
        async execute(args, ctx) {
            const def = await registry.get(args.name, {
                cwd: ctx.cwd,
                signal: ctx.abortSignal,
            });
            if (def === undefined) {
                return {
                    content: `unknown skill: ${args.name}`,
                    isError: true,
                };
            }
            return { content: renderSkillContent(def) };
        },
    };
}
/**
 * Build the `skill_list` tool — returns the catalog summary
 * (name + description + provider) for every available skill.
 * The model uses this to discover skills before loading one.
 */
export function makeSkillListTool(registry) {
    return {
        name: "skill_list",
        description: "List the names and short descriptions of every available skill. " +
            "Use this to discover which skills exist; then call `skill` with " +
            "the chosen name to load its body.",
        parameters: z.object({}),
        async execute(_args, ctx) {
            const summaries = await registry.list({
                cwd: ctx.cwd,
                signal: ctx.abortSignal,
            });
            // The catalog projection (deepseek's `<available_skills>` block) is
            // the canonical discovery surface; the model reads it before calling
            // `skill` with a chosen name.
            return { content: renderSkillCatalog(summaries) };
        },
    };
}
/** Register both tools on a tool registry. */
export function registerSkillTools(tools, skillRegistry) {
    tools.register(makeSkillListTool(skillRegistry));
    tools.register(makeSkillTool(skillRegistry));
}
//# sourceMappingURL=tool-skill.js.map