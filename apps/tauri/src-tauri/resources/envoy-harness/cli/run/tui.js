/**
 * `envoy-harness tui` — delegate to the EHUI package (`envoy-harness-tui`).
 *
 * Package 1 stays UI-free; this subcommand only resolves and spawns the
 * sibling TUI binary with `--spawn` and forwarded flags.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CliError } from "./errors.js";
import { EXIT_USAGE } from "./types.js";
const TUI_FORWARD_FLAGS = new Set([
    "--demo",
    "--spawn",
    "--cluster-only",
    "--peers",
    "--connect-timeout-ms",
    "--provider",
    "--model",
    "--ask-permission",
    "--help",
    "-h",
    "--no-color",
]);
/** Flags we always pass so standalone `envoy-harness tui` runs a live agent. */
const TUI_DEFAULT_ARGS = ["--spawn"];
export function resolveTuiEntry(forwardArgv) {
    if (process.env.ENVOY_HARNESS_TUI_BIN !== undefined) {
        return {
            command: process.env.ENVOY_HARNESS_TUI_BIN,
            args: [...TUI_DEFAULT_ARGS, ...forwardArgv],
        };
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const siblingBin = path.resolve(here, "../../../../envoy-harness-tui/dist/bin.js");
    if (existsSync(siblingBin)) {
        return {
            command: process.execPath,
            args: [siblingBin, ...TUI_DEFAULT_ARGS, ...forwardArgv],
        };
    }
    try {
        const require = createRequire(import.meta.url);
        const pkgJson = require.resolve("@envoymesh/envoy-harness-tui/package.json");
        const bin = path.join(path.dirname(pkgJson), "dist/bin.js");
        if (existsSync(bin)) {
            return {
                command: process.execPath,
                args: [bin, ...TUI_DEFAULT_ARGS, ...forwardArgv],
            };
        }
    }
    catch {
        // optional package not installed
    }
    return {
        command: "envoy-harness-tui",
        args: [...TUI_DEFAULT_ARGS, ...forwardArgv],
    };
}
function buildForwardArgv(parsed, rawArgv) {
    const out = [];
    for (let i = 0; i < rawArgv.length; i++) {
        const arg = rawArgv[i];
        if (arg === undefined || arg === "tui")
            continue;
        if (!TUI_FORWARD_FLAGS.has(arg)) {
            throw new CliError(`unknown flag for tui subcommand: ${arg}`, EXIT_USAGE);
        }
        if (arg === "--help" || arg === "-h") {
            out.push("--help");
            continue;
        }
        out.push(arg);
        if (arg === "--peers" ||
            arg === "--connect-timeout-ms" ||
            arg === "--provider" ||
            arg === "--model") {
            const val = rawArgv[i + 1];
            if (val === undefined || val.startsWith("--")) {
                throw new CliError(`${arg} requires a value`, EXIT_USAGE);
            }
            out.push(val);
            i++;
        }
    }
    if (parsed.noColor) {
        out.push("--no-color");
    }
    return out;
}
export async function runTuiDispatch(parsed, rawArgv) {
    const forward = buildForwardArgv(parsed, rawArgv);
    const { command, args } = resolveTuiEntry(forward);
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: "inherit",
        });
        child.on("error", (err) => {
            if (err.code === "ENOENT") {
                reject(new CliError("envoy-harness-tui not found. Install with: npm install -g @envoymesh/envoy-harness-tui " +
                    "(or use the monorepo packages/envoy-harness-tui)", EXIT_USAGE));
                return;
            }
            reject(err);
        });
        child.on("close", (code) => {
            if (code !== 0 && code !== null) {
                process.exitCode = code;
            }
            resolve();
        });
    });
    return { subcommand: "tui" };
}
//# sourceMappingURL=tui.js.map