/**
 * `envoy-peer serve` — start a standalone envoy-harness peer.
 *
 * The peer server is the MAP-over-JSON-RPC server
 * (`createPeerServerHandler`) behind a real TCP socket. A user who wants
 * a peer on another machine runs:
 *
 *   envoy-peer serve --port 8123 --adapter ./my-adapter.mjs \
 *     --peer-id peer-1 --model deepseek-chat
 *
 * Without `--adapter`, a built-in **demo adapter** answers (echo-style),
 * so the CLI is runnable out of the box for smoke tests / team-runner
 * experiments — mirroring the ACP server's demo backend.
 *
 * **Why this lives in the peer package, not `envoy-harness`:** Package 1
 * must not depend on the peer package (the peer package depends on
 * Package 1). The binary is `envoy-peer` (from
 * `@envoymesh/envoy-harness-peer`), not an `envoy-harness` subcommand.
 */
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { JsonRpcConnection } from "@envoymesh/envoy-harness";
import { createPeerServerHandler } from "../server.js";
/** Parse `envoy-peer serve` argv (throws on unknown flags). */
export function parseServeArgs(argv) {
    const args = {
        host: "0.0.0.0",
        port: 8123,
        peerId: "envoy-peer",
    };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        switch (flag) {
            case "--help":
            case "-h":
                args.help = true;
                break;
            case "--host":
                args.host = requireValue(argv, ++i, "--host");
                break;
            case "--port":
                args.port = Number(requireValue(argv, ++i, "--port"));
                if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65_535) {
                    throw new Error(`--port must be an integer in [0, 65535]`);
                }
                break;
            case "--adapter":
                args.adapterFile = requireValue(argv, ++i, "--adapter");
                break;
            case "--peer-id":
                args.peerId = requireValue(argv, ++i, "--peer-id");
                break;
            case "--model":
                args.model = requireValue(argv, ++i, "--model");
                break;
            case "--owner-id":
                args.ownerId = requireValue(argv, ++i, "--owner-id");
                break;
            case "--verify-after-execute":
                args.verifyAfterExecute = true;
                break;
            case "--max-verify-after-execute": {
                const value = Number(requireValue(argv, ++i, "--max-verify-after-execute"));
                if (!Number.isInteger(value) || value < 0) {
                    throw new Error("--max-verify-after-execute must be a non-negative integer");
                }
                args.maxVerifyAfterExecute = value;
                break;
            }
            default:
                throw new Error(`unknown flag: ${flag}`);
        }
    }
    return args;
}
function requireValue(argv, index, flag) {
    const value = argv[index];
    if (value === undefined) {
        throw new Error(`${flag} requires a value`);
    }
    return value;
}
export const PEER_SERVE_HELP = `Usage: envoy-peer serve [options]

Start a standalone envoy-harness peer (MAP-over-JSON-RPC over TCP).

Options:
  --host <addr>              bind address (default 0.0.0.0)
  --port <n>                 listen port (default 8123)
  --adapter <file>           ESM module whose default export is an
                             AgentAdapter or a () => AgentAdapter factory.
                             Omit for the built-in demo adapter.
  --peer-id <id>             this peer's stable id (default "envoy-peer")
  --model <model>            advertised model for routing (e.g. deepseek-chat)
  --owner-id <owner>         advertised owner id (default: peer id)
  --verify-after-execute     run adapter.verify after every peer/submit and
                             include the combined verdict in the response
  --max-verify-after-execute <n>
                             cap auto-verifies per server lifetime (bounds
                             LLM-verifier cost; only meaningful with
                             --verify-after-execute)
  --help                     show this help
`;
/** The built-in echo adapter so `envoy-peer serve` runs without args. */
export function createDemoAdapter(identity) {
    return {
        runtime: "envoy-harness",
        describeSkills: () => [
            {
                skillId: "demo",
                description: "Built-in demo skill: echoes the objective as a text result.",
                maxSensitivity: "public",
                tags: [],
            },
        ],
        buildManifest: async (input) => ({
            runtime: "envoy-harness",
            runtimeVersion: "0.0.0",
            peerId: input.peerId,
            ownerId: input.ownerId,
            issuedAt: new Date().toISOString(),
            ttlSeconds: 3600,
            skills: [
                { skillId: "demo", description: "demo", maxSensitivity: "public", tags: [] },
            ],
            reputationBySkill: {},
        }),
        execute: async (input) => ({
            skillId: input.skillId,
            runtime: "envoy-harness",
            peerId: identity.peerId,
            correlationId: input.correlationId,
            content: [
                {
                    kind: "text",
                    text: `[demo ${identity.peerId}] ${input.objective}`,
                },
            ],
            citations: [],
            metrics: { durationMs: 0, costUsd: 0 },
            completedAt: new Date().toISOString(),
            signature: "",
        }),
        verify: async (_input) => [
            { kind: "pass", score: 1, confidence: "high" },
        ],
    };
}
/**
 * Load an adapter from `--adapter <file>`: ESM default export that is
 * either an `AgentAdapter` or a `() => AgentAdapter | Promise<AgentAdapter>`.
 */
export async function loadAdapterFromFile(file, cwd = process.cwd()) {
    const url = pathToFileURL(resolve(cwd, file)).href;
    const mod = (await import(url));
    const exported = mod.default;
    if (exported === undefined || exported === null) {
        throw new Error(`adapter module "${file}" has no default export`);
    }
    if (typeof exported === "function") {
        const created = await exported();
        return created;
    }
    return exported;
}
/** Start a peer server on a real TCP socket. */
export async function startPeerServer(options) {
    const server = createServer((socket) => {
        const connection = new JsonRpcConnection({
            input: socket,
            output: socket,
            onRequest: createPeerServerHandler({
                adapter: options.adapter,
                identity: options.identity,
                ...(options.verifyAfterExecute !== undefined
                    ? { verifyAfterExecute: options.verifyAfterExecute }
                    : {}),
                ...(options.maxVerifyAfterExecute !== undefined
                    ? { maxVerifyAfterExecute: options.maxVerifyAfterExecute }
                    : {}),
            }),
        });
        // Tolerate client disconnects (ECONNRESET etc.) — an unhandled
        // connection "error" event would crash the whole peer server.
        connection.on("error", (err) => {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(`[peer] connection error: ${message}\n`);
        });
        socket.on("close", () => connection.close());
    });
    await new Promise((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 8123, options.host ?? "0.0.0.0", () => {
            server.removeListener("error", reject);
            resolvePromise();
        });
    });
    const address = server.address();
    const port = address !== null && typeof address === "object" ? address.port : options.port ?? 8123;
    return {
        port,
        server,
        close: () => new Promise((resolvePromise) => {
            server.close(() => resolvePromise());
        }),
    };
}
/**
 * Run `envoy-peer serve` until SIGINT/SIGTERM (or the server closes).
 * Returns an exit code (0 = clean).
 */
export async function runPeerServeCli(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
    let args;
    try {
        args = parseServeArgs(argv);
    }
    catch (err) {
        io.stderr.write(`envoy-peer serve: ${err.message}\n`);
        return 2;
    }
    if (args.help) {
        io.stdout.write(PEER_SERVE_HELP);
        return 0;
    }
    let adapter;
    if (args.adapterFile !== undefined) {
        try {
            adapter = await loadAdapterFromFile(args.adapterFile);
        }
        catch (err) {
            io.stderr.write(`envoy-peer serve: failed to load --adapter: ${err.message}\n`);
            return 1;
        }
    }
    else {
        io.stderr.write("envoy-peer serve: no --adapter; using the built-in demo adapter (echo)\n");
        adapter = createDemoAdapter({
            peerId: args.peerId,
            ...(args.model !== undefined ? { model: args.model } : {}),
        });
    }
    try {
        const started = await startPeerServer({
            adapter,
            identity: {
                peerId: args.peerId,
                ...(args.model !== undefined ? { model: args.model } : {}),
                ...(args.ownerId !== undefined ? { ownerId: args.ownerId } : {}),
            },
            host: args.host,
            port: args.port,
            ...(args.verifyAfterExecute !== undefined
                ? { verifyAfterExecute: args.verifyAfterExecute }
                : {}),
            ...(args.maxVerifyAfterExecute !== undefined
                ? { maxVerifyAfterExecute: args.maxVerifyAfterExecute }
                : {}),
        });
        io.stdout.write(`envoy-peer serve: listening on ${args.host}:${started.port} (peer ${args.peerId}) — Ctrl-C to stop\n`);
        await new Promise((resolvePromise) => {
            const stop = () => {
                process.off("SIGINT", stop);
                process.off("SIGTERM", stop);
                void started.close().then(() => resolvePromise());
            };
            process.on("SIGINT", stop);
            process.on("SIGTERM", stop);
            started.server.once("close", () => resolvePromise());
        });
        return 0;
    }
    catch (err) {
        io.stderr.write(`envoy-peer serve: ${err.message}\n`);
        return 1;
    }
}
//# sourceMappingURL=serve.js.map