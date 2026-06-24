/** Call signaling E2E — chat message then call.invite on same connection. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SDP_OFFER_PATH1,
  setupCallHomes,
  teardownCallHomes,
  waitForCallEvent,
} from "./call-signaling-e2e-helpers.js";
import { deliverHumanChat, type Phase13TestNode } from "./phase13-e2e-harness.js";

let caller!: Phase13TestNode;
let callee!: Phase13TestNode;

describe("E2E call signaling — chat then call", () => {
  beforeAll(async () => {
    ({ caller, callee } = await setupCallHomes());
  }, 30_000);

  afterAll(async () => {
    await teardownCallHomes(caller, callee);
  }, 30_000);

  it("delivers call.invite after chat on the same libp2p path", async () => {
    await deliverHumanChat(caller, callee, "hello before call");
    expect(caller.mesh.getPeerConnectionInfo(callee.mesh.peerId).connected).toBe(true);

    const incomingPromise = waitForCallEvent(callee, (e) => e.type === "call:incoming");
    expect(
      await caller.service.sendCallInvite(callee.profile.owner.ownerId, SDP_OFFER_PATH1, []),
    ).toBeTruthy();
    await incomingPromise;

    expect(caller.mesh.getPeerConnectionInfo(callee.mesh.peerId).connected).toBe(true);
  }, 45_000);
});
