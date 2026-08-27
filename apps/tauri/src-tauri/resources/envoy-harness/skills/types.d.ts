/**
 * Phase G / Item 3 / SKILL.md loader (L0 reuse).
 *
 * **Why this module exists:** both codex and deepseek ship a
 * `SKILL.md` format for describing agent skills. The emerging
 * Agent Skills spec uses the same shape. One loader makes
 * envoy-harness compatible with all three roots
 * (`~/.codex/skills/`, `~/.dsh/skills/`, `~/.agents/skills/`,
 * project `.envoy/skills/`).
 *
 * **Module layout (per the gap-closure-plan §"SKILL.md loader"):**
 * - `types.ts` — SkillSummary, SkillDefinition, SkillProvider
 * - `frontmatter.ts` — YAML frontmatter parser
 * - `fs-provider.ts` — FilesystemProvider (scans skill roots)
 * - `registry.ts` — Provider registry (registerProvider / list / get)
 * - `render.ts` — Canonical `<skill_content>` block (deepseek shape)
 * - `tool-skill.ts` — Model-facing `skill` tool
 *
 * **Catalog projection (deepseek-style bounded fragment):** out
 * of scope for v0. The model loads skills via the `skill` tool
 * on demand; the catalog digest is a follow-up that integrates
 * with `context/fragment.ts`.
 */
export interface SkillSummary {
    /** kebab-case skill name (matches codex / deepseek convention). */
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    /** Where this skill came from — useful for diagnostics + audit. */
    readonly provider: string;
    readonly invocation: {
        readonly modelInvocable: boolean;
        readonly userInvocable: boolean;
    };
}
export interface SkillDefinition extends SkillSummary {
    /**
     * Resource base path. For filesystem skills, the directory
     * containing the SKILL.md (so other resources in the skill
     * directory are addressable).
     */
    readonly resourceBase: string;
    /** Body of the SKILL.md after frontmatter stripping. */
    readonly instructions: string;
}
export interface SkillProvider {
    readonly name: string;
    list(opts: {
        cwd: string;
        signal: AbortSignal;
    }): Promise<ReadonlyArray<SkillSummary>>;
    get(name: string, opts: {
        cwd: string;
        signal: AbortSignal;
    }): Promise<SkillDefinition | undefined>;
}
/**
 * Validation error — thrown by the frontmatter parser or
 * fs-provider when a SKILL.md is malformed (missing required
 * fields, bad YAML, etc.). The fs-provider catches these per
 * file so one bad skill doesn't kill the whole catalog.
 */
export declare class SkillError extends Error {
    readonly code: "PARSE_ERROR" | "MISSING_FRONTMATTER" | "INVALID_NAME";
    readonly name = "SkillError";
    constructor(message: string, code: "PARSE_ERROR" | "MISSING_FRONTMATTER" | "INVALID_NAME");
}
//# sourceMappingURL=types.d.ts.map