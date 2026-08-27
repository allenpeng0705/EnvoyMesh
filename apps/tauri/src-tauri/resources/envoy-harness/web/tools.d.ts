/**
 * Phase C / Item 8 — model-facing web tools.
 */
import type { Tool } from "../tools/types.js";
import type { WebRuntime } from "./types.js";
/** Build `web_search` + `web_fetch` tools bound to a runtime. */
export declare function makeWebTools(runtime: WebRuntime): Tool[];
/** Register web tools on a tool registry. */
export declare function registerWebTools(tools: {
    register(tool: Tool): unknown;
}, runtime: WebRuntime): void;
//# sourceMappingURL=tools.d.ts.map