/**
 * @envoymesh/envoy-harness — built-in tools.
 *
 * Phase 1 shipped two: `read_file` and `bash`.
 * T3.5 added `write` (file write), `edit` (targeted
 * edits), and `git` (read-only git operations).
 * Mutating git ops stay in `bash` (the 6 bash
 * validators enforce the same policy).
 */
export { readFileTool } from "./read-file.js";
export { bashTool, makeBashTool } from "./bash.js";
export { writeTool } from "./write.js";
export { editTool } from "./edit.js";
export { gitTool } from "./git.js";
/** All built-in tools, in registration order. */
import { bashTool } from "./bash.js";
import { editTool } from "./edit.js";
import { gitTool } from "./git.js";
import { readFileTool } from "./read-file.js";
import { writeTool } from "./write.js";
export const BUILTIN_TOOLS = [
    readFileTool,
    bashTool,
    writeTool,
    editTool,
    gitTool,
];
//# sourceMappingURL=index.js.map