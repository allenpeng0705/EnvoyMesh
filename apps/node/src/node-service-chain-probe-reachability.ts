/**
 * Phase 67-0 — chainProbeReachability extracted from node-service-impl.
 *
 * Warm offline owners, then apply WAN online gate (Phase 66B).
 */

import type {
  ChainProbeReachabilityParams,
  ChainProbeReachabilityResult,
} from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import type { PeerDirectoryRecord } from "@envoymesh/local-store";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import { raceWithTimeout } from "./outbound-warm-dial.js";
import { sameLanFromListenAddrs } from "./node-service-chain-orchestration.js";
import { evaluateWanPeerOnlineGate } from "./wan-peer-online-gate.js";

export type ChainProbeReachabilityDeps = {
  listAgentCards(): Promise<Array<{ ownerId: string; sourceAgentPeerId?: string }>>;
  reachableMesh(): EnvoyMesh | undefined;
  listPeerRecords(): Promise<PeerDirectoryRecord[]>;
  warmContactConnection(ownerId: string): Promise<unknown>;
  loadPersistedConfig(): Promise<
    { discoveryProfile?: string; relayEnabled?: boolean } | undefined
  >;
};

export async function chainProbeReachabilityViaRuntime(
  deps: ChainProbeReachabilityDeps,
  params: ChainProbeReachabilityParams,
): Promise<ChainProbeReachabilityResult> {
  const ownerIds = params.ownerIds ?? [];
  if (ownerIds.length === 0) return { rows: [] };

  const cards = await deps.listAgentCards();
  const agentPeerIdByOwner = new Map<string, string | undefined>();
  for (const card of cards) {
    agentPeerIdByOwner.set(card.ownerId, card.sourceAgentPeerId);
  }

  const mesh = deps.reachableMesh();
  const readConnectedIds = (): Set<string> => {
    const stats = mesh?.getConnectionStats();
    return new Set(stats?.connectedPeerIds ?? mesh?.getConnectedPeerIds() ?? []);
  };
  const readCircuitIds = (): Set<string> => {
    const stats = mesh?.getConnectionStats();
    return new Set(stats?.circuitPeerIds ?? []);
  };
  let connectedIds = readConnectedIds();
  let circuitIds = readCircuitIds();

  const recordsByOwner = new Map<string, PeerDirectoryRecord[]>();
  try {
    const allRecords = await deps.listPeerRecords();
    for (const rec of allRecords) {
      const list = recordsByOwner.get(rec.ownerId);
      if (list) list.push(rec);
      else recordsByOwner.set(rec.ownerId, [rec]);
    }
  } catch {
    /* leave empty — every row reports offline + sameLan=false */
  }

  const isOwnerConnected = (ownerId: string): boolean => {
    const peerRecords = recordsByOwner.get(ownerId) ?? [];
    return peerRecords.some(
      (r) => isLibp2pPeerId(r.peerId) && connectedIds.has(r.peerId),
    );
  };

  if (mesh) {
    const offlineOwners = ownerIds.filter((id) => !isOwnerConnected(id)).slice(0, 8);
    if (offlineOwners.length > 0) {
      const warmOne = async (ownerId: string): Promise<void> => {
        try {
          await raceWithTimeout(
            deps.warmContactConnection(ownerId),
            14_000,
            `chainProbeWarm(${ownerId.slice(0, 16)}…)`,
          );
        } catch {
          /* best-effort — leave offline */
        }
      };
      const concurrency = 3;
      for (let i = 0; i < offlineOwners.length; i += concurrency) {
        await Promise.all(offlineOwners.slice(i, i + concurrency).map(warmOne));
      }
      connectedIds = readConnectedIds();
      circuitIds = readCircuitIds();
    }
  }

  let discoveryProfile: string | undefined;
  let relayEnabled: boolean | undefined;
  try {
    const persisted = await deps.loadPersistedConfig();
    discoveryProfile = persisted?.discoveryProfile;
    relayEnabled = persisted?.relayEnabled;
  } catch {
    /* WAN gate uses defaults */
  }
  const hasLiveRelayReservation = mesh?.hasLiveRelayReservation?.() === true;

  const rows = ownerIds.map((ownerId) => {
    const agentPeerId = agentPeerIdByOwner.get(ownerId);
    const peerRecords = recordsByOwner.get(ownerId) ?? [];
    const connectedRecord = peerRecords
      .filter((r) => isLibp2pPeerId(r.peerId) && connectedIds.has(r.peerId))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
    const meshConnected = Boolean(connectedRecord);
    const viaRelay = meshConnected ? circuitIds.has(connectedRecord!.peerId) : false;
    const listenAddrs =
      connectedRecord?.listenAddrs ?? peerRecords[0]?.listenAddrs ?? [];
    const sameLan = sameLanFromListenAddrs(listenAddrs);
    const gated = evaluateWanPeerOnlineGate({
      meshConnected,
      sameLan,
      viaRelay,
      discoveryProfile,
      relayEnabled,
      hasLiveRelayReservation,
      dialHints: listenAddrs,
    });
    return {
      ownerId,
      agentPeerId,
      online: gated.online,
      sameLan,
      viaRelay,
      wanPathReady: gated.wanPathReady,
      gateReason: gated.reason,
    };
  });
  return { rows };
}

export function buildChainProbeReachabilityDeps(host: any): ChainProbeReachabilityDeps {
  return {
    listAgentCards: () => host.listAgentCards(),
    reachableMesh: () => host._reachableMesh(),
    listPeerRecords: () => host._peerDirectoryStore.listPeerRecords(),
    warmContactConnection: (ownerId) => host.warmContactConnection(ownerId),
    loadPersistedConfig: () => host._configStore.load(),
  };
}
