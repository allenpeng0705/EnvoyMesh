import { describe, expect, it } from "vitest";
import {
  generateDeviceIdentity,
  generateOwnerIdentity,
  verifyEnvelope,
} from "@envoymesh/identity";
import { buildSignedChatDeliveredEnvelope, parseChatDeliveredAck } from "../src/chat-delivered.js";

describe("chat-delivered helpers", () => {
  it("builds a verifiable chat.delivered ack envelope", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();

    const ack = buildSignedChatDeliveredEnvelope({
      profile: { owner, device },
      messageId: "msg-42",
      recipientOwnerId: owner.ownerId,
      envelopeRecipientPeerId: "envoy_sender",
    });

    expect(ack.intent).toBe("chat.delivered");
    expect(verifyEnvelope(ack)).toBe(true);
    expect(parseChatDeliveredAck(ack)).toEqual({
      messageId: "msg-42",
      recipientOwnerId: owner.ownerId,
      deliveredAt: ack.payload.deliveredAt,
    });
  });
});
