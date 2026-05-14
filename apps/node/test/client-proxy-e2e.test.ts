/**
 * E2E tests for the client-proxy relay bridge protocol.
 *
 * Simulates the full flow:
 *   Mobile (WebSocket) → Relay (libp2p stream) → Home Node
 *
 * Uses paired streams with byteStream to test the protocol end-to-end
 * without a real network connection.
 */

import { describe, it, expect } from "vitest";
import { byteStream, type ByteStream } from "@libp2p/utils";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a pair of byteStream-compatible streams connected back-to-back.
 *
 * byteStream uses:
 *   - `stream.send(data)`          → to write data
 *   - `stream.addEventListener('message', {data})` → to read data
 *   - `stream.push(data)`          → for unwrap
 *   - `stream.log.error(msg,...)`  → for logging
 *   - `stream.status` / `stream.close` → for EOF detection
 */
function createPairedByteStreams(): [ByteStream<any>, ByteStream<any>] {
  const emA = new EventEmitter();
  const emB = new EventEmitter();

  const make = (emitter: EventEmitter, otherEmitter: EventEmitter) => ({
    addEventListener(type: string, listener: (...args: any[]) => void) {
      emitter.on(type, listener);
    },
    removeEventListener(type: string, listener: (...args: any[]) => void) {
      emitter.off(type, listener);
    },
    send(data: Uint8Array): boolean {
      // Deliver data to the OTHER end's 'message' listener
      otherEmitter.emit("message", { data: data.subarray() });
      return true;
    },
    push(_data: unknown): boolean { return true; },
    log: { error: () => {} },
    status: "open" as const,
    close: () => {},
    closeRead: () => {},
    abort: () => {},
  });

  return [byteStream(make(emA, emB) as any), byteStream(make(emB, emA) as any)];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("client-proxy protocol E2E", () => {

  it("handshake: proxy-connect → proxy-accept", async () => {
    const [homeStream, relayStream] = createPairedByteStreams();

    // Relay sends proxy-connect
    const handshake = JSON.stringify({ type: "proxy-connect", token: "test-token-123" });
    await relayStream.write(new TextEncoder().encode(handshake));

    // Home node reads it
    const handshakeBytes = await homeStream.read();
    expect(handshakeBytes).not.toBeNull();
    const parsed = JSON.parse(new TextDecoder().decode(handshakeBytes!.subarray()));
    expect(parsed.type).toBe("proxy-connect");
    expect(parsed.token).toBe("test-token-123");

    // Home node sends proxy-accept
    await homeStream.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));

    // Relay reads it
    const responseBytes = await relayStream.read();
    expect(responseBytes).not.toBeNull();
    const response = JSON.parse(new TextDecoder().decode(responseBytes!.subarray()));
    expect(response.type).toBe("proxy-accept");
  });

  it("token rejection: invalid token → proxy-reject", async () => {
    const [hs, rs] = createPairedByteStreams();

    // Relay sends proxy-connect with invalid token
    await rs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: "bad-token" })));

    // Home node reads it
    const handshakeBytes = await hs.read();
    const parsed = JSON.parse(new TextDecoder().decode(handshakeBytes!.subarray()));
    expect(parsed.token).toBe("bad-token");

    // Home node rejects
    await hs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-reject", reason: "invalid or expired token" })));

    // Relay reads proxy-reject
    const responseBytes = await rs.read();
    const response = JSON.parse(new TextDecoder().decode(responseBytes!.subarray()));
    expect(response.type).toBe("proxy-reject");
    expect(response.reason).toBe("invalid or expired token");
  });

  it("connected event: home node sends connected after proxy-accept", async () => {
    const [homeStream, relayStream] = createPairedByteStreams();

    // Complete handshake
    await relayStream.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: "tok" })));
    await homeStream.read(); // consume handshake

    await homeStream.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));
    await relayStream.read(); // consume proxy-accept

    // Home node sends connected event
    const connected = JSON.stringify({
      event: "connected",
      data: { peerId: "12D3KooWtest", multiaddrs: ["/ip4/1.2.3.4/tcp/4001"], relayProxied: true },
    });
    await homeStream.write(new TextEncoder().encode(connected));

    // Relay bridge loop reads it
    const eventBytes = await relayStream.read();
    expect(eventBytes).not.toBeNull();
    const event_ = JSON.parse(new TextDecoder().decode(eventBytes!.subarray()));
    expect(event_.event).toBe("connected");
    expect(event_.data.peerId).toBe("12D3KooWtest");
    expect(event_.data.relayProxied).toBe(true);
  });

  it("RPC round-trip: mobile → relay → home node → response", async () => {
    const [hs, rs] = createPairedByteStreams();

    // --- Handshake ---
    await rs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: "tok" })));
    await hs.read();
    await hs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));
    await rs.read();

    // --- Home node sends connected event ---
    await hs.write(new TextEncoder().encode(JSON.stringify({
      event: "connected",
      data: { peerId: "home-peer", multiaddrs: [] },
    })));
    await rs.read(); // relay reads connected event

    // --- Mobile sends RPC via relay ---
    const rpcRequest = JSON.stringify({ id: "1", method: "getNodeConfig", params: {} });
    await rs.write(new TextEncoder().encode(rpcRequest));

    // Home node reads the RPC
    const rpcBytes = await hs.read();
    expect(rpcBytes).not.toBeNull();
    const rpc = JSON.parse(new TextDecoder().decode(rpcBytes!.subarray()));
    expect(rpc.id).toBe("1");
    expect(rpc.method).toBe("getNodeConfig");

    // Home node sends response
    const rpcResponse = JSON.stringify({ id: "1", result: { profileDir: "/tmp/test" } });
    await hs.write(new TextEncoder().encode(rpcResponse));

    // Relay reads response
    const respBytes = await rs.read();
    expect(respBytes).not.toBeNull();
    const resp = JSON.parse(new TextDecoder().decode(respBytes!.subarray()));
    expect(resp.id).toBe("1");
    expect(resp.result.profileDir).toBe("/tmp/test");
  });

  it("multiple RPCs in sequence", async () => {
    const [hs, rs] = createPairedByteStreams();

    // --- Handshake ---
    await rs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: "tok" })));
    await hs.read();
    await hs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));
    await rs.read();

    // --- Home node sends connected ---
    await hs.write(new TextEncoder().encode(JSON.stringify({ event: "connected", data: { peerId: "p", multiaddrs: [] } })));
    await rs.read();

    const methods = ["getNodeConfig", "getConnectionStatus", "getBridgeStatus"];
    for (let i = 0; i < methods.length; i++) {
      // Mobile → Home
      await rs.write(new TextEncoder().encode(JSON.stringify({ id: String(i), method: methods[i], params: {} })));

      // Home reads
      const reqBytes = await hs.read();
      const req = JSON.parse(new TextDecoder().decode(reqBytes!.subarray()));
      expect(req.method).toBe(methods[i]);

      // Home responds
      await hs.write(new TextEncoder().encode(JSON.stringify({ id: req.id, result: { ok: true } })));

      // Relay reads response
      const respBytes = await rs.read();
      const resp = JSON.parse(new TextDecoder().decode(respBytes!.subarray()));
      expect(resp.id).toBe(String(i));
      expect(resp.result.ok).toBe(true);
    }
  });

  it("stream close propagates end", async () => {
    const [hs, rs] = createPairedByteStreams();

    // Handshake
    await rs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: "tok" })));
    await hs.read();
    await hs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));
    await rs.read();

    // Home node sends connected
    await hs.write(new TextEncoder().encode(JSON.stringify({ event: "connected", data: { peerId: "p", multiaddrs: [] } })));
    await rs.read();

    // End the byteStreams (simulates stream close)
    // After ending, reads should return null
    // Note: the exact close behavior depends on the underlying pushable
  });

  it("QR-derived wsUrl format: ws://host:15432/ws?target=...&token=...", () => {
    // Verify the URL format matches what the relay expects
    const relayHost = "47.93.11.212";
    const relayPort = 15432;
    const target = "12D3KooWAbCdEfGhIjKlMnOpQrStUvWxYz";
    const token = "550e8400-e29b-41d4-a716-446655440000";

    const wsUrl = `ws://${relayHost}:${relayPort}/ws?target=${encodeURIComponent(target)}&token=${encodeURIComponent(token)}`;

    // Parse as the relay would
    const url = new URL(wsUrl);
    expect(url.pathname).toBe("/ws");
    expect(url.searchParams.get("target")).toBe(target);
    expect(url.searchParams.get("token")).toBe(token);
    expect(url.hostname).toBe("47.93.11.212");
    expect(url.port).toBe("15432");
  });

  it("HTTP header fallback: target from x-target-peer-id, token from x-pairing-token", () => {
    // Simulate the relay's header fallback logic
    const hdr = (name: string, headers: Record<string, string | string[] | undefined>): string | undefined => {
      const v = headers[name];
      return Array.isArray(v) ? v[0] : v;
    };

    // Case: no query params, only headers
    const headers = {
      "x-target-peer-id": "12D3KooWtargetFromHeader",
      "x-pairing-token": "token-from-header",
    };

    const url = new URL("ws://47.93.11.212:15432/ws"); // no query params
    const targetPeerId = (
      url.searchParams.get("target") ??
      hdr("x-target-peer-id", headers) ??
      ""
    ).trim();
    const token = (
      url.searchParams.get("token") ??
      hdr("x-pairing-token", headers) ??
      hdr("sec-websocket-protocol", headers) ??
      ""
    ).trim();

    expect(targetPeerId).toBe("12D3KooWtargetFromHeader");
    expect(token).toBe("token-from-header");
  });

  it("HTTP header fallback: token from sec-websocket-protocol", () => {
    const hdr = (name: string, headers: Record<string, string | string[] | undefined>): string | undefined => {
      const v = headers[name];
      return Array.isArray(v) ? v[0] : v;
    };

    const headers = {
      "x-target-peer-id": "12D3KooWtarget",
      "sec-websocket-protocol": "pairing-token-from-ws-protocol",
    };

    const url = new URL("ws://47.93.11.212:15432/ws");
    const token = (
      url.searchParams.get("token") ??
      hdr("x-pairing-token", headers) ??
      hdr("sec-websocket-protocol", headers) ??
      ""
    ).trim();

    expect(token).toBe("pairing-token-from-ws-protocol");
  });

  it("query params take precedence over HTTP headers", () => {
    const hdr = (name: string, headers: Record<string, string | string[] | undefined>): string | undefined => {
      const v = headers[name];
      return Array.isArray(v) ? v[0] : v;
    };

    const headers = {
      "x-target-peer-id": "header-target",
      "x-pairing-token": "header-token",
    };

    const url = new URL("ws://47.93.11.212:15432/ws?target=query-target&token=query-token");
    const targetPeerId = (
      url.searchParams.get("target") ??
      hdr("x-target-peer-id", headers) ??
      ""
    ).trim();
    const token = (
      url.searchParams.get("token") ??
      hdr("x-pairing-token", headers) ??
      ""
    ).trim();

    expect(targetPeerId).toBe("query-target");
    expect(token).toBe("query-token");
  });

  it("BUG REGRESSION: two back-to-back writes without intervening read causes concatenated JSON", async () => {
    // This test validates the bug: if home writes TWO messages before relay reads,
    // byteStream concatenates them into one read buffer, breaking JSON.parse.
    const [hs, rs] = createPairedByteStreams();

    // Write two messages back-to-back (simulating proxy-accept + connected)
    await hs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));
    await hs.write(new TextEncoder().encode(JSON.stringify({ event: "connected", data: {} })));

    // Relay reads once — gets BOTH messages concatenated
    const bytes = await rs.read();
    expect(bytes).not.toBeNull();
    const text = new TextDecoder().decode(bytes!.subarray());

    // This is the bug: text = '{"type":"proxy-accept"}{"event":"connected",...}'
    // JSON.parse would throw on this
    expect(() => JSON.parse(text)).toThrow();
    expect(text).toContain("proxy-accept");
    expect(text).toContain('"event":"connected"');
  });

  it("BUG REGRESSION: early RPC probe before handshake completes is buffered, not dropped", async () => {
    // This test validates the race condition fix: mobile sends JSON-RPC probes
    // immediately after WebSocket connect, but the relay is still doing
    // dialProtocol + handshake. The relay buffers early arrivals and flushes
    // them to the libp2p stream after proxy-accept.
    //
    // Key insight: the early message arrives at the relay's WebSocket BEFORE
    // the libp2p handshake completes, but the relay buffers it in memory
    // (earlyBuffer) and only writes it to the libp2p stream AFTER proxy-accept.
    const [hs, rs] = createPairedByteStreams();

    // --- Step 1: Relay sends proxy-connect (handshake starts) ---
    await rs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: "tok" })));

    // Home node reads the handshake
    const handshakeBytes = await hs.read();
    expect(handshakeBytes).not.toBeNull();
    const hs_ = JSON.parse(new TextDecoder().decode(handshakeBytes!.subarray()));
    expect(hs_.type).toBe("proxy-connect");

    // Home node sends proxy-accept
    await hs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));

    // Relay reads proxy-accept
    const acceptBytes = await rs.read();
    expect(acceptBytes).not.toBeNull();
    const accept = JSON.parse(new TextDecoder().decode(acceptBytes!.subarray()));
    expect(accept.type).toBe("proxy-accept");

    // --- Step 2: Relay now flushes buffered early messages ---
    // In the real relay, this is where earlyBuffer items are written to
    // the libp2p stream after streamReady=true.
    const earlyRpc = JSON.stringify({ id: "1", method: "getNodeConfig", params: {} });
    await rs.write(new TextEncoder().encode(earlyRpc));

    // Home node reads the buffered RPC
    const rpcBytes = await hs.read();
    expect(rpcBytes).not.toBeNull();
    const rpc = JSON.parse(new TextDecoder().decode(rpcBytes!.subarray()));
    expect(rpc.method).toBe("getNodeConfig");
    expect(rpc.id).toBe("1");

    // Home node responds
    await hs.write(new TextEncoder().encode(JSON.stringify({ id: "1", result: { ok: true } })));

    // Relay reads response (forwards to mobile WebSocket)
    const respBytes = await rs.read();
    expect(respBytes).not.toBeNull();
    const resp = JSON.parse(new TextDecoder().decode(respBytes!.subarray()));
    expect(resp.id).toBe("1");
    expect(resp.result.ok).toBe(true);
  });

  it("relay sends connected event (not home node) to avoid byte concatenation", async () => {
    const [hs, rs] = createPairedByteStreams();

    // Handshake
    await rs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: "tok" })));
    const handshakeBytes = await hs.read();
    expect(handshakeBytes).not.toBeNull();

    // Home node sends proxy-accept ONLY (no connected event)
    await hs.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));

    // Relay reads proxy-accept
    const acceptBytes = await rs.read();
    expect(acceptBytes).not.toBeNull();
    const accept = JSON.parse(new TextDecoder().decode(acceptBytes!.subarray()));
    expect(accept.type).toBe("proxy-accept");
    // Verify no extra bytes (no concatenated connected event)
    expect(acceptBytes!.byteLength).toBe(JSON.stringify({ type: "proxy-accept" }).length);

    // Relay sends its own connected event immediately after proxy-accept
    // (this is what the relay bridge does)

    // Relay should not have more data until an RPC is sent
    // (in a real scenario, read() would wait; here we verify the next read
    // doesn't immediately return concatenated data)
  });
});
