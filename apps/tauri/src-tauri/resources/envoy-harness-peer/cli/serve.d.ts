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
import { type Server } from "node:net";
import type { AgentAdapter } from "@envoymesh/agent-adapter";
export interface PeerServeArgs {
    host: string;
    port: number;
    adapterFile?: string;
    peerId: string;
    model?: string;
    ownerId?: string;
    verifyAfterExecute?: boolean;
    maxVerifyAfterExecute?: number;
    help?: boolean;
}
export interface PeerServeIo {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
}
/** Parse `envoy-peer serve` argv (throws on unknown flags). */
export declare function parseServeArgs(argv: readonly string[]): PeerServeArgs;
export declare const PEER_SERVE_HELP = "Usage: envoy-peer serve [options]\n\nStart a standalone envoy-harness peer (MAP-over-JSON-RPC over TCP).\n\nOptions:\n  --host <addr>              bind address (default 0.0.0.0)\n  --port <n>                 listen port (default 8123)\n  --adapter <file>           ESM module whose default export is an\n                             AgentAdapter or a () => AgentAdapter factory.\n                             Omit for the built-in demo adapter.\n  --peer-id <id>             this peer's stable id (default \"envoy-peer\")\n  --model <model>            advertised model for routing (e.g. deepseek-chat)\n  --owner-id <owner>         advertised owner id (default: peer id)\n  --verify-after-execute     run adapter.verify after every peer/submit and\n                             include the combined verdict in the response\n  --max-verify-after-execute <n>\n                             cap auto-verifies per server lifetime (bounds\n                             LLM-verifier cost; only meaningful with\n                             --verify-after-execute)\n  --help                     show this help\n";
/** The built-in echo adapter so `envoy-peer serve` runs without args. */
export declare function createDemoAdapter(identity: {
    peerId: string;
    model?: string;
}): AgentAdapter;
/**
 * Load an adapter from `--adapter <file>`: ESM default export that is
 * either an `AgentAdapter` or a `() => AgentAdapter | Promise<AgentAdapter>`.
 */
export declare function loadAdapterFromFile(file: string, cwd?: string): Promise<AgentAdapter>;
export interface StartedPeerServer {
    port: number;
    server: Server;
    close(): Promise<void>;
}
/** Start a peer server on a real TCP socket. */
export declare function startPeerServer(options: {
    adapter: AgentAdapter;
    identity: {
        peerId: string;
        model?: string;
        ownerId?: string;
    };
    host?: string;
    port?: number;
    verifyAfterExecute?: boolean;
    maxVerifyAfterExecute?: number;
}): Promise<StartedPeerServer>;
/**
 * Run `envoy-peer serve` until SIGINT/SIGTERM (or the server closes).
 * Returns an exit code (0 = clean).
 */
export declare function runPeerServeCli(argv: readonly string[], io?: PeerServeIo): Promise<number>;
//# sourceMappingURL=serve.d.ts.map