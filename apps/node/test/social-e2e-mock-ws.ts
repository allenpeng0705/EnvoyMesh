/**
 * Shared mock WebSocket for Social UI Playwright E2E (Vitest + Chromium).
 * Answers bootstrap RPCs so App.tsx reaches the main shell (not SetupView / splash).
 */

import type { Page } from "playwright";

const E2E_CHAT_ROOMS = [
  {
    roomId: "test",
    title: "Test Room",
    creatorOwnerId: "envoy:owner:e2e-self",
    memberOwnerIds: ["envoy:owner:e2e-self"],
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    roomId: "team",
    title: "Team",
    creatorOwnerId: "envoy:owner:e2e-self",
    memberOwnerIds: ["envoy:owner:e2e-self"],
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
];

const E2E_PROFILE = {
  owner: { ownerId: "envoy:owner:e2e-self", publicKeyPem: "-----BEGIN PUBLIC KEY-----\nE2E\n-----END PUBLIC KEY-----" },
  device: { deviceId: "envoy:device:e2e-self", publicKeyPem: "-----BEGIN PUBLIC KEY-----\nE2E-DEV\n-----END PUBLIC KEY-----" },
};

/** Install mock WebSocket before navigation (page.addInitScript). */
export async function setupSocialE2eMockWebSocket(page: Page): Promise<void> {
  await page.addInitScript(({ profile, chatRooms }) => {
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState = 1;
      private _onmessage: ((ev: MessageEvent) => void) | null = null;
      private _onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        (window as unknown as { __mockWsInstance?: MockWebSocket }).__mockWsInstance = this;
      }

      set onopen(fn: ((ev: Event) => void) | null) {
        this._onopen = fn;
        if (!fn) return;
        queueMicrotask(() => {
          if (this._onopen !== fn) return;
          fn.call(this, new Event("open"));
          this.dispatchEvent(new Event("open"));
        });
      }

      get onopen(): ((ev: Event) => void) | null {
        return this._onopen;
      }

      set onmessage(fn: ((ev: MessageEvent) => void) | null) {
        this._onmessage = fn;
      }

      get onmessage(): ((ev: MessageEvent) => void) | null {
        return this._onmessage;
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
          queueMicrotask(() => {
            this._onmessage?.call(this, new MessageEvent("message", { data: payload }));
          });
        };

        switch (req.method) {
          case "getNodeStatus":
            respond({ status: "running" });
            break;
          case "getNodeConfig":
            respond({ bootstrapPresets: [], iceServers: [] });
            break;
          case "getConnectionStatus":
            respond({ peerId: "12D3KooWE2EPeerId000000000000000000000000", connected: true });
            break;
          case "getProfile":
            respond(profile);
            break;
          case "getHumanProfile":
            respond({
              ownerId: profile.owner.ownerId,
              displayName: "E2E User",
              bio: "",
              hobbies: [],
              knowledge: [],
              updatedAt: new Date().toISOString(),
              signature: "e2e-signature",
            });
            break;
          case "getBridgeStatus":
            respond({ enabled: false, agentPeerId: "", typing: false });
            break;
          case "getBonds":
            respond([
              {
                peerOwnerId: "envoy:owner:e2e-friend",
                displayName: "E2E Friend",
                tier: "direct",
                establishedAt: new Date().toISOString(),
              },
            ]);
            break;
          case "listChatRooms":
            respond(chatRooms);
            break;
          case "chainListActive":
            respond({ chains: [] });
            break;
          case "getPairedDiagnostics":
            respond({});
            break;
          case "listPendingShareOffers":
          case "listAgentShareProposals":
          case "listPendingSocialIntroProposals":
          case "listPendingHelloRequests":
            respond([]);
            break;
          case "sendCallInvite":
            (window as unknown as { __lastSendCallInviteParams?: Record<string, unknown> }).__lastSendCallInviteParams =
              req.params ?? null;
            respond("call_e2e_outbound");
            break;
          case "acceptCallInvite":
          case "declineCallInvite":
          case "endCall":
          case "setCallMuted":
          case "sendIceCandidate":
            respond(true);
            break;
          default:
            if (req.method.startsWith("list") || req.method.endsWith("History")) {
              respond([]);
            } else if (req.method.startsWith("get") && req.method.includes("Report")) {
              respond([]);
            } else {
              respond(null);
            }
            break;
        }
      }

      close(): void {
        this.readyState = 3;
        this.onclose?.call(this, new Event("close"));
        this.dispatchEvent(new Event("close"));
      }
    }

    (window as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  }, { profile: E2E_PROFILE, chatRooms: E2E_CHAT_ROOMS });
}

/** Push a node event through the mock WebSocket (JsonRpcEvent shape). */
export async function injectSocialE2eEvent(
  page: Page,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    ({ eventName, eventData }) => {
      const mock = (window as unknown as { __mockWsInstance?: { onmessage: ((ev: MessageEvent) => void) | null } })
        .__mockWsInstance;
      if (!mock?.onmessage) return;
      const payload = JSON.stringify({ event: eventName, data: eventData });
      mock.onmessage(new MessageEvent("message", { data: payload }));
    },
    { eventName: event, eventData: data },
  );
}

/** Wait until main app shell is visible (past SetupView / connecting splash). */
export async function waitForSocialAppReady(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForSelector(".main, header", { timeout: timeoutMs });
}
