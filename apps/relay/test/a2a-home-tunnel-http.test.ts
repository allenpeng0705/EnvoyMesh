/**
 * Phase 48D.5 — relay home-tunnel HTTP forward E2E.
 *
 * Drives real `createHomeTunnelProxy` with a home WebSocket that answers
 * `http-req` frames (buffered + streamed SSE), matching production
 * A2A `forwardToHome` / vault proxy wiring.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { WebSocket as WsClient } from "ws";
import type { WebSocket } from "ws";
import { createHomeTunnelProxy, type HomeTunnelProxy } from "../src/home-tunnel-proxy.js";
import { handleA2AJsonRpcProxy } from "../src/a2a-jsonrpc-proxy.js";

interface Harness {
  proxy: HomeTunnelProxy;
  homePeerId: string;
  baseUrl: string;
  sendFromHome: (frame: Record<string, unknown>) => void;
  shutdown: () => Promise<void>;
}

async function startHarness(
  onHttpReq: (env: {
    requestId: string;
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  }) => void,
): Promise<Harness> {
  const homePeerId = "12D3KooWA2AHttpE2E" + Date.now().toString(36);
  const proxy = createHomeTunnelProxy({
    maxHomeTunnels: 4,
    maxProxyConnections: 16,
    maxHomeTunnelDataBytes: 1024 * 1024,
    logPrefix: "[a2a-http-e2e]",
  });
  const sockets = new Set<WebSocket>();
  let homeWs: WebSocket | undefined;

  const httpServer = createServer((req, res) => {
    void handleA2AJsonRpcProxy(req, res, {
      bearerTokens: [{ token: "tok-e2e", ownerId: "envoy:owner:e2e" }],
      lookupHomePeerId: () => homePeerId,
      forwardToHome: async (_peer, body, headers, stream) =>
        proxy.requestHttpViaHomeTunnel(homePeerId, {
          method: "POST",
          path: "/a2a/jsonrpc",
          headers: {
            "Content-Type": "application/json",
            ...(headers ?? {}),
          },
          body,
          ...(stream ? { onStream: stream } : {}),
        }),
    });
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "ws://localhost");
    if (url.pathname !== "/ws/home") {
      socket.destroy();
      return;
    }
    void proxy.handleHomeUpgrade(req, socket, head, homePeerId).then((ws) => {
      if (ws) sockets.add(ws);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  homeWs = await new Promise<WebSocket>((resolve, reject) => {
    const ws = new WsClient(`ws://127.0.0.1:${addr.port}/ws/home?peerId=${encodeURIComponent(homePeerId)}`);
    sockets.add(ws);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });

  homeWs.on("message", (raw) => {
    const text = typeof raw === "string" ? raw : Buffer.from(raw as Buffer).toString("utf8");
    let env: {
      type?: string;
      requestId?: string;
      method?: string;
      path?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    try {
      env = JSON.parse(text);
    } catch {
      return;
    }
    if (env.type === "http-req" && typeof env.requestId === "string") {
      onHttpReq({
        requestId: env.requestId,
        method: env.method ?? "POST",
        path: env.path ?? "/",
        headers: env.headers ?? {},
        body: env.body ?? "",
      });
    }
  });

  for (let i = 0; i < 50 && !proxy.hasHomeTunnel(homePeerId); i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!proxy.hasHomeTunnel(homePeerId)) {
    throw new Error("home tunnel not registered");
  }

  return {
    proxy,
    homePeerId,
    baseUrl,
    sendFromHome: (frame) => {
      homeWs!.send(JSON.stringify(frame));
    },
    shutdown: async () => {
      for (const s of sockets) {
        try { s.close(); } catch { /* ignore */ }
      }
      await proxy.shutdown();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

describe("a2a home-tunnel HTTP E2E", () => {
  let h: Harness | undefined;

  afterEach(async () => {
    if (h) await h.shutdown();
    h = undefined;
  });

  it("requestHttpViaHomeTunnel round-trips buffered http-res", async () => {
    h = await startHarness((env) => {
      h!.sendFromHome({
        type: "http-res",
        requestId: env.requestId,
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, path: env.path }),
      });
    });

    const result = await h.proxy.requestHttpViaHomeTunnel(h.homePeerId, {
      method: "POST",
      path: "/a2a/jsonrpc",
      body: "{}",
    });
    expect(result).toEqual({
      status: 201,
      body: JSON.stringify({ ok: true, path: "/a2a/jsonrpc" }),
      contentType: "application/json",
    });
  });

  it("streams SSE chunks via http-res-start/chunk/end", async () => {
    const chunks: string[] = [];
    let headerStatus = 0;
    h = await startHarness((env) => {
      h!.sendFromHome({
        type: "http-res-start",
        requestId: env.requestId,
        status: 200,
        contentType: "text/event-stream",
      });
      h!.sendFromHome({
        type: "http-res-chunk",
        requestId: env.requestId,
        data: "event: status-update\ndata: {\"state\":\"working\"}\n\n",
      });
      h!.sendFromHome({
        type: "http-res-chunk",
        requestId: env.requestId,
        data: "event: done\ndata: {\"id\":\"t1\"}\n\n",
      });
      h!.sendFromHome({ type: "http-res-end", requestId: env.requestId });
    });

    const result = await h.proxy.requestHttpViaHomeTunnel(h.homePeerId, {
      method: "POST",
      path: "/a2a/jsonrpc",
      headers: { Accept: "text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/stream", params: {} }),
      onStream: {
        onHeaders: (status) => { headerStatus = status; },
        onChunk: (c) => { chunks.push(c); },
      },
    });

    expect(headerStatus).toBe(200);
    expect(chunks.join("")).toContain("event: status-update");
    expect(chunks.join("")).toContain("event: done");
    expect(result?.contentType).toBe("text/event-stream");
    // Stream path must not retain chunks for the joined body (24/7 OOM guard).
    expect(result?.body).toBe("");
  });

  it("A2A JSON-RPC proxy uses home-tunnel forwardToHome", async () => {
    h = await startHarness((env) => {
      expect(env.headers.Authorization).toBe("Bearer tok-e2e");
      h!.sendFromHome({
        type: "http-res",
        requestId: env.requestId,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { kind: "task", id: "t-e2e" },
        }),
      });
    });

    const resp = await fetch(`${h.baseUrl}/.well-known/a2a/jsonrpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok-e2e",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/get",
        params: { id: "t-e2e" },
      }),
    });
    expect(resp.status).toBe(200);
    const json = await resp.json() as { result?: { id?: string } };
    expect(json.result?.id).toBe("t-e2e");
  });
});
