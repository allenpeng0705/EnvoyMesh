import {
  evaluateAutoReplyLimit,
  markAutoReplyPaused,
  normalizeAutoReplyLimits,
  recordAutoReplySent,
  shouldEnforceAutoReplyLimits,
  type AutoReplyLimitDecision,
  type AutoReplyLimits,
  type AutoReplyPausedNotification,
  type ContactAutoReplyLimitState,
  type InboundChatSenderRole,
} from "@envoymesh/api";

export class MobileAutoReplyLimitStore {
  private readonly contacts = new Map<string, ContactAutoReplyLimitState>();

  async get(contactOwnerId: string): Promise<ContactAutoReplyLimitState | undefined> {
    return this.contacts.get(contactOwnerId);
  }

  async set(contactOwnerId: string, state: ContactAutoReplyLimitState): Promise<void> {
    this.contacts.set(contactOwnerId, state);
  }
}

export async function checkMobileAutoReplyAllowed(input: {
  store: MobileAutoReplyLimitStore;
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

export async function applyMobileAutoReplyLimitDenied(input: {
  store: MobileAutoReplyLimitStore;
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

export async function recordMobileAutoReplyAfterSend(input: {
  store: MobileAutoReplyLimitStore;
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
