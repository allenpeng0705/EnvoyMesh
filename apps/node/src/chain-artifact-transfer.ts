/**
 * Phase 65C — intermediate artifact transfer (worker → Assigner → next worker).
 *
 * Stages content-addressed blobs under `imports/team-jobs/<chainId>/out/`,
 * delivers to child workers via the same voucher path as Phase 59 job inputs,
 * and builds a soft provenance graph. Not vault mirror.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CHAIN_ARTIFACT_MAX_BYTES,
  CHAIN_ARTIFACT_MAX_PER_PARTIAL,
  CHAIN_INPUT_VOUCHER_TTL_MS,
  chainArtifactDeliveredRelativePath,
  chainArtifactStagedRelativePath,
  type ChainArtifactDeliveryRecord,
  type ChainArtifactGraph,
  type ChainArtifactKind,
} from "@envoymesh/api";
import type { NamedArtifact, TaskChainPartialPayload } from "@envoymesh/protocol";
import type { ChainState } from "./chain-orchestrator.js";
import { isSafeVaultPath } from "./share-inbound.js";
import type { ChainInputPushFile } from "./chain-input-delivery-runtime.js";
import { chainArtifactPathWithinJobWorkspace } from "./chain-sensitivity-gate.js";

export type { ChainArtifactDeliveryRecord, ChainArtifactGraph };

export function sha256Hex(input: string | Uint8Array): string {
  const h = createHash("sha256");
  h.update(typeof input === "string" ? Buffer.from(input, "utf8") : input);
  return h.digest("hex");
}

function ensureArtifactLedger(state: ChainState): ChainArtifactDeliveryRecord[] {
  if (!state.artifactDeliveries) state.artifactDeliveries = [];
  return state.artifactDeliveries;
}

function artifactKindOf(artifact: NamedArtifact["artifact"]): ChainArtifactKind {
  const kind = (artifact as { kind?: string }).kind;
  if (kind === "file" || kind === "structured" || kind === "text") return kind;
  return "text";
}

function extForKind(kind: ChainArtifactKind): string {
  if (kind === "text") return "txt";
  if (kind === "structured") return "json";
  return "bin";
}

/** Same fallback order as Phase 53 `namedFromPartial` (keep local to avoid export churn). */
export function namedArtifactsFromPartial(
  partial: TaskChainPartialPayload["partial"],
): NamedArtifact[] {
  const named = partial.namedArtifacts;
  if (named && named.length > 0) return [...named];
  if (partial.artifactFragment) {
    return [{ key: "default", artifact: partial.artifactFragment as NamedArtifact["artifact"] }];
  }
  const note = partial.note?.trim();
  if (note) {
    return [{ key: "default", artifact: { kind: "text", content: note.slice(0, 64_000) } }];
  }
  return [];
}

/**
 * Register parent final namedArtifacts on the Assigner ledger (content-addressed).
 * Text/structured keep inline payload for rewrite + optional vault stage.
 */
export function registerParentArtifacts(
  state: ChainState,
  sourceSubtaskId: string,
  named: readonly NamedArtifact[],
  now = new Date(),
): ChainArtifactDeliveryRecord[] {
  const ledger = ensureArtifactLedger(state);
  const updatedAt = now.toISOString();
  const out: ChainArtifactDeliveryRecord[] = [];
  for (const item of named.slice(0, CHAIN_ARTIFACT_MAX_PER_PARTIAL)) {
    const key = (item.key || "default").trim() || "default";
    const kind = artifactKindOf(item.artifact);
    const art = item.artifact as {
      kind?: string;
      content?: string;
      data?: unknown;
      vaultPath?: string;
      contentHash?: string;
      sizeBytes?: number;
    };
    let contentHash = "";
    let inlineText: string | undefined;
    let byteLength: number | undefined;
    let stagedRelativePath = "";

    if (kind === "text" && typeof art.content === "string") {
      inlineText = art.content.slice(0, CHAIN_ARTIFACT_MAX_BYTES);
      contentHash = sha256Hex(inlineText);
      byteLength = Buffer.byteLength(inlineText, "utf8");
      stagedRelativePath = chainArtifactStagedRelativePath(
        state.chainId,
        key,
        contentHash,
        extForKind(kind),
      );
    } else if (kind === "structured") {
      inlineText = JSON.stringify(art.data ?? {});
      if (inlineText.length > CHAIN_ARTIFACT_MAX_BYTES) {
        inlineText = inlineText.slice(0, CHAIN_ARTIFACT_MAX_BYTES);
      }
      contentHash = sha256Hex(inlineText);
      byteLength = Buffer.byteLength(inlineText, "utf8");
      stagedRelativePath = chainArtifactStagedRelativePath(
        state.chainId,
        key,
        contentHash,
        extForKind(kind),
      );
    } else if (kind === "file") {
      contentHash =
        typeof art.contentHash === "string" && art.contentHash.length > 0
          ? art.contentHash
          : sha256Hex(art.vaultPath ?? key);
      byteLength = typeof art.sizeBytes === "number" ? art.sizeBytes : undefined;
      stagedRelativePath =
        typeof art.vaultPath === "string" && art.vaultPath.length > 0
          ? art.vaultPath.replace(/^[\\/]+/, "")
          : chainArtifactStagedRelativePath(state.chainId, key, contentHash, "bin");
      if (!chainArtifactPathWithinJobWorkspace(state.chainId, stagedRelativePath)) {
        // Refuse arbitrary vault paths for intermediate staging (not vault mirror).
        continue;
      }
    } else {
      continue;
    }

    if (!chainArtifactPathWithinJobWorkspace(state.chainId, stagedRelativePath)) {
      continue;
    }

    const existingIdx = ledger.findIndex(
      (r) =>
        r.sourceSubtaskId === sourceSubtaskId &&
        r.artifactKey === key &&
        !r.workerPeerId,
    );
    const row: ChainArtifactDeliveryRecord = {
      chainId: state.chainId,
      artifactKey: key,
      contentHash,
      sourceSubtaskId,
      kind,
      stagedRelativePath,
      phase: "verified",
      byteLength,
      inlineText,
      updatedAt,
    };
    if (existingIdx >= 0) ledger[existingIdx] = row;
    else ledger.push(row);
    out.push(row);
  }
  return out;
}

export function registerArtifactsFromFinalPartial(
  state: ChainState,
  partial: TaskChainPartialPayload["partial"],
  now = new Date(),
): ChainArtifactDeliveryRecord[] {
  return registerParentArtifacts(
    state,
    partial.subtaskId,
    namedArtifactsFromPartial(partial),
    now,
  );
}

/** Write staged text/structured blobs into the Assigner vault `out/` tree. */
export async function persistStagedArtifactsToVault(opts: {
  vaultDir: string;
  records: readonly ChainArtifactDeliveryRecord[];
}): Promise<void> {
  for (const row of opts.records) {
    if (!row.inlineText) continue;
    if (!chainArtifactPathWithinJobWorkspace(row.chainId, row.stagedRelativePath)) continue;
    if (!isSafeVaultPath(opts.vaultDir, row.stagedRelativePath)) continue;
    const abs = join(opts.vaultDir, row.stagedRelativePath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, row.inlineText, { encoding: "utf8", mode: 0o600 });
  }
}

/**
 * Parent artifact rows that a child subtask depends on (via dependsOn).
 */
export function parentArtifactRowsForSubtask(
  state: ChainState,
  subtaskId: string,
): ChainArtifactDeliveryRecord[] {
  const sub = state.subtasks.get(subtaskId);
  if (!sub?.dependsOn?.length) return [];
  const ledger = state.artifactDeliveries ?? [];
  const parents = new Set(sub.dependsOn);
  return ledger.filter((r) => parents.has(r.sourceSubtaskId) && !r.workerPeerId);
}

/**
 * Deliver staged intermediate blobs to a child worker (voucher / local copy).
 */
export async function deliverIntermediateArtifactsOnAward(opts: {
  state: ChainState;
  subtaskId: string;
  workerPeerId: string;
  orchestratorPeerId: string;
  vaultDir?: string;
  transportPeerId?: string;
  pushFile?: ChainInputPushFile;
  copyLocal?: (args: {
    sourceRelativePath: string;
    deliveredRelativePath: string;
  }) => Promise<{ contentHash: string }>;
  now?: () => Date;
  onUpdate?: () => void;
}): Promise<ChainArtifactDeliveryRecord[]> {
  const {
    state,
    subtaskId,
    workerPeerId,
    orchestratorPeerId,
    vaultDir,
    transportPeerId,
    pushFile,
    copyLocal,
    onUpdate,
  } = opts;
  const now = opts.now ?? (() => new Date());
  const parents = parentArtifactRowsForSubtask(state, subtaskId);
  if (parents.length === 0) return [];

  if (vaultDir) {
    await persistStagedArtifactsToVault({ vaultDir, records: parents });
  }

  const ledger = ensureArtifactLedger(state);
  const isSelf = workerPeerId === orchestratorPeerId;
  const results: ChainArtifactDeliveryRecord[] = [];

  for (const parent of parents) {
    const existing = ledger.find(
      (r) =>
        r.workerPeerId === workerPeerId &&
        r.sourceSubtaskId === parent.sourceSubtaskId &&
        r.artifactKey === parent.artifactKey &&
        r.phase === "verified" &&
        r.deliveredRelativePath,
    );
    if (existing) {
      results.push(existing);
      continue;
    }

    const deliveredRelativePath = chainArtifactDeliveredRelativePath(
      state.chainId,
      parent.artifactKey,
      parent.contentHash,
      extForKind(parent.kind),
    );
    const base: ChainArtifactDeliveryRecord = {
      ...parent,
      workerPeerId,
      deliveredRelativePath,
      phase: "pending",
      updatedAt: now().toISOString(),
    };
    // Drop staging-only inline from worker row to keep ledger lean (parent row keeps it).
    delete (base as { inlineText?: string }).inlineText;
    ledger.push(base);
    onUpdate?.();

    try {
      if (isSelf) {
        if (copyLocal && (parent.inlineText || parent.kind === "file")) {
          base.phase = "transferring";
          base.updatedAt = now().toISOString();
          onUpdate?.();
          await copyLocal({
            sourceRelativePath: parent.stagedRelativePath,
            deliveredRelativePath,
          });
          base.phase = "verified";
          base.contentHash = parent.contentHash;
          base.updatedAt = now().toISOString();
        } else {
          base.phase = "verified";
          base.deliveredRelativePath = parent.stagedRelativePath;
          base.contentHash = parent.contentHash;
          base.updatedAt = now().toISOString();
        }
      } else {
        if (!pushFile || !transportPeerId) {
          throw new Error(pushFile ? "no_transport_peer" : "push_unavailable");
        }
        if (!parent.inlineText && parent.kind !== "file") {
          throw new Error("no_staged_bytes");
        }
        base.phase = "transferring";
        base.updatedAt = now().toISOString();
        onUpdate?.();
        const expiresAt = new Date(now().getTime() + CHAIN_INPUT_VOUCHER_TTL_MS).toISOString();
        const pushed = await pushFile({
          sourceRelativePath: parent.stagedRelativePath,
          voucherRelativePath: deliveredRelativePath,
          toPeerId: transportPeerId,
          chainId: state.chainId,
          expiresAt,
        });
        base.phase = "verified";
        base.contentHash = parent.contentHash || pushed.contentHash;
        base.transferId = pushed.transferId;
        base.updatedAt = now().toISOString();
      }
    } catch (err) {
      base.phase = "failed";
      base.error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      base.updatedAt = now().toISOString();
    }
    onUpdate?.();
    results.push(base);
  }
  return results;
}

export function intermediateArtifactsReadyForAward(
  state: ChainState,
  subtaskId: string,
  workerPeerId: string,
): { ok: true } | { ok: false; reason: "artifact_delivery_pending" | "artifact_delivery_failed" } {
  const parents = parentArtifactRowsForSubtask(state, subtaskId);
  if (parents.length === 0) return { ok: true };

  const ledger = state.artifactDeliveries ?? [];
  for (const parent of parents) {
    const workerRow = ledger.find(
      (r) =>
        r.workerPeerId === workerPeerId &&
        r.sourceSubtaskId === parent.sourceSubtaskId &&
        r.artifactKey === parent.artifactKey,
    );
    if (workerRow?.phase === "verified") continue;
    if (workerRow?.phase === "failed") {
      // Text/structured still ride Phase 53 inline packs on propose/accept.
      if (parent.inlineText && parent.kind !== "file") continue;
      return { ok: false, reason: "artifact_delivery_failed" };
    }
    if (!workerRow) {
      // Pending: allow inline text/structured; require delivery for file refs.
      if (parent.inlineText && parent.kind !== "file") continue;
      if (parent.kind === "file") {
        return { ok: false, reason: "artifact_delivery_pending" };
      }
      continue;
    }
    if (workerRow.phase !== "verified") {
      if (parent.inlineText && parent.kind !== "file") continue;
      return { ok: false, reason: "artifact_delivery_pending" };
    }
  }
  return { ok: true };
}

/**
 * File-shaped NamedArtifacts for a child worker after intermediate delivery.
 * Prefer worker-local delivered paths; fall back to staged path on self.
 */
export function buildIntermediateFileArtifacts(
  state: ChainState,
  subtaskId: string,
  workerPeerId: string,
): NamedArtifact[] {
  const parents = parentArtifactRowsForSubtask(state, subtaskId);
  if (parents.length === 0) return [];
  const ledger = state.artifactDeliveries ?? [];
  const out: NamedArtifact[] = [];
  for (const parent of parents) {
    const workerRow = ledger.find(
      (r) =>
        r.workerPeerId === workerPeerId &&
        r.sourceSubtaskId === parent.sourceSubtaskId &&
        r.artifactKey === parent.artifactKey &&
        r.phase === "verified",
    );
    const path = workerRow?.deliveredRelativePath;
    if (!path) continue;
    out.push({
      key: parent.artifactKey,
      artifact: {
        kind: "file",
        vaultPath: path,
        contentHash: workerRow?.contentHash ?? parent.contentHash,
        displayName: parent.artifactKey,
        ...(typeof parent.byteLength === "number" ? { sizeBytes: parent.byteLength } : {}),
      },
    });
  }
  return out;
}

/** Prefer delivered file refs over inline parent text when keys collide. */
export function preferDeliveredFileArtifacts(
  parent: NamedArtifact[] | undefined,
  delivered: NamedArtifact[],
): NamedArtifact[] | undefined {
  if ((!parent || parent.length === 0) && delivered.length === 0) return undefined;
  if (delivered.length === 0) return parent;
  const byKey = new Map(delivered.map((d) => [d.key, d]));
  const out: NamedArtifact[] = [];
  for (const p of parent ?? []) {
    out.push(byKey.get(p.key) ?? p);
    byKey.delete(p.key);
  }
  for (const d of byKey.values()) out.push(d);
  return out.slice(0, 16);
}

/** Soft provenance graph: parent produce keys → child expects / dependsOn. */
export function buildArtifactGraph(state: ChainState): ChainArtifactGraph {
  const nodes: ChainArtifactGraph["nodes"] = [];
  const edges: ChainArtifactGraph["edges"] = [];
  const seen = new Set<string>();

  for (const row of state.artifactDeliveries ?? []) {
    if (row.workerPeerId) continue;
    const id = `${row.sourceSubtaskId}:${row.artifactKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({
      id,
      subtaskId: row.sourceSubtaskId,
      artifactKey: row.artifactKey,
      contentHash: row.contentHash,
      kind: row.kind,
    });
  }

  for (const sub of state.subtasks.values()) {
    for (const dep of sub.dependsOn ?? []) {
      const parentRows = (state.artifactDeliveries ?? []).filter(
        (r) => r.sourceSubtaskId === dep && !r.workerPeerId,
      );
      for (const parent of parentRows) {
        const from = `${parent.sourceSubtaskId}:${parent.artifactKey}`;
        const expectKeys = (sub.expects ?? []).map((e) => e.key);
        const key =
          expectKeys.find((k) => k === parent.artifactKey) ?? parent.artifactKey;
        const to = `${sub.subtaskId}:${key}`;
        if (!seen.has(to)) {
          seen.add(to);
          nodes.push({
            id: to,
            subtaskId: sub.subtaskId,
            artifactKey: key,
          });
        }
        edges.push({ from, to, key });
      }
      if (parentRows.length === 0) {
        const from = `${dep}:*`;
        const to = `${sub.subtaskId}:*`;
        if (!seen.has(from)) {
          seen.add(from);
          nodes.push({ id: from, subtaskId: dep, artifactKey: "*" });
        }
        if (!seen.has(to)) {
          seen.add(to);
          nodes.push({ id: to, subtaskId: sub.subtaskId, artifactKey: "*" });
        }
        edges.push({ from, to });
      }
    }
  }

  return { nodes, edges };
}
