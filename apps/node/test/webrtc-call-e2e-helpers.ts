/**
 * Shared helpers for WebRTC voice/video call Playwright E2E (Vitest + Chromium).
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
  await page.addInitScript(() => {
    // Pre-seed localStorage so first-run setup + Getting Started guide are
    // skipped -- the call UI is what we want to exercise, and SetupView /
    // modal overlays would intercept pointer events in click-driven tests.
    try {
      localStorage.setItem("envoymesh.setupComplete", JSON.stringify({ ownerId: "envoy:owner:test", completedAt: "2025-01-01T00:00:00.000Z" }));
      localStorage.setItem("envoymesh.guideSeen:envoy:owner:test", "1");
    } catch (_) { /* private mode etc -- non-fatal */ }

    const TEST_PEER_ID = "12D3KooTest12NodeService";
    const TEST_OWNER_ID = "envoy:owner:test";

    const methodSmartResponse = (method: string, params: Record<string, unknown> | undefined): unknown => {
      if (method === "getProfile") return {
        owner: { ownerId: TEST_OWNER_ID, publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----" },
        device: { deviceId: "12D3KooTestDevice", publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----" },
        deviceCertificate: { deviceId: "12D3KooTestDevice", ownerId: TEST_OWNER_ID, publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----" },
      };
      if (method === "human.getProfile" || method === "getHumanProfile") return { ownerId: TEST_OWNER_ID, displayName: "Test User", username: "test" };
      if (method === "node.listBonds" || method === "listBonds" || method === "getBonds") return [{
        peerOwnerId: "envoy:owner:alice", peerPeerId: "12D3KooAliceTestPeer", displayName: "Alice",
        level: "direct", establishedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
      }];
      if (method === "listPendingShareOffers" || method === "listAgentShareProposals" || method === "listPendingSocialIntroProposals" || method === "listPendingHelloRequests" || method === "listChatHistory" || method === "listChatRooms") return [];
      if (method === "node.getStatus" || method === "getNodeStatus") return { status: "running", peerId: TEST_PEER_ID, meshConnected: true, transportHealthy: true };
      if (method === "node.getConfig" || method === "getNodeConfig") return { nodeInitialized: true, bootstrapPresets: [], iceServers: [], openclawEnabled: false, bridgeEnabled: false, chatAssistEnabled: true, autoChatReplyEnabled: false, autonomousKillSwitch: false };
      if (method === "node.getConnectionStatus" || method === "getConnectionStatus") return { online: true, peerId: TEST_PEER_ID, connectedRelays: [], listeningAddrs: [], transportHealthy: true, dhtHealthy: true };
      if (method === "bridge.getStatus" || method === "getBridgeStatus") return { enabled: false, agentPeerId: null, agentName: null, typing: false };
      if (method === "getPairedDiagnostics") return null;
      // Call-related: capture sendCallInvite params for the outbound assertion.
      if (method === "sendCallInvite") {
        (window as any).__lastSendCallInviteParams = params ?? null;
        return "call_e2e_outbound";
      }
      if (method === "acceptCallInvite" || method === "declineCallInvite" || method === "endCall" || method === "setCallMuted" || method === "sendIceCandidate") return true;
      return {};
    };

    class MockWebSocket extends EventTarget {
      url: string;
      readyState = 0;
      CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        (window as any).__mockWsInstance = this;
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.call(this, new Event("open"));
          this.dispatchEvent(new Event("open"));
          // Emit node:status + node:online so the React app transitions to
          // "connected" and the call UI mounts. The social-ui-e2e tests do
          // the same trick in their init script; we replicate it here so the
          // webrtc tests don't need a separate RPC stub.
          setTimeout(() => {
            const dispatch = (data: unknown) => {
              this.onmessage?.call(this, new MessageEvent("message", { data: JSON.stringify(data) }));
            };
            dispatch({ event: "node:status", data: { status: "running", peerId: TEST_PEER_ID } });
            dispatch({ event: "node:online", data: { peerId: TEST_PEER_ID, meshConnected: true } });
          }, 5);
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
          const payload = JSON.stringify({ id: req.id, result, ok: true });
          this.onmessage?.call(this, new MessageEvent("message", { data: payload }));
        };
        respond(methodSmartResponse(req.method, req.params));
      }

      close(): void {
        this.readyState = 3;
        this.onclose?.call(this, new Event("close"));
        this.dispatchEvent(new Event("close"));
      }
    }

    (window as any).WebSocket = MockWebSocket;
    // CRITICAL: WsClient.isConnected() compares readyState === WebSocket.OPEN.
    // Without these static constants on the constructor, isConnected() always
    // returns false, which leaves the React tree stuck on the "Connecting..."
    // splash and never fires the initial RPC burst that lets call signaling
    // actually run.
    (MockWebSocket as unknown as { OPEN: number }).OPEN = 1;
    (MockWebSocket as unknown as { CONNECTING: number }).CONNECTING = 0;
    (MockWebSocket as unknown as { CLOSING: number }).CLOSING = 2;
    (MockWebSocket as unknown as { CLOSED: number }).CLOSED = 3;
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
