/**
 * U6 — minimal ANSI theme helpers (no TUI framework).
 * Screen mode applies colors; plain mode and tests use plain text.
 */
export declare const SGR: {
    readonly reset: "\u001B[0m";
    readonly bold: "\u001B[1m";
    readonly dim: "\u001B[2m";
    readonly cyan: "\u001B[36m";
    readonly green: "\u001B[32m";
    readonly red: "\u001B[31m";
    readonly yellow: "\u001B[33m";
    readonly magenta: "\u001B[35m";
    readonly inverse: "\u001B[7m";
};
export declare function color(text: string, sgr: string): string;
/** Strip ANSI for hermetic assertions. */
export declare function stripAnsi(text: string): string;
//# sourceMappingURL=theme.d.ts.map