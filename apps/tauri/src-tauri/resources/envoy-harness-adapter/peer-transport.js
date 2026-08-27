/**
 * D6 — the peer-backed `RemoteSubmitterTransport`: a mesh node's
 * `RemoteMeshSubmitter` can target a standalone envoy-harness peer
 * cluster (MAP-over-JSON-RPC) through the SAME transport seam the v2.2
 * libp2p fabric will use.
 *
 * This is Pattern A from `distributed-collaboration.md` — the mesh
 * orchestrates, the peer cluster executes; the peers never need to be
 * mesh nodes.
 *
 * **Crypto (v1):** the peer protocol uses a shared-token transport; the
 * worker's `SubagentResult.signature` rides through from the peer
 * adapter's `SignedAgentResult`. Envelope signing/verification (Ed25519)
 * is v2 — the same seam, a stronger transport.
 */
import { PeerMeshSubmitter, } from "@envoymesh/envoy-harness-peer";
export function createPeerRemoteSubmitterTransport(registry) {
    return {
        async send(input, targetPeerId, signal) {
            const entry = registry.get(targetPeerId) ?? registry.route(input);
            if (entry === undefined) {
                throw new Error(`peer transport: no peer for target "${targetPeerId}"`);
            }
            const submitter = new PeerMeshSubmitter({
                client: entry.client,
                workerPeerId: targetPeerId,
            });
            return submitter.submit(input, signal);
        },
    };
}
//# sourceMappingURL=peer-transport.js.map