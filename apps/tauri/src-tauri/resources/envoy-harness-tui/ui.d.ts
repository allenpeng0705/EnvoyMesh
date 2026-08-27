/**
 * Interactive run loop for the dedicated envoy-harness TUI.
 *
 * Two modes:
 * - **Screen mode** (TTY): ANSI regions — status bar, optional cluster
 *   rail, transcript window, composer input. Keymaps: Enter submit,
 *   Esc/Ctrl-C cancel, arrows history, Tab slash completion, Ctrl-U
 *   clear, Ctrl-D exit (empty input).
 * - **Plain mode** (pipes/CI): the legacy readline loop — transcript
 *   lines printed as they arrive, `> ` prompt, whole-line permissions.
 */
import type { TuiSession } from "./session.js";
import { type TranscriptFormatOptions } from "./transcript.js";
export interface RunInteractiveOptions {
    session: TuiSession;
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
    /** Force screen mode (default: both streams are TTYs). */
    interactive?: boolean;
    /** Screen width (default 80). */
    width?: number;
    /** Screen height (default 24). */
    height?: number;
    /** Refresh the cluster rail before every render. Default true. */
    refreshCluster?: boolean;
    /** U5 — ANSI SGR prefix for the status bar (e.g. `"\x1b[36m"`). */
    accent?: string;
    /** U6a.2 — transcript + permission styling (default color on). */
    transcriptFormat?: TranscriptFormatOptions;
    /** Peer endpoints configured at launch (shown in `/mesh`). */
    configuredPeers?: ReadonlyArray<{
        id: string;
        endpoint: string;
    }>;
}
/** Run until `/quit`, Ctrl-D, or input ends. */
export declare function runInteractive(options: RunInteractiveOptions): Promise<void>;
//# sourceMappingURL=ui.d.ts.map