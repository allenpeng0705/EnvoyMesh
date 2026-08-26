/**
 * Mutable peer cluster — connect peers at startup or at runtime (`cluster/connect`).
 */
import { createPeerUiBackend } from "./cli/ui.js";
import { PeerRegistry } from "./registry.js";
import { clusterStatusFromConnect, } from "./status.js";
import { connectPeerClient } from "./tcp.js";
/** Live peer pool with runtime `connectPeer` support. */
export class ManagedPeerCluster {
    registry = new PeerRegistry();
    connected = [];
    failed = [];
    #closers = new Map();
    #options;
    constructor(options = {}) {
        this.#options = options;
    }
    /** Connect every configured peer (fail-open per peer). */
    async connectPeers(peers) {
        for (const peer of peers) {
            await this.connectPeer(peer);
        }
    }
    /** Connect one peer endpoint and register it in the pool. */
    async connectPeer(peer) {
        if (this.registry.get(peer.id) !== undefined) {
            return { ok: false, error: `peer already connected: ${peer.id}` };
        }
        const failedIndex = this.failed.findIndex((f) => f.id === peer.id);
        if (failedIndex !== -1) {
            this.failed.splice(failedIndex, 1);
        }
        const colon = peer.endpoint.lastIndexOf(":");
        const host = colon === -1 ? "" : peer.endpoint.slice(0, colon);
        const port = Number(peer.endpoint.slice(colon + 1));
        if (host === "" || !Number.isInteger(port) || port <= 0) {
            const error = `bad endpoint "${peer.endpoint}"`;
            this.#recordFailure(peer.id, error);
            return { ok: false, error };
        }
        const connect = this.#options.connect ?? connectPeerClient;
        try {
            const { client, close } = await connect({
                host,
                port,
                ...(this.#options.connectTimeoutMs !== undefined
                    ? { connectTimeoutMs: this.#options.connectTimeoutMs }
                    : {}),
                ...(this.#options.signer !== undefined ? { signer: this.#options.signer } : {}),
                ...(this.#options.onEvent !== undefined ? { onEvent: this.#options.onEvent } : {}),
            });
            const unregister = this.registry.register({
                id: peer.id,
                client,
                ...(peer.model !== undefined ? { model: peer.model } : {}),
                ...(peer.capabilities !== undefined
                    ? { capabilities: peer.capabilities }
                    : {}),
            });
            this.#closers.set(peer.id, () => {
                close();
                unregister();
            });
            this.connected.push(peer.id);
            this.#options.onEvent?.({
                type: "peer.connected",
                peerId: peer.id,
                at: Date.now(),
            });
            return { ok: true };
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            const wrapped = err instanceof Error ? err : new Error(error);
            this.#recordFailure(peer.id, error, wrapped);
            return { ok: false, error };
        }
    }
    #recordFailure(id, error, err) {
        const existing = this.failed.findIndex((f) => f.id === id);
        if (existing === -1) {
            this.failed.push({ id, error });
        }
        else {
            this.failed[existing] = { id, error };
        }
        this.#options.onEvent?.({
            type: "peer.failed",
            peerId: id,
            error,
            at: Date.now(),
        });
        if (err !== undefined) {
            this.#options.onFailure?.(id, err);
        }
    }
    /** Build the cluster-console ACP backend over this live pool. */
    createUiBackend(healthProvider) {
        return createPeerUiBackend({
            registry: this.registry,
            connected: this.connected,
            failed: this.failed,
            ...(healthProvider !== undefined ? { healthProvider } : {}),
            ...(this.#options.onEvent !== undefined
                ? { onEvent: this.#options.onEvent }
                : {}),
        });
    }
    clusterStatus(health) {
        return clusterStatusFromConnect(this, health);
    }
    closeAll() {
        for (const id of [...this.connected]) {
            const close = this.#closers.get(id);
            if (close !== undefined)
                close();
            this.#closers.delete(id);
            this.#options.onEvent?.({
                type: "peer.disconnected",
                peerId: id,
                at: Date.now(),
            });
        }
        this.connected.length = 0;
    }
}
//# sourceMappingURL=managed-cluster.js.map