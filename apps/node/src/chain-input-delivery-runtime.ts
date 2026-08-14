/**
 * Phase 59B — deliver Team job composer attachments to awarded workers.
 *
 * Bytes: Data Transfer Voucher + `/envoymesh/data` (voucher path = worker
 * destination under `imports/team-jobs/<chainId>/in/…`; bytes read from
 * Assigner source path).
 */

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CHAIN_INPUT_VOUCHER_TTL_MS,
  DEFAULT_CHAIN_INPUT_DELIVERY_POLICY,
  chainInputDeliveredRelativePath,
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
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.push(next);
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
