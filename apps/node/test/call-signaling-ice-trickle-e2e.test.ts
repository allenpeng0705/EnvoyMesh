/**
 * Call signaling E2E — trickle ICE forwarding during an active call.
 *
 * Run: npm run test:e2e:call-signaling
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  reconnectCallHomes,
  setupCallHomes,
  SDP_ANSWER,
  SDP_OFFER_PATH1,
  STUN,
  teardownCallHomes,
  waitForCallEvent,
} from "./call-signaling-e2e-helpers.js";
import type { Phase13TestNode } from "./phase13-e2e-harness.js";

let caller!: Phase13TestNode;
let callee!: Phase13TestNode;

describe("E2E call signaling — ICE trickle", () => {
  beforeAll(async () => {
    ({ caller, callee } = await setupCallHomes());
  }, 30_000);

  afterAll(async () => {
    await teardownCallHomes(caller, callee);
  }, 30_000);

  it("forwards call.ice-candidate to the remote peer during active call", async () => {
    const incomingPromise = waitForCallEvent(callee, (e) => e.type === "call:incoming");
    const callId = await caller.service.sendCallInvite(
      callee.profile.owner.ownerId,
      SDP_OFFER_PATH1,
      STUN,
    );
    expect(callId).toBeTruthy();
    await incomingPromise;

    await reconnectCallHomes(caller, callee);

    const answeredPromise = waitForCallEvent(caller, (e) => e.type === "call:answered");
    expect(await callee.service.acceptCallInvite(callId!, SDP_ANSWER, STUN)).toBe(true);
    await answeredPromise;

    await reconnectCallHomes(caller, callee);

    const icePromise = waitForCallEvent(
      callee,
      (e) =>
        e.type === "call:ice-candidate" &&
        e.callId === callId &&
        e.candidate.candidate.includes("typ host"),
    );

    expect(
      await caller.service.sendIceCandidate(callId!, {
        candidate: "candidate:1 1 UDP 2113937159 192.0.2.1 54321 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }),
    ).toBe(true);

    await icePromise;
  }, 45_000);
});
