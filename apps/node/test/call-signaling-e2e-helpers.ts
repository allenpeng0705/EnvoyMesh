/**
 * Shared helpers for libp2p call-signaling E2E tests.
 */

import type { CallEvent } from "@envoymesh/api";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
  wireCallInboundHandler,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

export const SDP_OFFER_PATH1 = "v=0\r\no=- caller-path1 0 IN IP4 127.0.0.1\r\n";
export const SDP_ANSWER = "v=0\r\no=- callee-answer 0 IN IP4 127.0.0.1\r\n";
export const SDP_OFFER_PATH2 = "v=0\r\no=- caller-path2 0 IN IP4 127.0.0.1\r\n";
export const STUN = [{ urls: "stun:stun.l.google.com:19302" }];

export function waitForCallEvent(
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

export async function reconnectCallHomes(
  caller: Phase13TestNode,
  callee: Phase13TestNode,
): Promise<void> {
  await caller.mesh.dial(callee.mesh.multiaddrs[0]!);
  await callee.mesh.dial(caller.mesh.multiaddrs[0]!);
  await waitForPhase13(
    () =>
      caller.mesh.getPeerConnectionInfo(callee.mesh.peerId).connected &&
      callee.mesh.getPeerConnectionInfo(caller.mesh.peerId).connected,
    5_000,
  );
}

export async function setupCallHomes(): Promise<{
  caller: Phase13TestNode;
  callee: Phase13TestNode;
}> {
  await cleanupPhase13Harness();

  const caller = await createPhase13TestNode();
  const callee = await createPhase13TestNode();

  await registerBondedPeer(caller, callee, "Callee");
  await registerBondedPeer(callee, caller, "Caller");

  wireCallInboundHandler(caller);
  wireCallInboundHandler(callee);

  await reconnectCallHomes(caller, callee);

  return { caller, callee };
}

export async function teardownCallHomes(
  caller: Phase13TestNode,
  callee: Phase13TestNode,
): Promise<void> {
  await cleanupPhase13Node(caller);
  await cleanupPhase13Node(callee);
  await cleanupPhase13Harness();
}
