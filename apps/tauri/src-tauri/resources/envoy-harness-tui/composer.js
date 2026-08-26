/**
 * U2 — the TUI composer: a small dependency-free line editor with
 * keymaps (Enter submit, Esc cancel, arrows history, Tab slash
 * completion, Ctrl-C cancel, Ctrl-U clear), kept pure so tests drive it
 * directly.
 */
import { SLASH_COMMANDS } from "./slash.js";
export class Composer {
    #buffer = "";
    #cursor = 0;
    #history = [];
    #historyIndex;
    #historyLimit;
    constructor(options = {}) {
        this.#historyLimit = options.historyLimit ?? 50;
    }
    get buffer() {
        return this.#buffer;
    }
    get cursor() {
        return this.#cursor;
    }
    get history() {
        return [...this.#history];
    }
    setLine(line) {
        this.#buffer = line;
        this.#cursor = line.length;
    }
    /** Record a submitted line into history. */
    commit(line) {
        if (line.trim().length === 0)
            return;
        if (this.#history[this.#history.length - 1] === line)
            return;
        this.#history.push(line);
        if (this.#history.length > this.#historyLimit) {
            this.#history.splice(0, this.#history.length - this.#historyLimit);
        }
        this.#historyIndex = undefined;
    }
    /** Handle one keypress; mutates the buffer and returns an action. */
    handleKey(ch, key) {
        // Kitty-style Shift+Enter ("\x1b[13;2u") — some terminals send this
        // instead of marking the return keypress with `shift`.
        if (key.sequence === "\x1b[13;2u") {
            this.#buffer =
                this.#buffer.slice(0, this.#cursor) +
                    "\n" +
                    this.#buffer.slice(this.#cursor);
            this.#cursor++;
            return { type: "change" };
        }
        if (key.name === "return" || key.name === "enter") {
            // Shift+Enter / Alt+Enter inserts a newline (Claude Code style);
            // plain Enter submits.
            const isNewline = key.shift === true ||
                key.meta === true ||
                key.sequence === "\x1b[13;2u";
            if (isNewline) {
                this.#buffer =
                    this.#buffer.slice(0, this.#cursor) +
                        "\n" +
                        this.#buffer.slice(this.#cursor);
                this.#cursor++;
                return { type: "change" };
            }
            const line = this.#buffer;
            if (line.trim().length === 0)
                return { type: "change" };
            this.commit(line);
            this.#buffer = "";
            this.#cursor = 0;
            return { type: "submit", line };
        }
        if (key.ctrl === true && (key.name === "c" || key.name === "u")) {
            // Ctrl-C cancels the in-flight prompt (the caller decides exit);
            // Ctrl-U clears the current line.
            if (key.name === "u") {
                this.#buffer = "";
                this.#cursor = 0;
                return { type: "change" };
            }
            return { type: "cancel" };
        }
        if (key.ctrl === true && key.name === "d") {
            return { type: "eof" };
        }
        if (key.name === "escape") {
            return { type: "cancel" };
        }
        if (key.name === "backspace") {
            if (this.#cursor > 0) {
                this.#buffer =
                    this.#buffer.slice(0, this.#cursor - 1) +
                        this.#buffer.slice(this.#cursor);
                this.#cursor--;
            }
            return { type: "change" };
        }
        if (key.name === "left") {
            if (this.#cursor > 0)
                this.#cursor--;
            return { type: "change" };
        }
        if (key.name === "right") {
            if (this.#cursor < this.#buffer.length)
                this.#cursor++;
            return { type: "change" };
        }
        if (key.name === "up") {
            this.#historyBack(-1);
            return { type: "change" };
        }
        if (key.name === "down") {
            this.#historyBack(1);
            return { type: "change" };
        }
        if (key.name === "tab") {
            const completed = completeSlash(this.#buffer);
            if (completed !== this.#buffer) {
                this.#buffer = completed;
                this.#cursor = completed.length;
                return { type: "change" };
            }
            return { type: "change" };
        }
        // Printable characters. Alt+char sequences ("\x1bX") — produced when
        // Esc is quickly followed by a char, e.g. "leave view, then type /"
        // — carry no `ch`; read the char from `key.sequence`.
        let char = ch;
        if (char === undefined &&
            key.meta === true &&
            key.sequence !== undefined &&
            key.sequence.length === 2 &&
            key.sequence.startsWith("\x1b")) {
            char = key.sequence[1];
        }
        if (char !== undefined && char.length === 1 && !key.ctrl) {
            this.#buffer =
                this.#buffer.slice(0, this.#cursor) + char + this.#buffer.slice(this.#cursor);
            this.#cursor += char.length;
            return { type: "change" };
        }
        return { type: "change" };
    }
    #historyBack(delta) {
        if (this.#history.length === 0)
            return;
        if (this.#historyIndex === undefined) {
            this.#historyIndex = delta < 0 ? this.#history.length - 1 : 0;
        }
        else {
            const next = this.#historyIndex + delta;
            if (next < 0 || next >= this.#history.length)
                return;
            this.#historyIndex = next;
        }
        const line = this.#history[this.#historyIndex];
        if (line !== undefined) {
            this.#buffer = line;
            this.#cursor = line.length;
        }
    }
}
/**
 * Slash-command tab completion: completes the current `/`-prefixed
 * buffer to the first matching command (exact match adds a trailing
 * space). Non-slash input is unchanged.
 */
export function completeSlash(buffer) {
    const trimmed = buffer.trimStart();
    if (!trimmed.startsWith("/"))
        return buffer;
    const prefix = trimmed.slice(1);
    const matches = SLASH_COMMANDS.map((c) => c.name).filter((c) => c.startsWith(prefix));
    if (matches.length === 0)
        return buffer;
    const match = matches[0];
    const completed = `/${match}`;
    const suffix = completed === trimmed ? " " : "";
    return completed + suffix;
}
//# sourceMappingURL=composer.js.map