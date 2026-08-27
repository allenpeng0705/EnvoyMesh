/**
 * Minimal shell tokenizer for permission validation.
 *
 * **Why this exists:** the bash tool must hand `validateBash`
 * a real `argv` (the design says argv is "tokenized", but v0
 * passed `[]`, which made `pathValidation` a no-op). This
 * tokenizer splits a command string into shell words the way
 * `sh` would, well enough for path validation:
 *
 * - Splits on unquoted whitespace.
 * - Respects single quotes (no escapes inside).
 * - Respects double quotes (backslash escapes inside).
 * - Handles backslash escapes outside quotes.
 * - Quote characters are stripped (they are shell syntax, not
 *   part of the word).
 *
 * **What it does NOT do:** full POSIX shell parsing. No
 * handling of `$(...)` expansion semantics, heredocs, glob
 * expansion, or command substitution. `$HOME/x` stays a
 * literal token (path validation can't resolve variables —
 * documented limitation of the heuristic layer).
 *
 * **Stability:** the public surface is `tokenizeShellCommand`.
 * Additive.
 */
/**
 * Split a shell command into words, stripping quotes and
 * honoring backslash escapes. Empty commands yield `[]`.
 *
 * @example
 * ```ts
 * tokenizeShellCommand(`echo hi > ../outside.txt`)
 * // => ["echo", "hi", ">", "../outside.txt"]
 * tokenizeShellCommand(`cat "my file.txt"`)
 * // => ["cat", "my file.txt"]
 * tokenizeShellCommand(`echo a\\"b`)
 * // => ["echo", "a\\"b"]
 * ```
 */
export function tokenizeShellCommand(command) {
    const tokens = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (escaped) {
            current += ch;
            escaped = false;
            continue;
        }
        if (ch === "\\" && !inSingle) {
            escaped = true;
            continue;
        }
        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }
        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }
        if ((ch === " " || ch === "\t" || ch === "\n") && !inSingle && !inDouble) {
            if (current.length > 0) {
                tokens.push(current);
                current = "";
            }
            continue;
        }
        current += ch;
    }
    // Trailing backslash (e.g. `echo foo\`) — keep it in the word.
    if (escaped)
        current += "\\";
    if (current.length > 0)
        tokens.push(current);
    return tokens;
}
//# sourceMappingURL=tokenize.js.map