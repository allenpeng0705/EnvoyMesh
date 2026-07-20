# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: webrtc-call.smoke.ts >> WebRTC voice call E2E >> 2. accept incoming call shows ActiveCallPanel
- Location: apps/social/test/e2e/webrtc-call.smoke.ts:142:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid=\'incoming-call-modal\']')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-testid=\'incoming-call-modal\']')

```

```yaml
- status:
  - heading "Connecting to EnvoyMesh" [level=2]
  - paragraph: Opening node channel at ws://127.0.0.1:4030/ws
```

# Test source

```ts
  56  |         this.dispatchEvent(new Event("close"));
  57  |       }
  58  | 
  59  |       /** Dispatch a mock event from the test thread. */
  60  |       _dispatchEvent(data: object) {
  61  |         const msg = new MessageEvent("message", {
  62  |           data: JSON.stringify(data),
  63  |           origin: this.url,
  64  |         });
  65  |         if (this.onmessage) this.onmessage.call(this, msg);
  66  |       }
  67  |     }
  68  | 
  69  |     // Store the mock instance so the test can dispatch events
  70  |     (window as any).__mockWs = null;
  71  |     (window as any).WebSocket = MockWebSocket as any;
  72  |     (window as any).__OrigWebSocket = OrigWebSocket;
  73  |   });
  74  | }
  75  | 
  76  | /**
  77  |  * Dispatch a mock call event to the page.
  78  |  */
  79  | async function dispatchCallEvent(
  80  |   page: import("@playwright/test").Page,
  81  |   eventType: string,
  82  |   data: Record<string, unknown>,
  83  | ): Promise<void> {
  84  |   await page.evaluate(
  85  |     ({ type, data }) => {
  86  |       const mock = (window as any).__mockWs;
  87  |       if (!mock) {
  88  |         // Try to find the mock via the app's internal state
  89  |         // The mock is stored by the RPC client on window
  90  |         const ws = (window as any).__mockWsInstance;
  91  |         if (!ws) return;
  92  |         ws._dispatchEvent({ event: type, data });
  93  |         return;
  94  |       }
  95  |       mock._dispatchEvent({ event: type, data });
  96  |     },
  97  |     { type: eventType, data },
  98  |   );
  99  |   // Allow React to process the event
  100 |   await page.waitForTimeout(100);
  101 | }
  102 | 
  103 | // --------------------------------------------------------------------------
  104 | // Tests
  105 | // --------------------------------------------------------------------------
  106 | 
  107 | test.describe("WebRTC voice call E2E", () => {
  108 |   test("1. incoming call modal appears and can be declined", async ({ page }) => {
  109 |     await page.goto("/");
  110 |     await mockCallEvents(page);
  111 | 
  112 |     // Acknowledge the app loaded
  113 |     await expect(page.locator("body")).toBeVisible();
  114 |     await page.waitForTimeout(2000);
  115 | 
  116 |     // Dispatch incoming call event
  117 |     await dispatchCallEvent(page, "call:incoming", {
  118 |       callId: "call_test_001",
  119 |       peerOwnerId: "envoy:owner:alice",
  120 |       peerDisplayName: "Alice",
  121 |       callType: "audio",
  122 |     });
  123 | 
  124 |     // IncomingCallModal should appear
  125 |     const modal = page.locator("[data-testid='incoming-call-modal']");
  126 |     await expect(modal).toBeVisible({ timeout: 5000 });
  127 |     await expect(modal).toContainText("Alice");
  128 | 
  129 |     // Click Decline
  130 |     await page.locator("[data-testid='incoming-call-decline']").click();
  131 | 
  132 |     // Dispatch reject ack
  133 |     await dispatchCallEvent(page, "call:rejected", {
  134 |       callId: "call_test_001",
  135 |       reason: "declined",
  136 |     });
  137 | 
  138 |     // Modal should close
  139 |     await expect(modal).not.toBeVisible({ timeout: 3000 });
  140 |   });
  141 | 
  142 |   test("2. accept incoming call shows ActiveCallPanel", async ({ page }) => {
  143 |     await page.goto("/");
  144 |     await mockCallEvents(page);
  145 |     await page.waitForTimeout(2000);
  146 | 
  147 |     // Dispatch incoming call
  148 |     await dispatchCallEvent(page, "call:incoming", {
  149 |       callId: "call_test_002",
  150 |       peerOwnerId: "envoy:owner:bob",
  151 |       peerDisplayName: "Bob",
  152 |       callType: "audio",
  153 |     });
  154 | 
  155 |     const modal = page.locator("[data-testid='incoming-call-modal']");
> 156 |     await expect(modal).toBeVisible({ timeout: 5000 });
      |                         ^ Error: expect(locator).toBeVisible() failed
  157 | 
  158 |     // Click Accept
  159 |     await page.locator("[data-testid='incoming-call-accept']").click();
  160 | 
  161 |     // Dispatch answered event
  162 |     await dispatchCallEvent(page, "call:answered", { callId: "call_test_002" });
  163 | 
  164 |     // Modal should close, ActiveCallPanel should appear
  165 |     await expect(modal).not.toBeVisible({ timeout: 3000 });
  166 | 
  167 |     const panel = page.locator("[data-testid='active-call-panel']");
  168 |     await expect(panel).toBeVisible({ timeout: 5000 });
  169 |     await expect(panel).toContainText("Bob");
  170 |   });
  171 | 
  172 |   test("3. mute toggles and end call closes panel", async ({ page }) => {
  173 |     await page.goto("/");
  174 |     await mockCallEvents(page);
  175 |     await page.waitForTimeout(2000);
  176 | 
  177 |     // Setup active call
  178 |     await dispatchCallEvent(page, "call:incoming", {
  179 |       callId: "call_test_003",
  180 |       peerOwnerId: "envoy:owner:carol",
  181 |       peerDisplayName: "Carol",
  182 |       callType: "audio",
  183 |     });
  184 |     await page.locator("[data-testid='incoming-call-accept']").click();
  185 |     await dispatchCallEvent(page, "call:answered", { callId: "call_test_003" });
  186 | 
  187 |     const panel = page.locator("[data-testid='active-call-panel']");
  188 |     await expect(panel).toBeVisible({ timeout: 5000 });
  189 | 
  190 |     // Click mute
  191 |     const muteBtn = panel.locator("[data-testid='call-mute-toggle']");
  192 |     await muteBtn.click();
  193 | 
  194 |     // Verify mute indicator changed (the button title should now say "Unmute")
  195 |     await expect(muteBtn).toHaveAttribute("title", /unmute/i);
  196 | 
  197 |     // Click end call
  198 |     await panel.locator("[data-testid='call-end-button']").click();
  199 | 
  200 |     // Dispatch ended event
  201 |     await dispatchCallEvent(page, "call:ended", {
  202 |       callId: "call_test_003",
  203 |       reason: "normal",
  204 |     });
  205 | 
  206 |     // Panel should close
  207 |     await expect(panel).not.toBeVisible({ timeout: 3000 });
  208 |   });
  209 | 
  210 |   test("4. active call shows peer name and mute/end buttons", async ({ page }) => {
  211 |     await page.goto("/");
  212 |     await mockCallEvents(page);
  213 |     await page.waitForTimeout(2000);
  214 | 
  215 |     // Dispatch incoming call + accept
  216 |     await dispatchCallEvent(page, "call:incoming", {
  217 |       callId: "call_test_004",
  218 |       peerOwnerId: "envoy:owner:dave",
  219 |       peerDisplayName: "Dave",
  220 |       callType: "audio",
  221 |     });
  222 |     await page.locator("[data-testid='incoming-call-accept']").click();
  223 |     await dispatchCallEvent(page, "call:answered", { callId: "call_test_004" });
  224 | 
  225 |     // Verify ActiveCallPanel is visible
  226 |     const panel = page.locator("[data-testid='active-call-panel']");
  227 |     await expect(panel).toBeVisible({ timeout: 5000 });
  228 | 
  229 |     // Verify peer name is shown
  230 |     await expect(panel).toContainText("Dave");
  231 | 
  232 |     // Verify mute button exists
  233 |     const muteBtn = panel.locator("[data-testid='call-mute-toggle']");
  234 |     await expect(muteBtn).toBeVisible();
  235 | 
  236 |     // Verify end button exists
  237 |     const endBtn = panel.locator("[data-testid='call-end-button']");
  238 |     await expect(endBtn).toBeVisible();
  239 |   });
  240 | 
  241 |   test("5. end call via hangup event closes ActiveCallPanel", async ({ page }) => {
  242 |     await page.goto("/");
  243 |     await mockCallEvents(page);
  244 |     await page.waitForTimeout(2000);
  245 | 
  246 |     // Setup active call
  247 |     await dispatchCallEvent(page, "call:incoming", {
  248 |       callId: "call_test_005",
  249 |       peerOwnerId: "envoy:owner:eve",
  250 |       peerDisplayName: "Eve",
  251 |       callType: "audio",
  252 |     });
  253 |     await page.locator("[data-testid='incoming-call-accept']").click();
  254 |     await dispatchCallEvent(page, "call:answered", { callId: "call_test_005" });
  255 | 
  256 |     const panel = page.locator("[data-testid='active-call-panel']");
```