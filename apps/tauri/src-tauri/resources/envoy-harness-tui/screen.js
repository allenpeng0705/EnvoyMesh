/**
 * U2 — ANSI screen module for the dedicated envoy-harness TUI.
 *
 * A small dependency-free screen: fixed regions (status bar, optional
 * cluster rail, transcript window, input line), diff-based rendering
 * (only changed rows are rewritten), and pure layout helpers that are
 * hermetic-tested without a TTY.
 */
const ANSI_SGR = /^\x1b\[[0-?]*[ -/]*[@-~]/;
function runeWidth(rune) {
    const cp = rune.codePointAt(0) ?? 0;
    if (cp === 0 || cp < 32 || (cp >= 0x7f && cp < 0xa0))
        return 0;
    if (/\p{Mark}/u.test(rune) || cp === 0x200d || cp === 0xfe0f)
        return 0;
    return cp >= 0x1100 &&
        (cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
            (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
            (cp >= 0xac00 && cp <= 0xd7a3) ||
            (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe10 && cp <= 0xfe19) ||
            (cp >= 0xfe30 && cp <= 0xfe6f) ||
            (cp >= 0xff00 && cp <= 0xff60) ||
            (cp >= 0xffe0 && cp <= 0xffe6) ||
            (cp >= 0x1f300 && cp <= 0x1faff) ||
            (cp >= 0x20000 && cp <= 0x3fffd))
        ? 2
        : 1;
}
function nextGrapheme(text, start) {
    let end = start;
    let regionalIndicators = 0;
    while (end < text.length) {
        const rune = String.fromCodePoint(text.codePointAt(end));
        const cp = rune.codePointAt(0);
        const joinsPrevious = end > start && (/\p{Mark}/u.test(rune) ||
            cp === 0xfe0f ||
            cp === 0x20e3 ||
            (cp >= 0x1f3fb && cp <= 0x1f3ff));
        if (end > start && !joinsPrevious && text.codePointAt(end - 1) !== 0x200d) {
            const isRegional = cp >= 0x1f1e6 && cp <= 0x1f1ff;
            if (!isRegional || regionalIndicators !== 1)
                break;
        }
        if (cp >= 0x1f1e6 && cp <= 0x1f1ff)
            regionalIndicators++;
        end += rune.length;
        if (text.codePointAt(end) === 0x200d) {
            end += 1;
        }
    }
    return text.slice(start, end);
}
function graphemeWidth(grapheme) {
    let width = 0;
    for (const rune of grapheme) {
        const cp = rune.codePointAt(0);
        width = Math.max(width, cp >= 0x1f1e6 && cp <= 0x1f1ff ? 2 : runeWidth(rune));
    }
    return width;
}
/** Visible terminal columns, ignoring ANSI control sequences. */
export function displayWidth(text) {
    let width = 0;
    for (let i = 0; i < text.length;) {
        const ansi = text.slice(i).match(ANSI_SGR)?.[0];
        if (ansi !== undefined) {
            i += ansi.length;
            continue;
        }
        const grapheme = nextGrapheme(text, i);
        width += graphemeWidth(grapheme);
        i += grapheme.length;
    }
    return width;
}
/** Truncate a line to `width` terminal columns without splitting glyphs/ANSI. */
export function fitLine(text, width) {
    if (displayWidth(text) <= width)
        return text;
    if (width <= 1)
        return "…";
    let out = "";
    let columns = 0;
    let hasAnsi = false;
    for (let i = 0; i < text.length;) {
        const ansi = text.slice(i).match(ANSI_SGR)?.[0];
        if (ansi !== undefined) {
            hasAnsi = true;
            out += ansi;
            i += ansi.length;
            continue;
        }
        const rune = nextGrapheme(text, i);
        const next = graphemeWidth(rune);
        if (columns + next > width - 1)
            break;
        out += rune;
        columns += next;
        i += rune.length;
    }
    return `${out}${hasAnsi ? "\x1b[0m" : ""}…`;
}
/**
 * Compute the fixed-height row layout for a model. Pure — testable
 * without a TTY.
 */
export function layoutRows(model, width, height) {
    const rows = [];
    rows.push(fitLine(model.statusLine, width));
    if (model.railLine !== undefined) {
        rows.push(fitLine(model.railLine, width));
    }
    if (model.tabLine !== undefined) {
        rows.push(fitLine(model.tabLine, width));
    }
    const inputLines = model.inputLines.length > 0 ? model.inputLines : [""];
    const palette = model.palette ?? [];
    const hintRows = model.composerHint !== undefined ? 1 : 0;
    const bottom = palette.length + inputLines.length + hintRows;
    const usedTop = rows.length; // status + optional rail + optional tabs
    const transcriptHeight = Math.max(0, height - usedTop - bottom);
    const tail = model.transcript.slice(-transcriptHeight);
    for (const line of tail) {
        rows.push(fitLine(line, width));
    }
    while (rows.length < height - bottom) {
        rows.push("");
    }
    palette.forEach((item, i) => {
        rows.push(fitLine(`${i === model.paletteSelected ? ">" : " "} ${item}`, width));
    });
    if (model.composerHint !== undefined) {
        rows.push(fitLine(model.composerHint, width));
    }
    for (const line of inputLines) {
        rows.push(fitLine(line, width));
    }
    return rows;
}
/** Tab ids rendered in the main strip (coding-agent panels). */
export const VIEW_TAB_IDS = [
    "chat",
    "plan",
    "memory",
    "git-diff",
    "mesh",
];
const VIEW_TAB_LABELS = {
    chat: "Chat",
    plan: "Plan",
    memory: "Memory",
    "git-diff": "Diff",
    mesh: "Mesh",
};
/**
 * U6 — one-line tab strip. Active tab is bold; optional accent on active.
 * Maps cluster/team/scoreboard views to Mesh tab highlight.
 */
export function buildViewTabLine(activeView, options) {
    const meshViews = new Set([
        "mesh",
        "cluster",
        "peers",
        "team",
        "scoreboard",
        "route",
        "trace",
    ]);
    const highlighted = meshViews.has(activeView)
        ? "mesh"
        : VIEW_TAB_IDS.includes(activeView)
            ? activeView
            : "chat";
    const parts = VIEW_TAB_IDS.map((id) => {
        const label = VIEW_TAB_LABELS[id];
        if (id !== highlighted)
            return label;
        const text = `[${label}]`;
        if (options?.accent !== undefined) {
            return `${options.accent}${text}\x1b[0m`;
        }
        return text;
    });
    return parts.join("  ");
}
/** Build the one-line status bar (pure). */
export function buildStatusLine(info) {
    const parts = ["envoy-harness"];
    if (info.sessionId !== undefined)
        parts.push(`session ${info.sessionId}`);
    parts.push(`model ${info.model ?? "—"}`);
    if (info.view !== undefined && info.view !== "chat") {
        parts.push(`view ${info.view}`);
    }
    if (info.meshHint === true || (info.clusterTotal ?? 0) === 0) {
        parts.push("mesh · /mesh");
    }
    else if (info.clusterTotal !== undefined) {
        parts.push(`cluster ${info.clusterConnected ?? 0}/${info.clusterTotal}`);
    }
    parts.push(info.busy === true ? "busy" : "ready");
    return parts.join(" · ");
}
/** Build the one-line cluster rail (always shown — hints when empty). */
export function buildRailLine(peers, options) {
    const emptyHint = options?.emptyHint ??
        "no peers — /mesh for setup · envoy-peer serve + --peers id@host:port";
    if (peers === undefined || peers.length === 0) {
        return `mesh: ${emptyHint}`;
    }
    const rendered = peers.map((p) => {
        const model = p.model !== undefined ? `(${p.model})` : "";
        const health = p.health.ok
            ? p.health.rttMs !== undefined
                ? `rtt=${p.health.rttMs}ms`
                : "ok"
            : "down";
        return `${p.id}${model}[${health}]`;
    });
    return `peers: ${rendered.join("  ")}`;
}
/**
 * The screen renderer. Writes ANSI cursor/erase escapes to the output
 * stream; keeps the last rendered rows so unchanged lines are skipped.
 * No-ops when `enabled` is false (plain-mode callers handle output).
 */
export class Screen {
    #output;
    #width;
    #height;
    #accent;
    #last = [];
    #drawn = false;
    constructor(output, options = {}) {
        this.#output = output;
        this.#width = options.width ?? 80;
        this.#height = options.height ?? 24;
        this.#accent = options.accent;
    }
    get width() {
        return this.#width;
    }
    get height() {
        return this.#height;
    }
    setSize(width, height) {
        this.#width = Math.max(1, width);
        this.#height = Math.max(1, height);
        this.#last = [];
        this.#drawn = false;
    }
    /** Redraw with a diff. Rows are 1-based; the cursor ends on the input row. */
    render(model) {
        const rows = layoutRows(model, this.#width, this.#height);
        let out = "";
        if (!this.#drawn) {
            out += "\x1b[2J\x1b[H"; // clear once on first render
            this.#drawn = true;
        }
        for (let i = 0; i < rows.length; i++) {
            if (rows[i] === this.#last[i])
                continue;
            const rendered = i === 0 && this.#accent !== undefined
                ? `${this.#accent}${rows[0]}\x1b[0m`
                : rows[i];
            out += `\x1b[${i + 1};1H${rendered}\x1b[K`;
        }
        for (let i = rows.length; i < this.#last.length; i++) {
            out += `\x1b[${i + 1};1H\x1b[K`;
        }
        const inputLines = model.inputLines.length > 0 ? model.inputLines : [""];
        const cursorLine = model.inputCursorLine ?? Math.max(0, inputLines.length - 1);
        const activeLine = inputLines[Math.min(cursorLine, inputLines.length - 1)] ?? "";
        const cursorCol = Math.min(model.inputCursor ?? activeLine.length, this.#width - 1) + 1;
        const cursorRow = rows.length - inputLines.length + cursorLine + 1;
        out += `\x1b[${Math.min(cursorRow, rows.length)};${cursorCol}H`;
        this.#last = rows;
        this.#output.write(out);
    }
    /** Clear the screen and forget the diff state. */
    clear() {
        this.#output.write("\x1b[2J\x1b[H");
        this.#last = [];
        this.#drawn = false;
    }
}
//# sourceMappingURL=screen.js.map