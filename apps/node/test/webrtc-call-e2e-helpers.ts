/**
 * Shared helpers for WebRTC voice-call Playwright E2E (Vitest + Chromium).
 */

import type { Page } from "playwright";

/** Reject microphone access so the UI enters listen-only mode. */
export async function mockGetUserMediaFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Requested device not found", "NotFoundError"));
  });
}

/** Install a mock WebSocket that answers RPC and supports push event injection. */
export async function setupMockWebSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      url: string;
      readyState = 1;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        (window as any).__mockWsInstance = this;
        setTimeout(() => {
          this.onopen?.call(this, new Event("open"));
          this.dispatchEvent(new Event("open"));
        }, 10);
      }

      send(data: string): void {
        let req: { id?: string; method?: string; params?: Record<string, unknown> };
        try {
          req = JSON.parse(data);
        } catch {
          return;
        }
        if (!req.id || !req.method) return;

        const respond = (result: unknown) => {
          const payload = JSON.stringify({ id: req.id, result });
          this.onmessage?.call(this, new MessageEvent("message", { data: payload }));
        };

        switch (req.method) {
          case "sendCallInvite":
            respond("call_e2e_outbound");
            break;
          case "acceptCallInvite":
          case "declineCallInvite":
          case "endCall":
          case "setCallMuted":
          case "sendIceCandidate":
            respond(true);
            break;
          case "getNodeConfig":
            respond({ iceServers: [] });
            break;
          default:
            respond(null);
        }
      }

      close(): void {
        this.readyState = 3;
        this.onclose?.call(this, new Event("close"));
        this.dispatchEvent(new Event("close"));
      }
    }

    (window as any).WebSocket = MockWebSocket;
  });
}

/** Push a node call event through the mock WebSocket (JsonRpcEvent shape). */
export async function injectCallPush(
  page: Page,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    ({ eventName, eventData }) => {
      const mock = (window as any).__mockWsInstance as {
        onmessage: ((ev: MessageEvent) => void) | null;
      } | undefined;
      if (!mock?.onmessage) return;
      const payload = JSON.stringify({ event: eventName, data: eventData });
      mock.onmessage(new MessageEvent("message", { data: payload }));
    },
    { eventName: event, eventData: data },
  );
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
): Promise<void> {
  await page.evaluate(
    async ({ ownerId, name }) => {
      const session = (window as any).__envoyCallSession as {
        startCall: (id: string, label?: string) => Promise<void>;
      };
      await session.startCall(ownerId, name);
    },
    { ownerId: targetOwnerId, name: displayName },
  );
}
