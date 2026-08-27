/**
 * Home node = family proxy + owner profile.
 *
 * - Mom/Dad/Owner all chat through the home node (proxy).
 * - Owner is a family member too (`profileId = "owner"`).
 * - Social desktop is the owner session: it only displays threads that
 *   include the owner (Owner↔Mom, Owner↔Dad, mesh strangers, …).
 * - Dad↔Mom still works on the node and on their phones; Social must not
 *   show those messages (`threadVisibleTo(key, "owner") === false`).
 */
import {
  ENVOY_AI_THREAD_KEY,
  OWNER_FAMILY_PROFILE_ID,
  isAiBotThread,
  isChatRoomThreadKey,
  isFamilyThreadKey,
  threadVisibleTo,
  type ChatMessage,
} from "@envoymesh/api";

/** Thread keys that are bound to a family profile (not shared mesh). */
export function isProfileScopedThreadKey(threadKey: string): boolean {
  const key = threadKey.trim();
  if (!key) return false;
  if (isFamilyThreadKey(key)) return true;
  if (key === ENVOY_AI_THREAD_KEY || key.startsWith(`${ENVOY_AI_THREAD_KEY}:`)) {
    return true;
  }
  if (key.startsWith("bridge:")) return true;
  if (key.startsWith("bot:")) return true;
  if (key.startsWith("pi:")) return true;
  return false;
}

/**
 * Resolve the UI thread key for a live chat message (same rules as Social
 * `partnerOwnerIdForChat` for family / AI / rooms).
 */
export function resolveChatThreadKey(
  msg: ChatMessage,
  selfOwnerId: string,
  selfPeerId: string,
): string | null {
  const selfO = selfOwnerId.trim();
  const selfP = selfPeerId.trim();
  const sndO = msg.sender.ownerId?.trim();
  const sndN = msg.sender.nodeId?.trim();
  const rcvO = msg.recipient?.ownerId?.trim();
  const rcvN = msg.recipient?.nodeId?.trim();

  if (rcvO && isChatRoomThreadKey(rcvO)) return rcvO;
  if (rcvO && isFamilyThreadKey(rcvO)) return rcvO;
  if (sndO && isFamilyThreadKey(sndO)) return sndO;
  if (rcvO === ENVOY_AI_THREAD_KEY || sndO === ENVOY_AI_THREAD_KEY) {
    return ENVOY_AI_THREAD_KEY;
  }
  if (rcvO && rcvO.startsWith(`${ENVOY_AI_THREAD_KEY}:`)) return rcvO;
  if (sndO && sndO.startsWith(`${ENVOY_AI_THREAD_KEY}:`)) return sndO;
  if (rcvO && isAiBotThread(rcvO)) return rcvO;
  if (sndO && isAiBotThread(sndO)) return sndO;
  if (rcvO && rcvO.startsWith("bridge:")) return rcvO;
  if (sndO && sndO.startsWith("bridge:")) return sndO;

  if (sndO && sndO === selfO && rcvO && rcvO !== selfO) return rcvO;
  if (rcvO && rcvO === selfO && sndO && sndO !== selfO) return sndO;

  const sndNIsSelf = !!selfP && sndN === selfP;
  const rcvNIsSelf = !!selfP && rcvN === selfP;
  if (sndNIsSelf && !rcvNIsSelf) return rcvO ?? rcvN ?? null;
  if (rcvNIsSelf && !sndNIsSelf) return sndO ?? sndN ?? null;
  return null;
}

/**
 * Whether this thread key may be shown for the caller's family profile.
 * Mesh contact keys (envoy:owner:…) are always allowed for owner Social.
 */
export function isThreadVisibleToProfile(
  threadKey: string,
  familyProfileId: string = OWNER_FAMILY_PROFILE_ID,
): boolean {
  const key = threadKey.trim();
  const profile = familyProfileId.trim() || OWNER_FAMILY_PROFILE_ID;
  if (!key) return false;
  if (isProfileScopedThreadKey(key)) {
    return threadVisibleTo(key, profile);
  }
  // Mesh / other non-scoped keys — Social owner UI may show them.
  return profile === OWNER_FAMILY_PROFILE_ID;
}

/** Live message visible to this family profile (defense-in-depth after WS routing). */
export function isChatMessageVisibleToProfile(
  msg: ChatMessage,
  opts: {
    familyProfileId?: string;
    selfOwnerId?: string;
    selfPeerId?: string;
  },
): boolean {
  const familyProfileId =
    opts.familyProfileId?.trim() || OWNER_FAMILY_PROFILE_ID;
  const threadKey = resolveChatThreadKey(
    msg,
    opts.selfOwnerId?.trim() ?? "",
    opts.selfPeerId?.trim() ?? "",
  );
  if (!threadKey) {
    // Incomplete self ids (e.g. notifications before profile load): still
    // allow mesh strangers for the owner profile; never allow bare family
    // profile senders (mom/dad/owner).
    if (familyProfileId !== OWNER_FAMILY_PROFILE_ID) return false;
    const snd = msg.sender.ownerId?.trim() ?? "";
    const rcv = msg.recipient?.ownerId?.trim() ?? "";
    if (rcv && isFamilyThreadKey(rcv)) {
      return threadVisibleTo(rcv, familyProfileId);
    }
    return snd.startsWith("envoy:owner:");
  }
  return isThreadVisibleToProfile(threadKey, familyProfileId);
}

/** Whether a live message was sent by this session (mesh, family DM, or room). */
export function messageIsOutgoing(
  msg: ChatMessage,
  selfOwnerId: string,
  selfPeerId: string,
  selfFamilyProfileId?: string,
): boolean {
  const selfO = selfOwnerId.trim();
  const selfP = selfPeerId.trim();
  const sndO = msg.sender.ownerId?.trim();
  const sndN = msg.sender.nodeId?.trim();
  const rcvO = msg.recipient.ownerId?.trim();
  // Family DMs use profile ids (e.g. "owner" / "mom"), not mesh envoy:owner:….
  if (rcvO && isFamilyThreadKey(rcvO)) {
    const familySelf = (selfFamilyProfileId ?? OWNER_FAMILY_PROFILE_ID).trim();
    return !!sndO && sndO === familySelf;
  }
  // Family group rooms use profile ids; mesh group rooms use mesh owner id.
  if (rcvO && rcvO.startsWith("room:")) {
    const familySelf = (selfFamilyProfileId ?? OWNER_FAMILY_PROFILE_ID).trim();
    if (familySelf !== OWNER_FAMILY_PROFILE_ID) {
      return !!sndO && sndO === familySelf;
    }
    return (sndO !== undefined && sndO === selfO) || (!!selfP && sndN === selfP);
  }
  return (sndO !== undefined && sndO === selfO) || (!!selfP && sndN === selfP);
}

/** Drop cached threads that belong to other family profiles. */
export function pruneThreadsForProfile<T>(
  threads: Record<string, T>,
  familyProfileId: string = OWNER_FAMILY_PROFILE_ID,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(threads)) {
    if (isThreadVisibleToProfile(key, familyProfileId)) {
      next[key] = value;
    }
  }
  return next;
}
