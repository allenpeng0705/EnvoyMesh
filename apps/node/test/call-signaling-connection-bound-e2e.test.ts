/** Call signaling E2E — repeated invite/decline cycles keep connection count bounded. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  reconnectCallHomes,
  SDP_OFFER_PATH1,
  setupCallHomes,
  teardownCallHomes,
  waitForCallEvent,
} from "./call-signaling-e2e-helpers.js";
import { waitForPhase13, type Phase13TestNode } from "./phase13-e2e-harness.js";

let caller!: Phase13TestNode;
let callee!: Phase13TestNode;

describe("E2E call signaling — connection bound", () => {
  beforeAll(async () => {
    ({ caller, callee } = await setupCallHomes());
  }, 30_000);

  afterAll(async () => {
    await teardownCallHomes(caller, callee);
  }, 30_000);

  it("does not leak libp2p connections across invite/decline cycles", async () => {
    const baseline = caller.mesh.getConnectionStats().totalConnections;

    for (let i = 0; i < 3; i++) {
      await reconnectCallHomes(caller, callee);

      const incomingPromise = waitForCallEvent(callee, (e) => e.type === "call:incoming");
      const callId = await caller.service.sendCallInvite(
        callee.profile.owner.ownerId,
        SDP_OFFER_PATH1,
        [],
      );
      expect(callId).toBeTruthy();
      await incomingPromise;
      await reconnectCallHomes(caller, callee);

      const rejectedPromise = waitForCallEvent(
        caller,
        (e) => e.type === "call:rejected" && e.reason === "declined",
        30_000,
      );
      expect(await callee.service.declineCallInvite(callId!, "declined")).toBe(true);
      await rejectedPromise;

      await waitForPhase13(
        () => caller.service.getActiveCall() === null && callee.service.getActiveCall() === null,
        3_000,
      );
    }

    expect(caller.mesh.getConnectionStats().totalConnections).toBeLessThanOrEqual(baseline + 6);
  }, 90_000);
});
