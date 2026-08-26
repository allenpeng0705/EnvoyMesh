/**
 * U2 — ANSI screen module for the dedicated envoy-harness TUI.
 *
 * A small dependency-free screen: fixed regions (status bar, optional
 * cluster rail, transcript window, input line), diff-based rendering
 * (only changed rows are rewritten), and pure layout helpers that are
 * hermetic-tested without a TTY.
 */
export interface ScreenLayoutModel {
    statusLine: string;
    /** Optional one-line cluster rail (peers + health). */
    railLine?: string;
    /** U6 — view tab strip (Chat · Plan · Memory · Diff · Mesh). */
    tabLine?: string;
    /** Full transcript; the renderer keeps the bottom window. */
    transcript: readonly string[];
    /** The composer buffer split into lines (last line is the bottom row). */
    inputLines: readonly string[];
    /** 0-based line within `inputLines` the cursor is on. Default: last. */
    inputCursorLine?: number;
    /** 0-based cursor column within that line. Default: end of the line. */
    inputCursor?: number;
    /** Optional slash-command palette rows (drawn above the composer). */
    palette?: readonly string[];
    /** Index of the highlighted palette row. */
    paletteSelected?: number;
    /** U6a.5 — dim hint above composer (e.g. image paste). */
    composerHint?: string;
}
export interface ScreenOptions {
    /** Terminal width (default 80). */
    width?: number;
    /** Terminal height (default 24). */
    height?: number;
    /**
     * U5 — ANSI SGR prefix for the status bar (e.g. `"\x1b[36m"` cyan).
     * The row is wrapped with `accent` … `\x1b[0m` at render time.
     */
    accent?: string;
}
/** Visible terminal columns, ignoring ANSI control sequences. */
export declare function displayWidth(text: string): number;
/** Truncate a line to `width` terminal columns without splitting glyphs/ANSI. */
export declare function fitLine(text: string, width: number): string;
/**
 * Compute the fixed-height row layout for a model. Pure — testable
 * without a TTY.
 */
export declare function layoutRows(model: ScreenLayoutModel, width: number, height: number): string[];
export interface StatusBarInfo {
    sessionId?: string;
    model?: string;
    clusterConnected?: number;
    clusterTotal?: number;
    /** When true, show `mesh · /mesh` instead of cluster counts (no peers yet). */
    meshHint?: boolean;
    busy?: boolean;
    /** U6 — active detail view (shown when not chat). */
    view?: string;
}
/** Tab ids rendered in the main strip (coding-agent panels). */
export declare const VIEW_TAB_IDS: readonly ["chat", "plan", "memory", "git-diff", "mesh"];
export type ViewTabId = (typeof VIEW_TAB_IDS)[number];
/**
 * U6 — one-line tab strip. Active tab is bold; optional accent on active.
 * Maps cluster/team/scoreboard views to Mesh tab highlight.
 */
export declare function buildViewTabLine(activeView: string, options?: {
    accent?: string;
}): string;
/** Build the one-line status bar (pure). */
export declare function buildStatusLine(info: StatusBarInfo): string;
/** A minimal structural peer shape (keeps screen.ts client-agnostic). */
export interface RailPeer {
    id: string;
    model?: string;
    health: {
        ok: boolean;
        rttMs?: number;
    };
}
/** Build the one-line cluster rail (always shown — hints when empty). */
export declare function buildRailLine(peers: readonly RailPeer[] | undefined, options?: {
    emptyHint?: string;
}): string;
/**
 * The screen renderer. Writes ANSI cursor/erase escapes to the output
 * stream; keeps the last rendered rows so unchanged lines are skipped.
 * No-ops when `enabled` is false (plain-mode callers handle output).
 */
export declare class Screen {
    #private;
    constructor(output: NodeJS.WritableStream, options?: ScreenOptions);
    get width(): number;
    get height(): number;
    setSize(width: number, height: number): void;
    /** Redraw with a diff. Rows are 1-based; the cursor ends on the input row. */
    render(model: ScreenLayoutModel): void;
    /** Clear the screen and forget the diff state. */
    clear(): void;
}
//# sourceMappingURL=screen.d.ts.map