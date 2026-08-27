/**
 * Phase 60D — bounded worker attempt-receipt store.
 *
 * Design: docs/agent-network-next-generation-design.md §9.1
 * Workers retain receipts for mandate lifetime + 24h (bounded by count).
 * Assigners query via `task.chain.reconcile.request`.
 */

import type {
  ChainReconcileAttemptReport,
  ChainReconcileAttemptState,
  TaskChainPartialPayload,
} from "@envoymesh/protocol";

/** Mandate lifetime floor + 24h grace (design §9.1). */
export const WORKER_ATTEMPT_RECEIPT_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
/** Hard cap so a busy worker cannot grow unbounded. */
export const WORKER_ATTEMPT_RECEIPT_MAX_ENTRIES = 512;

export type WorkerAttemptReceipt = {
  chainId: string;
  attemptId: string;
  subtaskId: string;
  state: ChainReconcileAttemptState;
  lastPartialSeq?: number;
  finalPartial?: TaskChainPartialPayload;
  artifactHashes?: string[];
  /** ISO — when the receipt was last updated. */
  updatedAt: string;
  /** Absolute expiry (ms since epoch). */
  expiresAtMs: number;
};

export type UpsertWorkerAttemptReceiptInput = {
  chainId: string;
  attemptId: string;
  subtaskId: string;
  state: ChainReconcileAttemptState;
  lastPartialSeq?: number;
  finalPartial?: TaskChainPartialPayload;
  artifactHashes?: string[];
  /** Mandate deadline ISO; receipt lives until deadline + 24h. */
  mandateExpiresAt?: string;
  now?: Date;
};

function receiptKey(chainId: string, attemptId: string): string {
  return `${chainId}\0${attemptId}`;
}

function resolveExpiryMs(mandateExpiresAt: string | undefined, nowMs: number): number {
  const mandateMs = mandateExpiresAt ? Date.parse(mandateExpiresAt) : Number.NaN;
  const base = Number.isFinite(mandateMs) ? mandateMs : nowMs;
  return base + WORKER_ATTEMPT_RECEIPT_DEFAULT_TTL_MS;
}

export class WorkerAttemptReceiptStore {
  private readonly byKey = new Map<string, WorkerAttemptReceipt>();

  constructor(private readonly maxEntries = WORKER_ATTEMPT_RECEIPT_MAX_ENTRIES) {}

  size(): number {
    return this.byKey.size;
  }

  clear(): void {
    this.byKey.clear();
  }

  get(chainId: string, attemptId: string): WorkerAttemptReceipt | undefined {
    return this.byKey.get(receiptKey(chainId, attemptId));
  }

  listForChain(chainId: string, now: Date = new Date()): WorkerAttemptReceipt[] {
    this.prune(now);
    const out: WorkerAttemptReceipt[] = [];
    for (const receipt of this.byKey.values()) {
      if (receipt.chainId === chainId) out.push(receipt);
    }
    return out;
  }

  upsert(input: UpsertWorkerAttemptReceiptInput): WorkerAttemptReceipt {
    const now = input.now ?? new Date();
    const key = receiptKey(input.chainId, input.attemptId);
    const existing = this.byKey.get(key);
    const next: WorkerAttemptReceipt = {
      chainId: input.chainId,
      attemptId: input.attemptId,
      subtaskId: input.subtaskId,
      state: input.state,
      updatedAt: now.toISOString(),
      expiresAtMs: resolveExpiryMs(input.mandateExpiresAt, now.getTime()),
      ...(typeof input.lastPartialSeq === "number"
        ? { lastPartialSeq: input.lastPartialSeq }
        : existing?.lastPartialSeq !== undefined
          ? { lastPartialSeq: existing.lastPartialSeq }
          : {}),
      ...(input.finalPartial
        ? { finalPartial: input.finalPartial }
        : existing?.finalPartial
          ? { finalPartial: existing.finalPartial }
          : {}),
      ...(input.artifactHashes
        ? { artifactHashes: input.artifactHashes }
        : existing?.artifactHashes
          ? { artifactHashes: existing.artifactHashes }
          : {}),
    };
    // Monotonic: never downgrade final → running/accepted.
    if (existing?.state === "final" && next.state !== "cancelled") {
      next.state = "final";
      if (existing.finalPartial && !input.finalPartial) {
        next.finalPartial = existing.finalPartial;
      }
    }
    if (
      typeof existing?.lastPartialSeq === "number" &&
      typeof next.lastPartialSeq === "number" &&
      next.lastPartialSeq < existing.lastPartialSeq
    ) {
      next.lastPartialSeq = existing.lastPartialSeq;
    }
    this.byKey.set(key, next);
    this.evictIfNeeded();
    return next;
  }

  /** Build reconcile attempt reports for the given known attempts (or all for chain). */
  buildReports(input: {
    chainId: string;
    knownAttempts?: Array<{ attemptId: string; subtaskId: string }>;
    now?: Date;
  }): ChainReconcileAttemptReport[] {
    const now = input.now ?? new Date();
    this.prune(now);
    const targets =
      input.knownAttempts && input.knownAttempts.length > 0
        ? input.knownAttempts
        : this.listForChain(input.chainId, now).map((r) => ({
            attemptId: r.attemptId,
            subtaskId: r.subtaskId,
          }));
    const reports: ChainReconcileAttemptReport[] = [];
    for (const target of targets) {
      const receipt = this.get(input.chainId, target.attemptId);
      if (!receipt) {
        reports.push({
          attemptId: target.attemptId,
          subtaskId: target.subtaskId,
          state: "unknown",
        });
        continue;
      }
      reports.push({
        attemptId: receipt.attemptId,
        subtaskId: receipt.subtaskId,
        state: receipt.state,
        ...(typeof receipt.lastPartialSeq === "number"
          ? { lastPartialSeq: receipt.lastPartialSeq }
          : {}),
        ...(receipt.finalPartial ? { finalPartial: receipt.finalPartial } : {}),
        ...(receipt.artifactHashes ? { artifactHashes: receipt.artifactHashes } : {}),
      });
    }
    return reports;
  }

  prune(now: Date = new Date()): number {
    const nowMs = now.getTime();
    let removed = 0;
    for (const [key, receipt] of this.byKey) {
      if (receipt.expiresAtMs <= nowMs) {
        this.byKey.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  private evictIfNeeded(): void {
    if (this.byKey.size <= this.maxEntries) return;
    const ranked = [...this.byKey.entries()].sort(
      (a, b) => a[1].expiresAtMs - b[1].expiresAtMs,
    );
    while (this.byKey.size > this.maxEntries && ranked.length > 0) {
      const [key] = ranked.shift()!;
      this.byKey.delete(key);
    }
  }
}
