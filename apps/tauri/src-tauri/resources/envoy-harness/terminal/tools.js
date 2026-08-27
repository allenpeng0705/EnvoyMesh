/**
 * Phase C / Item 9 — model-facing terminal tools.
 */
import { z } from "zod";
import { TerminalError } from "./types.js";
const SIGNAL_SCHEMA = z.enum([
    "SIGINT",
    "SIGTERM",
    "SIGKILL",
    "SIGTSTP",
    "SIGHUP",
]);
/** Default UTF-8 cap for a complete terminal result (deepseek parity). */
const DEFAULT_MAX_RESULT_BYTES = 262144;
/**
 * Cap a string to `maxBytes` UTF-8 bytes, cutting on a character boundary.
 * Deepseek parity: every complete terminal result is bounded so a chatty
 * PTY cannot blow up the context window.
 */
export function capTextUtf8(text, maxBytes = DEFAULT_MAX_RESULT_BYTES) {
    if (Buffer.byteLength(text, "utf8") <= maxBytes) {
        return { text, truncated: false };
    }
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    let end = maxBytes;
    // Back off to a UTF-8 boundary: continuation bytes start with 10xxxxxx.
    while (end > 0 && (bytes[end] & 0xc0) === 0x80)
        end--;
    return {
        text: new TextDecoder().decode(bytes.subarray(0, end)),
        truncated: true,
    };
}
function errResult(err) {
    if (err instanceof TerminalError) {
        return {
            content: `terminal error (${err.code}): ${err.message}`,
            isError: true,
        };
    }
    return {
        content: err instanceof Error ? err.message : String(err),
        isError: true,
    };
}
/** Poll cumulative `readOutput().delta` and emit only new suffixes. */
async function streamTerminalOutput(operation, onOutput) {
    let lastEmitted = 0;
    const poll = () => {
        const { delta } = operation.readOutput();
        if (delta.length > lastEmitted) {
            onOutput(delta.slice(lastEmitted));
            lastEmitted = delta.length;
        }
    };
    const interval = setInterval(poll, 50);
    try {
        await operation.done;
        poll();
    }
    finally {
        clearInterval(interval);
    }
}
function startTerminalOutputPoll(operation, onOutput) {
    let lastEmitted = 0;
    const poll = () => {
        const { delta } = operation.readOutput();
        if (delta.length > lastEmitted) {
            onOutput(delta.slice(lastEmitted));
            lastEmitted = delta.length;
        }
    };
    const interval = setInterval(poll, 50);
    poll();
    return () => {
        clearInterval(interval);
        poll();
    };
}
/** Build the six terminal tools bound to a session service. */
export function makeTerminalTools(service, jobs) {
    const terminalOpen = {
        name: "terminal_open",
        description: "Create a persistent, owner-isolated terminal session from a " +
            "registered backend type. Use for shell/REPL state that must " +
            "survive across tool calls.",
        parameters: z.object({
            type: z
                .string()
                .optional()
                .describe('Registered backend type (default "fake")'),
            name: z
                .string()
                .optional()
                .describe('Optional owner-local display name (e.g. "main")'),
            cwd: z
                .string()
                .optional()
                .describe("Initial working directory (defaults to session cwd)"),
        }),
        async execute(args, ctx) {
            try {
                const result = await service.spawn(ctx.session.id, {
                    type: args.type ?? "fake",
                    ...(args.name !== undefined ? { name: args.name } : {}),
                    cwd: args.cwd ?? ctx.cwd,
                }, ctx.abortSignal);
                return { content: JSON.stringify(result) };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const terminalSend = {
        name: "terminal_send",
        description: "Send text to a persistent terminal. By default Enter is " +
            "submitted and the call waits for idle/timeout/exit.",
        parameters: z.object({
            sessionId: z
                .string()
                .describe("Terminal session id from terminal_open / terminal_list"),
            text: z.string().describe("UTF-8 text to write to the terminal"),
            submit: z
                .boolean()
                .optional()
                .describe("Submit Enter after text (default true)"),
            run_in_background: z
                .boolean()
                .optional()
                .describe("Return immediately with a job id instead of waiting for " +
                "idle/timeout/exit; collect the result via job_output / " +
                "job_wait, and cancel via job_kill (SIGINT)"),
        }),
        async execute(args, ctx) {
            try {
                const operation = service.startSend(ctx.session.id, args.sessionId, {
                    text: args.text,
                    submit: args.submit ?? true,
                    signal: ctx.abortSignal,
                });
                if (args.run_in_background === true) {
                    if (jobs === undefined) {
                        return {
                            content: "terminal_send background: true requires a job registry " +
                                "(wireEnvironmentTools)",
                            isError: true,
                        };
                    }
                    // Deepseek parity: the PTY service's exclusive per-session send
                    // reservation happens BEFORE the job id is returned (preflight),
                    // so a second concurrent send on the same session fails fast.
                    const jobId = jobs.start({
                        kind: "terminal",
                        label: `terminal_send ${args.sessionId}`,
                        owner: ctx.session.id,
                        run: () => terminalSendJobHooks({
                            service,
                            owner: ctx.session.id,
                            sessionId: args.sessionId,
                            operation,
                            ...(ctx.onToolOutput !== undefined
                                ? { onOutput: ctx.onToolOutput }
                                : {}),
                        }),
                    });
                    return { content: JSON.stringify({ kind: "background", jobId }) };
                }
                if (ctx.onToolOutput !== undefined) {
                    const [, result] = await Promise.all([
                        streamTerminalOutput(operation, ctx.onToolOutput),
                        operation.done,
                    ]);
                    if (ctx.abortSignal.aborted) {
                        return { content: "terminal send aborted", isError: true };
                    }
                    const viewport = capTextUtf8(result.viewport);
                    return {
                        content: JSON.stringify({
                            kind: "foreground",
                            viewport: viewport.text,
                            waitReason: result.waitReason,
                            sessionStatus: result.sessionStatus,
                            truncated: viewport.truncated,
                        }),
                    };
                }
                const result = await operation.done;
                if (ctx.abortSignal.aborted) {
                    return { content: "terminal send aborted", isError: true };
                }
                const viewport = capTextUtf8(result.viewport);
                return {
                    content: JSON.stringify({
                        kind: "foreground",
                        viewport: viewport.text,
                        waitReason: result.waitReason,
                        sessionStatus: result.sessionStatus,
                        truncated: viewport.truncated,
                    }),
                };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const terminalRead = {
        name: "terminal_read",
        description: "Read a bounded page of retained output from a persistent " +
            "terminal without sending input.",
        parameters: z.object({
            sessionId: z.string().describe("Terminal session id"),
            offset: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .describe("Newest-relative line offset (default 0)"),
            count: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Requested line count (default 500)"),
        }),
        async execute(args, ctx) {
            try {
                const result = service.read(ctx.session.id, args.sessionId, {
                    ...(args.offset !== undefined ? { offset: args.offset } : {}),
                    ...(args.count !== undefined ? { count: args.count } : {}),
                });
                const capped = capTextUtf8(result.text);
                if (ctx.onToolOutput !== undefined && capped.text.length > 0) {
                    ctx.onToolOutput(capped.text);
                }
                return {
                    content: JSON.stringify({
                        text: capped.text,
                        totalLines: result.totalLines,
                        lineBegin: result.lineBegin,
                        lineEnd: result.lineEnd,
                        truncated: result.truncated || capped.truncated,
                    }),
                };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const terminalSignal = {
        name: "terminal_signal",
        description: "Send an allowed signal to the current foreground process " +
            "group of a persistent terminal.",
        parameters: z.object({
            sessionId: z.string().describe("Terminal session id"),
            signal: SIGNAL_SCHEMA.describe("POSIX signal to deliver"),
        }),
        async execute(args, ctx) {
            try {
                const result = await service.signal(ctx.session.id, args.sessionId, args.signal);
                return { content: JSON.stringify(result) };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const terminalClose = {
        name: "terminal_close",
        description: "Close one persistent terminal and wait until its process " +
            "tree is gone.",
        parameters: z.object({
            sessionId: z.string().describe("Terminal session id"),
        }),
        async execute(args, ctx) {
            try {
                const closed = await service.kill(ctx.session.id, args.sessionId);
                return {
                    content: JSON.stringify({
                        sessionId: args.sessionId,
                        outcome: closed ? "closed" : "already-closing",
                    }),
                };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const terminalList = {
        name: "terminal_list",
        description: "List persistent terminal sessions owned by this session.",
        parameters: z.object({}),
        async execute(_args, ctx) {
            try {
                const list = service.list(ctx.session.id);
                return { content: JSON.stringify({ sessions: list }) };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    return [
        terminalOpen,
        terminalSend,
        terminalRead,
        terminalSignal,
        terminalClose,
        terminalList,
    ];
}
/** Register all terminal tools on a tool registry. */
export function registerTerminalTools(tools, service, jobs) {
    for (const tool of makeTerminalTools(service, jobs)) {
        tools.register(tool);
    }
}
/** Job hooks for a background terminal send (deepseek parity). */
function terminalSendJobHooks(opts) {
    let cancelled = false;
    const stopPoll = opts.onOutput !== undefined
        ? startTerminalOutputPoll(opts.operation, opts.onOutput)
        : undefined;
    return {
        cancel(_reason) {
            if (cancelled)
                return;
            cancelled = true;
            opts.operation.cancel();
            // Deepseek parity: job_kill delivers SIGINT to the foreground
            // process group (best-effort — the send may already have settled).
            void opts.service
                .signal(opts.owner, opts.sessionId, "SIGINT")
                .catch(() => { });
        },
        done: opts.operation.done.then((result) => {
            stopPoll?.();
            return {
                status: cancelled ? "killed" : "completed",
                detail: `waitReason=${result.waitReason}`,
                ...(result.viewport !== "" ? { output: result.viewport } : {}),
            };
        }),
        readOutput: () => opts.operation.readOutput().delta,
    };
}
//# sourceMappingURL=tools.js.map