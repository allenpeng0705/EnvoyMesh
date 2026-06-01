import type { ChatMessage } from "./node-service.js";

export function mergeGroupDeliveryAck(
  metadata: ChatMessage["metadata"],
  recipientOwnerId: string,
): ChatMessage["metadata"] {
  const delivered = new Set(metadata.deliveredToOwnerIds ?? []);
  delivered.add(recipientOwnerId);
  const pending = (metadata.pendingRecipientOwnerIds ?? []).filter((id) => !delivered.has(id));
  const allDelivered = pending.length === 0 && delivered.size > 0;
  return {
    ...metadata,
    deliveredToOwnerIds: [...delivered],
    pendingRecipientOwnerIds: pending,
    deliveryReceipt: allDelivered ? "delivered" : "sent",
  };
}

export function groupDeliveryRecipientCount(memberCount: number): number {
  return Math.max(0, memberCount - 1);
}

export function isGroupDeliveryComplete(
  metadata: ChatMessage["metadata"],
  memberCount: number,
): boolean {
  const total = groupDeliveryRecipientCount(memberCount);
  if (total === 0) return metadata.deliveryReceipt === "delivered";
  const delivered = metadata.deliveredToOwnerIds?.length ?? 0;
  return delivered >= total || metadata.deliveryReceipt === "delivered";
}

export function hasPartialGroupDelivery(
  metadata: ChatMessage["metadata"],
  memberCount: number,
): boolean {
  const total = groupDeliveryRecipientCount(memberCount);
  if (total <= 1) return false;
  const delivered = metadata.deliveredToOwnerIds?.length ?? 0;
  const pending = metadata.pendingRecipientOwnerIds?.length ?? 0;
  return delivered > 0 && pending > 0 && delivered < total;
}
