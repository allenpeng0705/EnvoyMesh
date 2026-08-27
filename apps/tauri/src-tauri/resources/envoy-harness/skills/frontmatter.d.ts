/**
 * SKILL.md frontmatter parser (YAML subset, hand-written).
 *
 * **Why no `yaml` library:** SKILL.md frontmatter is a small,
 * stable subset of YAML — `name: foo`, `description: bar`,
 * `when-to-use: baz`. Pulling a YAML parser for this is overkill
 * and adds a runtime dep we don't need. The shape is:
 *
 * ```
 * ---
 * name: my-skill
 * description: A short description.
 * when-to-use: When the user wants to do X.
 * ---
 * Body markdown here.
 * ```
 *
 * **Failure mode:** on any parse error, throws `SkillError` with
 * the offending line / field. The fs-provider catches per-file
 * so one bad skill doesn't kill the catalog.
 */
/** A minimal subset of the SKILL.md frontmatter shape. */
export interface SkillFrontmatter {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    /** Future-compat: any extra fields are preserved verbatim. */
    readonly extra: Readonly<Record<string, string>>;
}
/** Parse the frontmatter block from raw SKILL.md contents. */
export declare function parseFrontmatter(raw: string): {
    frontmatter: SkillFrontmatter;
    body: string;
};
//# sourceMappingURL=frontmatter.d.ts.map