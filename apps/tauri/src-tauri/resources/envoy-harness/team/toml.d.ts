/**
 * Minimal TOML reader for `TeamConfig`.
 *
 * **Why hand-rolled:** the team config uses a small
 * subset of TOML. Pulling in `@iarna/toml` (or any
 * other TOML library) is overkill for v0 and adds
 * a runtime dep. ~150 lines of TypeScript handles
 * the subset we need; a future chunk can swap in
 * a real library if the schema grows.
 *
 * **Supported v0 subset:**
 * - `key = "string"` — top-level + inside tables.
 * - `key = [array, of, strings]` — string arrays.
 * - `key = "value with \"escapes\" and \\backslash"` —
 *   basic string escapes (`\\`, `\"`, `\n`, `\t`).
 * - `# comment` — full-line comments.
 * - `[section]` — single-level tables.
 * - `[[agents]]` — array of tables.
 * - Blank lines.
 *
 * **Not supported (v0):**
 * - Integer / float / boolean / datetime values.
 * - Nested inline tables `{ ... }`.
 * - Multiline strings.
 * - Array of tables at non-root (`[[a.b]]`).
 * - Dotted keys (`a.b = 1`).
 *
 * The parser fails fast on any of the above with a
 * descriptive error message ("TOML: line N: ... not
 * supported in v0").
 *
 * **Stability:** the public surface is
 * `parseTeamToml(input: string): TeamConfig`. Additive
 * (new fields on the result are additive; the parser
 * is v0, so adding new value kinds is a separate
 * concern).
 */
import type { TeamConfig } from "./types.js";
/** Thrown by the TOML parser on bad input. */
export declare class TomlParseError extends Error {
    readonly lineNumber: number;
    readonly line: string;
    constructor(lineNumber: number, line: string, message: string);
}
/**
 * Parse a TOML team config. Throws `TomlParseError`
 * on bad input. The shape matches `TeamConfig`.
 */
export declare function parseTeamToml(input: string): TeamConfig;
//# sourceMappingURL=toml.d.ts.map