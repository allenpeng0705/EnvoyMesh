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
/** Thrown by the TOML parser on bad input. */
export class TomlParseError extends Error {
    lineNumber;
    line;
    constructor(lineNumber, line, message) {
        super(`TOML: line ${lineNumber}: ${message} (got: ${JSON.stringify(line)})`);
        this.lineNumber = lineNumber;
        this.line = line;
        this.name = "TomlParseError";
    }
}
/**
 * Parse a TOML team config. Throws `TomlParseError`
 * on bad input. The shape matches `TeamConfig`.
 */
export function parseTeamToml(input) {
    const lines = input.split(/\r?\n/);
    const result = {};
    let currentSection = null;
    let currentArray = null;
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        const lineNo = i + 1;
        if (line === "" || line.startsWith("#"))
            continue;
        // `[[array]]` — start a new array-of-tables entry.
        const arrMatch = /^\[\[([a-zA-Z_][\w-]*)\]\]$/.exec(line);
        if (arrMatch) {
            const name = arrMatch[1];
            if (currentArray && currentSection !== name) {
                throw new TomlParseError(lineNo, rawLine, "nested array of tables not supported");
            }
            currentSection = name;
            if (!Array.isArray(result[name])) {
                result[name] = [];
            }
            currentArray = result[name];
            currentArray.push({});
            continue;
        }
        // `[section]` — start a new table.
        const secMatch = /^\[([a-zA-Z_][\w-]*)\]$/.exec(line);
        if (secMatch) {
            const name = secMatch[1];
            currentSection = name;
            currentArray = null;
            if (result[name] === undefined) {
                result[name] = {};
            }
            continue;
        }
        // `key = value` — assignment.
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) {
            throw new TomlParseError(lineNo, rawLine, "expected key = value");
        }
        const key = line.slice(0, eqIdx).trim();
        const valueStr = line.slice(eqIdx + 1).trim();
        if (!/^[a-zA-Z_][\w-]*$/.test(key)) {
            throw new TomlParseError(lineNo, rawLine, "invalid key");
        }
        let value;
        if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
            value = parseString(valueStr);
        }
        else if (valueStr.startsWith("[") && valueStr.endsWith("]")) {
            value = parseStringArray(valueStr);
        }
        else {
            throw new TomlParseError(lineNo, rawLine, "value must be a string or string array in v0");
        }
        // Write to the right place.
        if (currentArray) {
            const entry = currentArray[currentArray.length - 1];
            entry[key] = value;
        }
        else if (currentSection) {
            const sec = result[currentSection];
            sec[key] = value;
        }
        else {
            result[key] = value;
        }
    }
    return toTeamConfig(result);
}
// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------
/** Parse a TOML basic string (double-quoted, with
 *  the v0 escape subset). */
function parseString(s) {
    // Strip the surrounding quotes.
    const inner = s.slice(1, -1);
    let out = "";
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === "\\") {
            const next = inner[i + 1];
            if (next === "\\") {
                out += "\\";
                i++;
            }
            else if (next === '"') {
                out += '"';
                i++;
            }
            else if (next === "n") {
                out += "\n";
                i++;
            }
            else if (next === "t") {
                out += "\t";
                i++;
            }
            else {
                throw new Error(`TOML: unsupported escape: \\${next} (in ${JSON.stringify(s)})`);
            }
        }
        else {
            out += ch;
        }
    }
    return out;
}
/** Parse a TOML array of strings. */
function parseStringArray(s) {
    const inner = s.slice(1, -1).trim();
    if (inner === "")
        return [];
    // Split on commas at the top level (no nested
    // arrays in v0). Trim each element; each must
    // be a quoted string.
    const parts = splitTopLevel(inner, ",");
    return parts.map((p) => {
        const t = p.trim();
        if (!t.startsWith('"') || !t.endsWith('"')) {
            throw new Error(`TOML: array element must be a string: ${JSON.stringify(t)}`);
        }
        return parseString(t);
    });
}
/** Split a string on a top-level delimiter (no
 *  nesting in v0). */
function splitTopLevel(s, delim) {
    const out = [];
    let buf = "";
    let inString = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
            inString = !inString;
            buf += ch;
        }
        else if (ch === delim && !inString) {
            out.push(buf);
            buf = "";
        }
        else {
            buf += ch;
        }
    }
    if (buf.length > 0)
        out.push(buf);
    return out;
}
// ---------------------------------------------------------------------------
// TOML -> TeamConfig
// ---------------------------------------------------------------------------
function toTeamConfig(raw) {
    const name = raw["name"];
    if (typeof name !== "string") {
        throw new TomlParseError(0, "", "missing or invalid `name` (string required)");
    }
    const agentsRaw = raw["agents"];
    if (!Array.isArray(agentsRaw) || agentsRaw.length === 0) {
        throw new TomlParseError(0, "", "missing or empty `[[agents]]` table");
    }
    const agents = agentsRaw.map((a, i) => toAgentSpec(a, i));
    const scheduleRaw = raw["schedule"];
    let schedule;
    if (scheduleRaw !== undefined) {
        if (typeof scheduleRaw !== "object" || scheduleRaw === null) {
            throw new TomlParseError(0, "", "`schedule` must be a table");
        }
        const cron = scheduleRaw["cron"];
        if (typeof cron !== "string") {
            throw new TomlParseError(0, "", "`schedule.cron` must be a string");
        }
        if (!/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(cron)) {
            throw new TomlParseError(0, cron, `\`schedule.cron\` must be a 5-field cron expression (got: ${JSON.stringify(cron)})`);
        }
        schedule = { cron };
    }
    return {
        name,
        agents,
        ...(schedule ? { schedule } : {}),
    };
}
function toAgentSpec(raw, index) {
    if (typeof raw !== "object" || raw === null) {
        throw new TomlParseError(0, "", `agents[${index}] must be a table`);
    }
    const r = raw;
    const id = r["id"];
    const role = r["role"];
    const systemPrompt = r["system_prompt"];
    const objective = r["objective"];
    const host = r["host"];
    if (typeof id !== "string") {
        throw new TomlParseError(0, "", `agents[${index}].id must be a string`);
    }
    if (typeof role !== "string") {
        throw new TomlParseError(0, "", `agents[${index}].role must be a string`);
    }
    // Phase G: `system_prompt` is optional — when absent, the runner
    // defaults to the assembled AGENTS.md + guidance prompt.
    if (systemPrompt !== undefined && typeof systemPrompt !== "string") {
        throw new TomlParseError(0, "", `agents[${index}].system_prompt must be a string`);
    }
    if (host !== undefined && typeof host !== "string") {
        throw new TomlParseError(0, "", `agents[${index}].host must be a string`);
    }
    if (typeof objective !== "string") {
        throw new TomlParseError(0, "", `agents[${index}].objective must be a string`);
    }
    let dependsOn = [];
    if (r["depends_on"] !== undefined) {
        if (!Array.isArray(r["depends_on"])) {
            throw new TomlParseError(0, "", `agents[${index}].depends_on must be a string array`);
        }
        dependsOn = r["depends_on"].map((d, j) => {
            if (typeof d !== "string") {
                throw new TomlParseError(0, "", `agents[${index}].depends_on[${j}] must be a string`);
            }
            return d;
        });
    }
    return {
        id,
        role,
        objective,
        dependsOn,
        ...(host !== undefined ? { host } : {}),
        ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    };
}
//# sourceMappingURL=toml.js.map