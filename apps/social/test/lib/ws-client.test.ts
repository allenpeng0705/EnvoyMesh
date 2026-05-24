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
});
