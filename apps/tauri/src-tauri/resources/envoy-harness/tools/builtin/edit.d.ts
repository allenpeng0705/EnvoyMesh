import { z } from "zod";
import type { Tool } from "../types.js";
/**
 * The edit tool. Three required parameters:
 * `path`, `oldText`, `newText`. One optional:
 * `mode` (default: "replace").
 */
export declare const editTool: Tool<z.ZodObject<{
    path: z.ZodString;
    oldText: z.ZodString;
    newText: z.ZodString;
    mode: z.ZodOptional<z.ZodEnum<["replace", "replaceAll", "insertAfter"]>>;
}>>;
//# sourceMappingURL=edit.d.ts.map