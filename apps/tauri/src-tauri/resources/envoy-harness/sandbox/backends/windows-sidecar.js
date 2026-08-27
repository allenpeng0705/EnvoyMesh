/**
 * F2b — Windows sandbox sidecar executor (`envoy-sandbox-win`).
 *
 * Spawns a long-lived sidecar process and sends newline JSON requests.
 * Falls back to {@link WindowsJobSandboxExecutor} when the sidecar binary
 * is missing (or `onUnusable: "noop"` on non-Windows for tests).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WindowsJobSandboxExecutor } from "./windows-job.js";
export function resolveWindowsSidecarBin() {
    if (process.env.ENVOY_SANDBOX_WIN_BIN !== undefined) {
        return process.env.ENVOY_SANDBOX_WIN_BIN;
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sibling = path.resolve(here, "../../../../envoy-sandbox-win/dist/bin.js");
    if (existsSync(sibling))
        return sibling;
    try {
        const require = createRequire(import.meta.url);
        const pkg = require.resolve("@envoymesh/envoy-sandbox-win/package.json");
        const bin = path.join(path.dirname(pkg), "dist/bin.js");
        if (existsSync(bin))
            return bin;
    }
    catch {
        // optional package
    }
    return undefined;
}
export function isWindowsSidecarAvailable() {
    return resolveWindowsSidecarBin() !== undefined;
}
export class WindowsSidecarSandboxExecutor {
    #command;
    #args;
    #onUnusable;
    #fallback = new WindowsJobSandboxExecutor({ onUnusable: "noop" });
    #child;
    #pending;
    #buffer = "";
    constructor(options = {}) {
        this.#command = options.command;
        this.#args = options.args;
        this.#onUnusable = options.onUnusable ?? "error";
    }
    async execute(command, context) {
        const bin = this.#command ?? resolveWindowsSidecarBin();
        if (bin === undefined) {
            if (this.#onUnusable === "noop") {
                return this.#fallback.execute(command, context);
            }
            return {
                stdout: "",
                stderr: "envoy-sandbox-win sidecar not found",
                exitCode: 125,
                isError: true,
                stdoutTruncated: false,
                stderrTruncated: false,
            };
        }
        try {
            await this.#ensureChild(bin);
            const id = randomUUID();
            const req = {
                id,
                method: "execute",
                params: {
                    command,
                    cwd: context.cwd,
                    policy: context.policy,
                    ...(context.maxOutputBytes !== undefined
                        ? { maxOutputBytes: context.maxOutputBytes }
                        : {}),
                },
            };
            const result = await this.#request(req, context.signal);
            return result;
        }
        catch (err) {
            if (this.#onUnusable === "noop") {
                return this.#fallback.execute(command, context);
            }
            return {
                stdout: "",
                stderr: err instanceof Error ? err.message : String(err),
                exitCode: 125,
                isError: true,
                stdoutTruncated: false,
                stderrTruncated: false,
            };
        }
    }
    async #ensureChild(bin) {
        if (this.#child !== undefined && !this.#child.killed)
            return;
        const isJs = bin.endsWith(".js");
        const command = isJs ? process.execPath : bin;
        const spawnArgs = isJs ? [bin] : (this.#args ?? []);
        const child = spawn(command, spawnArgs, {
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.#child = child;
        this.#pending = new Map();
        this.#buffer = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            this.#buffer += chunk;
            let idx;
            while ((idx = this.#buffer.indexOf("\n")) !== -1) {
                const line = this.#buffer.slice(0, idx).trim();
                this.#buffer = this.#buffer.slice(idx + 1);
                if (line.length === 0)
                    continue;
                try {
                    const parsed = JSON.parse(line);
                    const waiter = this.#pending?.get(parsed.id);
                    if (waiter === undefined)
                        continue;
                    this.#pending?.delete(parsed.id);
                    if (!parsed.ok || parsed.result === undefined) {
                        waiter.reject(new Error(parsed.error ?? "sidecar error"));
                    }
                    else {
                        waiter.resolve(parsed.result);
                    }
                }
                catch {
                    // ignore malformed lines
                }
            }
        });
        child.on("error", () => this.#resetChild());
        child.on("close", () => this.#resetChild());
    }
    #resetChild() {
        if (this.#pending !== undefined) {
            for (const waiter of this.#pending.values()) {
                waiter.reject(new Error("sidecar exited"));
            }
        }
        this.#pending = undefined;
        this.#child = undefined;
    }
    #request(req, signal) {
        const child = this.#child;
        const pending = this.#pending;
        if (child === undefined || pending === undefined) {
            return Promise.reject(new Error("sidecar not running"));
        }
        return new Promise((resolve, reject) => {
            pending.set(req.id, { resolve, reject });
            const onAbort = () => {
                pending.delete(req.id);
                child.kill();
                this.#resetChild();
                reject(new Error("aborted"));
            };
            if (signal?.aborted) {
                onAbort();
                return;
            }
            signal?.addEventListener("abort", onAbort, { once: true });
            child.stdin.write(JSON.stringify(req) + "\n", (err) => {
                if (err !== undefined && err !== null) {
                    signal?.removeEventListener("abort", onAbort);
                    pending.delete(req.id);
                    reject(err);
                }
            });
        });
    }
}
//# sourceMappingURL=windows-sidecar.js.map