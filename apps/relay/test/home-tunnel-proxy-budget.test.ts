/**
 * Shared proxy budget between home-tunnel and libp2p fallback paths.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type IncomingMessage } from "http";
import { WebSocketServer, WebSocket as WsClient } from "ws";
import type { WebSocket } from "ws";
import { createHomeTunnelProxy } from "../src/home-tunnel-proxy.js";
import { createLibp2pClientProxyHandler } from "../src/libp2p-client-proxy.js";

interface BudgetHarness {
  url: string;
  sharedProxyBudget: { total: number; max: number };
  handleLibp2pFallback: (ws: WebSocket, targetPeerId: string, token: string) => Promise<void>;
  shutdown(): Promise<void>;
  openHomeTunnel(peerId: string): Promise<WebSocket>;
  openMobile(target: string, token: string): Promise<WebSocket>;
}

async function startBudgetHarness(maxConnections = 1): Promise<BudgetHarness> {
  const httpServer = createServer((_req: IncomingMessage, res) => {
    res.writeHead(404);
    res.end();
  });
  const proxyWss = new WebSocketServer({ noServer: true });
  const sharedProxyBudget = { total: 0, max: maxConnections };
  const proxyConnByTarget = new Map<string, Set<WebSocket>>();

  const proxy = createHomeTunnelProxy({
    maxHomeTunnels: 10,
    maxProxyConnections: maxConnections,
    maxHomeTunnelDataBytes: 64 * 1024,
    sharedProxyBudget,
    logPrefix: "[budget-test]",
  });

  const handleLibp2pFallback = createLibp2pClientProxyHandler({
    sharedProxyBudget,
    proxyConnByTarget,
    maxConnsPerTarget: 10,
    maxEarlyBuffer: 10,
    dialProtocol: async () => {
      throw new Error("libp2p unavailable in budget test");
    },
    logPrefix: "[budget-test]",
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "ws://localhost");
    if (url.pathname === "/ws/home") {
      const peerId = (url.searchParams.get("peerId") ?? "").trim();
      void proxy.handleHomeUpgrade(req, socket, head, peerId);
      return;
    }
    if (url.pathname === "/ws") {
      const target = (url.searchParams.get("target") ?? "").trim();
      const token = (url.searchParams.get("token") ?? "").trim();
      proxyWss.handleUpgrade(req, socket, head, (ws) => {
        proxy.attachMobileProxy(ws, target, token, (fallbackWs) => {
          void handleLibp2pFallback(fallbackWs, target, token);
        });
      });
      return;
    }
    socket.destroy();
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `ws://127.0.0.1:${port}`;

  return {
    url,
    sharedProxyBudget,
    handleLibp2pFallback,
    openHomeTunnel: (peerId) =>
      new Promise<WebSocket>((resolve) => {
        const ws = new WsClient(`${url}/ws/home?peerId=${encodeURIComponent(peerId)}`);
        ws.on("open", () => resolve(ws));
      }),
    openMobile: (target, token) =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WsClient(
          `${url}/ws?target=${encodeURIComponent(target)}&token=${encodeURIComponent(token)}`,
        );
        ws.on("open", () => resolve(ws));
        ws.on("close", () => reject(new Error("mobile closed during open")));
      }),
    shutdown: async () => {
      await proxy.shutdown();
      await new Promise<void>((r) => proxyWss.close(() => r()));
      await new Promise<void>((r) => httpServer.close(() => r()));
    },
  };
}

const harnesses: BudgetHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.shutdown()));
});

async function waitForBudget(harness: BudgetHarness, expected: number): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (harness.sharedProxyBudget.total === expected) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(harness.sharedProxyBudget.total).toBe(expected);
}

describe("home-tunnel shared proxy budget", () => {
  it("acquires and releases budget when mobile disconnects via tunnel", async () => {
    const harness = await startBudgetHarness(2);
    harnesses.push(harness);
    const peerId = "12D3KooWBudgetHome";
    const home = await harness.openHomeTunnel(peerId);

    const mobile = await new Promise<WebSocket>((resolve) => {
      const ws = new WsClient(`${harness.url}/ws?target=${peerId}&token=tok`);
      ws.on("open", () => resolve(ws));
    });

    expect(harness.sharedProxyBudget.total).toBe(1);

    await new Promise<void>((resolve) => {
      mobile.on("close", () => resolve());
      mobile.close();
    });
    await waitForBudget(harness, 0);

    home.close();
  });

  it("rejects a second mobile when shared budget is exhausted", async () => {
    const harness = await startBudgetHarness(1);
    harnesses.push(harness);
    const peerId = "12D3KooWBudgetCap";
    const home = await harness.openHomeTunnel(peerId);

    const first = await new Promise<WebSocket>((resolve) => {
      const ws = new WsClient(`${harness.url}/ws?target=${peerId}&token=tok`);
      ws.on("open", () => resolve(ws));
    });
    expect(harness.sharedProxyBudget.total).toBe(1);

    const secondClosed = new Promise<number>((resolve) => {
      const ws = new WsClient(`${harness.url}/ws?target=${peerId}&token=tok2`);
      ws.on("close", (code) => resolve(code));
    });

    expect(await secondClosed).toBe(1013);
    expect(harness.sharedProxyBudget.total).toBe(1);

    first.close();
    home.close();
  });

  it("libp2p fallback respects budget already held by tunnel path", async () => {
    const harness = await startBudgetHarness(1);
    harnesses.push(harness);
    const peerId = "12D3KooWSharedBudget";
    const home = await harness.openHomeTunnel(peerId);

    const tunnelMobile = await new Promise<WebSocket>((resolve) => {
      const ws = new WsClient(`${harness.url}/ws?target=${peerId}&token=tok`);
      ws.on("open", () => resolve(ws));
    });
    expect(harness.sharedProxyBudget.total).toBe(1);

    const fallbackClosed = new Promise<number>((resolve) => {
      const ws = new WsClient(`${harness.url}/ws?target=12D3KooWOtherHome&token=tok`);
      ws.on("close", (code) => resolve(code));
    });
    expect(await fallbackClosed).toBe(1013);
    expect(harness.sharedProxyBudget.total).toBe(1);

    tunnelMobile.close();
    home.close();
    await waitForBudget(harness, 0);
  });
});
