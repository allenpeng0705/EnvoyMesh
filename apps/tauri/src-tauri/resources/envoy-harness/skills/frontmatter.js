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
import { SkillError } from "./types.js";
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Parse the frontmatter block from raw SKILL.md contents. */
export function parseFrontmatter(raw) {
    if (!raw.startsWith("---")) {
        throw new SkillError("SKILL.md must start with a YAML frontmatter block (--- ... ---)", "MISSING_FRONTMATTER");
    }
    // Look for the closing `---` on its own line. The leading
    // newline after the opening `---` is part of the body content.
    const endIdx = raw.indexOf("\n---", 3);
    if (endIdx < 0) {
        throw new SkillError("SKILL.md frontmatter has no closing ---", "MISSING_FRONTMATTER");
    }
    const fmBlock = raw.slice(3, endIdx);
    // The body starts AFTER the closing `---` and the following
    // newline (if any). The first line of the body is the line
    // right after `\n---`.
    const afterFence = raw.slice(endIdx + 4);
    const body = afterFence.startsWith("\n") ? afterFence.slice(1) : afterFence;
    const lines = fmBlock.split("\n");
    const map = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#"))
            continue;
        const colon = trimmed.indexOf(":");
        if (colon < 0)
            continue;
        const key = trimmed.slice(0, colon).trim();
        const value = trimmed.slice(colon + 1).trim();
        if (key.length === 0)
            continue;
        // Strip surrounding quotes (single or double) if present.
        map[key] = stripQuotes(value);
    }
    const name = map["name"];
    if (typeof name !== "string" || name.length === 0) {
        throw new SkillError("SKILL.md frontmatter missing required field: name", "PARSE_ERROR");
    }
    if (!NAME_RE.test(name)) {
        throw new SkillError(`SKILL.md name "${name}" does not match ${NAME_RE}`, "INVALID_NAME");
    }
    const description = map["description"];
    if (typeof description !== "string" || description.length === 0) {
        throw new SkillError("SKILL.md frontmatter missing required field: description", "PARSE_ERROR");
    }
    const whenToUse = map["when-to-use"] ?? map["whenToUse"];
    // Collect extras (anything not in the known fields).
    const known = new Set(["name", "description", "when-to-use", "whenToUse"]);
    const extra = {};
    for (const [k, v] of Object.entries(map)) {
        if (!known.has(k))
            extra[k] = v;
    }
    const frontmatter = {
        name,
        description,
        ...(whenToUse !== undefined ? { whenToUse } : {}),
        extra,
    };
    return { frontmatter, body };
}
function stripQuotes(value) {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}
//# sourceMappingURL=frontmatter.js.map