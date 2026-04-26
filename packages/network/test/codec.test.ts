import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { decodeEnvelope, encodeEnvelope } from "../src/index.js";

describe("network codec", () => {
  it("round trips an envelope", () => {
    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "public-key",
        recipientPeerId: "peer-b",
        intent: "system.ping",
        payload: { message: "hello" },
      }),
      signature: "signature",
    };

    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
  });
});
