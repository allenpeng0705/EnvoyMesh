/**
 * Codex-shaped shell environment policy — filter env for bash / jobs.
 */
import { z } from "zod";
export const ShellEnvironmentPolicySchema = z
    .object({
    /**
     * Inherit mode:
     * - `all` — full parent env (default)
     * - `core` — PATH/HOME/USER/SHELL/… only
     * - `none` — start empty (then apply `set` / includes)
     */
    inherit: z.enum(["all", "core", "none"]).optional(),
    /** Regex patterns of env var names to drop (after inherit). */
    exclude: z.array(z.string()).optional(),
    /** When set, only names matching these regexes are kept. */
    includeOnly: z.array(z.string()).optional(),
    /** Extra KEY=value pairs to set/override. */
    set: z.record(z.string()).optional(),
    /** Skip default secret-ish excludes (KEY/TOKEN/SECRET/PASSWORD). */
    ignoreDefaultExcludes: z.boolean().optional(),
})
    .strict();
const CORE_UNIX = new Set([
    "HOME",
    "LOGNAME",
    "PATH",
    "SHELL",
    "USER",
    "TMPDIR",
    "TERM",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
]);
const DEFAULT_EXCLUDE = /(^|_)(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_KEY)(_|$)/i;
/**
 * Build the env map for a shell spawn under the given policy.
 * When `policy` is undefined, returns a filtered copy of `process.env`.
 */
export function applyShellEnvironmentPolicy(policy, source = process.env) {
    const inherit = policy?.inherit ?? "all";
    let env = {};
    if (inherit === "all") {
        for (const [k, v] of Object.entries(source)) {
            if (v !== undefined)
                env[k] = v;
        }
    }
    else if (inherit === "core") {
        for (const [k, v] of Object.entries(source)) {
            if (v !== undefined && CORE_UNIX.has(k))
                env[k] = v;
        }
    }
    // inherit === "none" → empty
    if (policy?.ignoreDefaultExcludes !== true) {
        env = filterByName(env, (name) => !DEFAULT_EXCLUDE.test(name));
    }
    for (const pattern of policy?.exclude ?? []) {
        const re = safeRegex(pattern);
        if (re === undefined)
            continue;
        env = filterByName(env, (name) => !re.test(name));
    }
    if (policy?.includeOnly !== undefined && policy.includeOnly.length > 0) {
        const res = policy.includeOnly
            .map(safeRegex)
            .filter((r) => r !== undefined);
        if (res.length > 0) {
            env = filterByName(env, (name) => res.some((r) => r.test(name)));
        }
    }
    if (policy?.set !== undefined) {
        for (const [k, v] of Object.entries(policy.set)) {
            env[k] = v;
        }
    }
    return env;
}
function filterByName(env, keep) {
    const out = {};
    for (const [k, v] of Object.entries(env)) {
        if (keep(k))
            out[k] = v;
    }
    return out;
}
function safeRegex(pattern) {
    try {
        return new RegExp(pattern, "i");
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=shell-env.js.map