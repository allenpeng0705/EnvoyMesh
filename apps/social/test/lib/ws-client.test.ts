/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  WsClient,
  computeReconnectDelayMs,
  isLoopbackWsUrl,
} from "../../src/ws-client.js";

type Handler = ((ev?: { data?: string }) => void) | null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onmessage: Handler = null;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Test helper — complete the handshake. */
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Test helper — deliver a JSON frame to onmessage. */
  deliver(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe("WsClient reconnect helpers", () => {
  it("detects loopback URLs", () => {
    expect(isLoopbackWsUrl("ws://127.0.0.1:3030/ws")).toBe(true);
    expect(isLoopbackWsUrl("ws://localhost:3030/ws")).toBe(true);
    expect(isLoopbackWsUrl("ws://example.com:3030/ws")).toBe(false);
  });

  it("caps loopback backoff well below the remote 60s plateau", () => {
    const loopback = computeReconnectDelayMs(10, {
      loopback: true,
      jitterRatio: 0,
    });
    const remote = computeReconnectDelayMs(10, {
      loopback: false,
      jitterRatio: 0,
    });
    expect(loopback).toBe(8_000);
    expect(remote).toBe(60_000);
  });

  it("grows exponentially before the cap", () => {
    expect(
      computeReconnectDelayMs(0, { loopback: true, jitterRatio: 0 }),
    ).toBe(1_000);
    expect(
      computeReconnectDelayMs(1, { loopback: true, jitterRatio: 0 }),
    ).toBe(2_000);
    expect(
      computeReconnectDelayMs(2, { loopback: true, jitterRatio: 0 }),
    ).toBe(4_000);
    expect(
      computeReconnectDelayMs(3, { loopback: true, jitterRatio: 0 }),
    ).toBe(8_000);
  });

  it("applies jitter when requested", () => {
    const withJitter = computeReconnectDelayMs(0, {
      loopback: true,
      jitterRatio: 0.2,
      random: () => 1,
    });
    expect(withJitter).toBe(1_200);
  });
});

describe("WsClient connection lifecycle", () => {
  let client: WsClient;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    client = new WsClient("ws://127.0.0.1:3030/ws");
  });

  afterEach(() => {
    client.disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function openClient(): Promise<MockWebSocket> {
    const pending = client.connect();
    const socket = MockWebSocket.instances.at(-1)!;
    socket.open();
    await pending;
    return socket;
  }

  it("reconnectTo can connect again after disconnect", async () => {
    client.disconnect();
    const connectSpy = vi.spyOn(client, "connect").mockResolvedValue(undefined);
    await client.reconnectTo("ws://127.0.0.1:4040/ws");
    expect(connectSpy).toHaveBeenCalled();
  });

  it("reconnectTo resets reconnectAttempts for immediate Retry", async () => {
    (client as unknown as { reconnectAttempts: number }).reconnectAttempts = 9;
    const connectSpy = vi.spyOn(client, "connect").mockResolvedValue(undefined);
    await client.reconnectTo();
    expect(client.getReconnectAttempts()).toBe(0);
    expect(connectSpy).toHaveBeenCalled();
  });

  it("nudgeReconnect clears backoff and connects when down", () => {
    (client as unknown as { reconnectAttempts: number }).reconnectAttempts = 6;
    const connectSpy = vi.spyOn(client, "connect").mockResolvedValue(undefined);
    client.nudgeReconnect("test");
    expect(client.getReconnectAttempts()).toBe(0);
    expect(connectSpy).toHaveBeenCalled();
  });

  it("nudgeReconnect is a no-op when auto-reconnect is disabled", () => {
    client.setAutoReconnectEnabled(false);
    const connectSpy = vi.spyOn(client, "connect").mockResolvedValue(undefined);
    client.nudgeReconnect("test");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("nudgeReconnect probes an idle open socket instead of reconnecting", async () => {
    const socket = await openClient();
    const probe = vi.spyOn(
      client as unknown as { runHeartbeatProbe: (o: { force: boolean }) => Promise<void> },
      "runHeartbeatProbe",
    ).mockResolvedValue(undefined);
    (client as unknown as { lastActivityAt: number }).lastActivityAt =
      Date.now() - 25_000;
    const before = MockWebSocket.instances.length;
    client.nudgeReconnect("focus");
    expect(probe).toHaveBeenCalledWith({ force: true });
    expect(MockWebSocket.instances.length).toBe(before);
    expect(socket.readyState).toBe(MockWebSocket.OPEN);
  });

  it("setAutoReconnectEnabled clears pending reconnect timer", () => {
    (client as unknown as { scheduleReconnect: () => void }).scheduleReconnect();
    expect(client.getNextReconnectDelayMs()).not.toBeNull();
    client.setAutoReconnectEnabled(false);
    expect(client.getNextReconnectDelayMs()).toBeNull();
  });

  it("rejects in-flight RPCs immediately on disconnect", async () => {
    await openClient();
    const rpcPromise = client.rpc(
      "sendChat",
      { targetOwnerId: "x", text: "hi" },
      { timeoutMs: 60_000 },
    );
    client.closeConnection();
    await expect(rpcPromise).rejects.toThrow(/WebSocket disconnected/);
  });

  it("schedules loopback reconnect under 10s after a drop", () => {
    (client as unknown as { scheduleReconnect: () => void }).scheduleReconnect();
    const delay = client.getNextReconnectDelayMs();
    expect(delay).not.toBeNull();
    expect(delay!).toBeLessThanOrEqual(8_000 + 8_000 * 0.2 + 1);
    expect(client.getReconnectAttempts()).toBe(1);
  });

  it("schedules remote reconnect with a 60s ceiling", () => {
    const remote = new WsClient("ws://relay.example:443/ws");
    (remote as unknown as { reconnectAttempts: number }).reconnectAttempts = 10;
    (remote as unknown as { scheduleReconnect: () => void }).scheduleReconnect();
    const delay = remote.getNextReconnectDelayMs();
    expect(delay).not.toBeNull();
    expect(delay!).toBeGreaterThan(50_000);
    expect(delay!).toBeLessThanOrEqual(60_000 + 60_000 * 0.2 + 1);
    remote.disconnect();
  });

  it("does not schedule reconnect when disposed or auto-reconnect is off", () => {
    client.setAutoReconnectEnabled(false);
    (client as unknown as { scheduleReconnect: () => void }).scheduleReconnect();
    expect(client.getNextReconnectDelayMs()).toBeNull();

    client.setAutoReconnectEnabled(true);
    client.disconnect();
    (client as unknown as { scheduleReconnect: () => void }).scheduleReconnect();
    expect(client.getNextReconnectDelayMs()).toBeNull();
  });

  it("connect open resets attempts and reports healthy heartbeat", async () => {
    (client as unknown as { reconnectAttempts: number }).reconnectAttempts = 4;
    await openClient();
    expect(client.getReconnectAttempts()).toBe(0);
    expect(client.isConnected()).toBe(true);
    expect(client.isHeartbeatHealthy()).toBe(true);
  });

  it("socket close schedules a reconnect and notifies status listeners", async () => {
    const statuses: string[] = [];
    client.onStatusChange((s) => statuses.push(s));
    const socket = await openClient();
    expect(statuses).toContain("connected");
    socket.close();
    expect(statuses).toContain("disconnected");
    expect(client.getNextReconnectDelayMs()).not.toBeNull();
    expect(client.getReconnectAttempts()).toBe(1);
  });

  it("fires scheduled reconnect after the backoff delay", async () => {
    await openClient();
    MockWebSocket.instances.at(-1)!.close();
    const delay = client.getNextReconnectDelayMs()!;
    const before = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(delay + 10);
    expect(MockWebSocket.instances.length).toBeGreaterThan(before);
  });

  it("connect timeout uses the loopback 8s budget", async () => {
    const pending = client.connect();
    const rejection = expect(pending).rejects.toThrow(/timed out after 8s/);
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;
  });

  it("shares an in-flight handshake instead of opening a second socket", async () => {
    const first = client.connect();
    const second = client.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0]!.open();
    await Promise.all([first, second]);
    expect(client.isConnected()).toBe(true);
  });

  it("waitForConnection resolves when the socket opens", async () => {
    const waiting = client.waitForConnection(5_000);
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    MockWebSocket.instances.at(-1)!.open();
    await waiting;
    expect(client.isConnected()).toBe(true);
  });

  it("recycles the socket when a forced heartbeat probe fails", async () => {
    const socket = await openClient();
    const before = MockWebSocket.instances.length;
    const probe = (
      client as unknown as {
        runHeartbeatProbe: (o: { force: boolean }) => Promise<void>;
      }
    ).runHeartbeatProbe({ force: true });

    // Probe RPC times out → recycle → immediate reconnect socket.
    await vi.advanceTimersByTimeAsync(8_000);
    await probe;
    expect(client.getLastError()).toMatch(/idle|reconnect/i);
    expect(MockWebSocket.instances.length).toBeGreaterThan(before);
    expect(socket.onclose).toBeNull();
  });

  it("skips heartbeat probe when traffic is recent", async () => {
    await openClient();
    const rpcSpy = vi.spyOn(client, "rpc");
    await (
      client as unknown as {
        runHeartbeatProbe: (o: { force: boolean }) => Promise<void>;
      }
    ).runHeartbeatProbe({ force: false });
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("visibilitychange visible nudges reconnect after connect", async () => {
    await openClient();
    client.closeConnection();
    (client as unknown as { reconnectAttempts: number }).reconnectAttempts = 5;
    const before = MockWebSocket.instances.length;
    document.dispatchEvent(new Event("visibilitychange"));
    // jsdom visibilityState is usually "visible"
    expect(client.getReconnectAttempts()).toBe(0);
    expect(MockWebSocket.instances.length).toBeGreaterThan(before);
  });

  it("online event nudges reconnect when the socket is down", async () => {
    await openClient();
    client.closeConnection();
    (client as unknown as { reconnectAttempts: number }).reconnectAttempts = 3;
    const before = MockWebSocket.instances.length;
    window.dispatchEvent(new Event("online"));
    expect(client.getReconnectAttempts()).toBe(0);
    expect(MockWebSocket.instances.length).toBeGreaterThan(before);
  });

  it("resolves RPC responses delivered on the socket", async () => {
    const socket = await openClient();
    const pending = client.rpc("getNodeStatus");
    const sent = JSON.parse(socket.sent.at(-1)!) as { id: string; method: string };
    expect(sent.method).toBe("getNodeStatus");
    socket.deliver({ id: sent.id, result: { status: "running" } });
    await expect(pending).resolves.toEqual({ status: "running" });
  });

  it("dispatches push events to subscribers", async () => {
    const socket = await openClient();
    const seen: unknown[] = [];
    client.on("node:status", (data) => seen.push(data));
    socket.deliver({ event: "node:status", data: { status: "running" } });
    expect(seen).toEqual([{ status: "running" }]);
  });

  it("isHeartbeatHealthy is false when disconnected", () => {
    expect(client.isHeartbeatHealthy()).toBe(false);
  });

  it("isHeartbeatHealthy is false when last activity is too old", async () => {
    await openClient();
    (client as unknown as { lastActivityAt: number }).lastActivityAt =
      Date.now() - 120_000;
    expect(client.isHeartbeatHealthy()).toBe(false);
  });
});
