/**
 * Phase 67-0 — Phase 64 reclaim / cancel / stranded-Assigner scan
 * extracted from allowlisted node-service-impl.ts.
 */

import { createUnsignedEnvelope } from "@envoymesh/protocol";
import {
  signUnsignedEnvelope,
  signCanonicalPayload,
} from "@envoymesh/identity";
import {
  markOwnershipStranded,
  resolveCancelDelegated,
  resolveReclaimAssigner,
  shouldMarkAssignerStranded,
  type ChainRemoteOwnership,
} from "./chain-remote-reclaim.js";
import {
  buildReclaimMandate,
  hydrateReclaimedChainState,
} from "./chain-reclaim-hydrate.js";
import {
  beginChainRecovery,
  createOrchestratorEpoch,
  isChainRecovering,
} from "./chain-reconcile-recovery.js";
import { _runChainGoal } from "./node-service-chain-orchestration.js";

/** Host is NodeServiceImpl; typed as any to access private fields (same as fleet-ops). */
export type ChainOwnershipHost = any;

export async function scanDelegatedAssignersViaRuntime(
  host: ChainOwnershipHost,
): Promise<void> {
  const side = host._chainOrchestrationContext().getChainSideState();
  const mesh = host._mesh ?? host._reachableMesh();
  const connected = new Set(mesh?.getConnectedPeerIds?.() ?? []);
  const candidates = [
    ...side.remoteOwnership.values(),
    ...host._delegatedChainStore.listActive(),
  ];
  const seen = new Set<string>();
  for (const ownership of candidates) {
    if (seen.has(ownership.chainId)) continue;
    seen.add(ownership.chainId);
    if (ownership.status === "assigner_stranded") continue;
    const decision = shouldMarkAssignerStranded({
      ownership,
      assignerReachable: connected.has(ownership.assignerPeerId),
    });
    if (!decision.stranded) continue;
    const stranded = markOwnershipStranded(ownership);
    side.remoteOwnership.set(ownership.chainId, stranded);
    await host._delegatedChainStore.upsert(stranded);
    await host._appendChainAudit({
      type: "chain.handoff.request_received",
      outcome: "record",
      intent: "task.chain.ownership",
      remotePeerId: stranded.assignerPeerId,
      correlationId: stranded.chainId,
      summary: `chain.assigner_lost reason=${decision.reason ?? "unknown"}`,
    });
    host._emitChainState(stranded.chainId);
  }
}

export async function bestEffortCancelRemoteAssignerViaRuntime(
  host: ChainOwnershipHost,
  ownership: ChainRemoteOwnership,
): Promise<void> {
  const agentIdentity = await host._ensureAgentIdentity();
  const mesh = host._mesh;
  if (!agentIdentity || !mesh) return;
  try {
    const { TaskChainCancelPayloadSchema } = await import("@envoymesh/protocol");
    const payload = TaskChainCancelPayloadSchema.parse({
      chainId: ownership.chainId,
      reason: "creator_reclaim_or_cancel",
      cancelledBy: "owner",
      notifyWorkerPeerIds: [],
      createdAt: new Date().toISOString(),
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: agentIdentity.agentPeerId,
      senderPublicKey: agentIdentity.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId: ownership.assignerPeerId,
      recipientRole: "agent",
      intent: "task.chain.cancel",
      payload,
      correlationId: ownership.chainId,
    });
    const envelope = signUnsignedEnvelope(unsigned, agentIdentity.agentPrivateKeyPem);
    const { sendEnvelopeWithRetry } = await import("./chat-outbound-deliver.js");
    await sendEnvelopeWithRetry({
      mesh: mesh as import("./chat-outbound-deliver.js").OutboundDeliverMesh,
      transportPeerId: ownership.assignerPeerId,
      envelope,
      dialHints: [],
    });
  } catch {
    /* best-effort */
  }
}

export async function chainReclaimAssignerViaRuntime(
  host: ChainOwnershipHost,
  params: import("@envoymesh/api").ChainReclaimAssignerParams,
): Promise<import("@envoymesh/api").ChainReclaimAssignerResult> {
  await scanDelegatedAssignersViaRuntime(host);
  const side = host._chainOrchestrationContext().getChainSideState();
  const ownership =
    side.remoteOwnership.get(params.chainId) ??
    host._delegatedChainStore.get(params.chainId);
  const resolved = resolveReclaimAssigner({ chainId: params.chainId, ownership });
  if (!resolved.ok) {
    return { ok: false, chainId: resolved.chainId, reason: resolved.reason };
  }

  const profile = host.getProfile();
  const ownerKey = profile?.owner?.privateKeyPem;
  const unsignedMandate = buildReclaimMandate({
    chainId: params.chainId,
    issuerOwnerId: resolved.ownership.creatorOwnerId,
    maxChainCostUsd: ownership?.maxChainCostUsd,
    costCeilingUsd: ownership?.costCeilingUsd,
    awardMode: ownership?.statusMirror?.awardMode,
  });
  const mandate = {
    ...unsignedMandate,
    signature: ownerKey
      ? signCanonicalPayload(unsignedMandate, ownerKey)
      : "stub",
  };

  const hydrated = hydrateReclaimedChainState({
    ownership: {
      ...resolved.ownership,
      ...(ownership?.statusMirror ? { statusMirror: ownership.statusMirror } : {}),
      ...(ownership?.goal ? { goal: ownership.goal } : {}),
      ...(typeof ownership?.maxChainCostUsd === "number"
        ? { maxChainCostUsd: ownership.maxChainCostUsd }
        : {}),
      ...(typeof ownership?.costCeilingUsd === "number"
        ? { costCeilingUsd: ownership.costCeilingUsd }
        : {}),
    },
    mandate: mandate as import("@envoymesh/protocol").ChainMandate,
  });
  if (!hydrated.ok) {
    return { ok: false, chainId: params.chainId, reason: hydrated.reason };
  }

  void bestEffortCancelRemoteAssignerViaRuntime(host, resolved.ownership).catch(
    () => undefined,
  );

  if (hydrated.mode === "fallback_restart") {
    side.remoteOwnership.set(params.chainId, hydrated.ownership);
    await host._delegatedChainStore.upsert(hydrated.ownership);
    await host._appendChainAudit({
      type: "chain.handoff.request_received",
      outcome: "allow",
      intent: "task.chain.ownership",
      remotePeerId: resolved.ownership.assignerPeerId,
      correlationId: params.chainId,
      summary: `chain.reclaimed mode=restart reason=${hydrated.reason}`,
    });
    const restarted = await _runChainGoal(host._chainOrchestrationContext(), {
      goal: hydrated.goal,
    });
    host._emitChainState(params.chainId);
    if (!restarted.ok) {
      return {
        ok: false,
        chainId: params.chainId,
        reason: restarted.error ?? "reclaim_restart_failed",
        mode: "restart",
      };
    }
    return {
      ok: true,
      chainId: params.chainId,
      mode: "restart",
      newChainId: restarted.chainId,
    };
  }

  side.remoteOwnership.set(params.chainId, hydrated.ownership);
  await host._delegatedChainStore.upsert(hydrated.ownership);
  host._chainStore.setOwnership(params.chainId, { ...hydrated.ownership });
  host._chainStore.setRuntime(params.chainId, {
    state: hydrated.state,
    bidStrategy: {
      baseCostUsd: 1,
      capabilityLocalEtaMs: 60_000,
      reputationDiscount: 1,
      etaSlackMs: 60_000,
    },
  });
  side.goals.set(params.chainId, hydrated.state.goal ?? resolved.goal);
  side.awardModes.set(
    params.chainId,
    hydrated.state.awardMode === "competitive" ? "competitive" : "direct",
  );
  side.reclaimSeedChains.add(params.chainId);
  side.orchestratorEpoch = createOrchestratorEpoch();
  const recovery = beginChainRecovery({
    state: hydrated.state,
    orchestratorEpoch: side.orchestratorEpoch,
  });
  side.recovery.set(params.chainId, recovery);
  hydrated.state.journalEvent?.("recovery.started", {
    orchestratorEpoch: recovery.orchestratorEpoch,
    peerCount: Object.keys(recovery.peers).length,
    graceDeadlineAt: recovery.graceDeadlineAt,
    reclaim: true,
  });
  await host._appendChainAudit({
    type: "chain.handoff.request_received",
    outcome: "allow",
    intent: "task.chain.ownership",
    remotePeerId: resolved.ownership.assignerPeerId,
    correlationId: params.chainId,
    summary: `chain.reclaimed mode=resume workers=${hydrated.workerPeerIds.length}`,
  });
  host._startChainTracking(params.chainId);
  host._emitChainState(params.chainId);
  if (isChainRecovering(recovery)) {
    void host._runChainReconcile(params.chainId).catch((err: unknown) => {
      console.warn(`[team-jobs] reclaim reconcile failed for ${params.chainId}:`, err);
    });
  }
  return {
    ok: true,
    chainId: params.chainId,
    mode: "resume",
  };
}

export async function chainCancelDelegatedViaRuntime(
  host: ChainOwnershipHost,
  params: import("@envoymesh/api").ChainCancelDelegatedParams,
): Promise<import("@envoymesh/api").ChainCancelDelegatedResult> {
  const side = host._chainOrchestrationContext().getChainSideState();
  const ownership =
    side.remoteOwnership.get(params.chainId) ??
    host._delegatedChainStore.get(params.chainId);
  const resolved = resolveCancelDelegated({ chainId: params.chainId, ownership });
  if (!resolved.ok) {
    return { ok: false, chainId: resolved.chainId, reason: resolved.reason };
  }
  side.remoteOwnership.set(params.chainId, resolved.ownership);
  await host._delegatedChainStore.upsert(resolved.ownership);
  await host._appendChainAudit({
    type: "chain.handoff.request_received",
    outcome: "allow",
    intent: "task.chain.ownership",
    remotePeerId: resolved.ownership.assignerPeerId,
    correlationId: params.chainId,
    summary: `chain.stranded_cancelled reason=${params.reason ?? "owner"}`,
  });
  void bestEffortCancelRemoteAssignerViaRuntime(host, resolved.ownership).catch(
    () => undefined,
  );
  host._emitChainState(params.chainId);
  return { ok: true, chainId: params.chainId };
}
