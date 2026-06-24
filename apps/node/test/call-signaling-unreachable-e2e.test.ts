/** Call signaling E2E — unreachable peer delivery failure. */

import { describe, expect, it } from "vitest";

import {
  SDP_OFFER_PATH1,
  setupCallHomes,
  teardownCallHomes,
  waitForCallEvent,
} from "./call-signaling-e2e-helpers.js";

describe("E2E call signaling — unreachable peer", () => {
  it("returns null and emits call:error when peer is offline", async () => {
    const { caller, callee } = await setupCallHomes();

    try {
      await callee.mesh.stop();

      const errorPromise = waitForCallEvent(
        caller,
        (e) => e.type === "call:error" || e.type === "call:ended",
      );

      expect(
        await caller.service.sendCallInvite(callee.profile.owner.ownerId, SDP_OFFER_PATH1, []),
      ).toBeNull();
      await errorPromise;
    } finally {
      await teardownCallHomes(caller, callee);
    }
  }, 45_000);
});
