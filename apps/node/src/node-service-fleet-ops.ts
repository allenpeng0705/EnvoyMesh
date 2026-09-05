/**
 * Phase 67-0 — fleet Join+lease ensure context builder (thin NodeService wrapper).
 */

import {
  ensureFleetWorkersReadyViaRuntime,
  type EnsureFleetWorkersDeps,
  type EnsureFleetWorkersParams,
  type EnsureFleetWorkersResult,
} from "./ensure-fleet-workers.js";

/** Host is NodeServiceImpl; typed as any to access private fields (same as wan deps). */
export type FleetOpsHost = any;

export function buildFleetOpsDeps(host: FleetOpsHost): EnsureFleetWorkersDeps {
  const identityCtx = host._identityContext();
  return {
    getOwnOwnerId: () => host._profile?.owner?.ownerId,
    getNodeConfig: () => host.getNodeConfig(),
    enableJoin: async () => {
      await host.updateNodeConfig({ capabilityProviderEnabled: true });
    },
    ensureLeaseBroadcaster: async () => {
      const mesh = host._reachableMesh();
      if (!mesh) return undefined;
      return host.ensureWorkerLeaseBroadcasterStarted(mesh);
    },
    refreshAgentNetworkWorkers: () => host.refreshAgentNetworkWorkers(),
    getBonds: () => host.getBonds(),
    ensureAgentIdentity: () => host._ensureAgentIdentity(),
    resolveLibp2pPeer: async (ownerId) => {
      const resolved = await identityCtx.resolveLibp2pPeerForBondOwner(ownerId);
      if (!resolved) return undefined;
      return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
    },
    dialHintsFor: (peerId, listenAddrs) => identityCtx.dialHintsForChat(peerId, listenAddrs),
    sendEnvelope: async ({ transportPeerId, envelope, dialHints }) => {
      const { sendEnvelopeWithRetry } = await import("./chat-outbound-deliver.js");
      const mesh = host._reachableMesh();
      if (!mesh) throw new Error("mesh not started");
      await sendEnvelopeWithRetry({
        mesh: mesh as import("./chat-outbound-deliver.js").OutboundDeliverMesh,
        transportPeerId,
        envelope,
        dialHints,
      });
    },
  };
}

export async function ensureFleetWorkersJoinAndLeaseViaRuntime(
  host: FleetOpsHost,
  params?: EnsureFleetWorkersParams,
): Promise<EnsureFleetWorkersResult> {
  return ensureFleetWorkersReadyViaRuntime(buildFleetOpsDeps(host), params);
}
