/**
 * WsServer lifecycle: connection limits, heartbeat, and stop cleanup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket as WsClient } from "ws";
import type { NodeService } from "@envoymesh/api";
import { WsServer } from "../src/ws-server.js";

function createMockNodeService(): NodeService {
  return {
    getConnectionStatus: () => ({ peerId: "envoy_test_peer", multiaddrs: [] }),
    getNodeStatus: () => "running",
    recordOwnerActivity: () => {},
    on: () => {},
    callManager: { onCallEvent: () => {} },
  } as unknown as NodeService;
}

function openClientAndWaitForConnected(port: number): Promise<{ ws: WsClient; connected: unknown }> {
  return new Promise((resolve, reject) => {
    const ws = new WsClient(`ws://127.0.0.1:${port}/ws`);
    const timer = setTimeout(() => reject(new Error("timed out waiting for connected")), 3000);
    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as { event?: string };
        if (parsed.event === "connected") {
          clearTimeout(timer);
          resolve({ ws, connected: parsed });
        }
      } catch {
        /* ignore non-json frames */
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("WsServer lifecycle", () => {
  let server: WsServer;
  let port: number;

  beforeEach(async () => {
    vi.useRealTimers();
    port = 31_000 + Math.floor(Math.random() * 1000);
    server = new WsServer(port, "/ws");
    server.start(createMockNodeService());
    await new Promise((r) => setTimeout(r, 50));
  });

  afterEach(() => {
    vi.useRealTimers();
    server.stop();
  });

  it("accepts a client and sends connected event", async () => {
    const { ws, connected } = await openClientAndWaitForConnected(port);
    expect(connected).toMatchObject({ event: "connected" });
    ws.close();
  });

  it("rejects connections beyond maxClients at HTTP upgrade", async () => {
    const clients: WsClient[] = [];
    for (let i = 0; i < 32; i++) {
      const { ws } = await openClientAndWaitForConnected(port);
      clients.push(ws);
    }

    const rejected = await new Promise<boolean>((resolve) => {
      const ws = new WsClient(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => resolve(false));
      ws.on("error", () => resolve(true));
      setTimeout(() => resolve(true), 500);
    });

    expect(rejected).toBe(true);
    for (const ws of clients) {
      ws.close();
    }
  });

  it("terminates clients that miss two heartbeats", async () => {
    const { ws } = await openClientAndWaitForConnected(port);
    const closed = new Promise<void>((resolve) => {
      ws.on("close", () => resolve());
    });

    const internal = server as unknown as {
      heartbeatInterval: ReturnType<typeof setInterval> | null;
      heartbeatIntervalMs: number;
      startHeartbeat: () => void;
      wss: { clients: Set<WsClient> };
    };
    if (internal.heartbeatInterval) {
      clearInterval(internal.heartbeatInterval);
    }
    internal.heartbeatIntervalMs = 20;
    internal.startHeartbeat();

    for (const client of internal.wss.clients) {
      (client as unknown as { isAlive: boolean; missedHeartbeats: number }).isAlive = false;
      (client as unknown as { missedHeartbeats: number }).missedHeartbeats = 1;
    }

    await new Promise((r) => setTimeout(r, 50));
    await closed;
  });

  it("stop clears server state and allows restart wiring", () => {
    server.stop();
    server.start(createMockNodeService());
    expect(() => server.stop()).not.toThrow();
  });
});
