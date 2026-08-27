/**
 * Render a SkillDefinition into the canonical `<skill_content>`
 * block (deepseek shape). The model receives this verbatim when
 * it invokes the `skill` tool.
 *
 * **Format (deepseek convention):**
 *
 * ```
 * <skill_content>
 * <name>my-skill</name>
 * <description>...</description>
 * <body>
 * (markdown body, indented)
 * </body>
 * </skill_content>
 * ```
 *
 * **Why this exact shape:** the deepseek design's render
 * function is the de-facto standard. Matching it means an
 * envoy-harness skill is portable — drop the same SKILL.md
 * into a deepseek root and it works.
 */
import type { SkillDefinition } from "./types.js";
export declare function renderSkillContent(skill: SkillDefinition): string;
//# sourceMappingURL=render.d.ts.map