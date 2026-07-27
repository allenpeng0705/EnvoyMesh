import type { ChatMessage } from "@envoymesh/api";

/** Unsent / in-flight outbound rows — survives panel unmount while peer is offline. */
const pendingByContact: Record<string, ChatMessage[]> = {};

/** Age after which a still-pending bubble is marked failed (under the 120s WS sendChat budget). */
export const PENDING_OUTBOUND_STALE_MS = 90_000;

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

/** Mark in-flight pending rows as failed (node restart / transport drop / age-out). */
export function markPendingOutboundFailed(rows: ChatMessage[]): ChatMessage[] {
  let changed = false;
  const next = rows.map((m) => {
    if (m.metadata.deliveryReceipt !== "pending") return m;
    changed = true;
    return {
      ...m,
      metadata: { ...m.metadata, deliveryReceipt: "failed" as const },
    };
  });
  return changed ? next : rows;
}

/** Fail pending bubbles older than {@link PENDING_OUTBOUND_STALE_MS}. */
export function markStalePendingOutboundFailed(
  rows: ChatMessage[],
  now = Date.now(),
  staleMs = PENDING_OUTBOUND_STALE_MS,
): ChatMessage[] {
  let changed = false;
  const next = rows.map((m) => {
    if (m.metadata.deliveryReceipt !== "pending") return m;
    const ts = Date.parse(m.metadata.timestamp);
    if (!Number.isFinite(ts) || now - ts < staleMs) return m;
    changed = true;
    return {
      ...m,
      metadata: { ...m.metadata, deliveryReceipt: "failed" as const },
    };
  });
  return changed ? next : rows;
}
