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
