/**
 * Call signaling E2E — STUN defaults when iceServers omitted.
 *
 * Mirrors Social UI `sendCallInvite(target, sdp)` (no explicit `[]`), which
 * must ship STUN in the invite so cross-NAT peers can negotiate ICE.
 *
 * Run: npm run test:e2e:call-signaling
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  reconnectCallHomes,
  setupCallHomes,
  SDP_ANSWER,
  SDP_OFFER_PATH1,
  teardownCallHomes,
  waitForCallEvent,
} from "./call-signaling-e2e-helpers.js";
import type { Phase13TestNode } from "./phase13-e2e-harness.js";

const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun.cloudflare.com:3478",
  "stun:global.stun.twilio.com:3478",
];

describe("E2E call signaling — STUN default invite", () => {
  let caller!: Phase13TestNode;
  let callee!: Phase13TestNode;

  afterEach(async () => {
    if (caller && callee) {
      await teardownCallHomes(caller, callee);
    }
  });

  it("sendCallInvite without iceServers ships STUN defaults to callee", async () => {
    ({ caller, callee } = await setupCallHomes());

    const incomingPromise = waitForCallEvent(
      callee,
      (e) => e.type === "call:incoming" && e.sdpOffer === SDP_OFFER_PATH1,
    );

    const callId = await caller.service.sendCallInvite(
      callee.profile.owner.ownerId,
      SDP_OFFER_PATH1,
    );
    expect(callId).toBeTruthy();

    const incoming = await incomingPromise;
    expect(incoming.type).toBe("call:incoming");
    if (incoming.type !== "call:incoming") return;

    const urls = (incoming.iceServers ?? []).map((entry) => entry.urls);
    expect(urls).toEqual(DEFAULT_STUN_URLS);
  }, 30_000);

  it("accept with STUN invite returns iceServers on call:answered", async () => {
    ({ caller, callee } = await setupCallHomes());

    const incomingPromise = waitForCallEvent(callee, (e) => e.type === "call:incoming");
    const callId = await caller.service.sendCallInvite(
      callee.profile.owner.ownerId,
      SDP_OFFER_PATH1,
    );
    expect(callId).toBeTruthy();
    await incomingPromise;

    await reconnectCallHomes(caller, callee);

    const answeredPromise = waitForCallEvent(
      caller,
      (e) => e.type === "call:answered" && e.sdpAnswer === SDP_ANSWER,
    );

    const stun = DEFAULT_STUN_URLS.map((urls) => ({ urls }));
    expect(await callee.service.acceptCallInvite(callId!, SDP_ANSWER, stun)).toBe(true);

    const answered = await answeredPromise;
    expect(answered.type).toBe("call:answered");
    if (answered.type !== "call:answered") return;
    expect(answered.iceServers?.map((entry) => entry.urls)).toEqual(DEFAULT_STUN_URLS);
  }, 30_000);
});
