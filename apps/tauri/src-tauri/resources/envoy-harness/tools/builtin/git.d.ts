import { z } from "zod";
import type { Tool } from "../types.js";
/**
 * The git tool. One required discriminator: `op`.
 * Other parameters depend on `op` (validated by
 * the per-op union below).
 */
export declare const gitTool: Tool<z.ZodDiscriminatedUnion<"op", [
    z.ZodObject<{
        op: z.ZodLiteral<"status">;
    }>,
    z.ZodObject<{
        op: z.ZodLiteral<"diff">;
        staged: z.ZodOptional<z.ZodBoolean>;
        ref: z.ZodOptional<z.ZodString>;
    }>,
    z.ZodObject<{
        op: z.ZodLiteral<"log">;
        max: z.ZodOptional<z.ZodNumber>;
    }>,
    z.ZodObject<{
        op: z.ZodLiteral<"branchList">;
    }>
]>>;
//# sourceMappingURL=git.d.ts.map