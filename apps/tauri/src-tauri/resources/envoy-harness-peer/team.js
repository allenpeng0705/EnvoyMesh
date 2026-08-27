/**
 * D4 — `createPeerTeamExecutor`: the `TeamOptions.peerExecutor`
 * implementation that dispatches a team agent to a standalone
 * envoy-harness peer.
 *
 * The runner (Package 1) declares the seam; this package provides it —
 * so Package 1 never depends on the peer package.
 */
import { PeerMeshSubmitter } from "./submitter.js";
import { PeerRegistry } from "./registry.js";
export function createPeerTeamExecutor(registry, options = {}) {
    const costCeilingUsd = options.defaultCostCeilingUsd ?? 1;
    const deadlineMs = options.defaultDeadlineMs ?? 60_000;
    return async (spec, prompt) => {
        if (spec.host === undefined || spec.host === "local") {
            throw new Error(`createPeerTeamExecutor: ${spec.id} is not a peer host`);
        }
        if (!spec.host.startsWith("peer://")) {
            throw new Error(`createPeerTeamExecutor: unknown host "${spec.host}" for agent ${spec.id}`);
        }
        const peerId = spec.host.slice("peer://".length);
        const entry = registry.get(peerId);
        if (entry === undefined) {
            throw new Error(`createPeerTeamExecutor: unknown peer "${peerId}"`);
        }
        const signal = options.signal ?? new AbortController().signal;
        const submitter = new PeerMeshSubmitter({
            client: entry.client,
            workerPeerId: peerId,
        });
        const result = await submitter.submit({
            objective: prompt,
            capabilityTag: spec.role,
            costCeilingUsd,
            deadlineMs,
            preferredPeerId: peerId,
        }, signal);
        const text = result.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");
        return text;
    };
}
/** Convenience: a `PeerClient` + identity is a one-peer registry. */
export function createSinglePeerTeamExecutor(peerId, client, options) {
    const registry = new PeerRegistry();
    registry.register({ id: peerId, client });
    return createPeerTeamExecutor(registry, options);
}
//# sourceMappingURL=team.js.map