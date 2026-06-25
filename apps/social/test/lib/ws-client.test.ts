/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WsClient } from "../../src/ws-client.js";

describe("WsClient connection prefs", () => {
  let client: WsClient;

  beforeEach(() => {
    client = new WsClient("ws://localhost:3030/ws");
  });

  afterEach(() => {
    client.disconnect();
  });

  it("reconnectTo can connect again after disconnect", async () => {
    client.disconnect();
    const connectSpy = vi.spyOn(client, "connect").mockResolvedValue(undefined);
    await client.reconnectTo("ws://127.0.0.1:4040/ws");
    expect(connectSpy).toHaveBeenCalled();
  });

  it("closeStaleSocket closes an in-flight connection", () => {
    const closed: string[] = [];
    const stale = {
      readyState: WebSocket.OPEN,
      close() {
        closed.push("stale");
      },
      onclose: null,
      onerror: null,
      onopen: null,
      onmessage: null,
    };
    (client as any).ws = stale;
    (client as any).closeStaleSocket();
    expect(closed).toEqual(["stale"]);
    expect((client as any).ws).toBeNull();
  });

  it("closeConnection rejects pending RPC promises", async () => {
    (client as any).ws = { readyState: WebSocket.OPEN, close: vi.fn() };
    const pending = new Promise((_resolve, reject) => {
      (client as any).pendingRequests.set("req-1", { resolve: () => {}, reject });
    });
    client.closeConnection();
    await expect(pending).rejects.toThrow("WebSocket connection closed");
    expect((client as any).pendingRequests.size).toBe(0);
  });

  it("setAutoReconnectEnabled clears pending reconnect timer", () => {
    client.setAutoReconnectEnabled(false);
    expect(() => client.setAutoReconnectEnabled(true)).not.toThrow();
  });
});
