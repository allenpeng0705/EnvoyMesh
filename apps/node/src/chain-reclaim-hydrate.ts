/**
 * Phase 64B — mid-flight reclaim hydrate (same chainId).
 *
 * Builds a minimal Assigner runtime on the creator from a status mirror +
 * ownership record, then recovery/reconcile pulls worker attempt receipts.
 */
import { randomUUID } from "node:crypto";

import type { ChainMandate, ChainSubtask } from "@envoymesh/protocol";

import type { ChainState } from "./chain-orchestrator.js";
import { createChainState } from "./chain-orchestrator.js";
import type { ChainRemoteOwnership, DelegatedStatusMirror } from "./chain-remote-reclaim.js";
import { createOwnershipEpoch } from "./chain-remote-reclaim.js";

export type ReclaimHydrateResult =
  | {
      ok: true;
      mode: "resume";
      state: ChainState;
      workerPeerIds: string[];
      ownership: ChainRemoteOwnership;
    }
  | {
      ok: true;
      mode: "fallback_restart";
      reason: string;
      ownership: ChainRemoteOwnership;
      goal: string;
    }
  | { ok: false; reason: string };

function mapStepStateToAttempt(
  stepState: DelegatedStatusMirror["steps"][number]["state"],
): "awarded" | "running" | "final_received" | "cancelled" | undefined {
  switch (stepState) {
    case "awarded":
      return "awarded";
    case "running":
      return "running";
    case "done":
      return "final_received";
    case "cancelled":
    case "failed":
      return "cancelled";
    default:
      return undefined;
  }
}

/**
 * Hydrate a reclaim runtime for the same chainId when a status mirror has
 * awarded workers. Otherwise signal fallback_restart (goal restart).
 */
export function hydrateReclaimedChainState(input: {
  ownership: ChainRemoteOwnership;
  mandate: ChainMandate;
  now?: Date;
}): ReclaimHydrateResult {
  const goal = input.ownership.goal?.trim();
  if (!goal) {
    return { ok: false, reason: "missing_goal" };
  }
  const mirror = input.ownership.statusMirror;
  const awardedSteps =
    mirror?.steps.filter(
      (s) =>
        Boolean(s.workerPeerId) &&
        (s.state === "awarded" ||
          s.state === "running" ||
          s.state === "done" ||
          s.state === "failed" ||
          s.state === "cancelled"),
    ) ?? [];

  if (!mirror || awardedSteps.length === 0) {
    return {
      ok: true,
      mode: "fallback_restart",
      reason: "insufficient_status_mirror",
      ownership: {
        ...input.ownership,
        status: "reclaimed",
        ownershipEpoch: createOwnershipEpoch(input.now),
        lastAssignerHeartbeatAt: (input.now ?? new Date()).toISOString(),
      },
      goal,
    };
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const awardMode = mirror.awardMode === "competitive" ? "competitive" : "direct";
  const state = createChainState(input.mandate, {
    awardMode,
    goal,
  });

  const workerPeerIds = new Set<string>();
  for (const step of mirror.steps) {
    const subtask: ChainSubtask = {
      version: "0.1",
      subtaskId: step.subtaskId,
      chainId: input.ownership.chainId,
      chainMandateId: input.mandate.chainMandateId,
      depth: 1,
      requiredSkill: "general",
      objective: step.objective?.trim() || goal,
      requestedResult: "text summary",
      constraints: [],
      dependsOn: [],
      costCeilingUsd: input.mandate.costCeilingUsd,
      createdAt: nowIso,
    };
    state.subtasks.set(step.subtaskId, subtask);

    if (!step.workerPeerId) continue;
    workerPeerIds.add(step.workerPeerId);
    const attemptState = mapStepStateToAttempt(step.state);
    if (!attemptState) continue;

    const createdAt = nowIso;
    const attemptId = `attempt_reclaim_${step.subtaskId}`;
    const award = {
      version: "0.1" as const,
      subtaskId: step.subtaskId,
      chainId: input.ownership.chainId,
      workerPeerId: step.workerPeerId,
      negotiationRound: 1,
      acceptedCostUsd: 0,
      deadlineAt: input.mandate.deadlineAt,
      createdAt,
      attemptId,
    };
    state.awards.set(step.subtaskId, award);
    state.awardedAt.set(step.subtaskId, createdAt);
    state.workersBySubtask.set(step.subtaskId, [step.workerPeerId]);
    state.proposedSubtasks.add(step.subtaskId);

    const attempt = {
      attemptId,
      chainId: input.ownership.chainId,
      subtaskId: step.subtaskId,
      workerPeerId: step.workerPeerId,
      role: "primary" as const,
      state: attemptState,
      attemptNumber: 1,
      acceptedCostUsd: 0,
      createdAt,
      updatedAt: createdAt,
      lastReason: "reclaim_hydrate",
    };
    state.attempts.set(attempt.attemptId, attempt);
    state.selectedAttemptBySubtask.set(step.subtaskId, attempt.attemptId);
  }

  const ownership: ChainRemoteOwnership = {
    ...input.ownership,
    status: "reclaimed",
    // Creator becomes the live Assigner; keep creatorPeerId as original owner identity.
    assignerPeerId: input.ownership.creatorPeerId,
    assignerOwnerId: input.ownership.creatorOwnerId,
    ownershipEpoch: createOwnershipEpoch(now),
    lastAssignerHeartbeatAt: nowIso,
  };

  return {
    ok: true,
    mode: "resume",
    state,
    workerPeerIds: [...workerPeerIds],
    ownership,
  };
}

export function buildReclaimMandate(input: {
  chainId: string;
  issuerOwnerId: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  awardMode?: "direct" | "competitive";
  now?: Date;
}): Omit<ChainMandate, "signature"> & { signature?: string } {
  const now = input.now ?? new Date();
  const awardMode = input.awardMode ?? "direct";
  return {
    version: "0.1",
    chainMandateId: `chainmandate_reclaim_${randomUUID()}`,
    chainId: input.chainId,
    issuerOwnerId: input.issuerOwnerId,
    orchestratorOwnerId: input.issuerOwnerId,
    maxChainCostUsd: input.maxChainCostUsd ?? 10,
    costCeilingUsd: input.costCeilingUsd ?? 3,
    maxWorkers: awardMode === "direct" ? 1 : 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
    rebalancePolicy: awardMode === "direct" ? "never" : "manual",
    maxAutoRebalances: 2,
    autoRebalanceIncrementUsd: 5,
  };
}
