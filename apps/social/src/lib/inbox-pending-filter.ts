import {
  ENVOY_AI_THREAD_KEY,
  OWNER_FAMILY_PROFILE_ID,
  isFamilyThreadKey,
  type ChatMessage,
} from "@envoymesh/api";

export interface InboxPendingFilterContext {
  selfOwnerId?: string;
  peerId?: string;
  bridgeAgentPeerId?: string;
  /** Active family profile ids on this home node (`owner`, `mom`, …). */
  familyProfileIds?: ReadonlySet<string>;
}

/** Mesh stranger / contact identity — never a family profile short id. */
export function isMeshOwnerId(id: string): boolean {
  return id.trim().startsWith("envoy:owner:");
}

/**
 * Whether a live `chat:message` belongs in Social Inbox as
 * "Messages before bonding".
 *
 * Owner desktop Inbox is mesh-only: family DMs (profile ids / `family:a:b`
 * threads), AI, and self echoes must never appear — even when the owner
 * profile is a participant and still receives the event for Family chat.
 */
export function isStrangerInboxCandidate(
  msg: ChatMessage,
  ctx: InboxPendingFilterContext,
  bonds: ReadonlyArray<{ peerOwnerId: string; displayName?: string }> = [],
): boolean {
  const selfOwnerId = ctx.selfOwnerId?.trim() ?? "";
  const snd = msg.sender.ownerId?.trim() ?? "";
  const rcv = msg.recipient?.ownerId?.trim() ?? "";

  if (!snd) return false;
  // Hard gate: only unbonded *mesh* owners belong in Inbox.
  if (!isMeshOwnerId(snd)) return false;
  if (selfOwnerId && snd === selfOwnerId) return false;

  if (rcv) {
    if (isFamilyThreadKey(rcv)) return false;
    if (rcv === OWNER_FAMILY_PROFILE_ID) return false;
    if (ctx.familyProfileIds?.has(rcv)) return false;
    // Family/AI synthetic recipients — not stranger mail.
    if (
      rcv.startsWith("bot:") ||
      rcv.startsWith("bridge:") ||
      rcv.startsWith("__envoy_ai__") ||
      rcv === ENVOY_AI_THREAD_KEY
    ) {
      return false;
    }
  }

  if (msg.metadata?.deliveryReceipt === "sent") return false;
  if (ctx.peerId && msg.sender.nodeId === ctx.peerId) return false;
  if (
    msg.metadata?.deliveryChannel === "ai" ||
    snd === ENVOY_AI_THREAD_KEY ||
    rcv === ENVOY_AI_THREAD_KEY ||
    (ctx.bridgeAgentPeerId &&
      (msg.sender.nodeId === ctx.bridgeAgentPeerId ||
        snd === ctx.bridgeAgentPeerId))
  ) {
    return false;
  }
  if (isBondedSender(msg, bonds)) return false;
  return true;
}

/** Same bond match Social used historically (ownerId or displayName). */
export function isBondedSender(
  msg: ChatMessage,
  bonds: ReadonlyArray<{ peerOwnerId: string; displayName?: string }>,
): boolean {
  const snd = msg.sender.ownerId?.trim() ?? "";
  const name = msg.sender.displayName?.trim() ?? "";
  return bonds.some(
    (b) =>
      b.peerOwnerId === snd ||
      (Boolean(b.displayName) && name.length > 0 && b.displayName === name),
  );
}
