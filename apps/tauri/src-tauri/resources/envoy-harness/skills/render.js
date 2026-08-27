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
export function renderSkillContent(skill) {
    const lines = [];
    lines.push("<skill_content>");
    lines.push(`<name>${escapeXml(skill.name)}</name>`);
    lines.push(`<description>${escapeXml(skill.description)}</description>`);
    if (skill.whenToUse !== undefined) {
        lines.push(`<when_to_use>${escapeXml(skill.whenToUse)}</when_to_use>`);
    }
    lines.push(`<provider>${escapeXml(skill.provider)}</provider>`);
    lines.push("<body>");
    // Indent the body for readability. The downstream consumer
    // (the model) parses the block by tag, not by indentation,
    // so this is purely cosmetic.
    for (const line of skill.instructions.split("\n")) {
        lines.push(`  ${line}`);
    }
    lines.push("</body>");
    lines.push("</skill_content>");
    return lines.join("\n");
}
function escapeXml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
//# sourceMappingURL=render.js.map