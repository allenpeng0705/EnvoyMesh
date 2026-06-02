/** Per-contact auto-reply rate limits (Settings → AI). */
export interface AutoReplyLimits {
  /** When false, hourly/daily caps are not enforced. Default true. */
  enabled?: boolean;
  /** Max auto-sends per contact per rolling window. Default 5. Use 0 for unlimited. */
  maxPerContactPerHour?: number;
  /** Rolling window length in milliseconds. Default 1 hour. */
  windowMs?: number;
  /** Max auto-sends per contact per UTC calendar day. Default 20. Use 0 for unlimited. */
  maxPerContactPerDay?: number;
  /** When a cap is hit, block further auto-sends until the window/day resets. Default true. */
  pauseThreadOnLimit?: boolean;
  /** When true (default), caps apply only when the inbound message is from a verified peer agent. */
  onlyForAgentPeers?: boolean;
}

export const DEFAULT_AUTO_REPLY_LIMITS: Required<AutoReplyLimits> = {
  enabled: true,
  maxPerContactPerHour: 5,
  windowMs: 60 * 60 * 1000,
  maxPerContactPerDay: 20,
  pauseThreadOnLimit: true,
  onlyForAgentPeers: true,
};

export type AutoReplyLimitReason = "hourly_cap" | "daily_cap" | "thread_paused";

export interface ContactAutoReplyLimitState {
  /** ISO timestamps of auto-sends within the rolling window. */
  hourlySentAt: number[];
  /** UTC date key YYYY-MM-DD for daily counter. */
  dailyDateKey: string;
  dailyCount: number;
  /** Set when pauseThreadOnLimit and a cap was exceeded. */
  pausedReason?: AutoReplyLimitReason;
  pausedAt?: string;
}

export interface AutoReplyLimitDecision {
  allowed: boolean;
  reason?: AutoReplyLimitReason;
  hourlyCount: number;
  dailyCount: number;
  limits: Required<AutoReplyLimits>;
}

export const AUTO_REPLY_CAP_UNLIMITED = 0;

export function isAutoReplyCapUnlimited(cap: number): boolean {
  return cap <= AUTO_REPLY_CAP_UNLIMITED;
}

export function hasFiniteAutoReplyCaps(limits: Required<AutoReplyLimits>): boolean {
  return (
    !isAutoReplyCapUnlimited(limits.maxPerContactPerHour) ||
    !isAutoReplyCapUnlimited(limits.maxPerContactPerDay)
  );
}

export function normalizeAutoReplyLimits(
  limits: AutoReplyLimits | undefined,
): Required<AutoReplyLimits> {
  if (!limits) return { ...DEFAULT_AUTO_REPLY_LIMITS };
  return {
    enabled: limits.enabled ?? DEFAULT_AUTO_REPLY_LIMITS.enabled,
    maxPerContactPerHour:
      limits.maxPerContactPerHour !== undefined
        ? limits.maxPerContactPerHour
        : DEFAULT_AUTO_REPLY_LIMITS.maxPerContactPerHour,
    windowMs: limits.windowMs ?? DEFAULT_AUTO_REPLY_LIMITS.windowMs,
    maxPerContactPerDay:
      limits.maxPerContactPerDay !== undefined
        ? limits.maxPerContactPerDay
        : DEFAULT_AUTO_REPLY_LIMITS.maxPerContactPerDay,
    pauseThreadOnLimit:
      limits.pauseThreadOnLimit ?? DEFAULT_AUTO_REPLY_LIMITS.pauseThreadOnLimit,
    onlyForAgentPeers:
      limits.onlyForAgentPeers ?? DEFAULT_AUTO_REPLY_LIMITS.onlyForAgentPeers,
  };
}

export type InboundChatSenderRole = "human" | "agent" | "system";

/** True when hourly/daily caps should be evaluated for this inbound message. */
export function shouldEnforceAutoReplyLimits(
  limitsInput: AutoReplyLimits | undefined,
  inboundSenderRole: InboundChatSenderRole | undefined,
): boolean {
  const limits = normalizeAutoReplyLimits(limitsInput);
  if (!limits.enabled) return false;
  if (limits.onlyForAgentPeers && inboundSenderRole !== "agent") return false;
  if (!hasFiniteAutoReplyCaps(limits)) return false;
  return true;
}

export function utcDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function pruneContactAutoReplyState(
  state: ContactAutoReplyLimitState,
  limits: Required<AutoReplyLimits>,
  nowMs: number,
): ContactAutoReplyLimitState {
  const today = utcDateKey(nowMs);
  const windowStart = nowMs - limits.windowMs;
  const hourlySentAt = state.hourlySentAt.filter((t) => t >= windowStart);
  let dailyCount = state.dailyCount;
  let dailyDateKey = state.dailyDateKey;
  if (dailyDateKey !== today) {
    dailyDateKey = today;
    dailyCount = 0;
  }

  let pausedReason = state.pausedReason;
  let pausedAt = state.pausedAt;
  if (pausedReason === "hourly_cap") {
    const hourlyCap = limits.maxPerContactPerHour;
    if (
      isAutoReplyCapUnlimited(hourlyCap) ||
      hourlySentAt.length < hourlyCap
    ) {
      pausedReason = undefined;
      pausedAt = undefined;
    }
  }
  if (pausedReason === "daily_cap") {
    const dailyCap = limits.maxPerContactPerDay;
    if (isAutoReplyCapUnlimited(dailyCap) || dailyCount < dailyCap) {
      pausedReason = undefined;
      pausedAt = undefined;
    }
  }
  if (pausedReason === "thread_paused" && !limits.pauseThreadOnLimit) {
    pausedReason = undefined;
    pausedAt = undefined;
  }

  return {
    hourlySentAt,
    dailyDateKey,
    dailyCount,
    pausedReason,
    pausedAt,
  };
}

export function emptyContactAutoReplyState(nowMs: number): ContactAutoReplyLimitState {
  return {
    hourlySentAt: [],
    dailyDateKey: utcDateKey(nowMs),
    dailyCount: 0,
  };
}

export function evaluateAutoReplyLimit(
  rawState: ContactAutoReplyLimitState | undefined,
  limitsInput: AutoReplyLimits | undefined,
  nowMs: number,
): AutoReplyLimitDecision {
  const limits = normalizeAutoReplyLimits(limitsInput);
  if (!limits.enabled) {
    return { allowed: true, hourlyCount: 0, dailyCount: 0, limits };
  }

  const state = pruneContactAutoReplyState(
    rawState ?? emptyContactAutoReplyState(nowMs),
    limits,
    nowMs,
  );

  if (limits.pauseThreadOnLimit && state.pausedReason) {
    return {
      allowed: false,
      reason: state.pausedReason,
      hourlyCount: state.hourlySentAt.length,
      dailyCount: state.dailyCount,
      limits,
    };
  }

  if (
    !isAutoReplyCapUnlimited(limits.maxPerContactPerHour) &&
    state.hourlySentAt.length >= limits.maxPerContactPerHour
  ) {
    return {
      allowed: false,
      reason: "hourly_cap",
      hourlyCount: state.hourlySentAt.length,
      dailyCount: state.dailyCount,
      limits,
    };
  }

  if (
    !isAutoReplyCapUnlimited(limits.maxPerContactPerDay) &&
    state.dailyCount >= limits.maxPerContactPerDay
  ) {
    return {
      allowed: false,
      reason: "daily_cap",
      hourlyCount: state.hourlySentAt.length,
      dailyCount: state.dailyCount,
      limits,
    };
  }

  return {
    allowed: true,
    hourlyCount: state.hourlySentAt.length,
    dailyCount: state.dailyCount,
    limits,
  };
}

export function recordAutoReplySent(
  rawState: ContactAutoReplyLimitState | undefined,
  limitsInput: AutoReplyLimits | undefined,
  nowMs: number,
): ContactAutoReplyLimitState {
  const limits = normalizeAutoReplyLimits(limitsInput);
  const state = pruneContactAutoReplyState(
    rawState ?? emptyContactAutoReplyState(nowMs),
    limits,
    nowMs,
  );
  return {
    ...state,
    hourlySentAt: [...state.hourlySentAt, nowMs],
    dailyCount: state.dailyCount + 1,
    pausedReason: undefined,
    pausedAt: undefined,
  };
}

export function markAutoReplyPaused(
  rawState: ContactAutoReplyLimitState | undefined,
  limitsInput: AutoReplyLimits | undefined,
  reason: AutoReplyLimitReason,
  nowMs: number,
): ContactAutoReplyLimitState {
  const limits = normalizeAutoReplyLimits(limitsInput);
  const state = pruneContactAutoReplyState(
    rawState ?? emptyContactAutoReplyState(nowMs),
    limits,
    nowMs,
  );
  if (!limits.pauseThreadOnLimit) return state;
  return {
    ...state,
    pausedReason: reason,
    pausedAt: new Date(nowMs).toISOString(),
  };
}

export interface AutoReplyPausedNotification {
  contactOwnerId: string;
  contactDisplayName: string;
  reason: AutoReplyLimitReason;
  hourlyCount: number;
  dailyCount: number;
  maxPerContactPerHour: number;
  maxPerContactPerDay: number;
  pausedAt: string;
}
