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

  it("setAutoReconnectEnabled clears pending reconnect timer", () => {
    client.setAutoReconnectEnabled(false);
    expect(() => client.setAutoReconnectEnabled(true)).not.toThrow();
  });

  it("rejects in-flight RPCs immediately on disconnect", async () => {
    const sent: string[] = [];
    const fakeWs = {
      readyState: 1,
      send: (data: string) => {
        sent.push(data);
      },
      close: () => {},
      onclose: null as null | (() => void),
      onerror: null as null | (() => void),
      onopen: null as null | (() => void),
      onmessage: null as null | ((ev: { data: string }) => void),
    };
    (client as unknown as { ws: typeof fakeWs }).ws = fakeWs;

    const rpcPromise = client.rpc("sendChat", { targetOwnerId: "x", text: "hi" }, { timeoutMs: 60_000 });
    expect(sent).toHaveLength(1);

    client.closeConnection();
    await expect(rpcPromise).rejects.toThrow(/WebSocket disconnected/);
  });
});
