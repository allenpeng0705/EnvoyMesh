/**
 * `envoy-peer ui` — the standalone cluster console.
 *
 * Starts the dedicated envoy-harness TUI (screen mode on a TTY) with a
 * peer registry wired into the ACP backend: the cluster rail, /cluster,
 * /peers, /route, /scoreboard and the discovery ticker all read the
 * connected peer cluster — no EnvoyMesh required.
 *
 * Chat is NOT wired here (a peer has no model of its own): the console
 * backend echoes a hint. Attach a full harness (`envoy-harness --acp` +
 * `envoy-harness-tui`) for the coding-agent surface; this is the
 * distributed-ops console.
 */
import type { ProtocolSessionBackend } from "@envoymesh/envoy-harness";
import type { ProtocolDiscoveryEvent, ProtocolScoreboardEntry } from "@envoymesh/envoy-harness";
import type { VerdictEntry } from "@envoymesh/protocol";
import type { PeerEventSink } from "../events.js";
import type { PeerRegistry } from "../registry.js";
import { PeerScoreboard } from "../scoreboard.js";
import { type PeerHealthInfo } from "../status.js";
export interface PeerUiPeerArg {
    id: string;
    endpoint: string;
}
export interface PeerUiArgs {
    peers: PeerUiPeerArg[];
    connectTimeoutMs?: number;
    help?: boolean;
}
export interface PeerUiIo {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
}
/** Parse `envoy-peer ui` argv (`--peers <id@host:port>`, repeatable). */
export declare function parsePeerUiArgs(argv: readonly string[]): PeerUiArgs;
export declare const PEER_UI_HELP = "Usage: envoy-peer ui [options]\n\nStart the dedicated envoy-harness TUI as a cluster console over the\nconnected standalone peer cluster (no EnvoyMesh required).\n\nOptions:\n  --peers <id>@<host:port>   peer to connect (repeatable)\n  --connect-timeout-ms <n>   connect timeout per peer (default 10000)\n  --help                     show this help\n\nSlash surfaces: /peers /cluster /team /scoreboard /route <tag>.\nChat requires attaching a full harness (--acp) \u2014 this is the\ndistributed-ops console.\n";
/** Lazily ping every registered peer and cache health for a TTL. */
export declare function buildHealthProvider(registry: PeerRegistry, options?: {
    pingTimeoutMs?: number;
    ttlMs?: number;
    onEvent?: PeerEventSink;
}): () => Promise<ReadonlyMap<string, PeerHealthInfo>>;
export interface PeerUiBackendOptions {
    registry: PeerRegistry;
    connected: string[];
    failed: Array<{
        id: string;
        error: string;
    }>;
    scoreboard?: PeerScoreboard;
    healthProvider?: () => Promise<ReadonlyMap<string, PeerHealthInfo>>;
    /**
     * U3 follow-up — a peer-event sink. Live lifecycle/health events
     * (`peer.connected` / `peer.failed` / `peer.health` /
     * `peer.disconnected`) are forwarded to discovery subscribers.
     */
    onEvent?: PeerEventSink;
}
export interface PeerUiBackend {
    backend: ProtocolSessionBackend;
    /** Push a discovery event to all current subscribers. */
    emitDiscoveryEvent(event: ProtocolDiscoveryEvent): void;
    /** Teardown: emit disconnects + close sockets (idempotent). */
    close(): void;
}
/** Build the ACP backend for the cluster console. */
export declare function createPeerUiBackend(options: PeerUiBackendOptions): PeerUiBackend;
/** Aggregate `VerdictEntry[]` (PeerScoreboard records or mesh verdicts) into the wire shape. */
export declare function aggregateVerdicts(entries: readonly VerdictEntry[]): ProtocolScoreboardEntry[];
/** Aggregate a scoreboard into the `scoreboard/summary` wire shape. */
export declare function aggregateScoreboard(scoreboard: PeerScoreboard): ProtocolScoreboardEntry[];
/** Run `envoy-peer ui` until the user quits. Returns an exit code. */
export declare function runPeerUiCli(argv: readonly string[], io?: PeerUiIo): Promise<number>;
//# sourceMappingURL=ui.d.ts.map