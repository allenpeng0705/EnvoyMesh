import {
  evaluateAutoReplyLimit,
  markAutoReplyPaused,
  normalizeAutoReplyLimits,
  recordAutoReplySent,
  type AutoReplyLimitDecision,
  type AutoReplyLimits,
  type AutoReplyPausedNotification,
  type InboundChatSenderRole,
  shouldEnforceAutoReplyLimits,
} from "@envoymesh/api";
import type { AutoReplyLimitStore } from "@envoymesh/local-store";

export async function checkAutoReplyAllowed(input: {
  store: AutoReplyLimitStore;
  contactOwnerId: string;
  limits: AutoReplyLimits | undefined;
  inboundSenderRole?: InboundChatSenderRole;
  nowMs?: number;
}): Promise<AutoReplyLimitDecision> {
  const limits = normalizeAutoReplyLimits(input.limits);
  if (!shouldEnforceAutoReplyLimits(limits, input.inboundSenderRole)) {
    return { allowed: true, hourlyCount: 0, dailyCount: 0, limits };
  }
  const nowMs = input.nowMs ?? Date.now();
  const state = await input.store.get(input.contactOwnerId);
  return evaluateAutoReplyLimit(state, input.limits, nowMs);
}

export async function applyAutoReplyLimitDenied(input: {
  store: AutoReplyLimitStore;
  contactOwnerId: string;
  contactDisplayName: string;
  limits: AutoReplyLimits | undefined;
  decision: AutoReplyLimitDecision;
  nowMs?: number;
}): Promise<AutoReplyPausedNotification | null> {
  const { decision } = input;
  if (decision.allowed || !decision.reason) return null;

  const nowMs = input.nowMs ?? Date.now();
  const limits = decision.limits;
  let state = await input.store.get(input.contactOwnerId);
  if (limits.pauseThreadOnLimit) {
    state = markAutoReplyPaused(state, limits, decision.reason, nowMs);
    await input.store.set(input.contactOwnerId, state);
  }

  return {
    contactOwnerId: input.contactOwnerId,
    contactDisplayName: input.contactDisplayName,
    reason: decision.reason,
    hourlyCount: decision.hourlyCount,
    dailyCount: decision.dailyCount,
    maxPerContactPerHour: limits.maxPerContactPerHour,
    maxPerContactPerDay: limits.maxPerContactPerDay,
    pausedAt: new Date(nowMs).toISOString(),
  };
}

export async function recordAutoReplyAfterSend(input: {
  store: AutoReplyLimitStore;
  contactOwnerId: string;
  limits: AutoReplyLimits | undefined;
  inboundSenderRole?: InboundChatSenderRole;
  nowMs?: number;
}): Promise<void> {
  if (!shouldEnforceAutoReplyLimits(input.limits, input.inboundSenderRole)) return;
  const nowMs = input.nowMs ?? Date.now();
  const state = await input.store.get(input.contactOwnerId);
  const next = recordAutoReplySent(state, input.limits, nowMs);
  await input.store.set(input.contactOwnerId, next);
}
