/**
 * Phase C / Item 9 — model-facing terminal tools.
 */
import type { JobRegistry } from "../jobs/types.js";
import type { Tool } from "../tools/types.js";
import type { TerminalSessionService } from "./types.js";
/**
 * Cap a string to `maxBytes` UTF-8 bytes, cutting on a character boundary.
 * Deepseek parity: every complete terminal result is bounded so a chatty
 * PTY cannot blow up the context window.
 */
export declare function capTextUtf8(text: string, maxBytes?: number): {
    text: string;
    truncated: boolean;
};
/** Build the six terminal tools bound to a session service. */
export declare function makeTerminalTools(service: TerminalSessionService, jobs?: JobRegistry): Tool[];
/** Register all terminal tools on a tool registry. */
export declare function registerTerminalTools(tools: {
    register(tool: Tool): unknown;
}, service: TerminalSessionService, jobs?: JobRegistry): void;
//# sourceMappingURL=tools.d.ts.map