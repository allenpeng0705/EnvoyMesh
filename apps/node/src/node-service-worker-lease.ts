/**
 * Phase 67-0 — worker lease broadcaster lifecycle extracted from node-service-impl.
 */

import type { EnvoyMesh } from "@envoymesh/network";
import type { NodeConfig, NodeProfile } from "@envoymesh/api";
import type { AgentRuntime } from "@envoymesh/protocol";
import { localAgentNetworkEngineReady } from "./chain-ready-probe.js";
import {
  buildLocalLeaseRuntime,
  startWorkerLeaseBroadcaster,
  type WorkerLeaseBroadcastMesh,
} from "./agent-worker-lease-broadcast.js";
import type { AgentNetworkWorkerEngine } from "./agent-network-worker-engine.js";

export type WorkerLeaseBroadcasterHandle = {
  stop: () => void;
  publishNow: () => Promise<void>;
};

export type WorkerLeaseLifecycleDeps = {
  getNodeConfig(): Promise<NodeConfig>;
  reachableMesh(): EnvoyMesh | undefined;
  getProfile(): NodeProfile | null | undefined;
  ensureAgentIdentity(): Promise<{
    agentPeerId: string;
    agentPublicKeyPem: string;
    agentPrivateKeyPem: string;
    agentCredential?: unknown;
  } | null>;
  getLeaseBroadcaster(): WorkerLeaseBroadcasterHandle | undefined;
  setLeaseBroadcaster(handle: WorkerLeaseBroadcasterHandle | undefined): void;
  localManifestDescriptor(): Promise<{
    skills: Array<{ skillId: string }>;
    runtime: AgentRuntime;
  }>;
  getAgentNetworkWorkerEngine(): AgentNetworkWorkerEngine;
  isOpenClawReady(): boolean;
  isExtAgentBridgeReady(): boolean;
  isEnvoyHarnessReady(): boolean;
  probeExtAgent(): Promise<{ reachable?: boolean }>;
  getBonds(): Promise<Array<{ peerOwnerId?: string }>>;
  resolveLibp2pPeerForBondOwner(
    ownerId: string,
  ): Promise<{ transportPeerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsForChat(peerId: string, listenAddrs?: string[]): Promise<string[]> | string[];
};

export async function ensureWorkerLeaseBroadcasterStartedViaRuntime(
  deps: WorkerLeaseLifecycleDeps,
  mesh?: EnvoyMesh,
): Promise<WorkerLeaseBroadcasterHandle | undefined> {
  const live = mesh ?? deps.reachableMesh();
  if (!live) return undefined;
  try {
    const cfg = await deps.getNodeConfig();
    if (cfg.capabilityProviderEnabled !== true) return undefined;
  } catch {
    return undefined;
  }
  return startWorkerLeaseBroadcasterViaRuntime(deps, live);
}

export async function startWorkerLeaseBroadcasterViaRuntime(
  deps: WorkerLeaseLifecycleDeps,
  mesh: EnvoyMesh,
  opts?: { intervalMs?: number; ttlMs?: number },
): Promise<WorkerLeaseBroadcasterHandle | undefined> {
  const profile = deps.getProfile();
  const agentIdentity = await deps.ensureAgentIdentity();
  if (!profile || !agentIdentity) {
    console.warn("[agent.worker.lease] broadcaster skipped: agent identity/profile unavailable");
    return undefined;
  }
  deps.getLeaseBroadcaster()?.stop();
  const broadcaster = startWorkerLeaseBroadcaster({
    mesh: mesh as WorkerLeaseBroadcastMesh,
    agentPublicKeyPem: agentIdentity.agentPublicKeyPem,
    agentPrivateKeyPem: agentIdentity.agentPrivateKeyPem,
    agentCredential: agentIdentity.agentCredential as never,
    workerPeerId: agentIdentity.agentPeerId,
    ownerId: profile.owner.ownerId,
    buildRuntimes: async () => {
      const { skills, runtime } = await deps.localManifestDescriptor();
      const localReady = await localAgentNetworkEngineReady({
        engine: deps.getAgentNetworkWorkerEngine(),
        isOpenClawReady: () => deps.isOpenClawReady(),
        isExtAgentBridgeReady: () => deps.isExtAgentBridgeReady(),
        isEnvoyHarnessReady: () => deps.isEnvoyHarnessReady(),
        probeExtAgent: async () => {
          const reach = await deps.probeExtAgent();
          return { reachable: reach.reachable === true };
        },
      });
      return [
        buildLocalLeaseRuntime({
          runtime,
          ready: localReady.ready,
          skillIds: skills.map((s) => s.skillId),
          runtimeVersion: "mesh-lease",
        }),
      ];
    },
    connectivity: async () => {
      const meshStats = mesh.getConnectionStats?.();
      return {
        direct: (meshStats?.connectedPeerIds?.length ?? 0) > 0,
        relay: (meshStats?.circuitPeerIds?.length ?? 0) > 0,
      };
    },
    bondOwnerIds: async () => {
      const bonds = await deps.getBonds();
      return bonds
        .map((b) => b.peerOwnerId)
        .filter((id): id is string => Boolean(id));
    },
    resolveLibp2pPeer: async (ownerId) => {
      const resolved = await deps.resolveLibp2pPeerForBondOwner(ownerId);
      if (!resolved) return undefined;
      return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
    },
    dialHintsFor: async (peerId, listenAddrs) =>
      Promise.resolve(deps.dialHintsForChat(peerId, listenAddrs)),
    intervalMs: opts?.intervalMs,
    ttlMs: opts?.ttlMs,
    onError: (err) =>
      console.warn(
        "[agent.worker.lease] broadcast cycle failed:",
        err instanceof Error ? err.message : err,
      ),
  });
  deps.setLeaseBroadcaster(broadcaster);
  return broadcaster;
}

export function buildWorkerLeaseLifecycleDeps(host: any): WorkerLeaseLifecycleDeps {
  return {
    getNodeConfig: () => host.getNodeConfig(),
    reachableMesh: () => host._reachableMesh(),
    getProfile: () => host.getProfile(),
    ensureAgentIdentity: () => host._ensureAgentIdentity(),
    getLeaseBroadcaster: () => host._leaseBroadcaster,
    setLeaseBroadcaster: (handle) => {
      host._leaseBroadcaster = handle;
    },
    localManifestDescriptor: () => host._localManifestDescriptor(),
    getAgentNetworkWorkerEngine: () => host.getAgentNetworkWorkerEngine(),
    isOpenClawReady: () => host.isOpenClawReady(),
    isExtAgentBridgeReady: () => host.isExtAgentBridgeReady(),
    isEnvoyHarnessReady: () => host.isEnvoyHarnessReady(),
    probeExtAgent: () => host.probeExtAgent(),
    getBonds: () => host.getBonds(),
    resolveLibp2pPeerForBondOwner: (ownerId) =>
      host._identityContext().resolveLibp2pPeerForBondOwner(ownerId),
    dialHintsForChat: (peerId, listenAddrs) =>
      host._identityContext().dialHintsForChat(peerId, listenAddrs),
  };
}
