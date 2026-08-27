/**
 * pathValidation — fifth of the 6 bash validators.
 *
 * **Rule:** in workspace-write mode, every path-like token in
 * `argv` must resolve to a path under one of the `writable_roots`
 * (or the cwd if no roots are configured).
 *
 * **Why per-argument and not command-string scan?** the argv is
 * already tokenized (the bash tool passes a real tokenizer's
 * output; tests pass explicit argv). Scanning the command string
 * for paths is brittle (paths can be inside quotes, behind
 * variables, escaped). Tokenized argv is what the shell will
 * actually pass to the command.
 *
 * **Why relative paths are checked too (not just `/` and `~`)?**
 * `../sibling` and `..` escape the workspace without starting
 * with `/`. v0 only checked absolute/`~` tokens, which let
 * `rm -rf ../secret` and `echo hi > ../outside.txt` through.
 * The design §2.5 itself flags this as the classic
 * `pathValidation` failure mode ("lets `../` escape cwd").
 * A token is treated as a path when it starts with `/`, `~`,
 * or `.`, or contains a `/`. Plain filenames (`file.txt`) are
 * resolved against cwd and are inside the roots by definition.
 *
 * **What is skipped:** flag-like tokens starting with `-` (e.g.
 * `-name`, `-m`) and shell operators (`>`, `&&`, `|`, `;`).
 *
 * **Why `path.resolve`?** `argv` paths may be relative. We resolve
 * them against `cwd` so a relative `../foo` is checked against the
 * roots correctly.
 *
 * **Why boundary-aware root matching?** `expanded.startsWith(root)`
 * would accept `/home/foo2` when the root is `/home/foo`. We compare
 * against `root + path.sep` so a sibling directory is rejected.
 *
 * **Design doc:** §6.2 of `docs/design.md`.
 */
import * as os from "node:os";
import * as path from "node:path";
/**
 * Resolve a `~`-prefixed argument to an absolute path.
 *
 * - `~` or `~/foo` → the current user's home directory.
 * - `~user` or `~user/foo` → `/home/user` (Linux default). The actual
 *   user's home would require a name service lookup; we use the
 *   Linux convention which is what EnvoyMesh targets. macOS users
 *   with non-standard home paths should override the policy.
 *
 * Returns the original `arg` unchanged if it doesn't start with `~`.
 */
function expandTilde(arg) {
    if (!arg.startsWith("~"))
        return arg;
    if (arg === "~" || arg.startsWith("~/")) {
        const home = os.homedir();
        return arg === "~" ? home : path.join(home, arg.slice(2));
    }
    // ~user or ~user/foo
    const slashIdx = arg.indexOf("/");
    const user = slashIdx === -1 ? arg.slice(1) : arg.slice(1, slashIdx);
    const rest = slashIdx === -1 ? "" : arg.slice(slashIdx);
    // Linux convention: home dirs live under /home. Real systems may
    // differ; this is the common case.
    return `/home/${user}${rest}`;
}
export const pathValidation = {
    name: "path",
    async validate(input) {
        if (input.policy.mode !== "workspace-write")
            return { kind: "allow" };
        const roots = input.policy.writableRoots.length > 0
            ? input.policy.writableRoots
            : [input.cwd];
        for (const arg of input.argv) {
            if (!looksLikePath(arg))
                continue;
            if (isFlagToken(arg))
                continue;
            const expanded = arg.startsWith("~")
                ? expandTilde(arg)
                : path.resolve(input.cwd, arg);
            if (!roots.some((root) => isWithin(path.resolve(input.cwd, root), expanded))) {
                return {
                    kind: "block",
                    reason: `path ${arg} is outside writable_roots`,
                };
            }
        }
        return { kind: "allow" };
    },
};
/**
 * True if a token could be a filesystem path: absolute, `~`-prefixed,
 * starts with `.` (`./`, `../`, `.`), or contains a `/`.
 */
function looksLikePath(arg) {
    return (arg.startsWith("/") ||
        arg.startsWith("~") ||
        arg.startsWith(".") ||
        arg.includes("/"));
}
/** Skip flag-like tokens (`-x`, `--long`) — they are options, not paths. */
function isFlagToken(arg) {
    return arg.startsWith("-");
}
/**
 * Boundary-aware containment check: `p` is within `root` iff it
 * equals the root or starts with `root + path.sep`.
 */
function isWithin(root, p) {
    return p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}
//# sourceMappingURL=path.js.map