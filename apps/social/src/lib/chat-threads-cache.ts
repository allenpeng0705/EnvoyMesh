import type { ChatMessage } from "@envoymesh/api";

/** In-memory chat threads — survives ContactChatPanel unmount (Inbox / tab switches). */
let threadsByContact: Record<string, ChatMessage[]> = {};

export function snapshotChatThreadsCache(): Record<string, ChatMessage[]> {
  return threadsByContact;
}

export function replaceChatThreadsCache(next: Record<string, ChatMessage[]>): void {
  threadsByContact = next;
}

export function readCachedThread(contactOwnerId: string): ChatMessage[] | undefined {
  const key = contactOwnerId.trim();
  if (!key) return undefined;
  return threadsByContact[key];
}

function messageTimestampMs(msg: ChatMessage): number {
  const raw = msg.metadata?.timestamp;
  const n = typeof raw === "string" ? new Date(raw).getTime() : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Merge server/local history rows into a single thread key (ascending by time). */
export function mergeMessagesIntoThread(
  prev: Record<string, ChatMessage[]>,
  threadKey: string,
  incoming: readonly ChatMessage[],
): Record<string, ChatMessage[]> {
  const key = threadKey.trim();
  if (!key || incoming.length === 0) return prev;
  const byId = new Map((prev[key] ?? []).map((m) => [m.messageId, m]));
  for (const msg of incoming) {
    byId.set(msg.messageId, msg);
  }
  const merged = [...byId.values()].sort((a, b) => {
    const dt = messageTimestampMs(a) - messageTimestampMs(b);
    if (dt !== 0) return dt;
    return a.messageId.localeCompare(b.messageId);
  });
  return { ...prev, [key]: merged };
}
