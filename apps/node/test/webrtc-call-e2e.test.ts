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
import { readFile, stat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  generateAudioSdpOffer,
  generateVideoSdpOffer,
  getLastSendCallInviteParams,
  injectCallPush,
  mockGetUserMediaFailure,
  mockGetUserMediaVideoFailure,
  setupMockWebSocket,
  startOutboundCallViaHook,
  waitForCallSessionHook,
  waitForSocialMainApp,
} from "./webrtc-call-e2e-helpers.js";
import { pickFreePort } from "./playwright-e2e-port.js";

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

let webPort = 0;
const WORKSPACE_ROOT = join(import.meta.dirname, "..", "..", "..");
const SOCIAL_DIST = join(WORKSPACE_ROOT, "apps", "social", "src", "dist");

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

async function prepareCallPage(page: any): Promise<void> {
  await setupMockWebSocket(page);
}

async function openSocialPage(page: any): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" });
  await waitForSocialMainApp(page);
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
    try { await stat(join(SOCIAL_DIST, "index.html")); }
    catch {
      const { spawnSync } = await import("node:child_process");
      spawnSync("npm", ["run", "build", "-w", "@envoymesh/social", "--", "--mode", "development"], {
        cwd: WORKSPACE_ROOT, stdio: "pipe", timeout: 120_000,
      });
    }

    // Start static HTTP server
    webPort = await pickFreePort();
    webServer = createServer(serveStatic);
    await new Promise<void>((r) => webServer.listen(webPort, "127.0.0.1", r));
    console.log(`[e2e] Web server on :${webPort}`);

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
      await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" });
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
      await prepareCallPage(page);
      await openSocialPage(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_001",
        peerOwnerId: "envoy:owner:alice",
        peerDisplayName: "Alice",
        callType: "audio",
      });

      await sleep(500);

      const modal = await page.locator(".incoming-call-overlay");
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
      await prepareCallPage(page);
      await openSocialPage(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_002",
        peerOwnerId: "envoy:owner:bob",
        peerDisplayName: "Bob",
        callType: "audio",
        sdpOffer: await generateAudioSdpOffer(page),
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      await sleep(300);

      await page.locator(".incoming-call-overlay").waitFor({ state: "visible", timeout: 5_000 });
      await page.click(".incoming-call-action--accept");
      await sleep(200);

      await injectCallPush(page, "call:answered", { callId: "call_test_002" });
      await sleep(300);

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
      await prepareCallPage(page);
      await openSocialPage(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_003",
        peerOwnerId: "envoy:owner:carol",
        peerDisplayName: "Carol",
        callType: "audio",
      });
      await sleep(300);
      await page.click(".incoming-call-action--accept");
      await injectCallPush(page, "call:answered", { callId: "call_test_003" });
      await sleep(300);
      await page.locator(".active-call-panel").waitFor({ state: "visible", timeout: 5_000 });

      await page.click("button[title='End call']");
      await injectCallPush(page, "call:ended", { callId: "call_test_003", reason: "normal" });
      await sleep(500);

      await page.waitForFunction(
        () => !document.querySelector(".active-call-panel") && !document.querySelector(".incoming-call-overlay"),
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
      await prepareCallPage(page);
      await openSocialPage(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_004",
        peerOwnerId: "envoy:owner:dave",
        peerDisplayName: "Dave",
        callType: "audio",
      });
      await sleep(300);
      await page.locator(".incoming-call-overlay").waitFor({ state: "visible", timeout: 5_000 });

      await page.click(".incoming-call-action--decline");
      await sleep(500);

      await page.waitForFunction(() => !document.querySelector(".incoming-call-overlay"), { timeout: 5_000 });
    } finally {
      await page.close();
    }
  }, 25_000);

  it("6. Mute toggle in ActiveCallPanel", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await prepareCallPage(page);
      await openSocialPage(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_005",
        peerOwnerId: "envoy:owner:eve",
        peerDisplayName: "Eve",
        callType: "audio",
      });
      await sleep(300);
      await page.click(".incoming-call-action--accept");
      await injectCallPush(page, "call:answered", { callId: "call_test_005" });
      await sleep(300);
      await page.locator(".active-call-panel").waitFor({ state: "visible", timeout: 5_000 });

      const muteBtn = page.locator(".active-call-panel button[title]").first();
      await muteBtn.click();
      await sleep(500);

      const title = await muteBtn.getAttribute("title");
      expect(title?.toLowerCase()).toContain("unmute");
    } finally {
      await page.close();
    }
  }, 25_000);

  it("7. call:reinvite updates incoming offer (Path 1 → Path 2 UI)", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await prepareCallPage(page);
      await openSocialPage(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_006",
        peerOwnerId: "envoy:owner:frank",
        peerDisplayName: "Frank",
        callType: "audio",
        sdpOffer: "path1-offer",
        iceServers: [],
      });
      await page.locator(".incoming-call-overlay").waitFor({ state: "visible", timeout: 5_000 });

      await injectCallPush(page, "call:reinvite", {
        callId: "call_test_006",
        peerOwnerId: "envoy:owner:frank",
        sdpOffer: "path2-offer",
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        reason: "path1_timeout",
        transportPath: "path2",
      });
      await sleep(300);

      await page.locator(".incoming-call-overlay").waitFor({ state: "visible", timeout: 5_000 });
    } finally {
      await page.close();
    }
  }, 25_000);

  it("8. outbound Calling banner → active dock when getUserMedia fails (listen-only)", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await mockGetUserMediaFailure(page);
      await prepareCallPage(page);
      await openSocialPage(page);
      await waitForCallSessionHook(page);

      await startOutboundCallViaHook(page, "envoy:owner:windows", "Windows PC");
      await sleep(500);

      const banner = page.locator(".global-calling-banner");
      await banner.waitFor({ state: "visible", timeout: 8_000 });
      const bannerText = await banner.textContent();
      expect(bannerText?.toLowerCase()).toMatch(/calling/);

      await injectCallPush(page, "call:answered", {
        callId: "call_e2e_outbound",
        sdpAnswer: await generateAudioSdpOffer(page),
      });
      await sleep(500);

      const panel = page.locator(".active-call-panel");
      await panel.waitFor({ state: "visible", timeout: 8_000 });
      const panelText = await panel.textContent();
      expect(panelText?.toLowerCase()).toMatch(/listen only|no microphone/);
    } finally {
      await page.close();
    }
  }, 30_000);

  it("9. accept incoming call shows listen-only active dock when getUserMedia fails", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await mockGetUserMediaFailure(page);
      await prepareCallPage(page);
      await openSocialPage(page);

      const sdpOffer = await generateAudioSdpOffer(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_listen_only",
        peerOwnerId: "envoy:owner:mac",
        peerDisplayName: "MacBook",
        callType: "audio",
        sdpOffer,
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      await page.locator(".incoming-call-overlay").waitFor({ state: "visible", timeout: 5_000 });

      await page.click(".incoming-call-action--accept");
      await sleep(800);

      const panel = page.locator(".active-call-panel");
      await panel.waitFor({ state: "visible", timeout: 8_000 });
      const panelText = await panel.textContent();
      expect(panelText).toContain("MacBook");
      expect(panelText?.toLowerCase()).toMatch(/listen only|no microphone/);
    } finally {
      await page.close();
    }
  }, 30_000);

  it("10. incoming video call modal shows video copy", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await prepareCallPage(page);
      await openSocialPage(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_video_001",
        peerOwnerId: "envoy:owner:alice",
        peerDisplayName: "Alice",
        callType: "video",
      });
      await sleep(500);

      const modal = page.locator(".incoming-call-overlay");
      await modal.waitFor({ state: "visible", timeout: 5_000 });
      const text = await modal.textContent();
      expect(text?.toLowerCase()).toContain("video");
      expect(text).toContain("Alice");
    } finally {
      await page.close();
    }
  }, 25_000);

  it("11. accept video incoming → video active dock", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await prepareCallPage(page);
      await openSocialPage(page);

      const sdpOffer = await generateVideoSdpOffer(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_video_002",
        peerOwnerId: "envoy:owner:bob",
        peerDisplayName: "Bob",
        callType: "video",
        sdpOffer,
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      await page.locator(".incoming-call-overlay").waitFor({ state: "visible", timeout: 5_000 });
      await page.click(".incoming-call-action--accept");
      await sleep(800);

      const panel = page.locator(".active-call-panel--video");
      await panel.waitFor({ state: "visible", timeout: 8_000 });
      await page.locator(".active-call-video-stage").waitFor({ state: "visible", timeout: 5_000 });
      expect(await page.locator(".active-call-remote-video").count()).toBe(1);
      const panelText = await panel.textContent();
      expect(panelText).toContain("Bob");
    } finally {
      await page.close();
    }
  }, 30_000);

  it("12. outbound video call sends callType video via sendCallInvite RPC", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await prepareCallPage(page);
      await openSocialPage(page);
      await waitForCallSessionHook(page);

      await startOutboundCallViaHook(page, "envoy:owner:windows", "Windows PC", "video");
      await sleep(500);

      const params = await getLastSendCallInviteParams(page);
      expect(params).toBeTruthy();
      expect(params?.callType).toBe("video");
      expect(params?.targetOwnerId).toBe("envoy:owner:windows");
    } finally {
      await page.close();
    }
  }, 30_000);

  it("13. video call with camera denied shows audio-only hint", async (ctx) => {
    if (!browser) { ctx.skip(true, "Chromium not installed"); return; }
    const page = await browser.newPage();
    try {
      await mockGetUserMediaVideoFailure(page);
      await prepareCallPage(page);
      await openSocialPage(page);

      const sdpOffer = await generateVideoSdpOffer(page);

      await injectCallPush(page, "call:incoming", {
        callId: "call_test_video_no_cam",
        peerOwnerId: "envoy:owner:mac",
        peerDisplayName: "MacBook",
        callType: "video",
        sdpOffer,
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      await page.locator(".incoming-call-overlay").waitFor({ state: "visible", timeout: 5_000 });
      await page.click(".incoming-call-action--accept");
      await sleep(800);

      const panel = page.locator(".active-call-panel--video");
      await panel.waitFor({ state: "visible", timeout: 8_000 });
      const panelText = await panel.textContent();
      expect(panelText?.toLowerCase()).toMatch(/no camera|audio only/);
    } finally {
      await page.close();
    }
  }, 30_000);
});
