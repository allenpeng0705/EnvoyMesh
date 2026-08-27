/**
 * Codex-shaped shell environment policy — filter env for bash / jobs.
 */
import { z } from "zod";
export declare const ShellEnvironmentPolicySchema: z.ZodObject<{
    /**
     * Inherit mode:
     * - `all` — full parent env (default)
     * - `core` — PATH/HOME/USER/SHELL/… only
     * - `none` — start empty (then apply `set` / includes)
     */
    inherit: z.ZodOptional<z.ZodEnum<["all", "core", "none"]>>;
    /** Regex patterns of env var names to drop (after inherit). */
    exclude: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** When set, only names matching these regexes are kept. */
    includeOnly: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Extra KEY=value pairs to set/override. */
    set: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    /** Skip default secret-ish excludes (KEY/TOKEN/SECRET/PASSWORD). */
    ignoreDefaultExcludes: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    set?: Record<string, string> | undefined;
    inherit?: "none" | "all" | "core" | undefined;
    exclude?: string[] | undefined;
    includeOnly?: string[] | undefined;
    ignoreDefaultExcludes?: boolean | undefined;
}, {
    set?: Record<string, string> | undefined;
    inherit?: "none" | "all" | "core" | undefined;
    exclude?: string[] | undefined;
    includeOnly?: string[] | undefined;
    ignoreDefaultExcludes?: boolean | undefined;
}>;
export type ShellEnvironmentPolicy = z.infer<typeof ShellEnvironmentPolicySchema>;
/**
 * Build the env map for a shell spawn under the given policy.
 * When `policy` is undefined, returns a filtered copy of `process.env`.
 */
export declare function applyShellEnvironmentPolicy(policy: ShellEnvironmentPolicy | undefined, source?: NodeJS.ProcessEnv): Record<string, string>;
//# sourceMappingURL=shell-env.d.ts.map