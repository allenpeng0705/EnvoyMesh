/**
 * Phase 38 WebRTC voice-call E2E smoke test (Vitest + Playwright browser).
 *
 * Serves the pre-built Social UI from a static HTTP server, opens two
 * Chromium pages, and injects call events via a mock WebSocket so the
 * UI renders IncomingCallModal / ActiveCallPanel / calling-state banner
 * without requiring real EnvoyMesh nodes.
 *
 * Follows the same pattern as terminal-playwright-browser.test.ts.
 *
 * Run: npx vitest run apps/node/test/webrtc-call-e2e.test.ts
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

const WEB_PORT = 5400;
const WORKSPACE_ROOT = join(import.meta.dirname, "..", "..", "..");
const SOCIAL_DIST = join(WORKSPACE_ROOT, "apps", "social", "dist");

// --------------------------------------------------------------------------
// Static file server
// --------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
};

async function serveStatic(req: any, res: any): Promise<void> {
  let filePath = join(SOCIAL_DIST, req.url === "/" ? "index.html" : req.url);
  if (!extname(filePath)) filePath += ".html";
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    try {
      const index = await readFile(join(SOCIAL_DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(index);
    } catch {
      res.writeHead(404); res.end("Not found");
    }
  }
}

// --------------------------------------------------------------------------
// Helpers — inject call events into the page's mock WebSocket
// --------------------------------------------------------------------------

async function injectCallEvent(page: any, event: Record<string, unknown>): Promise<void> {
  await page.evaluate((ev: Record<string, unknown>) => {
    const handler = (window as any).__callEventHandler as ((e: any) => void) | undefined;
    if (handler) handler(ev);
  }, event);
}

// --------------------------------------------------------------------------
// Test
// --------------------------------------------------------------------------

describe("WebRTC voice call E2E", () => {
  let webServer: Server;
  let browser: any;
  let chromium: any;
  let profileDir: string;

  beforeAll(async () => {
    // Build Social UI if not already built
    const { spawnSync } = await import("node:child_process");
    const build = spawnSync("npm", ["run", "build", "-w", "@envoymesh/social", "--", "--mode", "development"], {
      cwd: WORKSPACE_ROOT, stdio: "pipe", timeout: 120_000,
    });
    console.log("[e2e] Build:", build.status === 0 ? "ok" : build.stderr.toString().slice(0, 200));

    // Start static HTTP server
    webServer = createServer(serveStatic);
    await new Promise<void>((r) => webServer.listen(WEB_PORT, r));
    console.log(`[e2e] Web server on :${WEB_PORT}`);

    // Launch Chromium
    try {
      chromium = (await import("playwright")).chromium;
      browser = await chromium.launch({
        headless: true,
        args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--no-sandbox", "--disable-setuid-sandbox"],
      });
      console.log("[e2e] Chromium launched");
    } catch (err) {
      console.warn("[e2e] Chromium unavailable — browser tests will be skipped");
    }

    profileDir = await mkdtemp(join(tmpdir(), "e2e-webrtc-"));
  }, 180_000);

  afterAll(async () => {
    if (browser) await browser.close().catch(() => {});
    if (webServer) await new Promise<void>((r) => webServer.close(() => r()));
    if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  });

  it("1. page loads", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${WEB_PORT}/`, { waitUntil: "domcontentloaded" });
      await sleep(2000);
      expect(await page.textContent("body")).toBeTruthy();
    } finally {
      await page.close();
    }
  }, 20_000);

  it("2. IncomingCallModal appears on call:incoming", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${WEB_PORT}/`, { waitUntil: "domcontentloaded" });
      await sleep(2000);

      // Inject a mock WebSocket handler so call events reach the app
      await page.evaluate(() => {
        const OrigWS = (window as any).WebSocket;
        class MockWS extends (OrigWS ?? EventTarget) {
          url: string;
          _onmsg: ((e: any) => void) | null = null;
          readyState = 1; // OPEN
          constructor(url: string) {
            super();
            this.url = url;
            setTimeout(() => this.dispatchEvent(new Event("open")), 10);
          }
          set onmessage(fn: ((e: any) => void) | null) { this._onmsg = fn; }
          get onmessage() { return this._onmsg; }
          send(_: string) {}
          close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
        }
        (window as any).WebSocket = MockWS as any;
        // After the app connects, store the handler so we can call it
        const origSet = Object.getOwnPropertyDescriptor(MockWS.prototype, "onmessage")?.set;
        if (origSet) {
          const orig = origSet;
          Object.defineProperty(MockWS.prototype, "onmessage", {
            set(fn) { orig.call(this, fn); (window as any).__callEventHandler = fn; },
            get() { return this._onmsg; },
          });
        }
      });

      // Wait for the app to initialize and connect
      await sleep(2000);

      // Inject incoming call event
      await injectCallEvent(page, {
        type: "call:incoming",
        callId: "call_test_001",
        peerOwnerId: "envoy:owner:alice",
        peerDisplayName: "Alice",
        callType: "audio",
      });

      await sleep(500);

      // Verify the IncomingCallModal appeared
      const modal = await page.locator(".incoming-call-modal");
      await modal.waitFor({ state: "visible", timeout: 5_000 });
      const text = await modal.textContent();
      expect(text).toContain("Alice");
    } finally {
      await page.close();
    }
  }, 25_000);

  it("3. Accept call → ActiveCallPanel visible", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${WEB_PORT}/`, { waitUntil: "domcontentloaded" });
      await sleep(2000);

      // Inject mock WebSocket (same as test 2)
      await page.evaluate(() => {
        const OrigWS = (window as any).WebSocket;
        class MockWS extends (OrigWS ?? EventTarget) {
          url: string; _onmsg: ((e: any) => void) | null = null; readyState = 1;
          constructor(url: string) { super(); this.url = url; setTimeout(() => this.dispatchEvent(new Event("open")), 10); }
          set onmessage(fn: ((e: any) => void) | null) { this._onmsg = fn; (window as any).__callEventHandler = fn; }
          get onmessage() { return this._onmsg; }
          send(_: string) {} close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
        }
        (window as any).WebSocket = MockWS as any;
      });

      await sleep(2000);

      // Inject incoming call
      await injectCallEvent(page, {
        type: "call:incoming",
        callId: "call_test_002",
        peerOwnerId: "envoy:owner:bob",
        peerDisplayName: "Bob",
        callType: "audio",
      });
      await sleep(300);

      // Verify incoming modal
      await page.locator(".incoming-call-modal").waitFor({ state: "visible", timeout: 5_000 });

      // Click accept
      await page.click(".incoming-call-accept");
      await sleep(200);

      // Inject call:answered event (simulating peer accepted)
      await injectCallEvent(page, { type: "call:answered", callId: "call_test_002" });
      await sleep(300);

      // Verify ActiveCallPanel is visible and shows peer name
      const panel = page.locator(".active-call-panel");
      await panel.waitFor({ state: "visible", timeout: 5_000 });
      const panelText = await panel.textContent();
      expect(panelText).toContain("Bob");
    } finally {
      await page.close();
    }
  }, 25_000);

  it("4. End call closes ActiveCallPanel", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${WEB_PORT}/`, { waitUntil: "domcontentloaded" });
      await sleep(2000);

      await page.evaluate(() => {
        const OrigWS = (window as any).WebSocket;
        class MockWS extends (OrigWS ?? EventTarget) {
          url: string; _onmsg: ((e: any) => void) | null = null; readyState = 1;
          constructor(url: string) { super(); this.url = url; setTimeout(() => this.dispatchEvent(new Event("open")), 10); }
          set onmessage(fn: ((e: any) => void) | null) { this._onmsg = fn; (window as any).__callEventHandler = fn; }
          get onmessage() { return this._onmsg; }
          send(_: string) {} close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
        }
        (window as any).WebSocket = MockWS as any;
      });

      await sleep(2000);

      // Setup call
      await injectCallEvent(page, { type: "call:incoming", callId: "call_test_003", peerOwnerId: "envoy:owner:carol", peerDisplayName: "Carol", callType: "audio" });
      await sleep(300);
      await page.click(".incoming-call-accept");
      await injectCallEvent(page, { type: "call:answered", callId: "call_test_003" });
      await sleep(300);
      await page.locator(".active-call-panel").waitFor({ state: "visible", timeout: 5_000 });

      // End call
      await page.click("button[title='End call']");
      await injectCallEvent(page, { type: "call:ended", callId: "call_test_003", reason: "normal" });
      await sleep(500);

      // Verify panel is gone
      await page.waitForFunction(
        () => !document.querySelector(".active-call-panel") && !document.querySelector(".incoming-call-modal"),
        { timeout: 5_000 },
      );
    } finally {
      await page.close();
    }
  }, 25_000);

  it("5. Decline incoming call", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${WEB_PORT}/`, { waitUntil: "domcontentloaded" });
      await sleep(2000);

      await page.evaluate(() => {
        const OrigWS = (window as any).WebSocket;
        class MockWS extends (OrigWS ?? EventTarget) {
          url: string; _onmsg: ((e: any) => void) | null = null; readyState = 1;
          constructor(url: string) { super(); this.url = url; setTimeout(() => this.dispatchEvent(new Event("open")), 10); }
          set onmessage(fn: ((e: any) => void) | null) { this._onmsg = fn; (window as any).__callEventHandler = fn; }
          get onmessage() { return this._onmsg; }
          send(_: string) {} close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
        }
        (window as any).WebSocket = MockWS as any;
      });

      await sleep(2000);

      await injectCallEvent(page, { type: "call:incoming", callId: "call_test_004", peerOwnerId: "envoy:owner:dave", peerDisplayName: "Dave", callType: "audio" });
      await sleep(300);
      await page.locator(".incoming-call-modal").waitFor({ state: "visible", timeout: 5_000 });

      // Click decline
      await page.click(".incoming-call-decline");
      await sleep(500);

      // Verify modal is gone
      await page.waitForFunction(() => !document.querySelector(".incoming-call-modal"), { timeout: 5_000 });
    } finally {
      await page.close();
    }
  }, 25_000);

  it("6. Mute toggle in ActiveCallPanel", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${WEB_PORT}/`, { waitUntil: "domcontentloaded" });
      await sleep(2000);

      await page.evaluate(() => {
        const OrigWS = (window as any).WebSocket;
        class MockWS extends (OrigWS ?? EventTarget) {
          url: string; _onmsg: ((e: any) => void) | null = null; readyState = 1;
          constructor(url: string) { super(); this.url = url; setTimeout(() => this.dispatchEvent(new Event("open")), 10); }
          set onmessage(fn: ((e: any) => void) | null) { this._onmsg = fn; (window as any).__callEventHandler = fn; }
          get onmessage() { return this._onmsg; }
          send(_: string) {} close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
        }
        (window as any).WebSocket = MockWS as any;
      });

      await sleep(2000);

      // Setup call
      await injectCallEvent(page, { type: "call:incoming", callId: "call_test_005", peerOwnerId: "envoy:owner:eve", peerDisplayName: "Eve", callType: "audio" });
      await sleep(300);
      await page.click(".incoming-call-accept");
      await injectCallEvent(page, { type: "call:answered", callId: "call_test_005" });
      await sleep(300);
      await page.locator(".active-call-panel").waitFor({ state: "visible", timeout: 5_000 });

      // Click mute button (first button with title attribute in the panel)
      const muteBtn = page.locator(".active-call-panel button[title]").first();
      await muteBtn.click();
      await sleep(500);

      // After clicking mute, the button title should change to "Unmute"
      const title = await muteBtn.getAttribute("title");
      expect(title?.toLowerCase()).toContain("unmute");
    } finally {
      await page.close();
    }
  }, 25_000);
});
