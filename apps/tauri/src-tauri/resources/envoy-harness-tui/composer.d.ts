/**
 * U2 — the TUI composer: a small dependency-free line editor with
 * keymaps (Enter submit, Esc cancel, arrows history, Tab slash
 * completion, Ctrl-C cancel, Ctrl-U clear), kept pure so tests drive it
 * directly.
 */
export type ComposerAction = {
    type: "submit";
    line: string;
} | {
    type: "cancel";
} | {
    type: "eof";
} | {
    type: "change";
};
/** Minimal key shape from `readline.emitKeypressEvents`. */
export interface ComposerKey {
    name?: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    sequence?: string;
}
export interface ComposerOptions {
    /** Max history entries (default 50). */
    historyLimit?: number;
}
export declare class Composer {
    #private;
    constructor(options?: ComposerOptions);
    get buffer(): string;
    get cursor(): number;
    get history(): readonly string[];
    setLine(line: string): void;
    /** Record a submitted line into history. */
    commit(line: string): void;
    /** Handle one keypress; mutates the buffer and returns an action. */
    handleKey(ch: string | undefined, key: ComposerKey): ComposerAction;
}
/**
 * Slash-command tab completion: completes the current `/`-prefixed
 * buffer to the first matching command (exact match adds a trailing
 * space). Non-slash input is unchanged.
 */
export declare function completeSlash(buffer: string): string;
//# sourceMappingURL=composer.d.ts.map