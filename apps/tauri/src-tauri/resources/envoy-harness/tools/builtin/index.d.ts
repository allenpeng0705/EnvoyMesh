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
export { bashTool, makeBashTool, type MakeBashToolOptions } from "./bash.js";
export { writeTool } from "./write.js";
export { editTool } from "./edit.js";
export { gitTool } from "./git.js";
export declare const BUILTIN_TOOLS: readonly [import("../types.js").Tool<import("zod").ZodObject<{
    path: import("zod").ZodString;
    maxBytes: import("zod").ZodOptional<import("zod").ZodNumber>;
}, import("zod").UnknownKeysParam, import("zod").ZodTypeAny, {
    path: string;
    maxBytes?: number | undefined;
}, {
    path: string;
    maxBytes?: number | undefined;
}>>, import("../types.js").Tool<import("zod").ZodObject<{
    command: import("zod").ZodString;
    timeoutMs: import("zod").ZodOptional<import("zod").ZodNumber>;
    maxOutputBytes: import("zod").ZodOptional<import("zod").ZodNumber>;
    background: import("zod").ZodOptional<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
    command: string;
    timeoutMs?: number | undefined;
    maxOutputBytes?: number | undefined;
    background?: boolean | undefined;
}, {
    command: string;
    timeoutMs?: number | undefined;
    maxOutputBytes?: number | undefined;
    background?: boolean | undefined;
}>>, import("../types.js").Tool<import("zod").ZodObject<{
    path: import("zod").ZodString;
    content: import("zod").ZodString;
    createDirectories: import("zod").ZodOptional<import("zod").ZodBoolean>;
}, import("zod").UnknownKeysParam, import("zod").ZodTypeAny, {
    path: string;
    content: string;
    createDirectories?: boolean | undefined;
}, {
    path: string;
    content: string;
    createDirectories?: boolean | undefined;
}>>, import("../types.js").Tool<import("zod").ZodObject<{
    path: import("zod").ZodString;
    oldText: import("zod").ZodString;
    newText: import("zod").ZodString;
    mode: import("zod").ZodOptional<import("zod").ZodEnum<["replace", "replaceAll", "insertAfter"]>>;
}, import("zod").UnknownKeysParam, import("zod").ZodTypeAny, {
    path: string;
    oldText: string;
    newText: string;
    mode?: "replace" | "replaceAll" | "insertAfter" | undefined;
}, {
    path: string;
    oldText: string;
    newText: string;
    mode?: "replace" | "replaceAll" | "insertAfter" | undefined;
}>>, import("../types.js").Tool<import("zod").ZodDiscriminatedUnion<"op", [import("zod").ZodObject<{
    op: import("zod").ZodLiteral<"status">;
}, import("zod").UnknownKeysParam, import("zod").ZodTypeAny, {
    op: "status";
}, {
    op: "status";
}>, import("zod").ZodObject<{
    op: import("zod").ZodLiteral<"diff">;
    staged: import("zod").ZodOptional<import("zod").ZodBoolean>;
    ref: import("zod").ZodOptional<import("zod").ZodString>;
}, import("zod").UnknownKeysParam, import("zod").ZodTypeAny, {
    op: "diff";
    staged?: boolean | undefined;
    ref?: string | undefined;
}, {
    op: "diff";
    staged?: boolean | undefined;
    ref?: string | undefined;
}>, import("zod").ZodObject<{
    op: import("zod").ZodLiteral<"log">;
    max: import("zod").ZodOptional<import("zod").ZodNumber>;
}, import("zod").UnknownKeysParam, import("zod").ZodTypeAny, {
    op: "log";
    max?: number | undefined;
}, {
    op: "log";
    max?: number | undefined;
}>, import("zod").ZodObject<{
    op: import("zod").ZodLiteral<"branchList">;
}, import("zod").UnknownKeysParam, import("zod").ZodTypeAny, {
    op: "branchList";
}, {
    op: "branchList";
}>]>>];
//# sourceMappingURL=index.d.ts.map