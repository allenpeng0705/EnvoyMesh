/**
 * Phase 62C — gather Assigner candidates from live mesh state and resolve selection.
 */

import type {
  AssignerCapabilityInput,
  AssignerCapabilityScore,
  AssignerSelectionMode,
  CachedAgentCardSummary,
  ChainDefaultsConfig,
  ModelProviderConfig,
} from "@envoymesh/api";
import {
  formatAssignerSelectionReason,
  isAgentNetworkMember,
  resolveAssignerSelectionMode,
  scoreAssignerCapability,
  selectBestCapableAssigner,
} from "@envoymesh/api";

import {
  buildSameLanByPeerId,
  findAgentNetworkWorkers,
  listAgentCardsIncludingLocal,
  type ChainOrchestrationContext,
} from "./node-service-chain-orchestration.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

function listenAddrsIncludeLoopback(addrs: readonly string[] | undefined): boolean {
  if (!addrs?.length) return false;
  return addrs.some(
    (a) =>
      a.includes("/ip4/127.0.0.1/") ||
      a.includes("/ip6/::1/") ||
      a.includes("/ip6/0:0:0:0:0:0:0:1/"),
  );
}
function localEngineReady(deps: ChainOrchestrationContext): boolean {
  const engine = deps.getAgentNetworkWorkerEngine();
  if (engine === "ext") return deps.isExtAgentBridgeReady();
  if (engine === "envoy-harness") return deps.isEnvoyHarnessReady();
  return deps.isOpenClawReady() !== false;
}

function remoteOnline(
  deps: ChainOrchestrationContext,
  peerId: string,
  transportId: string | undefined,
): { online: boolean; availabilitySource: AssignerCapabilityInput["availabilitySource"] } {
  const leaseAvail = deps.getChainSideState().workerLeases.getAvailability(peerId);
  if (leaseAvail.state === "ready" && leaseAvail.source === "lease") {
    return { online: true, availabilitySource: "lease" };
  }
  if (
    leaseAvail.state === "expired" ||
    leaseAvail.state === "revoked" ||
    leaseAvail.state === "busy" ||
    leaseAvail.state === "engine_down"
  ) {
    return { online: false, availabilitySource: "unknown" };
  }
  const cachedReady = deps.getChainSideState().readyProbeCache.get(peerId);
  if (cachedReady) {
    return {
      online: Boolean(transportId) && cachedReady.ready,
      availabilitySource: "legacy_probe",
    };
  }
  return { online: Boolean(transportId), availabilitySource: "unknown" };
}

/**
 * Remote Assigner engine readiness (honest proxy — we cannot read peer OpenClaw).
 * Lease ready ⇒ engine is up. Otherwise Join'd workers with execute/orchestrate
 * are candidates; `chain.orchestrate` still boosts the score.
 */
function remoteEngineReady(input: {
  availabilitySource: AssignerCapabilityInput["availabilitySource"];
  membership: readonly string[];
}): boolean {
  if (input.availabilitySource === "lease") return true;
  return (
    input.membership.includes("chain.orchestrate") ||
    input.membership.includes("task.execute") ||
    input.membership.length > 0
  );
}

async function buildTransportByAgentPeer(
  deps: ChainOrchestrationContext,
  peerIds: readonly string[],
  cardsByPeer: Map<string, CachedAgentCardSummary | undefined>,
): Promise<Map<string, string>> {
  const transportByAgentPeer = new Map<string, string>();
  const mesh = deps.getReachableMesh();
  const connStats = mesh?.getConnectionStats();
  const connectedIds = new Set(connStats?.connectedPeerIds ?? mesh?.getConnectedPeerIds() ?? []);
  try {
    const store = deps.getPeerDirectoryStore?.();
    if (!store) return transportByAgentPeer;
    const allRecords = await store.listPeerRecords();
    const connectedLibp2pByOwner = new Map<string, string>();
    for (const rec of allRecords) {
      if (isLibp2pPeerId(rec.peerId) && connectedIds.has(rec.peerId)) {
        connectedLibp2pByOwner.set(rec.ownerId, rec.peerId);
      }
    }
    for (const peerId of peerIds) {
      const ownerId = cardsByPeer.get(peerId)?.ownerId;
      const transport = ownerId ? connectedLibp2pByOwner.get(ownerId) : undefined;
      if (transport) transportByAgentPeer.set(peerId, transport);
    }
  } catch {
    /* ignore */
  }
  return transportByAgentPeer;
}

export async function gatherAssignerCapabilityScores(
  deps: ChainOrchestrationContext,
): Promise<AssignerCapabilityScore[]> {
  const ready = deps.getAgentNetworkMembershipIndexReady();
  if (ready) await ready;

  const agent = await deps.ensureAgentIdentity();
  const localPeerId = agent?.agentPeerId;
  if (!localPeerId) return [];

  const eligible = new Set(await findAgentNetworkWorkers(deps, "task.execute"));
  eligible.add(localPeerId);

  const cards = await listAgentCardsIncludingLocal(deps);
  const byPeer = new Map<string, CachedAgentCardSummary>();
  for (const card of cards) {
    if (card.sourceAgentPeerId) byPeer.set(card.sourceAgentPeerId, card);
  }

  const peerList = [...eligible];
  const sameLanByPeer = await buildSameLanByPeerId(deps, peerList, byPeer);
  const transportByAgentPeer = await buildTransportByAgentPeer(deps, peerList, byPeer);

  let modelProviders: ModelProviderConfig | null = null;
  try {
    const cfg = (await deps.getNodeConfig()) as { modelProviders?: ModelProviderConfig } | null;
    modelProviders = cfg?.modelProviders ?? null;
  } catch {
    modelProviders = null;
  }

  const scores: AssignerCapabilityScore[] = [];
  for (const peerId of peerList) {
    const card = byPeer.get(peerId);
    if (card && !isAgentNetworkMember(card.membership) && peerId !== localPeerId) continue;
    const isLocal = peerId === localPeerId;
    let sameLan = sameLanByPeer.get(peerId) === true || isLocal;
    // In-process E2E (and rare loopback fleets): RFC1918 same-LAN is false for
    // 127.0.0.1, but peers are still dialable — treat loopback listen as local.
    if (!sameLan && !isLocal) {
      try {
        const ownerId = card?.ownerId;
        const store = deps.getPeerDirectoryStore?.();
        if (ownerId && store) {
          const peer = await store.getPeerByOwnerId(ownerId);
          if (listenAddrsIncludeLoopback(peer?.listenAddrs)) sameLan = true;
        }
      } catch {
        /* ignore */
      }
    }
    const transportId = transportByAgentPeer.get(peerId);
    const reach = isLocal
      ? { online: localEngineReady(deps), availabilitySource: "local" as const }
      : remoteOnline(deps, peerId, transportId);
    const membership =
      card?.membership ?? (isLocal ? ["task.execute", "chain.orchestrate"] : []);
    const engineReady = isLocal
      ? localEngineReady(deps)
      : remoteEngineReady({
          availabilitySource: reach.availabilitySource,
          membership,
        });

    scores.push(
      scoreAssignerCapability({
        peerId,
        isLocal,
        sameLan,
        online: reach.online || sameLan,
        engineReady,
        availabilitySource: reach.availabilitySource,
        membership,
        profile: card?.agentNetworkProfile,
        modelProviders: isLocal ? modelProviders : undefined,
        displayName: card?.displayName,
      }),
    );
  }
  return scores;
}

export async function resolveAssignerForChainGoal(
  deps: ChainOrchestrationContext,
  input: {
    explicitAssignerPeerId?: string;
    assignerSelection?: AssignerSelectionMode;
    nodeDefaults?: ChainDefaultsConfig;
  },
): Promise<{
  mode: AssignerSelectionMode;
  assignerPeerId?: string;
  handoff: boolean;
  auditSummary?: string;
  suggestedReason?: string;
  selected?: AssignerCapabilityScore;
  localPeerId?: string;
  creatorPeerId?: string;
}> {
  const agent = await deps.ensureAgentIdentity();
  const localPeerId = agent?.agentPeerId;
  const explicit = input.explicitAssignerPeerId?.trim();
  if (explicit) {
    return {
      mode: resolveAssignerSelectionMode(input.assignerSelection, input.nodeDefaults),
      assignerPeerId: explicit,
      handoff: Boolean(localPeerId && explicit !== localPeerId),
      localPeerId,
      creatorPeerId: localPeerId,
    };
  }

  const mode = resolveAssignerSelectionMode(input.assignerSelection, input.nodeDefaults);
  if (mode === "local" || !localPeerId) {
    return { mode, handoff: false, localPeerId, creatorPeerId: localPeerId };
  }

  const candidates = await gatherAssignerCapabilityScores(deps);
  const picked = selectBestCapableAssigner({ candidates, localPeerId });
  if (!picked) {
    return { mode, handoff: false, localPeerId, creatorPeerId: localPeerId };
  }

  const suggestedReason = formatAssignerSelectionReason(mode, picked.selected, picked.handoff);
  if (!picked.handoff) {
    return {
      mode,
      handoff: false,
      localPeerId,
      creatorPeerId: localPeerId,
      selected: picked.selected,
      suggestedReason,
      auditSummary: `mode=${mode} selected=${localPeerId} localScore=${picked.localScore.toFixed(2)} top=${picked.selected.peerId} reason=local_wins`,
    };
  }

  return {
    mode,
    assignerPeerId: picked.selected.peerId,
    handoff: true,
    localPeerId,
    creatorPeerId: localPeerId,
    selected: picked.selected,
    suggestedReason,
    auditSummary: `mode=${mode} selected=${picked.selected.peerId} creator=${localPeerId} score=${picked.selected.score.toFixed(2)} reasons=${picked.selected.reasonCodes.join(",")}`,
  };
}

export async function previewSuggestedAssigner(
  deps: ChainOrchestrationContext,
  input: {
    assignerSelection?: AssignerSelectionMode;
    nodeDefaults?: ChainDefaultsConfig;
  },
): Promise<{ peerId?: string; reason?: string; mode: AssignerSelectionMode }> {
  const resolved = await resolveAssignerForChainGoal(deps, {
    assignerSelection: input.assignerSelection,
    nodeDefaults: input.nodeDefaults,
  });
  if (resolved.handoff && resolved.assignerPeerId) {
    return {
      mode: resolved.mode,
      peerId: resolved.assignerPeerId,
      reason: resolved.suggestedReason,
    };
  }
  if (resolved.mode === "best_capable" && resolved.suggestedReason) {
    return { mode: resolved.mode, reason: resolved.suggestedReason };
  }
  return { mode: resolved.mode };
}
