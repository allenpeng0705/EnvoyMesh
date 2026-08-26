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
import { connectPeerClients } from "../cluster.js";
import { PeerScoreboard } from "../scoreboard.js";
import { clusterStatusFromConnect, peerToInfo, } from "../status.js";
/** Parse `envoy-peer ui` argv (`--peers <id@host:port>`, repeatable). */
export function parsePeerUiArgs(argv) {
    const args = { peers: [] };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        switch (flag) {
            case "--help":
            case "-h":
                args.help = true;
                break;
            case "--peers":
            case "--peer": {
                const raw = requireUiValue(argv, ++i, flag);
                const at = raw.lastIndexOf("@");
                if (at <= 0 || at === raw.length - 1) {
                    throw new Error(`--peers expects <id>@<host:port>, got "${raw}"`);
                }
                const id = raw.slice(0, at);
                const endpoint = raw.slice(at + 1);
                if (!endpoint.includes(":")) {
                    throw new Error(`--peers endpoint must be <host:port>, got "${endpoint}"`);
                }
                args.peers.push({ id, endpoint });
                break;
            }
            case "--connect-timeout-ms": {
                const value = Number(requireUiValue(argv, ++i, flag));
                if (!Number.isInteger(value) || value <= 0) {
                    throw new Error(`--connect-timeout-ms must be a positive integer`);
                }
                args.connectTimeoutMs = value;
                break;
            }
            default:
                throw new Error(`unknown flag: ${flag}`);
        }
    }
    return args;
}
function requireUiValue(argv, index, flag) {
    const value = argv[index];
    if (value === undefined)
        throw new Error(`${flag} requires a value`);
    return value;
}
export const PEER_UI_HELP = `Usage: envoy-peer ui [options]

Start the dedicated envoy-harness TUI as a cluster console over the
connected standalone peer cluster (no EnvoyMesh required).

Options:
  --peers <id>@<host:port>   peer to connect (repeatable)
  --connect-timeout-ms <n>   connect timeout per peer (default 10000)
  --help                     show this help

Slash surfaces: /peers /cluster /team /scoreboard /route <tag>.
Chat requires attaching a full harness (--acp) — this is the
distributed-ops console.
`;
/** Lazily ping every registered peer and cache health for a TTL. */
export function buildHealthProvider(registry, options = {}) {
    const ttlMs = options.ttlMs ?? 5_000;
    const pingTimeoutMs = options.pingTimeoutMs ?? 2_000;
    let cache;
    let cachedAt = 0;
    return async () => {
        const now = Date.now();
        if (cache !== undefined && now - cachedAt < ttlMs)
            return cache;
        const results = [];
        await Promise.all(registry.list().map(async (entry) => {
            const startedAt = Date.now();
            try {
                await Promise.race([
                    entry.client.ping(),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error("ping timeout")), pingTimeoutMs);
                    }),
                ]);
                results.push([
                    entry.id,
                    {
                        ok: true,
                        rttMs: Date.now() - startedAt,
                        lastPingAt: new Date().toISOString(),
                    },
                ]);
                options.onEvent?.({
                    type: "peer.health",
                    peerId: entry.id,
                    ok: true,
                    rttMs: Date.now() - startedAt,
                    at: Date.now(),
                });
            }
            catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                results.push([
                    entry.id,
                    {
                        ok: false,
                        error,
                    },
                ]);
                options.onEvent?.({
                    type: "peer.health",
                    peerId: entry.id,
                    ok: false,
                    error,
                    at: Date.now(),
                });
            }
        }));
        cache = new Map(results);
        cachedAt = Date.now();
        return cache;
    };
}
/** Build the ACP backend for the cluster console. */
export function createPeerUiBackend(options) {
    const scoreboard = options.scoreboard ?? new PeerScoreboard();
    const listeners = new Set();
    let closed = false;
    const emitDiscoveryEvent = (event) => {
        for (const listener of [...listeners])
            listener(event);
    };
    // U3 follow-up — forward live peer events to discovery subscribers.
    const forwardPeerEvent = (event) => {
        const discovery = event.type === "peer.connected"
            ? {
                type: "peer.connected",
                peerId: event.peerId,
                at: new Date(event.at).toISOString(),
            }
            : event.type === "peer.disconnected"
                ? {
                    type: "peer.disconnected",
                    peerId: event.peerId,
                    at: new Date(event.at).toISOString(),
                }
                : event.type === "peer.failed"
                    ? {
                        type: "peer.failed",
                        peerId: event.peerId,
                        error: event.error,
                        at: new Date(event.at).toISOString(),
                    }
                    : event.type === "peer.health"
                        ? {
                            type: "peer.health",
                            peerId: event.peerId,
                            ...(event.rttMs !== undefined ? { rttMs: event.rttMs } : {}),
                            ...(event.ok ? {} : { error: "ping failed" }),
                            at: new Date(event.at).toISOString(),
                        }
                        : undefined;
        if (discovery !== undefined)
            emitDiscoveryEvent(discovery);
    };
    const sink = options.onEvent === undefined
        ? undefined
        : (event) => {
            options.onEvent?.(event);
            forwardPeerEvent(event);
        };
    const healthProvider = options.healthProvider ??
        buildHealthProvider(options.registry, {
            ...(sink !== undefined ? { onEvent: sink } : {}),
        });
    const backend = {
        async createSession() {
            return { sessionId: "peer-ui" };
        },
        async prompt(params) {
            const userText = "text" in params.prompt
                ? params.prompt.text
                : params.prompt.content
                    .map((block) => block.type === "text" ? block.text : `[${block.type}]`)
                    .join("");
            return {
                stopReason: "end_turn",
                messages: [
                    { role: "user", text: userText },
                    {
                        role: "assistant",
                        text: "peer ui is the cluster console — slash commands: /mesh /peers /cluster " +
                            "/team /scoreboard /route <tag>. Chat requires attaching a harness.",
                    },
                ],
            };
        },
        cancel() {
            /* no in-flight prompt to cancel */
        },
        listPeers: () => options.registry.list().map(peerToInfo),
        clusterStatus: async () => {
            const health = await healthProvider();
            return clusterStatusFromConnect({
                registry: options.registry,
                connected: options.connected,
                failed: options.failed,
            }, health);
        },
        routePeer: (input) => {
            const entry = options.registry.route({
                objective: "",
                capabilityTag: input.capabilityTag,
                costCeilingUsd: 1,
                deadlineMs: 60_000,
                ...(input.preferredPeerId !== undefined
                    ? { preferredPeerId: input.preferredPeerId }
                    : {}),
            });
            return entry === undefined ? undefined : peerToInfo(entry);
        },
        scoreboardSummary: () => aggregateScoreboard(scoreboard),
        subscribeDiscovery: (listener) => {
            listeners.add(listener);
            const at = new Date().toISOString();
            for (const id of options.connected) {
                listener({ type: "peer.connected", peerId: id, at });
            }
            for (const failed of options.failed) {
                listener({
                    type: "peer.failed",
                    peerId: failed.id,
                    error: failed.error,
                    at,
                });
            }
            return () => {
                listeners.delete(listener);
            };
        },
    };
    return {
        backend,
        emitDiscoveryEvent,
        close() {
            if (closed)
                return;
            closed = true;
            const at = new Date().toISOString();
            for (const id of options.connected) {
                emitDiscoveryEvent({ type: "peer.disconnected", peerId: id, at });
            }
        },
    };
}
/** Aggregate `VerdictEntry[]` (PeerScoreboard records or mesh verdicts) into the wire shape. */
export function aggregateVerdicts(entries) {
    const byKey = new Map();
    for (const entry of entries) {
        const key = `${entry.workerPeerId}\u0000${entry.skillId}`;
        const agg = byKey.get(key) ?? {
            workerPeerId: entry.workerPeerId,
            skillId: entry.skillId,
            passCount: 0,
            failCount: 0,
            partialCount: 0,
            weighted: 0,
            total: 0,
        };
        if (entry.verdict.kind === "pass") {
            agg.passCount++;
            agg.weighted += entry.verdict.score;
        }
        else if (entry.verdict.kind === "fail") {
            agg.failCount++;
        }
        else {
            agg.partialCount++;
        }
        agg.total++;
        byKey.set(key, agg);
    }
    return [...byKey.values()].map((agg) => ({
        workerPeerId: agg.workerPeerId,
        skillId: agg.skillId,
        score: agg.total === 0 ? 0 : Math.min(1, Math.max(0, agg.weighted / agg.total)),
        passCount: agg.passCount,
        failCount: agg.failCount,
        partialCount: agg.partialCount,
    }));
}
/** Aggregate a scoreboard into the `scoreboard/summary` wire shape. */
export function aggregateScoreboard(scoreboard) {
    return aggregateVerdicts(scoreboard.list());
}
/** Run `envoy-peer ui` until the user quits. Returns an exit code. */
export async function runPeerUiCli(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
    let args;
    try {
        args = parsePeerUiArgs(argv);
    }
    catch (err) {
        io.stderr.write(`envoy-peer ui: ${err.message}\n`);
        return 2;
    }
    if (args.help) {
        io.stdout.write(PEER_UI_HELP);
        return 0;
    }
    if (args.peers.length === 0) {
        io.stderr.write("envoy-peer ui: at least one --peers <id@host:port> is required\n");
        return 2;
    }
    let connect;
    try {
        connect = await connectPeerClients(args.peers.map((p) => ({ id: p.id, endpoint: p.endpoint })), {
            ...(args.connectTimeoutMs !== undefined
                ? { connectTimeoutMs: args.connectTimeoutMs }
                : {}),
            onFailure: (id, err) => {
                io.stderr.write(`[peer-ui] ${id} failed: ${err.message}\n`);
            },
        });
    }
    catch (err) {
        io.stderr.write(`envoy-peer ui: ${err.message}\n`);
        return 1;
    }
    const { createInProcessTui } = await import("@envoymesh/envoy-harness-tui");
    const { runInteractive } = await import("@envoymesh/envoy-harness-tui");
    const { backend, close } = createPeerUiBackend({
        registry: connect.registry,
        connected: connect.connected,
        failed: connect.failed,
    });
    const tui = createInProcessTui({ backend });
    try {
        await runInteractive({ session: tui.session });
    }
    catch (err) {
        io.stderr.write(`envoy-peer ui: ${err.message}\n`);
        return 1;
    }
    finally {
        close();
        connect.closeAll();
        tui.close();
    }
    return 0;
}
//# sourceMappingURL=ui.js.map