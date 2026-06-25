/**
 * Shared helpers for WebRTC voice/video call Playwright E2E (Vitest + Chromium).
 */

import type { Page } from "playwright";
import {
  injectSocialE2eEvent,
  setupSocialE2eMockWebSocket,
  waitForSocialAppReady,
} from "./social-e2e-mock-ws.js";

/** Reject microphone access so the UI enters listen-only mode. */
export async function mockGetUserMediaFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Requested device not found", "NotFoundError"));
  });
}

/** Reject video capture only — audio succeeds (video call with camera unavailable). */
export async function mockGetUserMediaVideoFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    const original = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = (constraints) => {
      if (constraints && typeof constraints === "object" && constraints.video) {
        return Promise.reject(new DOMException("Requested device not found", "NotFoundError"));
      }
      return original(constraints);
    };
  });
}

/** Install a mock WebSocket that answers RPC and supports push event injection. */
export async function setupMockWebSocket(page: Page): Promise<void> {
  await setupSocialE2eMockWebSocket(page);
}

/** Push a node call event through the mock WebSocket (JsonRpcEvent shape). */
export async function injectCallPush(
  page: Page,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  await injectSocialE2eEvent(page, event, data);
}

/** Wait for main Social shell after mock WS bootstrap. */
export async function waitForSocialMainApp(page: Page, timeoutMs = 15_000): Promise<void> {
  await waitForSocialAppReady(page, timeoutMs);
}

/** Build a minimal audio SDP offer usable by RTCPeerConnection.setRemoteDescription. */
export async function generateAudioSdpOffer(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const pc = new RTCPeerConnection();
    pc.addTransceiver("audio", { direction: "recvonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = offer.sdp ?? "";
    pc.close();
    return sdp;
  });
}

/** Build a minimal audio+video SDP offer for callee accept flows. */
export async function generateVideoSdpOffer(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const pc = new RTCPeerConnection();
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addTransceiver("video", { direction: "recvonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = offer.sdp ?? "";
    pc.close();
    return sdp;
  });
}

/** Wait for the dev-only call session hook exposed by CallSessionProvider. */
export async function waitForCallSessionHook(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as any).__envoyCallSession?.startCall),
    { timeout: timeoutMs },
  );
}

/** Start an outbound call via the dev-only hook (avoids needing bonded contacts in UI). */
export async function startOutboundCallViaHook(
  page: Page,
  targetOwnerId: string,
  displayName: string,
  callType: "audio" | "video" = "audio",
): Promise<void> {
  await page.evaluate(
    async ({ ownerId, name, mediaType }) => {
      const session = (window as any).__envoyCallSession as {
        startCall: (id: string, label?: string, type?: "audio" | "video") => Promise<void>;
      };
      await session.startCall(ownerId, name, mediaType);
    },
    { ownerId: targetOwnerId, name: displayName, mediaType: callType },
  );
}

/** Read params from the last sendCallInvite RPC captured by the mock WebSocket. */
export async function getLastSendCallInviteParams(
  page: Page,
): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => (window as any).__lastSendCallInviteParams ?? null);
}
