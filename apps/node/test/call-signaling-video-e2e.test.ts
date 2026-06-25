/**
 * Call signaling E2E — video callType propagation over libp2p.
 * Run: npx vitest run apps/node/test/call-signaling-video-e2e.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  reconnectCallHomes,
  SDP_ANSWER,
  SDP_OFFER_PATH1,
  setupCallHomes,
  teardownCallHomes,
  waitForCallEvent,
} from "./call-signaling-e2e-helpers.js";
import type { Phase13TestNode } from "./phase13-e2e-harness.js";

let caller!: Phase13TestNode;
let callee!: Phase13TestNode;

describe("E2E call signaling — video callType", () => {
  beforeAll(async () => {
    ({ caller, callee } = await setupCallHomes());
  }, 30_000);

  afterAll(async () => {
    await teardownCallHomes(caller, callee);
  }, 30_000);

  it("sendCallInvite with callType video → callee call:incoming has video", async () => {
    const incomingPromise = waitForCallEvent(
      callee,
      (e) => e.type === "call:incoming" && e.callType === "video",
    );

    const callId = await caller.service.sendCallInvite(
      callee.profile.owner.ownerId,
      SDP_OFFER_PATH1,
      [],
      "video",
    );
    expect(callId).toBeTruthy();

    const incoming = await incomingPromise;
    expect(incoming.type).toBe("call:incoming");
    if (incoming.type !== "call:incoming") return;
    expect(incoming.callType).toBe("video");
    expect(incoming.callId).toBe(callId);
    expect(caller.service.getActiveCall()?.callType).toBe("video");

    await reconnectCallHomes(caller, callee);

    const answeredPromise = waitForCallEvent(
      caller,
      (e) => e.type === "call:answered" && e.sdpAnswer === SDP_ANSWER,
    );
    expect(await callee.service.acceptCallInvite(callId!, SDP_ANSWER, [])).toBe(true);
    await answeredPromise;

    expect(callee.service.getActiveCall()?.callType).toBe("video");
    await caller.service.endCall(callId!);
  }, 60_000);
});
