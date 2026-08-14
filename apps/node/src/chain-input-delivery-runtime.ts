/**
 * Phase 59B — deliver Team job composer attachments to awarded workers.
 *
 * Bytes: Data Transfer Voucher + `/envoymesh/data` (voucher path = worker
 * destination under `imports/team-jobs/<chainId>/in/…`; bytes read from
 * Assigner source path).
 */

import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CHAIN_INPUT_VOUCHER_TTL_MS,
  DEFAULT_CHAIN_INPUT_DELIVERY_POLICY,
  chainInputDeliveredRelativePath,
  chainInputJobWorkspaceDir,
  parseChainInputAttachmentsFromGoal,
  selectChainInputsForSubtask,
  type ChainInputAttachment,
  type ChainInputDeliveryPhase,
  type ChainInputDeliveryPolicy,
  type ChainInputDeliveryRecord,
} from "@envoymesh/api";
import type { ChainState } from "./chain-orchestrator.js";
import { isSafeVaultPath } from "./share-inbound.js";

export function ensureChainInputManifest(state: ChainState): ChainInputAttachment[] {
  if (!state.inputAttachments) {
    state.inputAttachments = parseChainInputAttachmentsFromGoal(state.goal ?? "");
  }
  if (!state.inputDeliveryPolicy) {
    state.inputDeliveryPolicy = { ...DEFAULT_CHAIN_INPUT_DELIVERY_POLICY };
  }
  if (!state.inputDeliveries) {
    state.inputDeliveries = [];
  }
  return state.inputAttachments;
}

export function upsertChainInputDelivery(
  state: ChainState,
  patch: Omit<ChainInputDeliveryRecord, "updatedAt"> & { updatedAt?: string },
): ChainInputDeliveryRecord {
  ensureChainInputManifest(state);
  const updatedAt = patch.updatedAt ?? new Date().toISOString();
  const next: ChainInputDeliveryRecord = { ...patch, updatedAt };
  const list = state.inputDeliveries!;
  const idx = list.findIndex(
    (r) =>
      r.workerPeerId === next.workerPeerId &&
      r.sourceRelativePath === next.sourceRelativePath,
  );
  if (idx >= 0) {
    const merged: ChainInputDeliveryRecord = { ...list[idx], ...next };
    if (!("error" in patch) || patch.error === undefined) delete merged.error;
    list[idx] = merged;
  } else list.push(next);
  return idx >= 0 ? list[idx]! : next;
}

export function attachmentsForAwardedSubtask(
  state: ChainState,
  subtaskId: string,
): ChainInputAttachment[] {
  const attachments = ensureChainInputManifest(state);
  if (attachments.length === 0) return [];
  const sub = state.subtasks.get(subtaskId);
  const expects = (sub?.expects ?? []).map((e) => e.key);
  return selectChainInputsForSubtask({
    attachments,
    objective: sub?.objective,
    expects,
    scope: state.inputDeliveryPolicy?.scope ?? DEFAULT_CHAIN_INPUT_DELIVERY_POLICY.scope,
  });
}

/**
 * Phase 59C — whether selected job inputs for this award are safe to execute.
 * No selected attachments → ready. Any failed → not ready. Any non-verified → pending.
 */
export function jobInputsReadyForAward(
  state: ChainState,
  subtaskId: string,
  workerPeerId: string,
): { ok: true } | { ok: false; reason: "input_delivery_pending" | "input_delivery_failed" } {
  const selected = attachmentsForAwardedSubtask(state, subtaskId);
  if (selected.length === 0) return { ok: true };
  const deliveries = state.inputDeliveries ?? [];
  for (const att of selected) {
    const source = att.sourceRelativePath.replace(/^[\\/]+/, "");
    const rec = deliveries.find(
      (d) => d.workerPeerId === workerPeerId && d.sourceRelativePath === source,
    );
    if (!rec) return { ok: false, reason: "input_delivery_pending" };
    if (rec.phase === "failed") return { ok: false, reason: "input_delivery_failed" };
    if (rec.phase !== "verified") return { ok: false, reason: "input_delivery_pending" };
  }
  return { ok: true };
}

/**
 * Phase 59C — file `inputArtifacts` for the worker (local vault paths after 59B).
 */
export function buildJobInputFileArtifacts(
  state: ChainState,
  subtaskId: string,
  workerPeerId: string,
): Array<{
  key: string;
  artifact: {
    kind: "file";
    vaultPath: string;
    contentHash: string;
    displayName?: string;
  };
}> {
  const selected = attachmentsForAwardedSubtask(state, subtaskId);
  if (selected.length === 0) return [];
  const deliveries = state.inputDeliveries ?? [];
  const out: Array<{
    key: string;
    artifact: {
      kind: "file";
      vaultPath: string;
      contentHash: string;
      displayName?: string;
    };
  }> = [];
  const usedKeys = new Set<string>();
  for (const att of selected) {
    const source = att.sourceRelativePath.replace(/^[\\/]+/, "");
    const rec = deliveries.find(
      (d) =>
        d.workerPeerId === workerPeerId &&
        d.sourceRelativePath === source &&
        d.phase === "verified",
    );
    if (!rec?.deliveredRelativePath) continue;
    const hash = rec.contentHash?.trim();
    if (!hash) continue;
    let key = (att.label?.trim() || att.fileName || "input").slice(0, 64);
    if (usedKeys.has(key)) key = `${key}_${usedKeys.size}`;
    usedKeys.add(key);
    out.push({
      key,
      artifact: {
        kind: "file",
        vaultPath: rec.deliveredRelativePath,
        contentHash: hash,
        ...(att.fileName || att.label
          ? { displayName: att.fileName ?? att.label }
          : {}),
      },
    });
  }
  return out;
}

export type ChainInputPushFile = (input: {
  sourceRelativePath: string;
  voucherRelativePath: string;
  toPeerId: string;
  chainId: string;
  expiresAt: string;
}) => Promise<{ contentHash: string; transferId?: string }>;

export type ChainInputCopyLocal = (input: {
  sourceRelativePath: string;
  deliveredRelativePath: string;
}) => Promise<{ contentHash: string }>;

/**
 * On award (before accept / Phase 59C): push selected inputs to the worker
 * (or local copy for You). Failures mark `failed` and do not throw —
 * callers use `jobInputsReadyForAward` to stall the accept.
 */
export async function deliverChainInputsOnAward(opts: {
  state: ChainState;
  subtaskId: string;
  workerPeerId: string;
  orchestratorPeerId: string;
  /** libp2p peer id for data transfer (may differ from agent peer id). */
  transportPeerId?: string;
  now?: () => Date;
  pushFile?: ChainInputPushFile;
  copyLocal?: ChainInputCopyLocal;
  onUpdate?: () => void;
}): Promise<ChainInputDeliveryRecord[]> {
  const {
    state,
    subtaskId,
    workerPeerId,
    orchestratorPeerId,
    transportPeerId,
    pushFile,
    copyLocal,
    onUpdate,
  } = opts;
  const now = opts.now ?? (() => new Date());
  const policy: ChainInputDeliveryPolicy =
    state.inputDeliveryPolicy ?? DEFAULT_CHAIN_INPUT_DELIVERY_POLICY;
  if (!policy.autoDeliverOnAward) return [];

  const selected = attachmentsForAwardedSubtask(state, subtaskId);
  if (selected.length === 0) return [];

  const isSelf = workerPeerId === orchestratorPeerId;
  const results: ChainInputDeliveryRecord[] = [];

  for (const att of selected) {
    const sourceRelativePath = att.sourceRelativePath.replace(/^[\\/]+/, "");
    const existing = state.inputDeliveries?.find(
      (r) =>
        r.workerPeerId === workerPeerId &&
        r.sourceRelativePath === sourceRelativePath &&
        r.phase === "verified" &&
        r.deliveredRelativePath,
    );
    if (existing) {
      results.push(existing);
      continue;
    }
    const fileName = att.fileName ?? sourceRelativePath.split("/").pop() ?? "file";
    const deliveredRelativePath = chainInputDeliveredRelativePath(state.chainId, fileName);
    upsertChainInputDelivery(state, {
      chainId: state.chainId,
      workerPeerId,
      sourceRelativePath,
      deliveredRelativePath,
      contentHash: att.contentHash,
      phase: "pending",
    });
    onUpdate?.();

    try {
      if (isSelf) {
        if (!copyLocal) {
          // Same vault: treat source as already available; mark verified.
          upsertChainInputDelivery(state, {
            chainId: state.chainId,
            workerPeerId,
            sourceRelativePath,
            deliveredRelativePath: sourceRelativePath,
            contentHash: att.contentHash ?? "local",
            phase: "verified",
          });
        } else {
          upsertChainInputDelivery(state, {
            chainId: state.chainId,
            workerPeerId,
            sourceRelativePath,
            deliveredRelativePath,
            phase: "transferring",
          });
          onUpdate?.();
          const copied = await copyLocal({ sourceRelativePath, deliveredRelativePath });
          upsertChainInputDelivery(state, {
            chainId: state.chainId,
            workerPeerId,
            sourceRelativePath,
            deliveredRelativePath,
            contentHash: copied.contentHash,
            phase: "verified",
          });
        }
      } else {
        if (!pushFile || !transportPeerId) {
          throw new Error(pushFile ? "no_transport_peer" : "push_unavailable");
        }
        upsertChainInputDelivery(state, {
          chainId: state.chainId,
          workerPeerId,
          sourceRelativePath,
          deliveredRelativePath,
          phase: "transferring",
        });
        onUpdate?.();
        const expiresAt = new Date(now().getTime() + CHAIN_INPUT_VOUCHER_TTL_MS).toISOString();
        const pushed = await pushFile({
          sourceRelativePath,
          voucherRelativePath: deliveredRelativePath,
          toPeerId: transportPeerId,
          chainId: state.chainId,
          expiresAt,
        });
        upsertChainInputDelivery(state, {
          chainId: state.chainId,
          workerPeerId,
          sourceRelativePath,
          deliveredRelativePath,
          contentHash: pushed.contentHash,
          transferId: pushed.transferId,
          phase: "verified",
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      upsertChainInputDelivery(state, {
        chainId: state.chainId,
        workerPeerId,
        sourceRelativePath,
        deliveredRelativePath,
        phase: "failed" satisfies ChainInputDeliveryPhase,
        error: error.slice(0, 500),
      });
    }
    onUpdate?.();
    const latest = state.inputDeliveries?.find(
      (r) =>
        r.workerPeerId === workerPeerId && r.sourceRelativePath === sourceRelativePath,
    );
    if (latest) results.push(latest);
  }
  return results;
}

/** Local vault copy into the job workspace (You worker / path consistency). */
export async function copyChainInputInVault(opts: {
  vaultDir: string;
  sourceRelativePath: string;
  deliveredRelativePath: string;
}): Promise<{ contentHash: string }> {
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const src = opts.sourceRelativePath.replace(/^[\\/]+/, "");
  const dest = opts.deliveredRelativePath.replace(/^[\\/]+/, "");
  if (!isSafeVaultPath(opts.vaultDir, src) || !isSafeVaultPath(opts.vaultDir, dest)) {
    throw new Error("Unsafe vault path for job input copy");
  }
  const absSrc = join(opts.vaultDir, src);
  const absDest = join(opts.vaultDir, dest);
  await mkdir(dirname(absDest), { recursive: true });
  if (absSrc !== absDest) {
    await copyFile(absSrc, absDest);
  }
  const content = await readFile(absDest);
  return { contentHash: createHash("sha256").update(content).digest("base64url") };
}

/**
 * Phase 59D — re-push failed (or stuck transferring) deliveries.
 * Does not require a subtask id; uses stored source/dest paths on the record.
 */
export async function retryFailedChainInputDeliveries(opts: {
  state: ChainState;
  workerPeerId?: string;
  sourceRelativePath?: string;
  orchestratorPeerId: string;
  resolveTransportPeerId?: (workerPeerId: string) => Promise<string | undefined>;
  now?: () => Date;
  pushFile?: ChainInputPushFile;
  copyLocal?: ChainInputCopyLocal;
  onUpdate?: () => void;
}): Promise<{ retried: number; verified: number; failed: number }> {
  const {
    state,
    workerPeerId,
    sourceRelativePath,
    orchestratorPeerId,
    resolveTransportPeerId,
    pushFile,
    copyLocal,
    onUpdate,
  } = opts;
  const now = opts.now ?? (() => new Date());
  ensureChainInputManifest(state);
  const wantSource = sourceRelativePath?.replace(/^[\\/]+/, "");
  const targets = (state.inputDeliveries ?? []).filter((r) => {
    if (r.phase !== "failed" && r.phase !== "transferring" && r.phase !== "pending") {
      return false;
    }
    if (workerPeerId && r.workerPeerId !== workerPeerId) return false;
    if (wantSource && r.sourceRelativePath !== wantSource) return false;
    return true;
  });
  let retried = 0;
  let verified = 0;
  let failed = 0;
  for (const rec of targets) {
    retried += 1;
    const source = rec.sourceRelativePath.replace(/^[\\/]+/, "");
    const fileName = source.split("/").pop() ?? "file";
    const deliveredRelativePath =
      rec.deliveredRelativePath?.replace(/^[\\/]+/, "") ||
      chainInputDeliveredRelativePath(state.chainId, fileName);
    const isSelf = rec.workerPeerId === orchestratorPeerId;
    upsertChainInputDelivery(state, {
      chainId: state.chainId,
      workerPeerId: rec.workerPeerId,
      sourceRelativePath: source,
      deliveredRelativePath,
      phase: "pending",
      error: undefined,
    });
    onUpdate?.();
    try {
      if (isSelf) {
        if (!copyLocal) {
          upsertChainInputDelivery(state, {
            chainId: state.chainId,
            workerPeerId: rec.workerPeerId,
            sourceRelativePath: source,
            deliveredRelativePath: source,
            contentHash: rec.contentHash ?? "local",
            phase: "verified",
          });
        } else {
          upsertChainInputDelivery(state, {
            chainId: state.chainId,
            workerPeerId: rec.workerPeerId,
            sourceRelativePath: source,
            deliveredRelativePath,
            phase: "transferring",
          });
          onUpdate?.();
          const copied = await copyLocal({
            sourceRelativePath: source,
            deliveredRelativePath,
          });
          upsertChainInputDelivery(state, {
            chainId: state.chainId,
            workerPeerId: rec.workerPeerId,
            sourceRelativePath: source,
            deliveredRelativePath,
            contentHash: copied.contentHash,
            phase: "verified",
          });
        }
      } else {
        if (!pushFile) throw new Error("push_unavailable");
        const transportPeerId = resolveTransportPeerId
          ? await resolveTransportPeerId(rec.workerPeerId)
          : undefined;
        if (!transportPeerId) throw new Error("no_transport_peer");
        upsertChainInputDelivery(state, {
          chainId: state.chainId,
          workerPeerId: rec.workerPeerId,
          sourceRelativePath: source,
          deliveredRelativePath,
          phase: "transferring",
        });
        onUpdate?.();
        const expiresAt = new Date(now().getTime() + CHAIN_INPUT_VOUCHER_TTL_MS).toISOString();
        const pushed = await pushFile({
          sourceRelativePath: source,
          voucherRelativePath: deliveredRelativePath,
          toPeerId: transportPeerId,
          chainId: state.chainId,
          expiresAt,
        });
        upsertChainInputDelivery(state, {
          chainId: state.chainId,
          workerPeerId: rec.workerPeerId,
          sourceRelativePath: source,
          deliveredRelativePath,
          contentHash: pushed.contentHash,
          transferId: pushed.transferId,
          phase: "verified",
        });
      }
      verified += 1;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      upsertChainInputDelivery(state, {
        chainId: state.chainId,
        workerPeerId: rec.workerPeerId,
        sourceRelativePath: source,
        deliveredRelativePath,
        phase: "failed",
        error: error.slice(0, 500),
      });
      failed += 1;
    }
    onUpdate?.();
  }
  return { retried, verified, failed };
}

/**
 * Phase 59E — delete `imports/team-jobs/<chainId>/` when policy is `on_terminal`.
 * Safe-path gated; missing dirs are a no-op success.
 */
export async function gcChainInputWorkspace(opts: {
  vaultDir: string;
  chainId: string;
  policy?: ChainInputDeliveryPolicy;
}): Promise<{ ok: true; removed: boolean; relativePath: string } | { ok: false; reason: string }> {
  const policy = opts.policy ?? DEFAULT_CHAIN_INPUT_DELIVERY_POLICY;
  if (policy.gc !== "on_terminal") {
    return {
      ok: true,
      removed: false,
      relativePath: chainInputJobWorkspaceDir(opts.chainId),
    };
  }
  const relativePath = chainInputJobWorkspaceDir(opts.chainId).replace(/^[\\/]+/, "");
  if (!relativePath.startsWith("imports/team-jobs/")) {
    return { ok: false, reason: "unsafe_workspace_prefix" };
  }
  if (!isSafeVaultPath(opts.vaultDir, relativePath)) {
    return { ok: false, reason: "unsafe_vault_path" };
  }
  const abs = join(opts.vaultDir, relativePath);
  try {
    await rm(abs, { recursive: true, force: true });
    return { ok: true, removed: true, relativePath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 500) };
  }
}
