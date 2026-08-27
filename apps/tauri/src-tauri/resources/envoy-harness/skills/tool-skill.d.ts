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
import type { Tool } from "../tools/types.js";
import type { SkillRegistry } from "./registry.js";
/** Build the `skill` tool bound to a registry. */
export declare function makeSkillTool(registry: SkillRegistry): Tool;
/**
 * Build the `skill_list` tool — returns the catalog summary
 * (name + description + provider) for every available skill.
 * The model uses this to discover skills before loading one.
 */
export declare function makeSkillListTool(registry: SkillRegistry): Tool;
/** Register both tools on a tool registry. */
export declare function registerSkillTools(tools: {
    register(tool: Tool): unknown;
}, skillRegistry: SkillRegistry): void;
//# sourceMappingURL=tool-skill.d.ts.map