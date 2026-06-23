import type { ChatMessage } from "@envoymesh/api";

/** Unsent / in-flight outbound rows — survives panel unmount while peer is offline. */
const pendingByContact: Record<string, ChatMessage[]> = {};

export function readPendingOutboundCache(contactOwnerId: string): ChatMessage[] {
  const key = contactOwnerId.trim();
  if (!key) return [];
  return pendingByContact[key] ?? [];
}

export function writePendingOutboundCache(contactOwnerId: string, rows: ChatMessage[]): void {
  const key = contactOwnerId.trim();
  if (!key) return;
  if (rows.length === 0) {
    delete pendingByContact[key];
    return;
  }
  pendingByContact[key] = rows;
}
