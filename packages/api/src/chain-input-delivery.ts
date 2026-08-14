/**
 * Phase 59A — Team job input delivery types + path / goal helpers.
 *
 * Bytes ship in 59B via existing Data Transfer Voucher + `/envoymesh/data/0.1.0`
 * (no new byte protocol; no `share.*` negotiation for job inputs).
 */

/** Soft cap so labels stay scannable in the goal text (mirrors Social composer). */
export const CHAIN_INPUT_ATTACHMENT_LABEL_MAX_CHARS = 40;

/** Max attachments per Team job (composer + delivery). */
export const CHAIN_INPUT_MAX_ATTACHMENTS = 8;

/** Per-file byte cap for job inputs (25 MiB; matches composer upload). */
export const CHAIN_INPUT_MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Suggested voucher TTL for job input pushes (award → deliver may lag).
 * Default share vouchers use 15m; job inputs use 60m and may re-issue on retry.
 */
export const CHAIN_INPUT_VOUCHER_TTL_MS = 60 * 60 * 1000;

export type ChainInputDeliveryPhase =
  | "pending"
  | "transferring"
  | "verified"
  | "failed";

/**
 * Attachment on the Assigner home (composer upload / goal Attachments block).
 * `sourceRelativePath` is the Assigner vault path before cross-home delivery.
 */
export interface ChainInputAttachment {
  sourceRelativePath: string;
  label?: string;
  fileName?: string;
  contentHash?: string;
  byteLength?: number;
  sensitivity?: "public" | "friends" | "private";
}

/** Per-(chain, worker, source path) delivery progress for assigner / observed UI. */
export interface ChainInputDeliveryRecord {
  chainId: string;
  workerPeerId: string;
  sourceRelativePath: string;
  /** Worker-local path after verified write. */
  deliveredRelativePath?: string;
  contentHash?: string;
  phase: ChainInputDeliveryPhase;
  error?: string;
  transferId?: string;
  updatedAt: string;
}

/** Job-level policy knobs (defaults locked in Phase 59A). */
export interface ChainInputDeliveryPolicy {
  /**
   * When true (default), push on award without an extra owner click.
   * Advanced UI may expose a per-job override later (59D).
   */
  autoDeliverOnAward: boolean;
  /**
   * `referenced` (default): deliver attachments whose `[label]` appears in the
   * awarded step's objective / expects; if none match, fall back to all job
   * attachments for that worker.
   * `all`: every job attachment to every awarded worker once.
   */
  scope: "referenced" | "all";
  /**
   * `on_terminal` (default): delete `imports/team-jobs/<chainId>/` when the
   * chain completes or is cancelled.
   * `retain_until_report_gc`: keep until report pin / report GC (59E).
   */
  gc: "on_terminal" | "retain_until_report_gc";
}

export const DEFAULT_CHAIN_INPUT_DELIVERY_POLICY: ChainInputDeliveryPolicy = {
  autoDeliverOnAward: true,
  scope: "referenced",
  gc: "on_terminal",
};

/**
 * Pending rows younger than this should not offer Retry — home may still be
 * flipping pending → transferring on the award path.
 */
export const CHAIN_INPUT_PENDING_RETRY_MIN_AGE_MS = 15_000;

/**
 * Whether assigner UI should show Retry for a delivery row.
 * Failed / transferring: always. Pending: only when `updatedAt` is old enough
 * (or missing `updatedAt` → false, to avoid racing a fresh award push).
 */
export function canRetryChainInputDelivery(
  phase: ChainInputDeliveryPhase | string,
  updatedAt: string | undefined | null,
  nowMs: number = Date.now(),
  pendingMinAgeMs: number = CHAIN_INPUT_PENDING_RETRY_MIN_AGE_MS,
): boolean {
  if (phase === "failed" || phase === "transferring") return true;
  if (phase !== "pending") return false;
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= pendingMinAgeMs;
}

/** Sanitize a file name segment for vault paths under the job workspace. */
export function sanitizeChainInputFileName(name: string): string {
  const base = name.replace(/^[\\/]+/, "").replace(/[\\/]/g, "_").trim();
  return base.length > 0 ? base : "file";
}

export function sanitizeChainInputLabel(
  raw: string | undefined | null,
): string | undefined {
  const cleaned = (raw ?? "")
    .replace(/[\r\n[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > CHAIN_INPUT_ATTACHMENT_LABEL_MAX_CHARS
    ? cleaned.slice(0, CHAIN_INPUT_ATTACHMENT_LABEL_MAX_CHARS).trim()
    : cleaned;
}

/**
 * Composer staging prefix (before `chainId` exists).
 * Example: `imports/team-jobs/tj_abc123`
 */
export function chainInputComposerStagingDir(composerBatchId: string): string {
  const id = composerBatchId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return `imports/team-jobs/${id || "batch"}`;
}

/**
 * Worker (and optional Assigner) job workspace inbound dir.
 * Example: `imports/team-jobs/chain_xyz/in`
 */
export function chainInputWorkspaceInDir(chainId: string): string {
  const id = chainId.trim() || "chain_unknown";
  return `imports/team-jobs/${id}/in`;
}

/**
 * Job-scoped workspace root (GC target on terminal).
 * Example: `imports/team-jobs/chain_xyz`
 */
export function chainInputJobWorkspaceDir(chainId: string): string {
  const id = chainId.trim() || "chain_unknown";
  return `imports/team-jobs/${id}`;
}

/** Full worker-local path for a delivered file. */
export function chainInputDeliveredRelativePath(
  chainId: string,
  fileName: string,
): string {
  return `${chainInputWorkspaceInDir(chainId)}/${sanitizeChainInputFileName(fileName)}`;
}

/**
 * Parse the `Attachments:` block from an effective Team job goal.
 * Supports `- [label] path` and unlabeled `- path` lines.
 */
export function parseChainInputAttachmentsFromGoal(
  goal: string,
): ChainInputAttachment[] {
  const text = goal ?? "";
  const marker = /\nAttachments:\s*\n/i.exec(text);
  if (!marker || marker.index === undefined) return [];
  const block = text.slice(marker.index + marker[0].length);
  const lines = block.split(/\r?\n/);
  const out: ChainInputAttachment[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Blank line ends the block (body may continue after).
      break;
    }
    if (!trimmed.startsWith("-")) break;
    const rest = trimmed.replace(/^-+\s*/, "");
    const labeled = /^\[([^\]]+)\]\s+(.+)$/.exec(rest);
    if (labeled) {
      const label = sanitizeChainInputLabel(labeled[1]);
      const sourceRelativePath = labeled[2].trim();
      if (!sourceRelativePath) continue;
      out.push({
        sourceRelativePath,
        label,
        fileName: basenameVaultPath(sourceRelativePath),
      });
    } else {
      const sourceRelativePath = rest.trim();
      if (!sourceRelativePath) continue;
      out.push({
        sourceRelativePath,
        fileName: basenameVaultPath(sourceRelativePath),
      });
    }
    if (out.length >= CHAIN_INPUT_MAX_ATTACHMENTS) break;
  }
  return out;
}

function basenameVaultPath(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  return sanitizeChainInputFileName(parts[parts.length - 1] || "file");
}

/**
 * Which attachments to push for an awarded step under the locked `referenced`
 * policy (with all-job fallback when the step references nothing).
 */
export function selectChainInputsForSubtask(opts: {
  attachments: readonly ChainInputAttachment[];
  /** Step objective / requestedResult text. */
  objective?: string;
  /** Expectation keys (often label-like). */
  expects?: readonly string[];
  scope?: ChainInputDeliveryPolicy["scope"];
}): ChainInputAttachment[] {
  const attachments = opts.attachments.filter((a) => a.sourceRelativePath.trim());
  if (attachments.length === 0) return [];
  if ((opts.scope ?? "referenced") === "all") return [...attachments];

  const haystack = [
    opts.objective ?? "",
    ...(opts.expects ?? []),
  ]
    .join("\n")
    .toLowerCase();

  const matched = attachments.filter((a) => {
    const label = a.label?.trim().toLowerCase();
    if (!label) return false;
    // Match [label] mention or bare label token.
    if (haystack.includes(`[${label}]`)) return true;
    return new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(label)}(?:[^a-z0-9_]|$)`).test(
      haystack,
    );
  });
  return matched.length > 0 ? matched : [...attachments];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
