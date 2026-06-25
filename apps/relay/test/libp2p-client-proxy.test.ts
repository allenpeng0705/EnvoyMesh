/**
 * Unit tests for libp2p client-proxy budget accounting and dial failures.
 */

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createLibp2pClientProxyHandler } from "../src/libp2p-client-proxy.js";

class MockWs extends EventEmitter {
  readyState = WebSocket.OPEN;
  sent: string[] = [];

  close(_code?: number, _reason?: string): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  send(text: string): void {
    this.sent.push(text);
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
}

function createHandler(
  overrides: Partial<Parameters<typeof createLibp2pClientProxyHandler>[0]> = {},
) {
  const sharedProxyBudget = { total: 0, max: 2 };
  const proxyConnByTarget = new Map<string, Set<WebSocket>>();
  const dialProtocol = vi.fn();
  const handleProxyConnection = createLibp2pClientProxyHandler({
    sharedProxyBudget,
    proxyConnByTarget,
    maxConnsPerTarget: 2,
    maxEarlyBuffer: 10,
    dialProtocol,
    ...overrides,
  });
  return { handleProxyConnection, sharedProxyBudget, proxyConnByTarget, dialProtocol };
}

describe("libp2p client-proxy", () => {
  it("releases shared budget when libp2p dial fails", async () => {
    const { handleProxyConnection, sharedProxyBudget, dialProtocol } = createHandler();
    dialProtocol.mockRejectedValue(new Error("dial refused"));

    const ws = new MockWs();
    await handleProxyConnection(ws as unknown as WebSocket, "12D3KooWHomePeer", "token-1");

    expect(sharedProxyBudget.total).toBe(0);
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it("releases shared budget when home rejects handshake", async () => {
    const { handleProxyConnection, sharedProxyBudget, dialProtocol } = createHandler();
    dialProtocol.mockResolvedValue({
      close: vi.fn(),
      source: {
        read: vi
          .fn()
          .mockResolvedValueOnce(
            new TextEncoder().encode(JSON.stringify({ type: "proxy-reject", reason: "bad token" })),
          ),
      },
      sink: vi.fn(),
    });

    const ws = new MockWs();
    await handleProxyConnection(ws as unknown as WebSocket, "12D3KooWHomePeer", "bad-token");

    expect(sharedProxyBudget.total).toBe(0);
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it("releases shared budget when home closes stream before handshake", async () => {
    const { handleProxyConnection, sharedProxyBudget, dialProtocol } = createHandler();
    dialProtocol.mockResolvedValue({
      close: vi.fn(),
      source: { read: vi.fn().mockResolvedValue(null) },
      sink: vi.fn(),
    });

    const ws = new MockWs();
    await handleProxyConnection(ws as unknown as WebSocket, "12D3KooWHomePeer", "token-1");

    expect(sharedProxyBudget.total).toBe(0);
  });

  it("rejects new connections when shared budget is full", async () => {
    const sharedProxyBudget = { total: 2, max: 2 };
    const { handleProxyConnection, dialProtocol } = createHandler({ sharedProxyBudget });
    dialProtocol.mockRejectedValue(new Error("should not dial"));

    const ws = new MockWs();
    await handleProxyConnection(ws as unknown as WebSocket, "12D3KooWHomePeer", "token-1");

    expect(dialProtocol).not.toHaveBeenCalled();
    expect(sharedProxyBudget.total).toBe(2);
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it("rejects when per-target connection limit is reached", async () => {
    const { handleProxyConnection, proxyConnByTarget, dialProtocol } = createHandler({
      maxConnsPerTarget: 1,
    });
    const existing = new MockWs();
    proxyConnByTarget.set("12D3KooWHomePeer", new Set([existing as unknown as WebSocket]));
    dialProtocol.mockRejectedValue(new Error("should not dial"));

    const ws = new MockWs();
    await handleProxyConnection(ws as unknown as WebSocket, "12D3KooWHomePeer", "token-1");

    expect(dialProtocol).not.toHaveBeenCalled();
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it("releaseConnection is idempotent on repeated close events", async () => {
    const { handleProxyConnection, sharedProxyBudget, dialProtocol } = createHandler();
    dialProtocol.mockRejectedValue(new Error("dial refused"));

    const ws = new MockWs();
    await handleProxyConnection(ws as unknown as WebSocket, "12D3KooWHomePeer", "token-1");
    ws.emit("close");

    expect(sharedProxyBudget.total).toBe(0);
  });
});
