/**
 * Phase C / Item 7 — child-process job producer.
 */
import { spawn } from "node:child_process";
const DEFAULT_OUTPUT_LIMIT = 256 * 1024;
const DEFAULT_KILL_GRACE_MS = 2000;
/** Build {@link JobHooks} for a shell command. Call from `JobStart.run()`. */
export function createProcessJobHooks(options) {
    const limit = options.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;
    const graceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    let buffer = Buffer.alloc(0);
    let truncated = false;
    let cancelled = false;
    let settled = false;
    let child;
    let killTimer;
    const append = (chunk) => {
        if (settled)
            return;
        if (options.onOutput !== undefined && chunk.byteLength > 0) {
            options.onOutput(chunk.toString("utf8"));
        }
        const next = Buffer.concat([buffer, chunk]);
        if (next.byteLength <= limit) {
            buffer = next;
            return;
        }
        truncated = true;
        buffer = next.subarray(next.byteLength - limit);
    };
    let resolveDone;
    const done = new Promise((resolve) => {
        resolveDone = resolve;
    });
    const finish = (outcome) => {
        if (settled)
            return;
        settled = true;
        if (killTimer !== undefined)
            clearTimeout(killTimer);
        resolveDone(outcome);
    };
    child = spawn("sh", ["-c", options.command], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (c) => append(c));
    child.stderr?.on("data", (c) => append(c));
    child.on("error", (err) => {
        finish({
            status: "failed",
            detail: err.message,
            output: buffer.toString("utf8"),
        });
    });
    child.on("close", (code, signal) => {
        const text = buffer.toString("utf8") + (truncated ? "\n…[truncated]" : "");
        if (cancelled) {
            finish({
                status: "killed",
                detail: signal !== null ? `signal ${signal}` : `exit ${code ?? "?"}`,
                output: text,
            });
            return;
        }
        if (code === 0) {
            finish({ status: "completed", detail: "exit 0", output: text });
            return;
        }
        finish({
            status: "failed",
            detail: signal !== null ? `signal ${signal}` : `exit ${code ?? "?"}`,
            output: text,
        });
    });
    return {
        cancel(reason) {
            if (settled || cancelled)
                return;
            cancelled = true;
            if (child === undefined || child.killed)
                return;
            try {
                child.kill("SIGTERM");
            }
            catch {
                // ignore
            }
            killTimer = setTimeout(() => {
                try {
                    child?.kill("SIGKILL");
                }
                catch {
                    // ignore
                }
                finish({
                    status: "killed",
                    detail: reason ?? "SIGKILL",
                    output: buffer.toString("utf8"),
                });
            }, graceMs);
        },
        done,
        readOutput() {
            const text = buffer.toString("utf8");
            buffer = Buffer.alloc(0);
            return text + (truncated ? "\n…[truncated]" : "");
        },
    };
}
//# sourceMappingURL=process-provider.js.map