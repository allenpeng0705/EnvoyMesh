/**
 * Slash palette — local + protocol-backed commands (Claude Code / Codex parity).
 */
export type SlashResult = {
    kind: "help";
    text: string;
} | {
    kind: "cancel";
} | {
    kind: "mesh";
    action?: "show" | "connect";
    endpoint?: string;
} | {
    kind: "peers";
} | {
    kind: "cluster";
} | {
    kind: "team";
} | {
    kind: "scoreboard";
} | {
    kind: "route";
    tag: string;
} | {
    kind: "search";
    term: string;
} | {
    kind: "trace";
} | {
    kind: "tools";
} | {
    kind: "config";
} | {
    kind: "session";
} | {
    kind: "status";
} | {
    kind: "cost";
} | {
    kind: "clear";
} | {
    kind: "new";
} | {
    kind: "context";
} | {
    kind: "compact";
    keep?: number;
    budget?: number;
    summarize?: boolean;
} | {
    kind: "provider";
    name: string;
    model?: string;
} | {
    kind: "model";
} | {
    kind: "sandbox";
    mode: string;
} | {
    kind: "approval";
    mode: string;
} | {
    kind: "permissions";
    mode: "safe-only" | "always-confirm" | "off" | undefined;
} | {
    kind: "diff";
    staged?: boolean;
    stat?: boolean;
} | {
    kind: "git-status";
} | {
    kind: "hooks";
} | {
    kind: "mcp";
} | {
    kind: "agents";
} | {
    kind: "memory";
    op: "list" | "read" | "add";
    name?: string;
    body?: string;
} | {
    kind: "plan";
    action: string;
    text?: string;
    reason?: string;
} | {
    kind: "review";
    staged?: boolean;
} | {
    kind: "init";
} | {
    kind: "resume";
    id?: string;
} | {
    kind: "quit";
} | {
    kind: "unknown";
    command: string;
};
/** Distributed mesh slash commands (cluster collaboration). */
export declare const MESH_SLASH_COMMANDS: ReadonlyArray<{
    name: string;
    description: string;
}>;
/** The slash-command palette (for help + tab completion). */
export declare const SLASH_COMMANDS: ReadonlyArray<{
    name: string;
    description: string;
}>;
/** Parse a line that starts with `/`. Non-slash input returns null. */
export declare function parseSlash(line: string): SlashResult | null;
/**
 * Slash-palette items for the current buffer: commands matching an
 * in-progress `/prefix` token (no space yet). Empty for non-slash input.
 */
export declare function matchingSlashCommands(buffer: string): string[];
//# sourceMappingURL=slash.d.ts.map