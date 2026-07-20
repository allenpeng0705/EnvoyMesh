# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: webrtc-call.smoke.ts >> WebRTC voice call E2E >> 5. end call via hangup event closes ActiveCallPanel
- Location: apps/social/test/e2e/webrtc-call.smoke.ts:241:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('[data-testid=\'incoming-call-accept\']')

```

# Page snapshot

```yaml
- status [ref=e4]:
  - generic [ref=e5]:
    - heading "Connecting to EnvoyMesh" [level=2] [ref=e7]
    - paragraph [ref=e8]: Opening node channel at ws://127.0.0.1:4030/ws
```

# Test source

```ts
  153 |     });
  154 | 
  155 |     const modal = page.locator("[data-testid='incoming-call-modal']");
  156 |     await expect(modal).toBeVisible({ timeout: 5000 });
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
> 253 |     await page.locator("[data-testid='incoming-call-accept']").click();
      |                                                                ^ Error: locator.click: Test timeout of 60000ms exceeded.
  254 |     await dispatchCallEvent(page, "call:answered", { callId: "call_test_005" });
  255 | 
  256 |     const panel = page.locator("[data-testid='active-call-panel']");
  257 |     await expect(panel).toBeVisible({ timeout: 5000 });
  258 | 
  259 |     // Remote party hangs up
  260 |     await dispatchCallEvent(page, "call:ended", {
  261 |       callId: "call_test_005",
  262 |       reason: "normal",
  263 |     });
  264 | 
  265 |     // Panel should close
  266 |     await expect(panel).not.toBeVisible({ timeout: 3000 });
  267 |   });
  268 | 
  269 |   test("6. call rejected with busy reason", async ({ page }) => {
  270 |     await page.goto("/");
  271 |     await mockCallEvents(page);
  272 |     await page.waitForTimeout(2000);
  273 | 
  274 |     // Setup active call first
  275 |     await dispatchCallEvent(page, "call:incoming", {
  276 |       callId: "call_test_006",
  277 |       peerOwnerId: "envoy:owner:frank",
  278 |       peerDisplayName: "Frank",
  279 |       callType: "audio",
  280 |     });
  281 |     await page.locator("[data-testid='incoming-call-accept']").click();
  282 |     await dispatchCallEvent(page, "call:answered", { callId: "call_test_006" });
  283 | 
  284 |     const panel = page.locator("[data-testid='active-call-panel']");
  285 |     await expect(panel).toBeVisible({ timeout: 5000 });
  286 | 
  287 |     // Remote rejects with busy
  288 |     await dispatchCallEvent(page, "call:rejected", {
  289 |       callId: "call_test_006",
  290 |       reason: "busy",
  291 |     });
  292 | 
  293 |     // Panel should close on reject
  294 |     await expect(panel).not.toBeVisible({ timeout: 3000 });
  295 |   });
  296 | });
  297 | 
```