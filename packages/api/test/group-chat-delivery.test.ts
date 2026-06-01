import { describe, expect, it } from "vitest";
import { mergeGroupDeliveryAck, hasPartialGroupDelivery, isGroupDeliveryComplete } from "../src/group-chat-delivery.js";

describe("group-chat-delivery", () => {
  it("merges per-recipient acks until all delivered", () => {
    const base = {
      timestamp: "2026-05-28T12:00:00.000Z",
      deliveryReceipt: "sent" as const,
      deliveredToOwnerIds: ["envoy:owner:bob"],
      pendingRecipientOwnerIds: ["envoy:owner:carol"],
    };
    const afterBob = mergeGroupDeliveryAck(base, "envoy:owner:bob");
    expect(afterBob.deliveredToOwnerIds).toEqual(["envoy:owner:bob"]);
    expect(afterBob.deliveryReceipt).toBe("sent");

    const afterCarol = mergeGroupDeliveryAck(base, "envoy:owner:carol");
    expect(afterCarol.deliveredToOwnerIds?.sort()).toEqual(["envoy:owner:bob", "envoy:owner:carol"]);
    expect(afterCarol.pendingRecipientOwnerIds).toEqual([]);
    expect(afterCarol.deliveryReceipt).toBe("delivered");
  });

  it("detects partial and complete group delivery", () => {
    const metadata = {
      timestamp: "2026-05-28T12:00:00.000Z",
      deliveryReceipt: "sent" as const,
      deliveredToOwnerIds: ["envoy:owner:bob"],
      pendingRecipientOwnerIds: ["envoy:owner:carol"],
    };
    expect(hasPartialGroupDelivery(metadata, 3)).toBe(true);
    expect(isGroupDeliveryComplete(metadata, 3)).toBe(false);
    expect(isGroupDeliveryComplete({ ...metadata, deliveryReceipt: "delivered" }, 3)).toBe(true);
  });
});
