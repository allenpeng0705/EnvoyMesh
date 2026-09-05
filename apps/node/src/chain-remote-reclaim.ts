/**
 * Phase 64A — remote Assigner ownership + reclaim scaffolding.
 *
 * Persists creator vs Assigner ownership for handed-off Team jobs so a
 * remote Assigner restart (or permanent loss) can be observed and later
 * reclaimed without silent orphans. Reclaim/cancel body lands in 64B;
 * this module owns types, disk store, epoch bumps, and state enrichment.
 */
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { ChainGetStateResult } from "@envoymesh/api";

export type ChainRemoteOwnershipStatus =
  | "delegated"
  | "assigner_active"
  | "assigner_recovering"
  | "assigner_stranded"
  | "reclaimed"
  | "cancelled";

/** Last Assigner status mirror (creator-side) for mid-flight reclaim. */
export interface DelegatedStatusMirror {
  phase:
    | "assigning"
    | "waitingWorkers"
    | "bidding"
    | "running"
    | "synthesizing"
    | "completed"
    | "cancelled";
  awardMode: "direct" | "competitive";
  subtaskCount: number;
  awardedCount: number;
  partialCount: number;
  steps: Array<{
    subtaskId: string;
    objective?: string;
    state: "pending" | "offered" | "awarded" | "running" | "done" | "failed" | "cancelled";
    workerPeerId?: string;
  }>;
  updatedAt: string;
}

export interface ChainRemoteOwnership {
  chainId: string;
  creatorPeerId: string;
  creatorOwnerId: string;
  assignerPeerId: string;
  assignerOwnerId: string;
  ownershipEpoch: string;
  handedOffAt: string;
  goal?: string;
  lastAssignerHeartbeatAt?: string;
  status: ChainRemoteOwnershipStatus;
  /** Optional handoff cost knobs for reclaim hydrate. */
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  /** Last known Assigner status steps (creator receives via status fan-out). */
  statusMirror?: DelegatedStatusMirror;
}

export type ChainRemoteOwnershipView = Pick<
  ChainRemoteOwnership,
  "creatorPeerId" | "assignerPeerId" | "ownershipEpoch" | "status"
> & {
  localRole: "creator" | "assigner";
};

export function createOwnershipEpoch(now = new Date()): string {
  return `own_${now.getTime()}_${randomUUID().slice(0, 8)}`;
}

export function createRemoteOwnership(input: {
  chainId: string;
  creatorPeerId: string;
  creatorOwnerId: string;
  assignerPeerId: string;
  assignerOwnerId: string;
  goal?: string;
  status?: ChainRemoteOwnershipStatus;
  now?: Date;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
}): ChainRemoteOwnership {
  const now = input.now ?? new Date();
  return {
    chainId: input.chainId,
    creatorPeerId: input.creatorPeerId,
    creatorOwnerId: input.creatorOwnerId,
    assignerPeerId: input.assignerPeerId,
    assignerOwnerId: input.assignerOwnerId,
    ownershipEpoch: createOwnershipEpoch(now),
    handedOffAt: now.toISOString(),
    ...(input.goal ? { goal: input.goal } : {}),
    ...(typeof input.maxChainCostUsd === "number"
      ? { maxChainCostUsd: input.maxChainCostUsd }
      : {}),
    ...(typeof input.costCeilingUsd === "number"
      ? { costCeilingUsd: input.costCeilingUsd }
      : {}),
    status: input.status ?? "delegated",
  };
}

/** Bump epoch and mark recovering (Assigner process restart). */
export function bumpOwnershipEpochForRestart(
  ownership: ChainRemoteOwnership,
  now = new Date(),
): ChainRemoteOwnership {
  return {
    ...ownership,
    ownershipEpoch: createOwnershipEpoch(now),
    status: "assigner_recovering",
    lastAssignerHeartbeatAt: now.toISOString(),
  };
}

/** Build a creator-side status mirror from an inbound `task.chain.status`. */
export function statusMirrorFromChainStatus(payload: {
  phase: DelegatedStatusMirror["phase"];
  awardMode: "direct" | "competitive" | string;
  subtaskCount: number;
  awardedCount: number;
  partialCount: number;
  steps: DelegatedStatusMirror["steps"];
  createdAt?: string;
}): DelegatedStatusMirror {
  return {
    phase: payload.phase,
    awardMode: payload.awardMode === "competitive" ? "competitive" : "direct",
    subtaskCount: payload.subtaskCount,
    awardedCount: payload.awardedCount,
    partialCount: payload.partialCount,
    steps: payload.steps.map((s) => ({
      subtaskId: s.subtaskId,
      ...(s.objective ? { objective: s.objective } : {}),
      state: s.state,
      ...(s.workerPeerId ? { workerPeerId: s.workerPeerId } : {}),
    })),
    updatedAt: payload.createdAt ?? new Date().toISOString(),
  };
}

export function withStatusMirror(
  ownership: ChainRemoteOwnership,
  mirror: DelegatedStatusMirror,
): ChainRemoteOwnership {
  return {
    ...ownership,
    statusMirror: mirror,
    lastAssignerHeartbeatAt: mirror.updatedAt,
  };
}

export function markOwnershipActive(
  ownership: ChainRemoteOwnership,
  now = new Date(),
): ChainRemoteOwnership {
  return {
    ...ownership,
    status: "assigner_active",
    lastAssignerHeartbeatAt: now.toISOString(),
  };
}

/**
 * Scaffold for 64B stranded detection. Returns stranded when the caller
 * already knows the Assigner is unreachable past the grace window.
 */
export function evaluateAssignerStranded(input: {
  ownership: ChainRemoteOwnership;
  assignerUnreachable: boolean;
  graceElapsed: boolean;
}): { stranded: boolean; reason?: string } {
  if (
    input.ownership.status === "cancelled" ||
    input.ownership.status === "reclaimed" ||
    input.ownership.status === "assigner_stranded"
  ) {
    return { stranded: input.ownership.status === "assigner_stranded" };
  }
  if (input.assignerUnreachable && input.graceElapsed) {
    return { stranded: true, reason: "assigner_unreachable_past_grace" };
  }
  return { stranded: false };
}

export function ownershipViewForLocal(
  ownership: ChainRemoteOwnership,
  localPeerId: string,
): ChainRemoteOwnershipView {
  const localRole =
    localPeerId === ownership.assignerPeerId
      ? "assigner"
      : "creator";
  return {
    creatorPeerId: ownership.creatorPeerId,
    assignerPeerId: ownership.assignerPeerId,
    ownershipEpoch: ownership.ownershipEpoch,
    status: ownership.status,
    localRole,
  };
}

/** Empty shell for creator homes that handed off (no local runtime). */
export function syntheticDelegatedChainGetState(
  ownership: ChainRemoteOwnership,
): ChainGetStateResult {
  const base: ChainGetStateResult = {
    chainId: ownership.chainId,
    chainMandateId: "",
    subtaskCount: 0,
    bidCount: 0,
    awardedCount: 0,
    partialCount: 0,
    cancelledCount: 0,
    chainCancelled: ownership.status === "cancelled",
    published: false,
    budgetSpentUsd: 0,
    budgetMaxUsd: 0,
    budgetReservedUsd: 0,
    budgetSynthesisUsd: 0,
    goal: ownership.goal,
    remoteOwnership: ownershipViewForLocal(ownership, ownership.creatorPeerId),
    assignerStranded:
      ownership.status === "assigner_stranded"
        ? {
            since: ownership.lastAssignerHeartbeatAt ?? ownership.handedOffAt,
            canReclaim: true,
            canCancel: true,
          }
        : undefined,
  };
  return applyStatusMirrorToChainGetState(base, ownership);
}

/**
 * Phase 67C — surface Assigner statusMirror as live steps/counts on the
 * creator home (no local runtime). Prefer local steps when already present.
 */
export function applyStatusMirrorToChainGetState(
  result: ChainGetStateResult,
  ownership: ChainRemoteOwnership | undefined,
): ChainGetStateResult {
  const mirror = ownership?.statusMirror;
  if (!mirror) return result;
  const hasLocalSteps = (result.steps?.length ?? 0) > 0;
  if (hasLocalSteps) return result;

  result.subtaskCount = mirror.subtaskCount;
  result.awardedCount = mirror.awardedCount;
  result.partialCount = mirror.partialCount;
  result.awardMode = mirror.awardMode;
  if (mirror.phase === "completed") {
    result.published = true;
  }
  if (mirror.phase === "cancelled") {
    result.chainCancelled = true;
  }
  result.steps = mirror.steps.map((s) => ({
    subtaskId: s.subtaskId,
    objective: s.objective?.trim() || s.subtaskId,
    state: s.state,
    ...(s.workerPeerId ? { workerPeerId: s.workerPeerId } : {}),
  }));
  return result;
}

export function enrichChainGetStateWithOwnership(
  result: ChainGetStateResult,
  ownership: ChainRemoteOwnership | undefined,
  localPeerId: string | undefined,
): ChainGetStateResult {
  if (!ownership) return result;
  const view = ownershipViewForLocal(ownership, localPeerId ?? ownership.creatorPeerId);
  result.remoteOwnership = view;
  if (ownership.status === "assigner_stranded") {
    result.assignerStranded = {
      since: ownership.lastAssignerHeartbeatAt ?? ownership.handedOffAt,
      canReclaim: true,
      canCancel: true,
    };
  }
  // Creator homes (and any empty-step view) get mirrored Assigner progress.
  if (view.localRole === "creator") {
    applyStatusMirrorToChainGetState(result, ownership);
  }
  return result;
}

/** Parse a loose ownership blob from checkpoint / disk JSON. */
export function parseRemoteOwnership(raw: unknown): ChainRemoteOwnership | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.chainId !== "string" ||
    typeof o.creatorPeerId !== "string" ||
    typeof o.creatorOwnerId !== "string" ||
    typeof o.assignerPeerId !== "string" ||
    typeof o.assignerOwnerId !== "string" ||
    typeof o.ownershipEpoch !== "string" ||
    typeof o.handedOffAt !== "string" ||
    typeof o.status !== "string"
  ) {
    return undefined;
  }
  let statusMirror: DelegatedStatusMirror | undefined;
  if (o.statusMirror && typeof o.statusMirror === "object") {
    const m = o.statusMirror as Record<string, unknown>;
    if (
      typeof m.phase === "string" &&
      typeof m.awardMode === "string" &&
      Array.isArray(m.steps)
    ) {
      statusMirror = {
        phase: m.phase as DelegatedStatusMirror["phase"],
        awardMode: m.awardMode === "competitive" ? "competitive" : "direct",
        subtaskCount: typeof m.subtaskCount === "number" ? m.subtaskCount : m.steps.length,
        awardedCount: typeof m.awardedCount === "number" ? m.awardedCount : 0,
        partialCount: typeof m.partialCount === "number" ? m.partialCount : 0,
        steps: m.steps.filter((s): s is DelegatedStatusMirror["steps"][number] =>
          Boolean(s && typeof s === "object" && typeof (s as { subtaskId?: string }).subtaskId === "string"),
        ).map((s) => {
          const step = s as DelegatedStatusMirror["steps"][number];
          return {
            subtaskId: step.subtaskId,
            ...(step.objective ? { objective: step.objective } : {}),
            state: step.state,
            ...(step.workerPeerId ? { workerPeerId: step.workerPeerId } : {}),
          };
        }),
        updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : new Date().toISOString(),
      };
    }
  }
  return {
    chainId: o.chainId,
    creatorPeerId: o.creatorPeerId,
    creatorOwnerId: o.creatorOwnerId,
    assignerPeerId: o.assignerPeerId,
    assignerOwnerId: o.assignerOwnerId,
    ownershipEpoch: o.ownershipEpoch,
    handedOffAt: o.handedOffAt,
    ...(typeof o.goal === "string" ? { goal: o.goal } : {}),
    ...(typeof o.lastAssignerHeartbeatAt === "string"
      ? { lastAssignerHeartbeatAt: o.lastAssignerHeartbeatAt }
      : {}),
    ...(typeof o.maxChainCostUsd === "number" ? { maxChainCostUsd: o.maxChainCostUsd } : {}),
    ...(typeof o.costCeilingUsd === "number" ? { costCeilingUsd: o.costCeilingUsd } : {}),
    ...(statusMirror ? { statusMirror } : {}),
    status: o.status as ChainRemoteOwnershipStatus,
  };
}

/**
 * Creator-side delegated-job ledger. Survives creator restart when Assigner
 * owns the live journal elsewhere.
 */
export class DelegatedChainStore {
  private readonly byId = new Map<string, ChainRemoteOwnership>();
  private dir?: string;

  async init(profileDir: string): Promise<void> {
    this.dir = join(profileDir, "team-jobs", "delegated");
    await mkdir(this.dir, { recursive: true });
    let names: string[] = [];
    try {
      names = await readdir(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(await readFile(join(this.dir, name), "utf8"));
        const ownership = parseRemoteOwnership(raw);
        if (ownership) this.byId.set(ownership.chainId, ownership);
      } catch {
        /* skip corrupt */
      }
    }
  }

  get(chainId: string): ChainRemoteOwnership | undefined {
    return this.byId.get(chainId);
  }

  listActive(): ChainRemoteOwnership[] {
    return [...this.byId.values()].filter(
      (o) =>
        o.status === "delegated" ||
        o.status === "assigner_active" ||
        o.status === "assigner_recovering" ||
        o.status === "assigner_stranded",
    );
  }

  async upsert(ownership: ChainRemoteOwnership): Promise<void> {
    this.byId.set(ownership.chainId, ownership);
    await this.persistOne(ownership);
  }

  async remove(chainId: string): Promise<void> {
    this.byId.delete(chainId);
    if (!this.dir) return;
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(join(this.dir, `${chainId}.json`));
    } catch {
      /* missing ok */
    }
  }

  private async persistOne(ownership: ChainRemoteOwnership): Promise<void> {
    if (!this.dir) return;
    const path = join(this.dir, `${ownership.chainId}.json`);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(ownership, null, 2), { mode: 0o600 });
    await rename(tmp, path);
  }
}

/** Default grace before a silent Assigner is treated as stranded (64B). */
export const ASSIGNER_STRAND_GRACE_MS = 120_000;
export const ASSIGNER_STRAND_ACTIVE_GRACE_MS = 300_000;

export function markOwnershipStranded(
  ownership: ChainRemoteOwnership,
  now = new Date(),
): ChainRemoteOwnership {
  return {
    ...ownership,
    status: "assigner_stranded",
    lastAssignerHeartbeatAt: ownership.lastAssignerHeartbeatAt ?? now.toISOString(),
  };
}

export function markOwnershipCancelled(
  ownership: ChainRemoteOwnership,
  now = new Date(),
): ChainRemoteOwnership {
  return {
    ...ownership,
    status: "cancelled",
    lastAssignerHeartbeatAt: now.toISOString(),
  };
}

export function markOwnershipReclaimed(
  ownership: ChainRemoteOwnership,
  now = new Date(),
): ChainRemoteOwnership {
  return {
    ...ownership,
    status: "reclaimed",
    lastAssignerHeartbeatAt: now.toISOString(),
  };
}

/**
 * Decide whether a creator-side delegated job should be marked stranded.
 * Uses heartbeat age + optional mesh reachability of the Assigner peer.
 */
export function shouldMarkAssignerStranded(input: {
  ownership: ChainRemoteOwnership;
  assignerReachable: boolean;
  now?: Date;
  recoveringGraceMs?: number;
  activeGraceMs?: number;
}): { stranded: boolean; reason?: string } {
  const { ownership } = input;
  if (
    ownership.status === "cancelled" ||
    ownership.status === "reclaimed" ||
    ownership.status === "assigner_stranded"
  ) {
    return { stranded: ownership.status === "assigner_stranded" };
  }
  const nowMs = (input.now ?? new Date()).getTime();
  const lastMs = Date.parse(
    ownership.lastAssignerHeartbeatAt ?? ownership.handedOffAt,
  );
  if (!Number.isFinite(lastMs)) {
    return { stranded: false };
  }
  const ageMs = nowMs - lastMs;
  const recoveringGrace =
    input.recoveringGraceMs ??
    (Number(process.env.ENVOYMESH_ASSIGNER_STRAND_GRACE_MS) || ASSIGNER_STRAND_GRACE_MS);
  const activeGrace =
    input.activeGraceMs ??
    (Number(process.env.ENVOYMESH_ASSIGNER_STRAND_ACTIVE_GRACE_MS) ||
      ASSIGNER_STRAND_ACTIVE_GRACE_MS);

  if (ownership.status === "assigner_recovering") {
    if (ageMs >= recoveringGrace) {
      return { stranded: true, reason: "recovering_timeout" };
    }
    return { stranded: false };
  }

  // delegated / assigner_active: require unreachable + grace elapsed
  if (!input.assignerReachable && ageMs >= activeGrace) {
    return { stranded: true, reason: "assigner_unreachable_past_grace" };
  }
  return { stranded: false };
}

/** 64B — cancel a stranded/delegated job on the creator home. */
export function resolveCancelDelegated(params: {
  chainId: string;
  ownership?: ChainRemoteOwnership;
}):
  | { ok: true; ownership: ChainRemoteOwnership }
  | { ok: false; chainId: string; reason: string } {
  if (!params.ownership) {
    return { ok: false, chainId: params.chainId, reason: "not_delegated" };
  }
  if (
    params.ownership.status === "cancelled" ||
    params.ownership.status === "reclaimed"
  ) {
    return { ok: false, chainId: params.chainId, reason: "already_terminal" };
  }
  return {
    ok: true,
    ownership: markOwnershipCancelled(params.ownership),
  };
}

/**
 * 64B — reclaim gate. Creator may reclaim when stranded. Actual local
 * re-run of the goal is performed by the NodeService host.
 */
export function resolveReclaimAssigner(params: {
  chainId: string;
  ownership?: ChainRemoteOwnership;
}):
  | { ok: true; ownership: ChainRemoteOwnership; goal: string }
  | { ok: false; chainId: string; reason: string } {
  if (!params.ownership) {
    return { ok: false, chainId: params.chainId, reason: "not_delegated" };
  }
  if (params.ownership.status !== "assigner_stranded") {
    return { ok: false, chainId: params.chainId, reason: "not_stranded" };
  }
  const goal = params.ownership.goal?.trim();
  if (!goal) {
    return { ok: false, chainId: params.chainId, reason: "missing_goal" };
  }
  return {
    ok: true,
    ownership: markOwnershipReclaimed(params.ownership),
    goal,
  };
}

/**
 * Apply an inbound `task.chain.ownership` notify on the creator (or Assigner
 * mirror). Rejects stale epochs that go backwards for the same assigner.
 */
export function applyOwnershipNotify(input: {
  current?: ChainRemoteOwnership;
  notify: {
    chainId: string;
    ownershipEpoch: string;
    status: ChainRemoteOwnershipStatus;
    assignerPeerId: string;
    creatorPeerId: string;
    goal?: string;
    createdAt: string;
  };
  creatorOwnerId?: string;
  assignerOwnerId?: string;
}): { ok: true; ownership: ChainRemoteOwnership } | { ok: false; reason: string } {
  const { current, notify } = input;
  if (current && current.chainId !== notify.chainId) {
    return { ok: false, reason: "chain_mismatch" };
  }
  if (
    current &&
    current.assignerPeerId === notify.assignerPeerId &&
    current.ownershipEpoch !== notify.ownershipEpoch &&
    // Allow bump only when epoch string differs; reject if notify looks older
    // by handedOff/heartbeat clock when both parse.
    current.lastAssignerHeartbeatAt &&
    Date.parse(notify.createdAt) < Date.parse(current.lastAssignerHeartbeatAt) - 5_000
  ) {
    return { ok: false, reason: "stale_epoch" };
  }
  const ownership: ChainRemoteOwnership = {
    chainId: notify.chainId,
    creatorPeerId: notify.creatorPeerId,
    creatorOwnerId: current?.creatorOwnerId ?? input.creatorOwnerId ?? notify.creatorPeerId,
    assignerPeerId: notify.assignerPeerId,
    assignerOwnerId: current?.assignerOwnerId ?? input.assignerOwnerId ?? notify.assignerPeerId,
    ownershipEpoch: notify.ownershipEpoch,
    handedOffAt: current?.handedOffAt ?? notify.createdAt,
    ...(notify.goal ? { goal: notify.goal } : current?.goal ? { goal: current.goal } : {}),
    lastAssignerHeartbeatAt: notify.createdAt,
    status: notify.status,
  };
  return { ok: true, ownership };
}
