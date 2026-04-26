import { generateIdentity, signUnsignedEnvelope } from "@envoymesh/identity";
import { createSystemPingPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { createInboundMessageGuard } from "../src/inbound-guard.js";

describe("inbound message guard", () => {
  it("allows a valid signed envelope", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedPingEnvelope();

    const decision = guard.inspect(envelope);

    expect(decision.action).toBe("allow");
    if (decision.action === "allow") {
      expect(decision.envelope.messageId).toBe(envelope.messageId);
    }
  });

  it("rejects malformed or unsigned envelopes", () => {
    const guard = createInboundMessageGuard();
    const identity = generateIdentity();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: identity.peerId,
      senderPublicKey: identity.publicKeyPem,
      intent: "system.ping",
      payload: createSystemPingPayload("hello"),
    });

    expect(guard.inspect({ not: "an envelope" })).toEqual({
      action: "reject",
      reason: "malformed or unsigned envelope",
    });
    expect(guard.inspect(unsigned)).toEqual({
      action: "reject",
      reason: "malformed or unsigned envelope",
    });
  });

  it("rejects oversized envelopes before signature verification", () => {
    const guard = createInboundMessageGuard({ maxEnvelopeBytes: 32 });

    expect(guard.inspect(signedPingEnvelope())).toEqual({
      action: "reject",
      reason: "envelope exceeds maximum size",
    });
  });

  it("rejects invalid signatures", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedPingEnvelope();

    const decision = guard.inspect({
      ...envelope,
      payload: createSystemPingPayload("tampered"),
    });

    expect(decision).toEqual({
      action: "reject",
      reason: "invalid signature",
      messageId: envelope.messageId,
    });
  });

  it("rejects replayed message IDs after accepting the first message", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedPingEnvelope();

    expect(guard.inspect(envelope).action).toBe("allow");
    expect(guard.inspect(envelope)).toEqual({
      action: "reject",
      reason: "replayed message",
      messageId: envelope.messageId,
    });
  });
});

function signedPingEnvelope() {
  const identity = generateIdentity();
  const unsigned = createUnsignedEnvelope({
    senderPeerId: identity.peerId,
    senderPublicKey: identity.publicKeyPem,
    intent: "system.ping",
    payload: createSystemPingPayload("hello"),
    messageId: "message-1",
    createdAt: "2026-04-27T10:00:00.000Z",
  });

  return signUnsignedEnvelope(unsigned, identity.privateKeyPem);
}
