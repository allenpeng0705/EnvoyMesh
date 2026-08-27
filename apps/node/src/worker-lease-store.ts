/**
 * Phase 60B — bounded in-memory worker lease store (availability source of truth).
 *
 * Design: docs/agent-network-next-generation-design.md §4
 * Do not merge into capability-index.json — membership stays on the card index;
 * this store owns live readiness only.
 */

import type { AgentWorkerLeasePayload } from "@envoymesh/protocol";

/** Default advertised lease TTL. */
export const WORKER_LEASE_DEFAULT_TTL_MS = 30_000;
/** Refresh cadence before TTL (jitter applied by the publisher). */
export const WORKER_LEASE_REFRESH_MS = 10_000;
/** Receivers reject leases that claim a longer lifetime. */
export const WORKER_LEASE_MAX_TTL_MS = 120_000;
/** Accept slightly skewed clocks; never extend expiresAt locally. */
export const WORKER_LEASE_CLOCK_SKEW_MS = 10_000;
/** Ranking penalty when readiness comes from a legacy ready-probe (not a lease). */
export const LEGACY_PROBE_SCORE_PENALTY = 15;

export type WorkerAvailability =
  | { state: "ready"; source: "lease"; leaseId: string; expiresAt: string }
  | { state: "legacy_ready"; source: "legacy_probe"; checkedAt: string }
  | { state: "busy"; retryAfterMs?: number }
  | { state: "expired" | "revoked" | "engine_down" | "unreachable" | "unknown" };

export type AcceptWorkerLeaseResult =
  | { ok: true; replaced: boolean }
  | { ok: false; reason: string };

export type RevokeWorkerLeaseResult =
  | { ok: true; cleared: boolean }
  | { ok: false; reason: string };

type StoredLease = {
  lease: AgentWorkerLeasePayload;
  /** Wall time when we accepted the lease (for LRU eviction). */
  acceptedAtMs: number;
  revoked: boolean;
};

/**
 * Deterministic ±10% refresh jitter from peer id (stable across restarts).
 */
export function leaseRefreshIntervalMs(
  peerId: string,
  baseMs = WORKER_LEASE_REFRESH_MS,
): number {
  let h = 2166136261;
  for (let i = 0; i < peerId.length; i++) {
    h ^= peerId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const jitterPct = ((h >>> 0) % 21) - 10; // -10 .. +10
  return Math.max(1_000, Math.round(baseMs * (1 + jitterPct / 100)));
}

function parseIsoMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export class WorkerLeaseStore {
  private readonly byWorker = new Map<string, StoredLease>();
  /** Recent (worker, sequence, nonce) keys to reject exact replays. */
  private readonly replayKeys = new Map<string, number>();

  constructor(private readonly maxWorkers = 256) {}

  size(): number {
    return this.byWorker.size;
  }

  clear(): void {
    this.byWorker.clear();
    this.replayKeys.clear();
  }

  getLease(workerPeerId: string): AgentWorkerLeasePayload | undefined {
    const row = this.byWorker.get(workerPeerId);
    if (!row || row.revoked) return undefined;
    return row.lease;
  }

  /**
   * Live availability for award eligibility. Expired/revoked leases stop new
   * awards; they do not cancel in-flight work.
   */
  getAvailability(workerPeerId: string, now = new Date()): WorkerAvailability {
    const row = this.byWorker.get(workerPeerId);
    if (!row) return { state: "unknown" };
    if (row.revoked) return { state: "revoked" };
    const expiresAtMs = parseIsoMs(row.lease.expiresAt);
    if (expiresAtMs === undefined) return { state: "expired" };
    if (now.getTime() > expiresAtMs + WORKER_LEASE_CLOCK_SKEW_MS) {
      return { state: "expired" };
    }
    const readyRuntime = row.lease.runtimes.some((rt) => rt.ready && rt.capacity.availableSlots > 0);
    if (!readyRuntime) {
      return { state: "busy" };
    }
    return {
      state: "ready",
      source: "lease",
      leaseId: row.lease.leaseId,
      expiresAt: row.lease.expiresAt,
    };
  }

  accept(
    lease: AgentWorkerLeasePayload,
    opts?: {
      now?: Date;
      /** Envelope sender must equal lease.workerPeerId (caller enforces). */
      maxWorkers?: number;
    },
  ): AcceptWorkerLeaseResult {
    const now = opts?.now ?? new Date();
    const nowMs = now.getTime();
    const issuedAtMs = parseIsoMs(lease.issuedAt);
    const notBeforeMs = parseIsoMs(lease.notBefore);
    const expiresAtMs = parseIsoMs(lease.expiresAt);
    if (
      issuedAtMs === undefined ||
      notBeforeMs === undefined ||
      expiresAtMs === undefined
    ) {
      return { ok: false, reason: "invalid_timestamps" };
    }
    if (expiresAtMs < issuedAtMs || expiresAtMs < notBeforeMs) {
      return { ok: false, reason: "expires_before_start" };
    }
    const ttlMs = expiresAtMs - issuedAtMs;
    if (ttlMs > WORKER_LEASE_MAX_TTL_MS) {
      return { ok: false, reason: "ttl_too_long" };
    }
    // Reject leases issued too far in the future (beyond skew).
    if (issuedAtMs > nowMs + WORKER_LEASE_CLOCK_SKEW_MS) {
      return { ok: false, reason: "issued_in_future" };
    }
    // Not yet valid (beyond skew).
    if (notBeforeMs > nowMs + WORKER_LEASE_CLOCK_SKEW_MS) {
      return { ok: false, reason: "not_yet_valid" };
    }
    // Already expired (with skew allowance).
    if (nowMs > expiresAtMs + WORKER_LEASE_CLOCK_SKEW_MS) {
      return { ok: false, reason: "already_expired" };
    }

    const replayKey = `${lease.workerPeerId}:${lease.sequence}:${lease.nonce}`;
    this.pruneReplay(nowMs);
    if (this.replayKeys.has(replayKey)) {
      return { ok: false, reason: "replay" };
    }

    const existing = this.byWorker.get(lease.workerPeerId);
    // Higher sequence always wins — including after a revoke, so a delayed
    // stale lease cannot resurrect a revoked worker.
    if (existing && lease.sequence < existing.lease.sequence) {
      return { ok: false, reason: "stale_sequence" };
    }
    if (existing && !existing.revoked && lease.sequence === existing.lease.sequence) {
      return { ok: false, reason: "duplicate_sequence" };
    }
    if (existing?.revoked && lease.sequence === existing.lease.sequence) {
      return { ok: false, reason: "revoked_sequence" };
    }

    const maxWorkers = opts?.maxWorkers ?? this.maxWorkers;
    this.evictIfNeeded(maxWorkers, lease.workerPeerId, nowMs);

    this.byWorker.set(lease.workerPeerId, {
      lease,
      acceptedAtMs: nowMs,
      revoked: false,
    });
    this.replayKeys.set(replayKey, nowMs + WORKER_LEASE_MAX_TTL_MS + WORKER_LEASE_CLOCK_SKEW_MS);
    return { ok: true, replaced: Boolean(existing) };
  }

  revoke(input: {
    workerPeerId: string;
    leaseId: string;
    sequence: number;
  }): RevokeWorkerLeaseResult {
    const existing = this.byWorker.get(input.workerPeerId);
    if (!existing) return { ok: true, cleared: false };
    if (existing.lease.leaseId !== input.leaseId) {
      return { ok: false, reason: "lease_id_mismatch" };
    }
    if (input.sequence < existing.lease.sequence) {
      return { ok: false, reason: "stale_sequence" };
    }
    existing.revoked = true;
    return { ok: true, cleared: true };
  }

  /** Drop expired/revoked entries; returns how many were removed. */
  prune(now = new Date()): number {
    const nowMs = now.getTime();
    let removed = 0;
    for (const [peerId, row] of this.byWorker) {
      const expiresAtMs = parseIsoMs(row.lease.expiresAt);
      const dead =
        row.revoked ||
        expiresAtMs === undefined ||
        nowMs > expiresAtMs + WORKER_LEASE_CLOCK_SKEW_MS;
      if (dead) {
        this.byWorker.delete(peerId);
        removed += 1;
      }
    }
    this.pruneReplay(nowMs);
    return removed;
  }

  private pruneReplay(nowMs: number): void {
    for (const [key, until] of this.replayKeys) {
      if (until <= nowMs) this.replayKeys.delete(key);
    }
  }

  private evictIfNeeded(
    maxWorkers: number,
    keepPeerId: string,
    nowMs: number,
  ): void {
    if (this.byWorker.size < maxWorkers) return;
    if (this.byWorker.has(keepPeerId) && this.byWorker.size <= maxWorkers) return;
    // Prefer dropping expired/revoked first.
    this.prune(new Date(nowMs));
    if (this.byWorker.size < maxWorkers) return;
    // Then LRU by acceptedAtMs (oldest first), skipping the worker we are writing.
    const victims = [...this.byWorker.entries()]
      .filter(([peerId]) => peerId !== keepPeerId)
      .sort((a, b) => a[1].acceptedAtMs - b[1].acceptedAtMs);
    while (this.byWorker.size >= maxWorkers && victims.length > 0) {
      const next = victims.shift();
      if (!next) break;
      this.byWorker.delete(next[0]);
    }
  }
}

/** Convenience: build a legacy_ready availability from a probe cache hit. */
export function legacyProbeAvailability(checkedAtMs: number): WorkerAvailability {
  return {
    state: "legacy_ready",
    source: "legacy_probe",
    checkedAt: new Date(checkedAtMs).toISOString(),
  };
}
