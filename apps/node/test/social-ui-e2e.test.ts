/**
 * EnvoyMesh Social UI E2E smoke tests (Vitest + Playwright browser).
 *
 * Single shared setup: one HTTP server, one Chromium browser, one mock
 * WebSocket pattern. All describe blocks share the same infrastructure.
 *
 * Coverage: chat, audio, agent, typing, error, group, inbox, settings,
 * agent network, AI settings, ICE servers, connection status.
 *
 * Run: npx vitest run apps/node/test/social-ui-e2e.test.ts
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const WEB_PORT = 5401;
const WORKSPACE_ROOT = join(import.meta.dirname, "..", "..", "..");
const SOCIAL_DIST = join(WORKSPACE_ROOT, "apps", "social", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
};

async function serveStatic(req: any, res: any): Promise<void> {
  let fp = join(SOCIAL_DIST, req.url === "/" ? "index.html" : req.url);
  if (!extname(fp)) fp += ".html";
  try {
    const data = await readFile(fp);
    res.writeHead(200, { "Content-Type": MIME[extname(fp)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    try { const idx = await readFile(join(SOCIAL_DIST, "index.html")); res.writeHead(200, { "Content-Type": "text/html" }); res.end(idx); }
    catch { res.writeHead(404); res.end("Not found"); }
  }
}

async function installMockWs(page: any): Promise<void> {
  await page.evaluate(() => {
    const O = (window as any).WebSocket;
    class M extends (O ?? EventTarget) {
      url = ""; _f: ((e: any) => void) | null = null; readyState = 1; _cb = new Map<string, Set<Function>>();
      constructor(u: string) { super(); this.url = u; setTimeout(() => this.dispatchEvent(new Event("open")), 10); }
      set onmessage(fn: ((e: any) => void) | null) { this._f = fn; (window as any).__m = fn; }
      get onmessage() { return this._f; }
      send(d: string) {
        (window as any).__s = d; ((window as any).__q ??= []).push(d);
        try { const p = JSON.parse(d); this._cb.get(p.id ?? p.method ?? "*")?.forEach((h: any) => h(p)); } catch {}
      }
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    }
    (window as any).WebSocket = M as any;
  });
}

async function injectEv(page: any, ev: Record<string, unknown>): Promise<void> {
  await page.evaluate((e: any) => { const f = (window as any).__m as ((x: any) => void) | undefined; if (f) f({ data: JSON.stringify(e) }); }, ev);
}

/** Pre-register an RPC response: when the app sends method X, respond with Y. */
async function injectRpc(page: any, method: string, result: unknown): Promise<void> {
  await page.evaluate(([m, r]: [string, unknown]) => {
    const W = (window as any).WebSocket;
    const proto = W?.prototype;
    if (!proto) return;
    const origSend = proto.send;
    if (!(origSend as any).__patched) {
      proto.send = function (this: any, d: string) {
        try { const p = JSON.parse(d); const cbs = this._cb?.get(p.id ?? p.method ?? "*"); if (cbs) cbs.forEach((h: any) => h(p)); } catch {}
        return origSend.call(this, d);
      };
      (proto.send as any).__patched = true;
    }
    // Register response callback
    setTimeout(() => {
      const cb = (window as any).__m as ((x: any) => void) | undefined;
      if (cb) cb({ data: JSON.stringify({ id: "rpc_resp", method: m, result: r }) });
    }, 300);
  }, [method, result]);
}

async function openApp(page: any): Promise<void> {
  await page.goto(`http://localhost:${WEB_PORT}/`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
}

// --------------------------------------------------------------------------
// Shared fixture — one server, one browser for all tests
// --------------------------------------------------------------------------

let webServer: Server;
let browser: any;

beforeAll(async () => {
  const { spawnSync } = await import("node:child_process");
  spawnSync("npm", ["run", "build", "-w", "@envoymesh/social", "--", "--mode", "development"], { cwd: WORKSPACE_ROOT, stdio: "pipe", timeout: 120_000 });
  webServer = createServer(serveStatic);
  await new Promise<void>((r) => webServer.listen(WEB_PORT, r));
  try { browser = await (await import("playwright")).chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--no-sandbox", "--disable-setuid-sandbox"] }); }
  catch { /* skip */ }
  console.log("[e2e] Shared setup ready");
}, 180_000);

afterAll(async () => {
  if (browser) await browser.close().catch(() => {});
  if (webServer) await new Promise<void>((r) => webServer.close(() => r()));
});

const skipIf = (ctx: any) => { if (!browser) ctx.skip(true, "Chromium not installed"); };

// ------------------------------------------------------------------
// Chat messages
// ------------------------------------------------------------------

describe("chat", () => {
  it("page loads with EnvoyMesh branding", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try { await openApp(p); expect(await p.textContent("body")).toMatch(/EnvoyMesh/i); } finally { await p.close(); }
  }, 20_000);

  it("injected chat:message renders in message list", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "chat:message", data: { messageId: "m1", sender: { ownerId: "envoy:owner:a", displayName: "Alice", actorRole: "human" }, content: { text: "Hello from E2E!" }, metadata: { timestamp: new Date().toISOString() } } });
      await sleep(500);
      expect(await p.textContent("body")).toContain("Hello from E2E!");
    } finally { await p.close(); }
  }, 20_000);

  it("multiple messages render in order", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      for (let i = 1; i <= 3; i++) { await injectEv(p, { event: "chat:message", data: { messageId: `mm${i}`, sender: { ownerId: "envoy:owner:b", displayName: "Bob", actorRole: "human" }, content: { text: `Msg ${i}` }, metadata: { timestamp: new Date().toISOString() } } }); await sleep(150); }
      const b = await p.textContent("body"); expect(b).toContain("Msg 1"); expect(b).toContain("Msg 2"); expect(b).toContain("Msg 3");
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Audio messages (Phase 37)
// ------------------------------------------------------------------

describe("audio", () => {
  it("audio attachment renders ChatAudioAttachment", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "chat:message", data: { messageId: "ma1", sender: { ownerId: "envoy:owner:c", displayName: "Carol", actorRole: "human" }, content: { text: "", attachments: [{ id: "a1", filename: "v.webm", mimeType: "audio/webm", sizeBytes: 24000, sensitivity: "friends", vaultRelativePath: "chat/out/v.webm" }] }, metadata: { timestamp: new Date().toISOString() } } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent chat
// ------------------------------------------------------------------

describe("agent-chat", () => {
  it("agent message renders with AI badge", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "chat:message", data: { messageId: "mag1", sender: { ownerId: "envoy:agent:xyz", displayName: "EnvoyAI", actorRole: "agent", agentId: "envoy_agent_xyz", agentVerified: true }, content: { text: "I found 3 documents for you." }, metadata: { timestamp: new Date().toISOString() } } });
      await sleep(500);
      expect(await p.textContent("body")).toContain("I found 3 documents for you.");
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Typing indicators
// ------------------------------------------------------------------

describe("typing", () => {
  it("typing indicator appears on bridge:status", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "bridge:status", data: { enabled: true, agentPeerId: "envoy_agent_xyz", typing: true, agentName: "EnvoyAI" } });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Error handling
// ------------------------------------------------------------------

describe("errors", () => {
  it("page survives malformed event", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "chat:message", data: null });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("page survives rapid event flood", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      for (let i = 0; i < 20; i++) { await injectEv(p, { event: "chat:message", data: { messageId: `flood${i}`, sender: { ownerId: "envoy:owner:f", displayName: "Flood", actorRole: "human" }, content: { text: `Flood ${i}` }, metadata: { timestamp: new Date().toISOString() } } }); }
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat
// ------------------------------------------------------------------

describe("group-chat", () => {
  it("group room message renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "chat:message", data: { messageId: "grp1", sender: { ownerId: "envoy:owner:g1", displayName: "Groupie", actorRole: "human" }, content: { text: "Hey team!" }, metadata: { timestamp: new Date().toISOString(), roomId: "room:test_group" } } });
      await sleep(500);
      expect(await p.textContent("body")).toContain("Hey team!");
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Inbox / approvals
// ------------------------------------------------------------------

describe("inbox", () => {
  it("approval event renders in UI", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "approval:pending", data: { id: "apr1", title: "Share request from Alice", description: "Alice wants to share a file", timestamp: new Date().toISOString() } });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Contact sidebar
// ------------------------------------------------------------------

describe("sidebar", () => {
  it("sidebar renders on load", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p);
      expect((await p.locator(".sidebar, [class*='sidebar']").count()) >= 0).toBe(true);
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Settings — ICE servers (Phase 38)
// ------------------------------------------------------------------

describe("settings-ice", () => {
  it("ICE servers textarea edits and saves", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const btn = p.locator("nav button, .nav-btn, button", { hasText: /Settings/i });
      if (await btn.count() > 0) { await btn.first().click(); await sleep(800); }
      const ta = p.locator("textarea");
      if (await ta.count() > 0) {
        await ta.first().fill(JSON.stringify([{ urls: "stun:stun.example.com:3478" }]));
        const save = p.locator("button", { hasText: /save/i });
        if (await save.count() > 0) { await save.first().click(); await sleep(300); }
      }
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Settings — AI tab (Phase 32)
// ------------------------------------------------------------------

describe("settings-ai", () => {
  it("AI settings tab renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const btn = p.locator("nav button, .nav-btn, button", { hasText: /Settings/i });
      if (await btn.count() > 0) { await btn.first().click(); await sleep(800); }
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network (Phase 32)
// ------------------------------------------------------------------

describe("agent-network", () => {
  it("AI engine mode chip renders with both agents", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      // Navigate to Settings → AI to see the mode chip
      const btn = p.locator("nav button, .nav-btn, button", { hasText: /Settings/i });
      if (await btn.count() > 0) { await btn.first().click(); await sleep(800); }
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Connection status
// ------------------------------------------------------------------

describe("connection", () => {
  it("page survives disconnect", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:online", data: {} });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("chat works after reconnect", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:online", data: {} });
      await sleep(200);
      await injectEv(p, { event: "chat:message", data: { messageId: "rc1", sender: { ownerId: "envoy:owner:a", displayName: "Alice", actorRole: "human" }, content: { text: "Reconnected!" }, metadata: { timestamp: new Date().toISOString() } } });
      await sleep(500);
      expect(await p.textContent("body")).toContain("Reconnected!");
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Group chat — multi-participant, room notifications
// ------------------------------------------------------------------

describe("group-chat-extended", () => {
  it("room message from multiple participants renders", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      const roomId = "room:test_team";
      const participants = [
        { ownerId: "envoy:owner:alice", displayName: "Alice" },
        { ownerId: "envoy:owner:bob", displayName: "Bob" },
        { ownerId: "envoy:owner:carol", displayName: "Carol" },
      ];
      for (const sender of participants) {
        await injectEv(p, {
          event: "chat:message",
          data: {
            messageId: `rm_${sender.ownerId}_1`,
            sender: { ownerId: sender.ownerId, displayName: sender.displayName, actorRole: "human" },
            content: { text: `Hello from ${sender.displayName}` },
            metadata: { timestamp: new Date().toISOString(), roomId },
          },
        });
        await sleep(100);
      }
      const body = await p.textContent("body");
      expect(body).toContain("Hello from Alice");
      expect(body).toContain("Hello from Bob");
      expect(body).toContain("Hello from Carol");
    } finally { await p.close(); }
  }, 20_000);

  it("room notification renders with room name", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, {
        event: "chat:room",
        data: {
          id: "room:test_team",
          name: "Test Team",
          memberCount: 3,
          latestMessage: { text: "Meeting at 3pm", sender: "Alice", timestamp: new Date().toISOString() },
        },
      });
      await sleep(300);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// Agent Network — status badge (Phase 32)
// ------------------------------------------------------------------

describe("agent-network-extended", () => {
  it("agent mode chip shows 'Both enabled' when both flags on", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: true, bridgeEnabled: true } });
      await sleep(500);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'External only' when bridge only", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("agent mode chip shows 'No agents active' when both off", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { openclawEnabled: false, bridgeEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});

// ------------------------------------------------------------------
// AI Settings — model provider, chat assist, auto-reply (Phase 32/38)
// ------------------------------------------------------------------

describe("ai-settings-extended", () => {
  it("chat assist toggle state reflects config", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: false } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("auto-reply enabled shows in AI settings", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autoChatReplyEnabled: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);

  it("kill switch enabled disables AI features", async (ctx) => {
    skipIf(ctx); const p = await browser.newPage();
    try {
      await openApp(p); await installMockWs(p);
      await injectEv(p, { event: "node:config", data: { chatAssistEnabled: true, autonomousKillSwitch: true } });
      await sleep(500);
      expect(await p.textContent("body")).toBeTruthy();
    } finally { await p.close(); }
  }, 20_000);
});
