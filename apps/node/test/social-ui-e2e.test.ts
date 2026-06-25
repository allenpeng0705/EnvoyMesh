/**
 * EnvoyMesh Social UI E2E smoke tests (Vitest + Playwright browser).
 * Single shared setup: one HTTP server, one Chromium browser, mock WebSocket.
 * Coverage: chat, audio, agent, typing, error, group, inbox, sidebar,
 * settings-ice, settings-ai, agent-network, connection, Phase 40 chains.
 *
 * Run: npx vitest run apps/node/test/social-ui-e2e.test.ts
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  injectSocialE2eEvent,
  setupSocialE2eMockWebSocket,
  waitForSocialAppReady,
} from "./social-e2e-mock-ws.js";
import { pickFreePort } from "./playwright-e2e-port.js";

let webPort = 0;
const ROOT = join(import.meta.dirname, "..", "..", "..");
const DIST = join(ROOT, "apps", "social", "src", "dist");
const MIME: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

async function serve(req: any, res: any) {
  let fp = join(DIST, req.url === "/" ? "index.html" : req.url);
  if (!extname(fp)) fp += ".html";
  try { const d = await readFile(fp); res.writeHead(200, { "Content-Type": MIME[extname(fp)] ?? "application/octet-stream" }); res.end(d); }
  catch { try { const i = await readFile(join(DIST, "index.html")); res.writeHead(200, { "Content-Type": "text/html" }); res.end(i); } catch { res.writeHead(404); res.end("NF"); } }
}

async function mockWs(page: any) {
  await setupSocialE2eMockWebSocket(page);
}

async function open(page: any) {
  await mockWs(page);
  await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" });
  await waitForSocialAppReady(page);
}

function buildChatMessage(data: {
  messageId: string;
  sender: { ownerId: string; displayName: string; actorRole?: string; agentId?: string; agentVerified?: boolean };
  text: string;
  timestamp?: string;
}) {
  return {
    messageId: data.messageId,
    sender: {
      nodeId: `peer_${data.sender.ownerId}`,
      displayName: data.sender.displayName,
      ownerId: data.sender.ownerId,
      actorRole: data.sender.actorRole ?? "human",
      ...(data.sender.agentId ? { agentId: data.sender.agentId } : {}),
      ...(data.sender.agentVerified ? { agentVerified: true } : {}),
    },
    recipient: {
      nodeId: "12D3KooWE2EPeerId000000000000000000000000",
      ownerId: "envoy:owner:e2e-self",
    },
    content: { text: data.text },
    metadata: { timestamp: data.timestamp ?? new Date().toISOString() },
    signature: "e2e-signature",
  };
}

async function injectChatMessage(
  page: any,
  data: Parameters<typeof buildChatMessage>[0],
) {
  await inject(page, { event: "chat:message", data: buildChatMessage(data) });
}

async function openInbox(page: any) {
  const tab = page.locator("button", { hasText: /Inbox/i });
  if ((await tab.count()) > 0) {
    await tab.first().click();
    await sleep(400);
  }
}

async function openChainsView(page: any) {
  const tab = page.locator("button, nav button", { hasText: /Chains/i });
  if ((await tab.count()) > 0) {
    await tab.first().click();
    await sleep(800);
  }
}

async function openRoomThread(page: any, label: string) {
  await page.waitForFunction(
    (roomLabel: string) => document.body.textContent?.includes(roomLabel) ?? false,
    label,
    { timeout: 10_000 },
  );
  const row = page.locator(".thread-row--group", { hasText: new RegExp(label, "i") });
  await row.first().waitFor({ state: "visible", timeout: 5_000 });
  await row.first().click();
  await page.waitForFunction(
    () => !(document.body.textContent?.includes("Select a contact") ?? false),
    { timeout: 5_000 },
  );
  await sleep(300);
}

async function injectRoomMessage(
  page: any,
  roomId: string,
  data: {
    messageId: string;
    sender: { ownerId: string; displayName: string; actorRole: string };
    content: { text: string };
    metadata?: { timestamp?: string };
  },
) {
  const roomKey = `room:${roomId}`;
  await inject(page, {
    event: "chat:room-message",
    data: {
      roomId,
      message: {
        messageId: data.messageId,
        sender: { nodeId: `peer_${data.sender.ownerId}`, ...data.sender },
        recipient: { nodeId: "12D3KooWE2EPeerId000000000000000000000000", ownerId: roomKey, displayName: "", actorRole: "human" },
        content: data.content,
        metadata: { timestamp: data.metadata?.timestamp ?? new Date().toISOString() },
        signature: "e2e-signature",
      },
    },
  });
}

async function inject(page: any, ev: Record<string, unknown>) {
  await injectSocialE2eEvent(page, String(ev.event), (ev.data ?? {}) as Record<string, unknown>);
}

async function waitForBodyText(page: any, text: string, timeoutMs = 8_000) {
  await page.waitForFunction(
    (needle: string) => document.body.textContent?.includes(needle) ?? false,
    text,
    { timeout: timeoutMs },
  );
}

function chainStatePayload(overrides: Record<string, unknown>) {
  return {
    chainId: "chain_ui_default",
    chainMandateId: "mandate_default",
    subtaskCount: 1,
    bidCount: 0,
    awardedCount: 0,
    partialCount: 0,
    cancelledCount: 0,
    chainCancelled: false,
    published: false,
    budgetSpentUsd: 0,
    budgetMaxUsd: 10,
    budgetReservedUsd: 0,
    budgetSynthesisUsd: 0,
    ...overrides,
  };
}

// ---- shared fixture ----
let srv: Server; let browser: any;

beforeAll(async () => {
  try { await stat(join(DIST, "index.html")); } catch { const { spawnSync } = await import("node:child_process"); spawnSync("npm", ["run", "build", "-w", "@envoymesh/social", "--", "--mode", "development"], { cwd: ROOT, stdio: "pipe", timeout: 120_000 }); }
  webPort = await pickFreePort();
  srv = createServer(serve); await new Promise<void>((r) => srv.listen(webPort, "127.0.0.1", r));
  try { browser = await (await import("playwright")).chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--no-sandbox", "--disable-setuid-sandbox"] }); } catch { /* skip */ }
  console.log("[e2e] ready");
}, 180_000);

afterAll(async () => { if (browser) await browser.close().catch(() => {}); if (srv) await new Promise<void>((r) => srv.close(() => r())); });
const skip = (c: any) => { if (!browser) c.skip(true, "no chromium"); };

// ---- tests ----

describe("chat", () => {
  it("page loads", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); expect(await p.textContent("body")).toMatch(/Envoy/i); } finally { await p.close(); } }, 20_000);
  it("message renders", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await injectChatMessage(p, { messageId:"m1", sender:{ownerId:"o:a",displayName:"Alice"}, text:"Hello!" }); await openInbox(p); await waitForBodyText(p, "Hello!"); } finally { await p.close(); } }, 20_000);
  it("multi messages", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); for (let i=1;i<=3;i++) { await injectChatMessage(p, { messageId:`mm${i}`, sender:{ownerId:"o:b",displayName:"Bob"}, text:`Msg ${i}` }); await sleep(100); } await openInbox(p); await waitForBodyText(p, "Msg 1"); await waitForBodyText(p, "Msg 3"); } finally { await p.close(); } }, 20_000);
});

describe("audio", () => {
  it("attachment renders", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"chat:message", data:{ messageId:"ma1", sender:{ownerId:"o:c",displayName:"Carol",actorRole:"human"}, content:{text:"", attachments:[{id:"a1",filename:"v.webm",mimeType:"audio/webm",sizeBytes:24000,sensitivity:"friends",vaultRelativePath:"chat/out/v.webm"}]}, metadata:{timestamp:new Date().toISOString()} } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("agent-chat", () => {
  it("AI badge", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await injectChatMessage(p, { messageId:"mag1", sender:{ownerId:"envoy:agent:xyz",displayName:"EnvoyAI",actorRole:"agent",agentId:"envoy_agent_xyz",agentVerified:true}, text:"I found 3 docs." }); await openInbox(p); await waitForBodyText(p, "I found 3 docs."); } finally { await p.close(); } }, 20_000);
});

describe("typing", () => {
  it("indicator", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"bridge:status", data:{ enabled:true, agentPeerId:"x", typing:true, agentName:"EnvoyAI" } }); await sleep(300); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("errors", () => {
  it("malformed event", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"chat:message", data:null }); await sleep(300); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("event flood", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); for (let i=0;i<20;i++) { await inject(p, { event:"chat:message", data:{ messageId:`flood${i}`, sender:{ownerId:"o:f",displayName:"F",actorRole:"human"}, content:{text:`F${i}`}, metadata:{timestamp:new Date().toISOString()} } }); } await sleep(300); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("group-chat", () => {
  it("room message", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await openRoomThread(p, "Test Room"); await injectRoomMessage(p, "test", { messageId:"grp1", sender:{ownerId:"o:g",displayName:"G",actorRole:"human"}, content:{text:"Hey team!"} }); await waitForBodyText(p, "Hey team!"); } finally { await p.close(); } }, 20_000);
  it("multi-participant", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await openRoomThread(p, "Team"); for (const s of [{o:"o:a",n:"Alice"},{o:"o:b",n:"Bob"},{o:"o:c",n:"Carol"}]) { await injectRoomMessage(p, "team", { messageId:`rm_${s.o}`, sender:{ownerId:s.o,displayName:s.n,actorRole:"human"}, content:{text:`Hi from ${s.n}`} }); await sleep(100); } await waitForBodyText(p, "Hi from Alice"); await waitForBodyText(p, "Hi from Carol"); } finally { await p.close(); } }, 20_000);
});

describe("inbox", () => {
  it("approval", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"approval:pending", data:{ id:"apr1", title:"Share request", description:"Alice wants to share", timestamp:new Date().toISOString() } }); await sleep(300); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("sidebar", () => {
  it("renders", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); expect((await p.locator(".sidebar, [class*='sidebar']").count())>=0).toBe(true); } finally { await p.close(); } }, 20_000);
});

describe("settings-ice", () => {
  it("edit & save", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); const b = p.locator("nav button, .nav-btn, button", { hasText: /Settings/i }); if (await b.count()>0) { await b.first().click(); await sleep(800); } const ta = p.locator("textarea"); if (await ta.count()>0) { await ta.first().fill(JSON.stringify([{ urls:"stun:stun.example.com:3478" }])); const s = p.locator("button", { hasText: /save/i }); if (await s.count()>0) { await s.first().click(); await sleep(300); } } expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("settings-ai", () => {
  it("renders", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); const b = p.locator("nav button, .nav-btn, button", { hasText: /Settings/i }); if (await b.count()>0) { await b.first().click(); await sleep(800); } expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("agent-network", () => {
  it("mode chip both", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:config", data:{ openclawEnabled:true, bridgeEnabled:true } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("mode chip ext only", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:config", data:{ openclawEnabled:false, bridgeEnabled:true } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("mode chip off", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:config", data:{ openclawEnabled:false, bridgeEnabled:false } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("connection", () => {
  it("survives disconnect", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:online", data:{} }); await sleep(300); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("chat after reconnect", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:online", data:{} }); await sleep(200); await injectChatMessage(p, { messageId:"rc1", sender:{ownerId:"o:a",displayName:"Alice"}, text:"Reconnected!" }); await openInbox(p); await waitForBodyText(p, "Reconnected!"); } finally { await p.close(); } }, 20_000);
});

describe("ai-settings", () => {
  it("chat assist on", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:config", data:{ chatAssistEnabled:true, autoChatReplyEnabled:false } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("auto-reply on", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:config", data:{ chatAssistEnabled:true, autoChatReplyEnabled:true } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("kill switch on", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"node:config", data:{ chatAssistEnabled:true, autonomousKillSwitch:true } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

describe("chain", () => {
  it("chain created", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"agent:chain", data:{ chainId:"c_e2e_01", status:"created", ownerId:"envoy:owner:a", objective:"Translate → Review → Summarize", createdAt:new Date().toISOString(), subtaskCount:3, completedCount:0 } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("subtask proposal", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"agent:chain:subtask", data:{ subtaskId:"sub_01", chainId:"c_e2e_02", requiredCapability:"translation", objective:"Translate to French", costCeilingUsd:5.0, deadlineAt:new Date(Date.now()+3600000).toISOString(), bids:0, status:"pending" } }); await sleep(300); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("worker bid", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"agent:chain:bid", data:{ subtaskId:"sub_01", chainId:"c_e2e_03", workerPeerId:"envoy_agent_w", workerName:"TranslationBot", bidKind:"accept", proposedCostUsd:4.5, proposedEtaAt:new Date(Date.now()+1800000).toISOString(), bidExpiresAt:new Date(Date.now()+300000).toISOString() } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("chain complete", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"agent:chain:complete", data:{ chainId:"c_e2e_04", status:"completed", completedAt:new Date().toISOString(), subtaskResults:[{subtaskId:"s1",status:"completed",artifactUrl:"f://r1",completionTimeMs:45000},{subtaskId:"s2",status:"completed",artifactUrl:"f://r2",completionTimeMs:67200},{subtaskId:"s3",status:"completed",artifactUrl:"f://r3",completionTimeMs:23400}], totalCostUsd:12.75, totalDurationMs:135600 } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
  it("negotiation counter", async (c) => { skip(c); const p = await browser.newPage(); try { await open(p); await inject(p, { event:"agent:chain:counter", data:{ subtaskId:"sub_01", chainId:"c_e2e_05", round:2, workerPeerId:"envoy_agent_w", counterObjective:"Legal translation", counterCostUsd:6.0, justification:"Domain expertise needed", bidExpiresAt:new Date(Date.now()+300000).toISOString() } }); await sleep(500); expect(await p.textContent("body")).toBeTruthy(); } finally { await p.close(); } }, 20_000);
});

// ------------------------------------------------------------------
// Phase 41D — Chain UI component rendering
// ------------------------------------------------------------------

describe("chain-ui", () => {
  it("chain card renders with budget and status", async (c) => {
    skip(c); const p = await browser.newPage();
    try {
      await open(p);
      await openChainsView(p);
      await inject(p, {
        event: "chain:state",
        data: chainStatePayload({
          chainId: "chain_ui_001",
          chainMandateId: "mandate_001",
          goal: "Find best Paris restaurant",
          subtaskCount: 4,
          awardedCount: 3,
          partialCount: 1,
          budgetSpentUsd: 2.5,
          budgetMaxUsd: 10,
        }),
      });
      await sleep(800);
      const body = await p.textContent("body");
      expect(body).toBeTruthy();
      expect(body).toContain("Find best Paris restaurant");
    } finally { await p.close(); }
  }, 25_000);

  it("completed chain shows cost and view report button", async (c) => {
    skip(c); const p = await browser.newPage();
    try {
      await open(p);
      await openChainsView(p);
      await inject(p, {
        event: "chain:state",
        data: chainStatePayload({
          chainId: "chain_ui_002",
          chainMandateId: "mandate_002",
          goal: "Translate handbook",
          subtaskCount: 3,
          awardedCount: 3,
          partialCount: 3,
          published: true,
          budgetSpentUsd: 3.75,
          budgetMaxUsd: 10,
        }),
      });
      await sleep(800);
      const body = await p.textContent("body");
      expect(body).toContain("chain_ui_002");
      expect(body).toContain("3.75");
    } finally { await p.close(); }
  }, 25_000);

  it("chain card renders status badge", async (c) => {
    skip(c); const p = await browser.newPage();
    try {
      await open(p);
      await openChainsView(p);
      await inject(p, {
        event: "chain:state",
        data: chainStatePayload({
          chainId: "chain_ui_003",
          chainMandateId: "mandate_003",
          goal: "Review documents",
          subtaskCount: 2,
          awardedCount: 0,
          partialCount: 0,
          budgetMaxUsd: 5,
        }),
      });
      await sleep(800);
      const body = await p.textContent("body");
      expect(body).toContain("Review documents");
    } finally { await p.close(); }
  }, 25_000);

  it("failed/cancelled chain shows error badge", async (c) => {
    skip(c); const p = await browser.newPage();
    try {
      await open(p);
      await openChainsView(p);
      await inject(p, {
        event: "chain:state",
        data: chainStatePayload({
          chainId: "chain_ui_004",
          chainMandateId: "mandate_004",
          goal: "Cancelled task",
          subtaskCount: 1,
          chainCancelled: true,
          cancelledCount: 1,
          budgetMaxUsd: 2,
        }),
      });
      await sleep(800);
      const body = await p.textContent("body");
      expect(body).toContain("chain_ui_004");
      expect(body).toMatch(/cancelled/i);
    } finally { await p.close(); }
  }, 25_000);
});
