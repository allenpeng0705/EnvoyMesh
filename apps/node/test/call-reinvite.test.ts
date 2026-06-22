/**
 * Phase 38 P2 — call.reinvite inbound handler tests.
 */

import { describe, expect, it, vi } from "vitest";
import { CallManager } from "../src/call-manager.js";
import { handleCallIntent } from "../src/call-inbound.js";
import {
  createCallReinvitePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

const CALLER_OWNER = "envoy:owner:alice";
const CALLEE_OWNER = "envoy:owner:bob";
const CALL_ID = "00000000-0000-4000-a000-000000000099";

function makeReinviteEnvelope(): EnvoyEnvelope {
  const payload = createCallReinvitePayload({
    callId: CALL_ID,
    callerOwnerId: CALLER_OWNER,
    callerPeerId: "peer-alice",
    sdpOffer: "v=0\r\npath2-offer",
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    reason: "path1_timeout",
  });
  return {
    version: "0.1",
    messageId: "m-reinvite",
    createdAt: new Date().toISOString(),
    senderPeerId: CALLER_OWNER,
    senderPublicKey: "pk",
    senderRole: "human",
    recipientRole: "human",
    intent: "call.reinvite",
    payload,
    signature: "sig",
  } as unknown as EnvoyEnvelope;
}

describe("handleCallIntent call.reinvite", () => {
  it("routes call.reinvite to inboundCallReinvite on ringing callee", async () => {
    const cm = new CallManager();
    cm.inboundCallReceived(CALL_ID, CALLER_OWNER, "peer-alice", "Alice", "v=0\r\npath1");

    const events: any[] = [];
    cm.onCallEvent((e) => events.push(e));

    const trustStore = {
      getTrustRecord: vi.fn(async () => ({ level: "direct", displayName: "Alice" })),
    } as any;

    const handled = await handleCallIntent(makeReinviteEnvelope(), {
      callManager: cm,
      trustStore,
      peerDirectoryStore: {} as any,
      sendResponseEnvelope: vi.fn(async () => undefined),
    });

    expect(handled).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "call:reinvite",
        callId: CALL_ID,
        sdpOffer: "v=0\r\npath2-offer",
        transportPath: "path2",
      }),
    );
  });
});
