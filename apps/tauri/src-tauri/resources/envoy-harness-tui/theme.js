/**
 * U6 — minimal ANSI theme helpers (no TUI framework).
 * Screen mode applies colors; plain mode and tests use plain text.
 */
export const SGR = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    inverse: "\x1b[7m",
};
export function color(text, sgr) {
    return `${sgr}${text}${SGR.reset}`;
}
/** Strip ANSI for hermetic assertions. */
export function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}
//# sourceMappingURL=theme.js.map