/**
 * Tests for RelayTunnelClient — verifies the home node's persistent WebSocket
 * tunnel to the relay. Uses a mock relay WebSocket server and a mock local
 * ws-server to simulate the full flow.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { RelayTunnelClient } from "../src/relay-tunnel-client.js";
import { AddressInfo } from "node:net";

describe("RelayTunnelClient", () => {
  let relayWss: WebSocketServer;
  let localWss: WebSocketServer;
  let relayPort: number;
  let localPort: number;
  let homeTunnelWs: WebSocket | null = null;
  let localReceived: Array<string> = [];
  let localConnectionUrls: Array<string> = [];
  let relaySentToHome: Array<{ type: string; channelId?: string; data?: string; token?: string }> = [];

  beforeEach(async () => {
    localReceived = [];
    localConnectionUrls = [];
    relaySentToHome = [];
    homeTunnelWs = null;

    // Mock relay server: /ws/home accepts home tunnel, forwards messages.
    relayWss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => relayWss.on("listening", resolve));
    relayPort = (relayWss.address() as AddressInfo).port;

    relayWss.on("connection", (ws, req) => {
      const url = new URL(req.url ?? "/", "ws://localhost");
      if (url.pathname === "/ws/home") {
        const peerId = url.searchParams.get("peerId");
        homeTunnelWs = ws;
        ws.send(JSON.stringify({ type: "home-tunnel-ack", peerId }));

        ws.on("message", (raw) => {
          const env = JSON.parse(raw.toString());
          relaySentToHome.push(env);
        });
        return;
      }
    });

    // Mock local ws-server.
    localWss = new WebSocketServer({ port: 0, path: "/ws" });
    await new Promise<void>((resolve) => localWss.on("listening", resolve));
    localPort = (localWss.address() as AddressInfo).port;

    localWss.on("connection", (localWs, req) => {
      localConnectionUrls.push(req.url ?? "");
      localWs.on("message", (raw) => {
        const text = raw.toString();
        localReceived.push(text);
        // Echo back.
        localWs.send(JSON.stringify({ id: "test-rpc", result: { echo: text } }));
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => relayWss.close(() => resolve()));
    await new Promise<void>((resolve) => localWss.close(() => resolve()));
  });

  it("connects to /ws/home and receives ack", async () => {
    const client = new RelayTunnelClient({
      relayWsUrl: `ws://127.0.0.1:${relayPort}/ws`,
      homePeerId: "12D3KooWTest",
      localWsServerUrl: `ws://127.0.0.1:${localPort}/ws`,
      log: () => {},
    });
    client.start();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(client.isConnected).toBe(true);
    expect(homeTunnelWs).not.toBeNull();

    client.stop();
  });

  it("opens a local ws-server connection when relay sends 'open'", async () => {
    const client = new RelayTunnelClient({
      relayWsUrl: `ws://127.0.0.1:${relayPort}/ws`,
      homePeerId: "12D3KooWTest",
      localWsServerUrl: `ws://127.0.0.1:${localPort}/ws`,
      log: () => {},
    });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(homeTunnelWs).not.toBeNull();

    // Simulate relay asking home to open a channel.
    const channelId = "chan-123";
    const sessionToken = "mom-session-token-abc";
    homeTunnelWs!.send(
      JSON.stringify({ type: "open", channelId, token: sessionToken }),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify open-ack was sent back to relay.
    const ack = relaySentToHome.find((m) => m.type === "open-ack" && m.channelId === channelId);
    expect(ack).toBeTruthy();

    // Session token must reach local Social WS — otherwise family phones
    // are treated as the untokened Owner.
    expect(localConnectionUrls.some((u) => u.includes(`token=${sessionToken}`))).toBe(
      true,
    );

    // Simulate relay forwarding data from mobile to home.
    homeTunnelWs!.send(JSON.stringify({ type: "data", channelId, data: "hello-mobile" }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify local ws-server received the data.
    expect(localReceived).toContain("hello-mobile");

    // Verify the echo was forwarded back to relay.
    const echoFrame = relaySentToHome.find(
      (m) => m.type === "data" && m.channelId === channelId && m.data?.includes("test-rpc"),
    );
    expect(echoFrame).toBeTruthy();

    client.stop();
  });

  it("handles relay 'close' by closing local connection", async () => {
    const client = new RelayTunnelClient({
      relayWsUrl: `ws://127.0.0.1:${relayPort}/ws`,
      homePeerId: "12D3KooWTest",
      localWsServerUrl: `ws://127.0.0.1:${localPort}/ws`,
      log: () => {},
    });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const channelId = "chan-close-test";
    homeTunnelWs!.send(JSON.stringify({ type: "open", channelId, token: "tok" }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    let localClosed = false;
    localWss.on("close", () => { localClosed = true; });

    homeTunnelWs!.send(JSON.stringify({ type: "close", channelId }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify no more "data" frames for this channel after close.
    const dataAfterClose = relaySentToHome.filter(
      (m) => m.type === "data" && m.channelId === channelId,
    );
    expect(dataAfterClose.length).toBe(0);

    client.stop();
  });
});
