/**
 * commandSemanticsValidation — sixth of the 6 bash validators.
 *
 * **Rule:** the command must be syntactically sane. Block if it has
 * unbalanced quotes or unescaped backticks.
 *
 * **Why this matters:** shell injection attacks often rely on
 * malformed quoting. A user typing `rm -rf /` is intentional; a
 * tool output that contains `"; rm -rf /` is suspicious. The
 * semantics validator catches the second kind.
 *
 * **Limitations:** this is a heuristic. It does not parse shell. A
 * user who writes `echo "hello"` with one missing closing quote is
 * blocked. A user who writes `printf '%s' "abc" "def"` (even count)
 * is allowed. False positives are rare; false negatives are caught
 * by the next layer (the actual shell will reject the malformed
 * command).
 *
 * **Design doc:** §6.2 of `docs/design.md`.
 */
/**
 * Return true if the command has unbalanced shell quotes.
 *
 * This is a small state machine rather than a raw character count:
 * - single quotes: nothing is escaped inside them (POSIX);
 * - double quotes: backslash escapes the next character;
 * - outside quotes: backslash escapes the next character;
 * - a quote inside a differently-quoted region is literal
 *   (`"it's"` has a balanced apostrophe; the old char-count
 *   version blocked it as a false positive).
 *
 * Unclosed regions at end of input are unbalanced.
 */
export function hasUnbalancedQuotes(command) {
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    for (const ch of command) {
        if (escaped) {
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
    }
    return inSingle || inDouble;
}
/**
 * Check for backtick characters. Backticks in bash invoke command
 * substitution (`echo $(date)` is preferred, but legacy code uses
 * `` `date` ``). Most agents should use `$(...)` instead; blocking
 * backticks forces a cleaner style and prevents a class of
 * injection.
 */
export function containsBackticks(command) {
    return command.includes("`");
}
export const commandSemanticsValidation = {
    name: "command-semantics",
    async validate(input) {
        if (hasUnbalancedQuotes(input.command)) {
            return { kind: "block", reason: "unbalanced quotes" };
        }
        if (containsBackticks(input.command)) {
            return { kind: "block", reason: "backticks not allowed" };
        }
        return { kind: "allow" };
    },
};
//# sourceMappingURL=semantics.js.map