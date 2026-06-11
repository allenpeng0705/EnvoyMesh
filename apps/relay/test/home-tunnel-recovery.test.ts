/**
 * End-to-end integration test for the relay's home-tunnel-proxy re-claim
 * behavior (issue I4).
 *
 * What this verifies:
 *   1. A mobile client connecting via the relay's home-tunnel-proxy
 *      receives a `connected` event once the home node claims the
 *      channel via `open-ack`.
 *   2. JSON-RPC frames sent by the mobile are forwarded to the home,
 *      and JSON-RPC responses from the home are forwarded back to the
 *      mobile.
 *   3. When the home's `/ws/home` tunnel drops, the mobile's WebSocket
 *      is **kept open** (not closed).
 *   4. The relay emits a `tunnel-down` event on the mobile ws.
 *   5. JSON-RPC frames sent by the mobile during the tunnel-down
 *      window are buffered by the relay, NOT lost.
 *   6. When a new home tunnel is registered, the relay emits
 *      `tunnel-up` on the mobile ws and re-issues the `open` frame to
 *      the new tunnel.
 *   7. After the new tunnel's `open-ack` arrives, the mobile receives
 *      a fresh `connected` event AND the buffered JSON-RPC frames are
 *      forwarded to the new tunnel.
 *   8. JSON-RPC responses on the new tunnel are forwarded back to the
 *      mobile just like before.
 *
 * This test drives the REAL `createHomeTunnelProxy(...)` factory in
 * `apps/relay/src/home-tunnel-proxy.ts` (not a mirror of its state
 * machine). The factory is wired into a `http.Server` exactly the way
 * `apps/relay/src/index.ts` does it, so any change to the production
 * module is automatically exercised here.
 *
 * Wire frames (matching `apps/relay/src/home-tunnel-proxy.ts` and
 * `apps/node/src/relay-tunnel-client.ts`):
 *
 *   relay → home:   { type: "open", channelId, token, targetPeerId }
 *                   { type: "data", channelId, data: <text> }
 *                   { type: "close", channelId }
 *                   { type: "home-tunnel-ack", peerId }
 *
 *   home → relay:   { type: "open-ack", channelId }
 *                   { type: "data", channelId, data: <text> }
 *                   { type: "close", channelId }
 *
 *   relay → mobile: { event: "connected", data: { relayProxied: true } }
 *                   { event: "tunnel-down", data: { peerId } }
 *                   { event: "tunnel-up", data: { peerId } }
 *                   <raw text frame from home> (via `data` frame)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server, type IncomingMessage } from "http";
import { WebSocketServer, WebSocket as WsClient } from "ws";
import type { WebSocket } from "ws";
import { createHomeTunnelProxy, type HomeTunnelProxy } from "../src/home-tunnel-proxy.js";

// ----------------------------------------------------------------------------
// Test harness: spins up a real http.Server + homeTunnelProxy and exposes
// hooks to control the home side.
// ----------------------------------------------------------------------------

interface Harness {
  /** Stop the test relay and all of its tunnels. */
  shutdown(): Promise<void>;
  /** The home peerId this test is using. */
  homePeerId: string;
  /** The pairing token the mobile sends. */
  token: string;
  /** Open a fresh WebSocket to the relay's /ws/home endpoint. */
  nextHomeTunnel(): Promise<WebSocket>;
  /** Inject a `data` frame on the given home tunnel as if the home
   *  forwarded it from the local ws-server. */
  sendFromHome(home: WebSocket, channelId: string, data: string): void;
  /** Close a home tunnel as if the network dropped. */
  dropHomeTunnel(home: WebSocket): void;
  /** Send an `open-ack` on behalf of the home. */
  ackHomeClaim(home: WebSocket, channelId: string): void;
}

function startTestRelay(): Promise<{ url: string; harness: Harness }> {
  return new Promise((resolve) => {
    const httpServer = createServer((_req: IncomingMessage, res) => {
      res.writeHead(404);
      res.end();
    });
    // Proxy wss for the *mobile*-side upgrade. The home-side upgrade is
    // owned by the module.
    const proxyWss = new WebSocketServer({ noServer: true });
    const homePeerId = "12D3KooWTestHome" + Date.now().toString(36);
    const token = "test-token-" + Date.now().toString(36);

    const proxy: HomeTunnelProxy = createHomeTunnelProxy({
      maxHomeTunnels: 10,
      maxProxyConnections: 100,
      maxHomeTunnelDataBytes: 1024 * 1024,
      logPrefix: "[test-relay]",
    });

    // Track sockets that the test opened so shutdown() can close them
    // all (the module does not own the proxyWss; the caller does).
    const testSockets = new Set<WebSocket>();

    httpServer.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "ws://localhost");
      if (url.pathname === "/ws/home") {
        const peerId = (url.searchParams.get("peerId") ?? "").trim() || homePeerId;
        void proxy.handleHomeUpgrade(req, socket, head, peerId).then((ws) => {
          if (ws) testSockets.add(ws);
        });
        return;
      }
      if (url.pathname === "/ws") {
        const target = (url.searchParams.get("target") ?? "").trim();
        const t = (url.searchParams.get("token") ?? "").trim();
        proxyWss.handleUpgrade(req, socket, head, (ws) => {
          testSockets.add(ws);
          proxy.attachMobileProxy(ws, target, t, (fallbackWs) => {
            try { fallbackWs.close(1011, "no home tunnel registered"); } catch { /* ignore */ }
          });
        });
        return;
      }
      socket.destroy();
    });

    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const url = `ws://127.0.0.1:${port}`;
      const harness: Harness = {
        homePeerId,
        token,
        shutdown: async () => {
          for (const ws of testSockets) {
            try { ws.terminate(); } catch { /* ignore */ }
          }
          testSockets.clear();
          await proxy.shutdown();
          await new Promise<void>((r) => {
            proxyWss.close(() => r());
          });
          await new Promise<void>((r) => {
            httpServer.close(() => r());
          });
        },
        nextHomeTunnel: () => new Promise<WebSocket>((r) => {
          const ws = new WsClient(`${url}/ws/home?peerId=${homePeerId}`);
          attachMessageBuffer(ws);
          ws.on("open", () => r(ws));
        }),
        sendFromHome: (home, channelId, data) => {
          try { home.send(JSON.stringify({ type: "data", channelId, data })); } catch { /* ignore */ }
        },
        dropHomeTunnel: (home) => {
          try { home.terminate(); } catch { /* ignore */ }
        },
        ackHomeClaim: (home, channelId) => {
          try { home.send(JSON.stringify({ type: "open-ack", channelId })); } catch { /* ignore */ }
        },
      };
      resolve({ url, harness });
    });
  });
}

// ----------------------------------------------------------------------------
// Helpers for waiting on WebSocket events.
// ----------------------------------------------------------------------------

/**
 * Per-WebSocket message buffer. The test harness attaches ONE listener
 * to each WebSocket at creation time that pushes every message into a
 * queue. `waitForMessage` then drains from this queue. This avoids the
 * race where the server emits a message between the test calling
 * `dropHomeTunnel` and `waitForMessage` registering a listener (during
 * which the message would be silently dropped by the `ws` library).
 */
const wsBuffers = new WeakMap<WebSocket, Array<Record<string, unknown>>>();
function attachMessageBuffer(ws: WebSocket): void {
  if (wsBuffers.has(ws)) return;
  const buf: Array<Record<string, unknown>> = [];
  wsBuffers.set(ws, buf);
  ws.on("message", (raw) => {
    const text = typeof raw === "string" ? raw : raw.toString("utf-8");
    try { buf.push(JSON.parse(text) as Record<string, unknown>); } catch { /* ignore */ }
  });
}

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    function check(): boolean {
      if (resolved) return true;
      const buf = wsBuffers.get(ws);
      if (!buf) return false;
      for (let i = 0; i < buf.length; i++) {
        if (predicate(buf[i]!)) {
          const matched = buf[i]!;
          buf.splice(i, 1);
          resolved = true;
          if (timer) clearTimeout(timer);
          if (interval) clearInterval(interval);
          resolve(matched);
          return true;
        }
      }
      return false;
    }
    timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      // Don't remove the listener — keep the buffer active for diagnostics.
      reject(new Error(`waitForMessage timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    interval = setInterval(() => { check(); }, 5);
    // Check once immediately in case the message already arrived.
    check();
  });
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe("relay home-tunnel-proxy recovery (I4)", () => {
  let harness: Harness;
  let url: string;

  beforeEach(async () => {
    const r = await startTestRelay();
    url = r.url;
    harness = r.harness;
  });

  afterEach(async () => {
    await harness.shutdown();
  });

  it("forwards RPC frames in both directions under a stable tunnel", async () => {
    const home = await harness.nextHomeTunnel();
    const mobile = new WsClient(`${url}/ws?target=${harness.homePeerId}&token=${harness.token}`);
    attachMessageBuffer(mobile);
    await new Promise<void>((r) => mobile.on("open", () => r()));
    // Capture the `open` frame the relay sends to the home.
    const openMsg = await waitForMessage(home, (m) => m.type === "open");
    const channelId = openMsg.channelId as string;
    // Home acknowledges the claim.
    harness.ackHomeClaim(home, channelId);
    // Mobile should get `connected`.
    const connected = await waitForMessage(mobile, (m) => m.event === "connected");
    expect(connected.data).toEqual({ relayProxied: true });

    // Mobile → home: send a JSON-RPC frame, capture on the home.
    const rpcId = "rpc-1";
    mobile.send(JSON.stringify({ id: rpcId, method: "ping", params: {} }));
    const rpcOnHome = await waitForMessage(home, (m) => m.type === "data" && m.channelId === channelId);
    const parsedRpc = JSON.parse(rpcOnHome.data as string);
    expect(parsedRpc.id).toBe(rpcId);

    // Home → mobile: send a JSON-RPC response.
    home.send(JSON.stringify({ type: "data", channelId, data: JSON.stringify({ id: rpcId, result: "pong" }) }));
    const rpcOnMobile = await waitForMessage(mobile, (m) => m.id === rpcId);
    expect(rpcOnMobile.result).toBe("pong");

    home.terminate();
    mobile.terminate();
  });

  it("keeps the mobile open and emits tunnel-down when the home tunnel drops", async () => {
    const home = await harness.nextHomeTunnel();
    const mobile = new WsClient(`${url}/ws?target=${harness.homePeerId}&token=${harness.token}`);
    attachMessageBuffer(mobile);
    await new Promise<void>((r) => mobile.on("open", () => r()));
    const openMsg = await waitForMessage(home, (m) => m.type === "open");
    harness.ackHomeClaim(home, openMsg.channelId as string);
    await waitForMessage(mobile, (m) => m.event === "connected");

    // Drop the home tunnel.
    harness.dropHomeTunnel(home);
    // Mobile should see tunnel-down.
    const downMsg = await waitForMessage(mobile, (m) => m.event === "tunnel-down");
    expect(downMsg.data).toEqual({ peerId: harness.homePeerId });

    // The mobile's WebSocket is still open.
    expect(mobile.readyState).toBe(WsClient.OPEN);

    mobile.terminate();
  });

  it("buffers mobile frames during tunnel-down and forwards them on re-claim", async () => {
    // First tunnel.
    const home1 = await harness.nextHomeTunnel();
    const mobile = new WsClient(`${url}/ws?target=${harness.homePeerId}&token=${harness.token}`);
    attachMessageBuffer(mobile);
    await new Promise<void>((r) => mobile.on("open", () => r()));
    const open1 = await waitForMessage(home1, (m) => m.type === "open");
    const channelId = open1.channelId as string;
    harness.ackHomeClaim(home1, channelId);
    await waitForMessage(mobile, (m) => m.event === "connected");

    // Drop the first tunnel.
    harness.dropHomeTunnel(home1);
    await waitForMessage(mobile, (m) => m.event === "tunnel-down");

    // Mobile sends 3 RPC frames during the down period.
    const rpcs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = `rpc-during-down-${i}`;
      rpcs.push(id);
      mobile.send(JSON.stringify({ id, method: "echo", params: { i } }));
    }
    // Give the relay a tick to buffer them.
    await new Promise((r) => setTimeout(r, 50));

    // New home tunnel comes up.
    const home2 = await harness.nextHomeTunnel();
    // Mobile should see tunnel-up.
    const upMsg = await waitForMessage(mobile, (m) => m.event === "tunnel-up");
    expect(upMsg.data).toEqual({ peerId: harness.homePeerId });
    // New home should receive an `open` for the same channelId.
    const open2 = await waitForMessage(home2, (m) => m.type === "open");
    expect(open2.channelId).toBe(channelId);
    // New home acks.
    harness.ackHomeClaim(home2, channelId);
    // Mobile should see a fresh `connected` event.
    const reconnected = await waitForMessage(mobile, (m) => m.event === "connected");
    expect(reconnected.data).toEqual({ relayProxied: true });

    // All 3 buffered RPC frames should arrive on the new tunnel in order.
    const received: string[] = [];
    for (let i = 0; i < 3; i++) {
      const dataMsg = await waitForMessage(home2, (m) => m.type === "data" && m.channelId === channelId);
      const parsed = JSON.parse(dataMsg.data as string);
      received.push(parsed.id as string);
    }
    expect(received).toEqual(rpcs);

    home2.terminate();
    mobile.terminate();
  });

  it("re-opens a channel after re-claim and the home's response reaches the mobile", async () => {
    // Same as above but verify the home's response on the new tunnel is
    // also delivered to the mobile.
    const home1 = await harness.nextHomeTunnel();
    const mobile = new WsClient(`${url}/ws?target=${harness.homePeerId}&token=${harness.token}`);
    attachMessageBuffer(mobile);
    await new Promise<void>((r) => mobile.on("open", () => r()));
    const open1 = await waitForMessage(home1, (m) => m.type === "open");
    const channelId = open1.channelId as string;
    harness.ackHomeClaim(home1, channelId);
    await waitForMessage(mobile, (m) => m.event === "connected");

    // Drop the first tunnel.
    harness.dropHomeTunnel(home1);
    await waitForMessage(mobile, (m) => m.event === "tunnel-down");

    // Mobile sends a frame during the down period.
    const id = "rpc-mid-drop";
    mobile.send(JSON.stringify({ id, method: "doStuff", params: {} }));
    await new Promise((r) => setTimeout(r, 50));

    // New home tunnel.
    const home2 = await harness.nextHomeTunnel();
    await waitForMessage(mobile, (m) => m.event === "tunnel-up");
    const open2 = await waitForMessage(home2, (m) => m.type === "open");
    expect(open2.channelId).toBe(channelId);
    harness.ackHomeClaim(home2, channelId);
    await waitForMessage(mobile, (m) => m.event === "connected");

    // The buffered frame arrives on the new home.
    const onHome2 = await waitForMessage(home2, (m) => m.type === "data" && m.channelId === channelId);
    const parsed = JSON.parse(onHome2.data as string);
    expect(parsed.id).toBe(id);

    // New home sends a response — it should reach the mobile.
    home2.send(JSON.stringify({ type: "data", channelId, data: JSON.stringify({ id, result: "didStuff" }) }));
    const onMobile = await waitForMessage(mobile, (m) => m.id === id);
    expect(onMobile.result).toBe("didStuff");

    home2.terminate();
    mobile.terminate();
  });

  it("does not close the mobile when the home tunnel closes between RPCs", async () => {
    const home1 = await harness.nextHomeTunnel();
    const mobile = new WsClient(`${url}/ws?target=${harness.homePeerId}&token=${harness.token}`);
    attachMessageBuffer(mobile);
    await new Promise<void>((r) => mobile.on("open", () => r()));
    const open1 = await waitForMessage(home1, (m) => m.type === "open");
    const channelId = open1.channelId as string;
    harness.ackHomeClaim(home1, channelId);
    await waitForMessage(mobile, (m) => m.event === "connected");

    // Send one RPC, get a response.
    mobile.send(JSON.stringify({ id: "rpc-pre-drop", method: "ping", params: {} }));
    const onHome1 = await waitForMessage(home1, (m) => m.type === "data" && m.channelId === channelId);
    expect(JSON.parse(onHome1.data as string).id).toBe("rpc-pre-drop");
    home1.send(JSON.stringify({ type: "data", channelId, data: JSON.stringify({ id: "rpc-pre-drop", result: "ok" }) }));
    await waitForMessage(mobile, (m) => m.id === "rpc-pre-drop");

    // Drop the home tunnel.
    let mobileClosedUnexpectedly = false;
    mobile.on("close", () => { mobileClosedUnexpectedly = true; });
    harness.dropHomeTunnel(home1);
    await waitForMessage(mobile, (m) => m.event === "tunnel-down");
    await new Promise((r) => setTimeout(r, 100));
    expect(mobileClosedUnexpectedly).toBe(false);
    expect(mobile.readyState).toBe(WsClient.OPEN);

    mobile.terminate();
  });
});
