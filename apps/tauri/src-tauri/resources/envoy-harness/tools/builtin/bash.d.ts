/**
 * bash — the workhorse tool for running shell commands.
 *
 * **Design doc:** `docs/design.md` §6 (permissions) + §10 (tools).
 *
 * **Permission validation:** every command is run through
 * `validateBash` (§6.2 — the 6-validator composition) using the
 * session's `permissionMode`. A blocked command never reaches
 * the shell; the tool returns `isError: true` with the validator
 * reason. A warned command runs; the model sees the warning in
 * the result so it can adjust.
 *
 * **Why we re-validate here (not just at the agent boundary):**
 * the bash tool is the chokepoint for "execute a command". Even
 * if a future chunk adds a new path to invoke bash (e.g. via a
 * sub-agent or a hook that reschedules commands), every invocation
 * goes through `validateBash`. No back door.
 *
 * **Sandbox:** v0 runs the command in `sh -c` with the same
 * permission system as the user. Phase 2 (mesh-native) adds a
 * real sandbox (Landlock / nsjail / Docker). The tool's signature
 * stays the same; only the spawn call changes.
 *
 * **Timeout:** default 30s, configurable via `timeoutMs`. The
 * agent's `abortSignal` is also honored (user-initiated cancel
 * kills the child). `SIGKILL` for hard-kill (a hung shell can't
 * be politely asked to exit).
 *
 * **Background (`background: true`):** when a {@link JobRegistry}
 * is bound via {@link makeBashTool}, the command is started as a
 * job and the tool returns the job id immediately.
 */
import { z } from "zod";
import { type JobRegistry } from "../../jobs/index.js";
import type { Tool } from "../types.js";
declare const bashParameters: z.ZodObject<{
    command: z.ZodString;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    maxOutputBytes: z.ZodOptional<z.ZodNumber>;
    background: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    command: string;
    timeoutMs?: number | undefined;
    maxOutputBytes?: number | undefined;
    background?: boolean | undefined;
}, {
    command: string;
    timeoutMs?: number | undefined;
    maxOutputBytes?: number | undefined;
    background?: boolean | undefined;
}>;
export interface MakeBashToolOptions {
    /** When set, `background: true` starts a job instead of blocking. */
    jobs?: JobRegistry;
}
/**
 * Build a bash tool. Pass `{ jobs }` to enable `background: true`
 * sugar that returns a job id immediately.
 */
export declare function makeBashTool(options?: MakeBashToolOptions): Tool<typeof bashParameters>;
/**
 * Default bash tool (no job registry). Prefer
 * {@link makeBashTool} when wiring environment capabilities.
 */
export declare const bashTool: Tool<typeof bashParameters>;
export {};
//# sourceMappingURL=bash.d.ts.map