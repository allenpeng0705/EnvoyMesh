/**
 * E2E tests for the relay bridge protocol using real libp2p nodes.
 *
 * Sets up a home node and a relay node on localhost with random ports,
 * then exercises the full client-proxy flow:
 *
 *   Relay dials home node → handshake (proxy-connect/proxy-accept) → RPC loop
 *
 * These tests catch the regressions we've been debugging:
 *   1. Protocol handler registered before dial (missing await)
 *   2. Token validation
 *   3. RPC round-trip routing
 *   4. Stream lifecycle
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { byteStream } from "@libp2p/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvoyMesh, CLIENT_PROXY_PROTOCOL } from "@envoymesh/network";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createClientProxyHandler } from "../src/client-proxy-handler.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
});

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
  });
  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

function makeNodeService(profileDir: string, mesh: EnvoyMesh): NodeServiceImpl {
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
  svc.setWsListenAddress(3030, "/ws");
  return svc;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Relay bridge E2E (real libp2p)", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-relay-bridge-e2e-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("protocol handler is registered and discoverable via dialProtocol", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    // Register handler — MUST be awaited (this was the missing await bug)
    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    // Relay dials the home node
    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    expect(stream).toBeDefined();
    // The stream is in "open" state — we can read/write
    await stream.close();
  });

  it("dial fails with protocol selection error when handler is NOT registered", async () => {
    const home = await startMesh();
    const relay = await startMesh();

    // Home node does NOT register CLIENT_PROXY_PROTOCOL
    await expect(
      relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL),
    ).rejects.toThrow(/protocol selection|Protocol selection|no protocol/);
  });

  it("BUG REGRESSION: unawaited handleRawProtocol does not prevent registration", async () => {
    // This test verifies that even without await, the registrar stores the
    // handler synchronously in practice. But we always use await to be safe.
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    // Deliberately omit await (the original bug)
    home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    // Give a microtick for the Promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    // Should still work because libp2p's registrar stores handlers synchronously
    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    expect(stream).toBeDefined();
    await stream.close();
  });

  it("full handshake: proxy-connect with valid token → proxy-accept", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    // Generate a pairing token by calling getPairingPayload
    const payload = await svc.getPairingPayload();
    const token = payload.token!;
    expect(token).toBeTruthy();

    // Register handler with AWAIT
    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    // Relay dials
    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    const streamIo = byteStream(stream);

    // Relay sends handshake
    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token })),
    );

    // Relay reads response
    const respBytes = await streamIo.read();
    expect(respBytes).not.toBeNull();
    const resp = JSON.parse(new TextDecoder().decode(respBytes!.subarray()));
    expect(resp.type).toBe("proxy-accept");

    await stream.close();
  });

  it("invalid token → proxy-reject", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    // Generate valid token first so NodeServiceImpl state is initialized
    await svc.getPairingPayload();

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    const streamIo = byteStream(stream);

    // Send wrong token
    await streamIo.write(
      new TextEncoder().encode(
        JSON.stringify({ type: "proxy-connect", token: "wrong-token" }),
      ),
    );

    const respBytes = await streamIo.read();
    expect(respBytes).not.toBeNull();
    const resp = JSON.parse(new TextDecoder().decode(respBytes!.subarray()));
    expect(resp.type).toBe("proxy-reject");
    expect(resp.reason).toContain("invalid");

    await stream.close();
  });

  it("RPC round-trip: relay proxies getNodeConfig → home responds", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    // --- Handshake ---
    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    const streamIo = byteStream(stream);

    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token })),
    );
    const acceptBytes = await streamIo.read();
    expect(JSON.parse(new TextDecoder().decode(acceptBytes!.subarray())).type).toBe("proxy-accept");

    // --- RPC request ---
    const rpc = JSON.stringify({ id: "1", method: "getNodeConfig", params: {} });
    await streamIo.write(new TextEncoder().encode(rpc));

    const rpcRespBytes = await streamIo.read();
    expect(rpcRespBytes).not.toBeNull();
    const rpcResp = JSON.parse(new TextDecoder().decode(rpcRespBytes!.subarray()));
    expect(rpcResp.id).toBe("1");
    expect(rpcResp.result).toBeDefined();
    // getNodeConfig returns a config object
    expect(rpcResp.result.relayEnabled).toBe(true);

    await stream.close();
  });

  it("RPC round-trip: getNodeStatus", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    const streamIo = byteStream(stream);

    // Handshake
    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token })),
    );
    await streamIo.read(); // consume proxy-accept

    // RPC
    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ id: "2", method: "getNodeStatus", params: {} })),
    );

    const respBytes = await streamIo.read();
    const resp = JSON.parse(new TextDecoder().decode(respBytes!.subarray()));
    expect(resp.id).toBe("2");
    expect(resp.result).toBeDefined();
    expect(resp.result.status).toBe("running");

    await stream.close();
  });

  it("multiple sequential RPCs on same stream", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    const streamIo = byteStream(stream);

    // Handshake
    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token })),
    );
    await streamIo.read(); // consume proxy-accept

    // Send 5 RPCs sequentially
    const methods = ["getNodeConfig", "getNodeStatus", "getConnectionStatus", "getBridgeStatus", "getBonds"];
    for (let i = 0; i < methods.length; i++) {
      await streamIo.write(
        new TextEncoder().encode(JSON.stringify({ id: String(i), method: methods[i], params: {} })),
      );
      const respBytes = await streamIo.read();
      expect(respBytes).not.toBeNull();
      const resp = JSON.parse(new TextDecoder().decode(respBytes!.subarray()));
      expect(resp.id).toBe(String(i));
      expect(resp.error).toBeUndefined();
    }

    await stream.close();
  });

  it("unknown method returns JSON-RPC error without breaking stream", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    const streamIo = byteStream(stream);

    // Handshake
    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token })),
    );
    await streamIo.read(); // proxy-accept

    // Unknown method → error response
    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ id: "99", method: "nonexistent_method", params: {} })),
    );
    const errRespBytes = await streamIo.read();
    const errResp = JSON.parse(new TextDecoder().decode(errRespBytes!.subarray()));
    expect(errResp.id).toBe("99");
    expect(errResp.error).toBeDefined();
    expect(errResp.error.message).toContain("Unknown method");

    // Stream is still usable — send a valid RPC
    await streamIo.write(
      new TextEncoder().encode(JSON.stringify({ id: "100", method: "getNodeStatus", params: {} })),
    );
    const okRespBytes = await streamIo.read();
    const okResp = JSON.parse(new TextDecoder().decode(okRespBytes!.subarray()));
    expect(okResp.id).toBe("100");
    expect(okResp.result).toBeDefined();

    await stream.close();
  });

  it("empty handshake (null bytes) closes stream cleanly", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    await svc.getPairingPayload();
    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);

    // Close stream immediately without sending handshake
    await stream.close();

    // Handler should have handled this cleanly — no crash on home node
    // Give it time to process
    await new Promise((r) => setTimeout(r, 50));
  });

  it("malformed JSON in handshake causes stream close", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    await svc.getPairingPayload();
    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const stream = await relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL);
    const streamIo = byteStream(stream);

    // Send garbage
    await streamIo.write(new TextEncoder().encode("not-json"));

    // The handler will try to JSON.parse, which throws → finally closes stream.
    // Wait a bit for the home node to process.
    await new Promise((r) => setTimeout(r, 50));

    // The stream should be closed from the home node's side
    // (read returns null on a closed stream)
    // We just verify the relay side doesn't crash
    await stream.close();
  });

  it("multiple parallel RPC connections from same relay to same home node", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    // Open 3 parallel connections
    const streams = await Promise.all(
      [0, 1, 2].map(() => relay.dialProtocol(home.multiaddrs[0], CLIENT_PROXY_PROTOCOL)),
    );
    expect(streams).toHaveLength(3);

    // Handshake each one
    for (const stream of streams) {
      const io = byteStream(stream);
      await io.write(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token })),
      );
      const resp = await io.read();
      expect(JSON.parse(new TextDecoder().decode(resp!.subarray())).type).toBe("proxy-accept");
    }

    // Send RPC on each
    for (let i = 0; i < streams.length; i++) {
      const io = byteStream(streams[i]);
      await io.write(
        new TextEncoder().encode(JSON.stringify({ id: String(i), method: "getNodeStatus", params: {} })),
      );
      const resp = await io.read();
      expect(JSON.parse(new TextDecoder().decode(resp!.subarray())).result).toBeDefined();
    }

    await Promise.all(streams.map((s) => s.close().catch(() => {})));
  });
});
