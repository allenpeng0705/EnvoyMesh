/**
 * R2 — the peer cluster: static discovery (`connectPeerClients`) + a
 * dynamic `MeshSubmitter` over the cluster (`createPeerClusterSubmitter`).
 */
import { connectPeerClient } from "./tcp.js";
import { PeerMeshSubmitter } from "./submitter.js";
import { PeerRegistry } from "./registry.js";
/** Static discovery: connect every configured peer endpoint (fail-open). */
export async function connectPeerClients(config, options) {
    const registry = new PeerRegistry();
    const closers = [];
    const connected = [];
    const failed = [];
    const connect = options?.connect ?? connectPeerClient;
    // R3 — connect every endpoint concurrently: a dead peer's connect
    // timeout must not delay the healthy peers. Fail-open is preserved:
    // each attempt catches its own error, and the successful peers still
    // form the cluster (in config order, so the result is deterministic).
    const attempts = await Promise.all(config.map(async (peer) => {
        const colon = peer.endpoint.lastIndexOf(":");
        const host = colon === -1 ? "" : peer.endpoint.slice(0, colon);
        const port = Number(peer.endpoint.slice(colon + 1));
        if (host === "" || !Number.isInteger(port) || port <= 0) {
            options?.onEvent?.({
                type: "peer.failed",
                peerId: peer.id,
                error: `bad endpoint "${peer.endpoint}"`,
                at: Date.now(),
            });
            return {
                ok: false,
                peer,
                error: `bad endpoint "${peer.endpoint}"`,
                err: new Error(`bad endpoint "${peer.endpoint}"`),
            };
        }
        try {
            const { client, close } = await connect({
                host,
                port,
                ...(options?.connectTimeoutMs !== undefined
                    ? { connectTimeoutMs: options.connectTimeoutMs }
                    : {}),
                ...(options?.signer !== undefined ? { signer: options.signer } : {}),
                ...(options?.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
            });
            options?.onEvent?.({
                type: "peer.connected",
                peerId: peer.id,
                at: Date.now(),
            });
            return { ok: true, peer, client, close };
        }
        catch (err) {
            options?.onEvent?.({
                type: "peer.failed",
                peerId: peer.id,
                error: err instanceof Error ? err.message : String(err),
                at: Date.now(),
            });
            return {
                ok: false,
                peer,
                error: err instanceof Error ? err.message : String(err),
                err: err instanceof Error ? err : new Error(String(err)),
            };
        }
    }));
    for (const attempt of attempts) {
        if (attempt.ok) {
            const peer = attempt.peer;
            registry.register({
                id: peer.id,
                client: attempt.client,
                ...(peer.model !== undefined ? { model: peer.model } : {}),
                ...(peer.capabilities !== undefined
                    ? { capabilities: peer.capabilities }
                    : {}),
            });
            closers.push(attempt.close);
            connected.push(peer.id);
            continue;
        }
        failed.push({ id: attempt.peer.id, error: attempt.error });
        options?.onFailure?.(attempt.peer.id, attempt.err);
    }
    return {
        registry,
        connected,
        failed,
        closeAll: () => {
            for (const c of closers)
                c();
            for (const id of connected) {
                options?.onEvent?.({
                    type: "peer.disconnected",
                    peerId: id,
                    at: Date.now(),
                });
            }
            closers.length = 0;
        },
    };
}
/**
 * A dynamic `MeshSubmitter` over the cluster: routes each submit by
 * `preferredPeerId`, then model/capability via the registry, then any
 * peer. The execution pool for a mesh node's worker (Pattern A).
 */
export function createPeerClusterSubmitter(registry, options = {}) {
    return {
        async submit(input, signal) {
            const entry = (input.preferredPeerId !== undefined
                ? registry.get(input.preferredPeerId)
                : undefined) ??
                registry.route(input) ??
                registry.list()[0];
            if (entry === undefined) {
                throw new Error("peer cluster: no peer available");
            }
            const submitter = new PeerMeshSubmitter({
                client: entry.client,
                workerPeerId: entry.id,
            });
            return submitter.submit({
                ...input,
                costCeilingUsd: input.costCeilingUsd ?? options.defaultCostCeilingUsd ?? 1,
                deadlineMs: input.deadlineMs ?? options.defaultDeadlineMs ?? 60_000,
            }, signal);
        },
    };
}
//# sourceMappingURL=cluster.js.map