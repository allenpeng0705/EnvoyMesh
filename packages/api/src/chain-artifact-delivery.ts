/**
 * Phase 65C — intermediate Team-job artifact delivery types + path helpers.
 *
 * Worker → Assigner staging (`out/`) → next-worker delivery (`in/`).
 * Reuses Phase 59 voucher TTL / phase vocabulary; not vault mirror.
 */

import {
  chainInputJobWorkspaceDir,
  sanitizeChainInputFileName,
  type ChainInputDeliveryPhase,
} from "./chain-input-delivery.js";

/** Soft cap for staged intermediate blobs (matches composer job-input cap). */
export const CHAIN_ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;

/** Max intermediate artifacts registered per parent final. */
export const CHAIN_ARTIFACT_MAX_PER_PARTIAL = 8;

export type ChainArtifactKind = "text" | "file" | "structured";

/**
 * One staged intermediate artifact (Assigner ledger) and optional per-worker
 * delivery progress toward a child step.
 */
export interface ChainArtifactDeliveryRecord {
  chainId: string;
  /** Soft key from `namedArtifacts` / produces. */
  artifactKey: string;
  contentHash: string;
  sourceSubtaskId: string;
  kind: ChainArtifactKind;
  /** Assigner-local path under `imports/team-jobs/<chainId>/out/…`. */
  stagedRelativePath: string;
  /** Present once delivery to a specific child worker is tracked. */
  workerPeerId?: string;
  deliveredRelativePath?: string;
  phase: ChainInputDeliveryPhase;
  byteLength?: number;
  /** Inline text retained for same-process rewrite / small packs. */
  inlineText?: string;
  /** Set when a remote voucher push completed. */
  transferId?: string;
  error?: string;
  updatedAt: string;
}

export interface ChainArtifactGraphNode {
  id: string;
  subtaskId: string;
  artifactKey: string;
  contentHash?: string;
  kind?: ChainArtifactKind;
}

export interface ChainArtifactGraphEdge {
  from: string;
  to: string;
  /** Soft expect/produce key when known. */
  key?: string;
}

export interface ChainArtifactGraph {
  nodes: ChainArtifactGraphNode[];
  edges: ChainArtifactGraphEdge[];
}

/** `imports/team-jobs/<chainId>/out` */
export function chainArtifactWorkspaceOutDir(chainId: string): string {
  return `${chainInputJobWorkspaceDir(chainId)}/out`;
}

/** Assigner staging path for a content-addressed intermediate blob. */
export function chainArtifactStagedRelativePath(
  chainId: string,
  artifactKey: string,
  contentHash: string,
  ext = "bin",
): string {
  const key = sanitizeChainInputFileName(artifactKey || "artifact");
  const hash = (contentHash || "unknown").replace(/[^a-fA-F0-9]/g, "").slice(0, 32) || "unknown";
  const safeExt = (ext || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
  return `${chainArtifactWorkspaceOutDir(chainId)}/${key}_${hash}.${safeExt}`;
}

/** Child-worker local path after verified intermediate delivery. */
export function chainArtifactDeliveredRelativePath(
  chainId: string,
  artifactKey: string,
  contentHash: string,
  ext = "bin",
): string {
  const key = sanitizeChainInputFileName(artifactKey || "artifact");
  const hash = (contentHash || "unknown").replace(/[^a-fA-F0-9]/g, "").slice(0, 32) || "unknown";
  const safeExt = (ext || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
  return `${chainInputJobWorkspaceDir(chainId)}/in/${key}_${hash}.${safeExt}`;
}
