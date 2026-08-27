/**
 * Phase G / Item 3 — SKILL.md loader public API.
 *
 * Loads `SKILL.md` files from project + user roots
 * (codex / deepseek / universal) and exposes them as a
 * `SkillRegistry` + model-facing tools.
 *
 * **Typical wiring (CLI / Tauri hosts):**
 *
 * ```ts
 * const skills = createSkillRegistry();
 * skills.registerProvider(
 *   createFilesystemSkillProvider({ homeDir: os.homedir() }),
 * );
 * registerSkillTools(tools, skills);
 * ```
 */
export { type FilesystemSkillProviderOptions, type SkillRoot, createFilesystemSkillProvider, defaultSkillRoots, } from "./fs-provider.js";
export { parseFrontmatter, type SkillFrontmatter } from "./frontmatter.js";
export { type SkillRegistry, createSkillRegistry, } from "./registry.js";
export { renderSkillContent } from "./render.js";
export { renderSkillCatalog, skillCatalogDigest, nextCatalogMessage, createSkillCatalogFragment, type SkillCatalogOptions, } from "./catalog.js";
export { type SkillDefinition, type SkillProvider, type SkillSummary, SkillError, } from "./types.js";
export { makeSkillListTool, makeSkillTool, registerSkillTools, } from "./tool-skill.js";
//# sourceMappingURL=index.d.ts.map