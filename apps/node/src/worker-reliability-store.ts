/**
 * Phase 60C — local calibrated reliability observations (Beta posterior).
 *
 * Design: docs/agent-network-next-generation-design.md §8
 * Keyed by (workerPeerId, runtime, modelFamily, skillId, connectivityClass).
 * Existing 3-tuple reputation remains the compatibility projection.
 */

export type ReliabilityConnectivityClass =
  | "self"
  | "lan_direct"
  | "wan_direct"
  | "relay";

export type ReliabilityQualityOutcome =
  | "pass"
  | "partial"
  | "fail"
  | "disputed"
  | "timeout"
  | "cancel"
  | "censored";

export type ReliabilityObservation = {
  workerPeerId: string;
  runtime: string;
  modelFamily: string;
  skillId: string;
  connectivityClass: ReliabilityConnectivityClass;
  quality: ReliabilityQualityOutcome;
  /** 0..1 quality score when available (pass/partial). */
  score?: number;
  /** Award→final latency in ms when known. */
  latencyMs?: number;
  /** Observation weight (verifier independence may raise this). */
  sourceWeight?: number;
  at: string;
  /** When true, do not count as a worker quality failure (owner/network). */
  censored?: boolean;
};

export type ReliabilityProjection = {
  key: string;
  alpha: number;
  beta: number;
  mean: number;
  /** Conservative lower bound used by highest-confidence. */
  lowerBound: number;
  sampleCount: number;
  effectiveWeight: number;
  latencyEwmaMs?: number;
  lastObservedAt?: string;
  /** Which hierarchy level produced this projection. */
  fallbackLevel:
    | "exact"
    | "peer_runtime_skill"
    | "peer_runtime"
    | "runtime_skill"
    | "prior";
};

type Bucket = {
  alpha: number;
  beta: number;
  effectiveWeight: number;
  sampleCount: number;
  latencyEwmaMs?: number;
  lastObservedAt?: string;
};

const PRIOR_ALPHA = 2;
const PRIOR_BETA = 2;
const LATENCY_EWMA = 0.3;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function exactKey(o: {
  workerPeerId: string;
  runtime: string;
  modelFamily: string;
  skillId: string;
  connectivityClass: ReliabilityConnectivityClass;
}): string {
  return [
    o.workerPeerId,
    o.runtime,
    o.modelFamily,
    o.skillId,
    o.connectivityClass,
  ].join("|");
}

function peerRuntimeSkillKey(o: {
  workerPeerId: string;
  runtime: string;
  skillId: string;
}): string {
  return `${o.workerPeerId}|${o.runtime}|*|${o.skillId}|*`;
}

function peerRuntimeKey(o: { workerPeerId: string; runtime: string }): string {
  return `${o.workerPeerId}|${o.runtime}|*|*|*`;
}

function runtimeSkillKey(o: { runtime: string; skillId: string }): string {
  return `*|${o.runtime}|*|${o.skillId}|*`;
}

function betaMean(alpha: number, beta: number): number {
  return alpha / (alpha + beta);
}

/** Approximate one-sided lower confidence bound (Jeffreys-style). */
function betaLowerBound(alpha: number, beta: number): number {
  const mean = betaMean(alpha, beta);
  const n = alpha + beta;
  const variance = (alpha * beta) / (n * n * (n + 1));
  return clamp01(mean - 1.64 * Math.sqrt(Math.max(0, variance)));
}

function emptyBucket(): Bucket {
  return {
    alpha: PRIOR_ALPHA,
    beta: PRIOR_BETA,
    effectiveWeight: 0,
    sampleCount: 0,
  };
}

function applyObservation(bucket: Bucket, obs: ReliabilityObservation): void {
  if (obs.censored || obs.quality === "censored" || obs.quality === "cancel") {
    // Owner/network cancellations must not count as worker failures.
    bucket.lastObservedAt = obs.at;
    return;
  }
  const weight = obs.sourceWeight && obs.sourceWeight > 0 ? obs.sourceWeight : 1;
  const score = clamp01(obs.score ?? 1);
  if (obs.quality === "pass") {
    bucket.alpha += weight * score;
  } else if (obs.quality === "partial") {
    bucket.alpha += weight * 0.5 * score;
  } else if (obs.quality === "fail" || obs.quality === "disputed") {
    bucket.beta += weight;
  } else if (obs.quality === "timeout") {
    bucket.beta += weight * 0.75;
  }
  bucket.effectiveWeight += weight;
  bucket.sampleCount += 1;
  bucket.lastObservedAt = obs.at;
  if (typeof obs.latencyMs === "number" && obs.latencyMs >= 0) {
    bucket.latencyEwmaMs =
      bucket.latencyEwmaMs === undefined
        ? obs.latencyMs
        : LATENCY_EWMA * obs.latencyMs + (1 - LATENCY_EWMA) * bucket.latencyEwmaMs;
  }
}

function project(bucket: Bucket, key: string, fallbackLevel: ReliabilityProjection["fallbackLevel"]): ReliabilityProjection {
  return {
    key,
    alpha: bucket.alpha,
    beta: bucket.beta,
    mean: betaMean(bucket.alpha, bucket.beta),
    lowerBound: betaLowerBound(bucket.alpha, bucket.beta),
    sampleCount: bucket.sampleCount,
    effectiveWeight: bucket.effectiveWeight,
    ...(bucket.latencyEwmaMs !== undefined ? { latencyEwmaMs: bucket.latencyEwmaMs } : {}),
    ...(bucket.lastObservedAt ? { lastObservedAt: bucket.lastObservedAt } : {}),
    fallbackLevel,
  };
}

/**
 * In-memory reliability ledger. Persistence can be added later without
 * changing the observation/projection API.
 */
export class WorkerReliabilityStore {
  private readonly buckets = new Map<string, Bucket>();

  clear(): void {
    this.buckets.clear();
  }

  size(): number {
    return this.buckets.size;
  }

  record(observation: ReliabilityObservation): void {
    const keys = [
      exactKey(observation),
      peerRuntimeSkillKey(observation),
      peerRuntimeKey(observation),
      runtimeSkillKey(observation),
    ];
    for (const key of keys) {
      const bucket = this.buckets.get(key) ?? emptyBucket();
      applyObservation(bucket, observation);
      this.buckets.set(key, bucket);
    }
  }

  /**
   * Hierarchical sparse-data fallback. Never invents precision: fallbackLevel
   * tells callers how coarse the estimate is.
   */
  project(input: {
    workerPeerId: string;
    runtime: string;
    modelFamily: string;
    skillId: string;
    connectivityClass: ReliabilityConnectivityClass;
  }): ReliabilityProjection {
    const exact = this.buckets.get(exactKey(input));
    if (exact && exact.sampleCount > 0) {
      return project(exact, exactKey(input), "exact");
    }
    const prs = this.buckets.get(peerRuntimeSkillKey(input));
    if (prs && prs.sampleCount > 0) {
      return project(prs, peerRuntimeSkillKey(input), "peer_runtime_skill");
    }
    const pr = this.buckets.get(peerRuntimeKey(input));
    if (pr && pr.sampleCount > 0) {
      return project(pr, peerRuntimeKey(input), "peer_runtime");
    }
    const rs = this.buckets.get(runtimeSkillKey(input));
    if (rs && rs.sampleCount > 0) {
      return project(rs, runtimeSkillKey(input), "runtime_skill");
    }
    return project(emptyBucket(), "prior", "prior");
  }

  /** Compatibility projection: single [0,1] mean for (peer, runtime, skill). */
  compatibilityScore(input: {
    workerPeerId: string;
    runtime: string;
    skillId: string;
  }): number {
    return this.project({
      ...input,
      modelFamily: "*",
      connectivityClass: "wan_direct",
    }).mean;
  }
}
