/**
 * Phase 38 WebRTC voice-call E2E smoke test (Playwright).
 *
 * Opens the Social UI in Chromium with a mocked WebSocket to inject call
 * events, then verifies the full call lifecycle UI:
 *   - IncomingCallModal appears on `call:incoming`
 *   - Accept/Decline buttons work
 *   - ActiveCallPanel appears after accept
 *   - Mute toggles
 *   - End call closes the panel
 *
 * No real EnvoyMesh nodes required — the RPC layer is mocked by
 * intercepting WebSocket creation and injecting events.
 *
 * Prerequisites:
 *   npm install
 *   npx playwright install chromium
 *   Social UI dev server running at PLAYWRIGHT_BASE_URL
 *
 * Run standalone:
 *   npx playwright test
 *
 * Run with dev server:
 *   bash scripts/smoke-webrtc-call.sh
 */

import { test, expect } from "@playwright/test";

// --------------------------------------------------------------------------
// Test helpers — injected mock WebSocket
// --------------------------------------------------------------------------

/**
 * Inject a mock WebSocket handler into the page that intercepts the
 * EnvoyMesh RPC client and fires call events on demand.
 */
async function mockCallEvents(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const OrigWebSocket = (window as any).WebSocket;

    class MockWebSocket extends EventTarget {
      public readonly url: string;
      private _readyState = 1; // OPEN
      public onmessage: ((ev: MessageEvent) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        setTimeout(() => this.dispatchEvent(new Event("open")), 20);
      }

      get readyState() { return this._readyState; }
      send(_data: string) {} // no-op — events are injected by the test
      close() {
        this._readyState = 3;
        this.dispatchEvent(new Event("close"));
      }

      /** Dispatch a mock event from the test thread. */
      _dispatchEvent(data: object) {
        const msg = new MessageEvent("message", {
          data: JSON.stringify(data),
          origin: this.url,
        });
        if (this.onmessage) this.onmessage.call(this, msg);
      }
    }

    // Store the mock instance so the test can dispatch events
    (window as any).__mockWs = null;
    (window as any).WebSocket = MockWebSocket as any;
    (window as any).__OrigWebSocket = OrigWebSocket;
  });
}

/**
 * Dispatch a mock call event to the page.
 */
async function dispatchCallEvent(
  page: import("@playwright/test").Page,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    ({ type, data }) => {
      const mock = (window as any).__mockWs;
      if (!mock) {
        // Try to find the mock via the app's internal state
        // The mock is stored by the RPC client on window
        const ws = (window as any).__mockWsInstance;
        if (!ws) return;
        ws._dispatchEvent({ event: type, data });
        return;
      }
      mock._dispatchEvent({ event: type, data });
    },
    { type: eventType, data },
  );
  // Allow React to process the event
  await page.waitForTimeout(100);
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe("WebRTC voice call E2E", () => {
  test("1. incoming call modal appears and can be declined", async ({ page }) => {
    await page.goto("/");
    await mockCallEvents(page);

    // Acknowledge the app loaded
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(2000);

    // Dispatch incoming call event
    await dispatchCallEvent(page, "call:incoming", {
      callId: "call_test_001",
      peerOwnerId: "envoy:owner:alice",
      peerDisplayName: "Alice",
      callType: "audio",
    });

    // IncomingCallModal should appear
    const modal = page.locator("[data-testid='incoming-call-modal']");
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal).toContainText("Alice");

    // Click Decline
    await page.locator("[data-testid='incoming-call-decline']").click();

    // Dispatch reject ack
    await dispatchCallEvent(page, "call:rejected", {
      callId: "call_test_001",
      reason: "declined",
    });

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test("2. accept incoming call shows ActiveCallPanel", async ({ page }) => {
    await page.goto("/");
    await mockCallEvents(page);
    await page.waitForTimeout(2000);

    // Dispatch incoming call
    await dispatchCallEvent(page, "call:incoming", {
      callId: "call_test_002",
      peerOwnerId: "envoy:owner:bob",
      peerDisplayName: "Bob",
      callType: "audio",
    });

    const modal = page.locator("[data-testid='incoming-call-modal']");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Click Accept
    await page.locator("[data-testid='incoming-call-accept']").click();

    // Dispatch answered event
    await dispatchCallEvent(page, "call:answered", { callId: "call_test_002" });

    // Modal should close, ActiveCallPanel should appear
    await expect(modal).not.toBeVisible({ timeout: 3000 });

    const panel = page.locator("[data-testid='active-call-panel']");
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(panel).toContainText("Bob");
  });

  test("3. mute toggles and end call closes panel", async ({ page }) => {
    await page.goto("/");
    await mockCallEvents(page);
    await page.waitForTimeout(2000);

    // Setup active call
    await dispatchCallEvent(page, "call:incoming", {
      callId: "call_test_003",
      peerOwnerId: "envoy:owner:carol",
      peerDisplayName: "Carol",
      callType: "audio",
    });
    await page.locator("[data-testid='incoming-call-accept']").click();
    await dispatchCallEvent(page, "call:answered", { callId: "call_test_003" });

    const panel = page.locator("[data-testid='active-call-panel']");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Click mute
    const muteBtn = panel.locator("[data-testid='call-mute-toggle']");
    await muteBtn.click();

    // Verify mute indicator changed (the button title should now say "Unmute")
    await expect(muteBtn).toHaveAttribute("title", /unmute/i);

    // Click end call
    await panel.locator("[data-testid='call-end-button']").click();

    // Dispatch ended event
    await dispatchCallEvent(page, "call:ended", {
      callId: "call_test_003",
      reason: "normal",
    });

    // Panel should close
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });

  test("4. active call shows peer name and mute/end buttons", async ({ page }) => {
    await page.goto("/");
    await mockCallEvents(page);
    await page.waitForTimeout(2000);

    // Dispatch incoming call + accept
    await dispatchCallEvent(page, "call:incoming", {
      callId: "call_test_004",
      peerOwnerId: "envoy:owner:dave",
      peerDisplayName: "Dave",
      callType: "audio",
    });
    await page.locator("[data-testid='incoming-call-accept']").click();
    await dispatchCallEvent(page, "call:answered", { callId: "call_test_004" });

    // Verify ActiveCallPanel is visible
    const panel = page.locator("[data-testid='active-call-panel']");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Verify peer name is shown
    await expect(panel).toContainText("Dave");

    // Verify mute button exists
    const muteBtn = panel.locator("[data-testid='call-mute-toggle']");
    await expect(muteBtn).toBeVisible();

    // Verify end button exists
    const endBtn = panel.locator("[data-testid='call-end-button']");
    await expect(endBtn).toBeVisible();
  });

  test("5. end call via hangup event closes ActiveCallPanel", async ({ page }) => {
    await page.goto("/");
    await mockCallEvents(page);
    await page.waitForTimeout(2000);

    // Setup active call
    await dispatchCallEvent(page, "call:incoming", {
      callId: "call_test_005",
      peerOwnerId: "envoy:owner:eve",
      peerDisplayName: "Eve",
      callType: "audio",
    });
    await page.locator("[data-testid='incoming-call-accept']").click();
    await dispatchCallEvent(page, "call:answered", { callId: "call_test_005" });

    const panel = page.locator("[data-testid='active-call-panel']");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Remote party hangs up
    await dispatchCallEvent(page, "call:ended", {
      callId: "call_test_005",
      reason: "normal",
    });

    // Panel should close
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });

  test("6. call rejected with busy reason", async ({ page }) => {
    await page.goto("/");
    await mockCallEvents(page);
    await page.waitForTimeout(2000);

    // Setup active call first
    await dispatchCallEvent(page, "call:incoming", {
      callId: "call_test_006",
      peerOwnerId: "envoy:owner:frank",
      peerDisplayName: "Frank",
      callType: "audio",
    });
    await page.locator("[data-testid='incoming-call-accept']").click();
    await dispatchCallEvent(page, "call:answered", { callId: "call_test_006" });

    const panel = page.locator("[data-testid='active-call-panel']");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Remote rejects with busy
    await dispatchCallEvent(page, "call:rejected", {
      callId: "call_test_006",
      reason: "busy",
    });

    // Panel should close on reject
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });
});
