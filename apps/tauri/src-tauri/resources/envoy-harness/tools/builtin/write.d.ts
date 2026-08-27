import { z } from "zod";
import type { Tool } from "../types.js";
/**
 * The write tool. Two required parameters: `path`
 * and `content`. One optional: `createDirectories`
 * (default: false).
 */
export declare const writeTool: Tool<z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
    createDirectories: z.ZodOptional<z.ZodBoolean>;
}>>;
//# sourceMappingURL=write.d.ts.map