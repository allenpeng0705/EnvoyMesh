import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createChatDeliveredPayload,
  createUnsignedEnvelope,
  parseChatDeliveredPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { NodeProfile } from "./node-service.js";

export function buildSignedChatDeliveredEnvelope(input: {
  profile: Pick<NodeProfile, "owner" | "device">;
  messageId: string;
  recipientOwnerId: string;
  /** Envelope routing id of the original sender (`envoy_*` device id). */
  envelopeRecipientPeerId: string;
  correlationId?: string;
}): EnvoyEnvelope {
  const payload = createChatDeliveredPayload({
    messageId: input.messageId,
    recipientOwnerId: input.recipientOwnerId,
    deliveredAt: new Date().toISOString(),
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.envelopeRecipientPeerId,
    recipientRole: "human",
    intent: "chat.delivered",
    payload,
    correlationId: input.correlationId,
  });
  return signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
}

export function parseChatDeliveredAck(envelope: EnvoyEnvelope): {
  messageId: string;
  recipientOwnerId: string;
  deliveredAt: string;
} {
  const payload = parseChatDeliveredPayload(envelope.payload);
  return {
    messageId: payload.messageId,
    recipientOwnerId: payload.recipientOwnerId,
    deliveredAt: payload.deliveredAt,
  };
}
