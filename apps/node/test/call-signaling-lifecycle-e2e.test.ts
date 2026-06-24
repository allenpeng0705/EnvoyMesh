/**
 * Call signaling E2E — full invite/accept/reinvite/end lifecycle.
 * Run: npm run test:e2e:call-signaling
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  reconnectCallHomes,
  SDP_ANSWER,
  SDP_OFFER_PATH1,
  SDP_OFFER_PATH2,
  setupCallHomes,
  STUN,
  teardownCallHomes,
  waitForCallEvent,
} from "./call-signaling-e2e-helpers.js";
import { waitForPhase13 } from "./phase13-e2e-harness.js";
import type { Phase13TestNode } from "./phase13-e2e-harness.js";

let caller!: Phase13TestNode;
let callee!: Phase13TestNode;

describe("E2E call signaling — lifecycle", () => {
  beforeAll(async () => {
    ({ caller, callee } = await setupCallHomes());
  }, 30_000);

  afterAll(async () => {
    await teardownCallHomes(caller, callee);
  }, 30_000);

  it("invite → accept → reinvite → endCall over chat protocol", async () => {
    const sendChatSpy = vi.spyOn(caller.mesh, "sendChat");
    const sendSpy = vi.spyOn(caller.mesh, "send");

    const incomingPromise = waitForCallEvent(callee, (e) => e.type === "call:incoming");
    const callId = await caller.service.sendCallInvite(
      callee.profile.owner.ownerId,
      SDP_OFFER_PATH1,
      [],
    );
    expect(callId).toBeTruthy();
    await incomingPromise;

    expect(sendChatSpy).toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    sendChatSpy.mockRestore();
    sendSpy.mockRestore();

    await reconnectCallHomes(caller, callee);

    const calleeSendChatSpy = vi.spyOn(callee.mesh, "sendChat");
    const answeredPromise = waitForCallEvent(
      caller,
      (e) => e.type === "call:answered" && e.sdpAnswer === SDP_ANSWER,
    );
    expect(await callee.service.acceptCallInvite(callId!, SDP_ANSWER, [])).toBe(true);
    await answeredPromise;
    expect(calleeSendChatSpy).toHaveBeenCalled();
    calleeSendChatSpy.mockRestore();

    await reconnectCallHomes(caller, callee);

    const reinvitePromise = waitForCallEvent(callee, (e) => e.type === "call:reinvite");
    expect(
      await caller.service.sendCallReinvite(callId!, SDP_OFFER_PATH2, STUN, "path1_timeout"),
    ).toBe(true);
    await reinvitePromise;

    await caller.service.endCall(callId!);
    await waitForPhase13(() => caller.service.getActiveCall() === null, 5_000);
    await waitForPhase13(() => callee.service.getActiveCall() === null, 5_000);
  }, 60_000);
});
