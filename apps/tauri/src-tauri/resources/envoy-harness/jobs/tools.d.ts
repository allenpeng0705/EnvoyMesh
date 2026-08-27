/**
 * Phase C / Item 7 — model-facing job tools.
 */
import type { Tool } from "../tools/types.js";
import type { JobRegistry } from "./types.js";
/** Build the six job tools bound to a registry. */
export declare function makeJobTools(registry: JobRegistry): Tool[];
/** Register all job tools on a tool registry. */
export declare function registerJobTools(tools: {
    register(tool: Tool): unknown;
}, registry: JobRegistry): void;
//# sourceMappingURL=tools.d.ts.map