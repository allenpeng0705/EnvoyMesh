/**
 * Phase C / Item 7 — model-facing job tools.
 */
import { z } from "zod";
import { createProcessJobHooks } from "./process-provider.js";
import { JobError } from "./types.js";
function publicSnap(s) {
    return {
        id: s.id,
        kind: s.kind,
        label: s.label,
        status: s.status,
        ...(s.detail !== undefined ? { detail: s.detail } : {}),
        startedAt: s.startedAt,
        ...(s.finishedAt !== undefined ? { finishedAt: s.finishedAt } : {}),
    };
}
function errResult(err) {
    if (err instanceof JobError) {
        return {
            content: `job error (${err.code}): ${err.message}`,
            isError: true,
        };
    }
    return {
        content: err instanceof Error ? err.message : String(err),
        isError: true,
    };
}
/** Build the six job tools bound to a registry. */
export function makeJobTools(registry) {
    const jobStart = {
        name: "job_start",
        description: "Start a background shell job. Returns a job id immediately; " +
            "use job_status / job_output / job_wait / job_kill to observe it.",
        parameters: z.object({
            command: z.string().describe("Shell command to run in the background"),
            label: z
                .string()
                .optional()
                .describe("Optional one-line label (defaults to the command)"),
            outputLimitBytes: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Cap retained output bytes (default 256KiB)"),
        }),
        async execute(args, ctx) {
            try {
                const label = args.label ?? args.command;
                const id = registry.start({
                    kind: "bash",
                    label,
                    ...(args.outputLimitBytes !== undefined
                        ? { outputLimitBytes: args.outputLimitBytes }
                        : {}),
                    owner: ctx.session.id,
                    run: () => createProcessJobHooks({
                        command: args.command,
                        cwd: ctx.cwd,
                        ...(args.outputLimitBytes !== undefined
                            ? { outputLimitBytes: args.outputLimitBytes }
                            : {}),
                    }),
                });
                return {
                    content: JSON.stringify({
                        id,
                        ...publicSnap(registry.get(id, ctx.session.id)),
                    }),
                };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const jobStatus = {
        name: "job_status",
        description: "Get a snapshot of one background job by id.",
        parameters: z.object({
            id: z.string().describe("Job id from job_start"),
        }),
        async execute(args, ctx) {
            try {
                return {
                    content: JSON.stringify(publicSnap(registry.get(args.id, ctx.session.id))),
                };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const jobOutput = {
        name: "job_output",
        description: "Read new output from a background job since the last read " +
            "(consuming cursor).",
        parameters: z.object({
            id: z.string().describe("Job id from job_start"),
        }),
        async execute(args, ctx) {
            try {
                const read = registry.read(args.id, ctx.session.id);
                return {
                    content: JSON.stringify({
                        text: read.text,
                        snapshot: publicSnap(read.snapshot),
                    }),
                };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const jobWait = {
        name: "job_wait",
        description: "Wait for a background job to finish (does not cancel it). " +
            "Returns the terminal snapshot or a timeout error.",
        parameters: z.object({
            id: z.string().describe("Job id from job_start"),
            timeoutMs: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Max wait in ms (default 60000)"),
        }),
        async execute(args, ctx) {
            try {
                const snap = await registry.wait(args.id, args.timeoutMs ?? 60_000, ctx.session.id, ctx.abortSignal);
                return { content: JSON.stringify(publicSnap(snap)) };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const jobKill = {
        name: "job_kill",
        description: "Request cancellation of a background job.",
        parameters: z.object({
            id: z.string().describe("Job id from job_start"),
            reason: z.string().optional().describe("Optional cancel reason"),
        }),
        async execute(args, ctx) {
            try {
                const result = registry.kill(args.id, ctx.session.id, args.reason);
                return {
                    content: JSON.stringify({
                        result,
                        snapshot: publicSnap(registry.get(args.id, ctx.session.id)),
                    }),
                };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const jobList = {
        name: "job_list",
        description: "List background jobs visible to this session (owned + unowned).",
        parameters: z.object({}),
        async execute(_args, ctx) {
            try {
                const list = registry.list(ctx.session.id).map(publicSnap);
                return { content: JSON.stringify({ jobs: list }) };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    return [jobStart, jobStatus, jobOutput, jobWait, jobKill, jobList];
}
/** Register all job tools on a tool registry. */
export function registerJobTools(tools, registry) {
    for (const tool of makeJobTools(registry)) {
        tools.register(tool);
    }
}
//# sourceMappingURL=tools.js.map