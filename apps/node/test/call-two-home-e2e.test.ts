/**
 * Phase 38/42 — two-home libp2p voice-call signaling E2E.
 *
 * Spins up two real EnvoyMesh nodes (caller + callee), bonds them, and
 * exercises the full call.* envelope path over libp2p:
 *
 *   call.invite → call:incoming → call.accept → call:answered
 *   call.reinvite → call:reinvite (Path 1 → Path 2 fallback)
 *   endCall → both CallManagers cleared
 *
 * Uses a single libp2p setup for all steps — restarting meshes in-process
 * between tests is flaky on some hosts (stale libp2p state).
 *
 * Media (RTCPeerConnection) is not asserted here — see Playwright UI tests
 * and docs/manual_test.md for browser/device audio verification.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { CallEvent } from "@envoymesh/api";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
  wireCallInboundHandler,
  wireNodeServiceInboundHandlers,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

const nodes: Phase13TestNode[] = [];

const SDP_OFFER_PATH1 = "v=0\r\no=- caller-path1 0 IN IP4 127.0.0.1\r\n";
const SDP_ANSWER = "v=0\r\no=- callee-answer 0 IN IP4 127.0.0.1\r\n";
const SDP_OFFER_PATH2 = "v=0\r\no=- caller-path2 0 IN IP4 127.0.0.1\r\n";
const STUN = [{ urls: "stun:stun.l.google.com:19302" }];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

async function setupCallHomes(): Promise<{ caller: Phase13TestNode; callee: Phase13TestNode }> {
  await cleanupPhase13Harness();

  const caller = await createPhase13TestNode();
  const callee = await createPhase13TestNode();
  nodes.push(caller, callee);

  await registerBondedPeer(caller, callee, "Callee");
  await registerBondedPeer(callee, caller, "Caller");

  wireNodeServiceInboundHandlers(caller);
  wireNodeServiceInboundHandlers(callee);
  wireCallInboundHandler(caller);
  wireCallInboundHandler(callee);

  // probePeer closes after dial — keep an open libp2p path for call.invite delivery.
  await caller.mesh.dial(callee.mesh.multiaddrs[0]!);
  await callee.mesh.dial(caller.mesh.multiaddrs[0]!);

  return { caller, callee };
}

function waitForCallEvent(
  node: Phase13TestNode,
  predicate: (event: CallEvent) => boolean,
  timeoutMs = 20_000,
): Promise<CallEvent> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      reject(new Error("timeout waiting for call event"));
    }, timeoutMs);
    const unsub = node.service.onCallEvent((event) => {
      if (settled || !predicate(event)) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(event);
    });
  });
}

describe.sequential("E2E two-home call signaling (libp2p)", () => {
  it("invite → accept → reinvite → endCall over libp2p", async () => {
    const { caller, callee } = await setupCallHomes();

    // --- call.invite → call:incoming ---
    const incomingPromise = waitForCallEvent(
      callee,
      (e) => e.type === "call:incoming" && e.sdpOffer === SDP_OFFER_PATH1,
    );

    const callId = await caller.service.sendCallInvite(
      callee.profile.owner.ownerId,
      SDP_OFFER_PATH1,
      [],
    );
    expect(callId).toBeTruthy();

    const incoming = await incomingPromise;
    expect(incoming.type).toBe("call:incoming");
    if (incoming.type !== "call:incoming") return;
    expect(incoming.callId).toBe(callId);
    expect(incoming.peerOwnerId).toBe(caller.profile.owner.ownerId);
    expect(incoming.iceServers ?? []).toEqual([]);

    // Re-open callee → caller path (invite delivery retries may have torn down dial hints).
    await callee.mesh.dial(caller.mesh.multiaddrs[0]!);

    // --- call.accept → call:answered ---
    const answeredPromise = waitForCallEvent(
      caller,
      (e) => e.type === "call:answered" && e.sdpAnswer === SDP_ANSWER,
    );

    const accepted = await callee.service.acceptCallInvite(callId!, SDP_ANSWER, []);
    expect(accepted).toBe(true);

    const answered = await answeredPromise;
    expect(answered.type).toBe("call:answered");
    if (answered.type !== "call:answered") return;
    expect(answered.callId).toBe(callId);

    // --- call.reinvite → call:reinvite (Path 1 → Path 2) ---
    const reinvitePromise = waitForCallEvent(
      callee,
      (e) => e.type === "call:reinvite" && e.sdpOffer === SDP_OFFER_PATH2,
    );

    const sent = await caller.service.sendCallReinvite(
      callId!,
      SDP_OFFER_PATH2,
      STUN,
      "path1_timeout",
    );
    expect(sent).toBe(true);

    const reinvite = await reinvitePromise;
    expect(reinvite.type).toBe("call:reinvite");
    if (reinvite.type !== "call:reinvite") return;
    expect(reinvite.callId).toBe(callId);
    expect(reinvite.transportPath).toBe("path2");
    expect(reinvite.reason).toBe("path1_timeout");
    expect(reinvite.iceServers).toEqual(STUN);

    // --- endCall clears both sides ---
    expect(caller.service.getActiveCall()?.status).toBe("active");
    expect(callee.service.getActiveCall()?.status).toBe("active");

    await caller.service.endCall(callId!);

    await waitForPhase13(() => caller.service.getActiveCall() === null, 5_000);
    await waitForPhase13(() => callee.service.getActiveCall() === null, 5_000);
  }, 60_000);
});
