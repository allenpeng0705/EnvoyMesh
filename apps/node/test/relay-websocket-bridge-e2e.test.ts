/**
 * E2E tests for the full relay WebSocket → libp2p bridge flow.
 *
 * Simulates the EXACT production scenario:
 *   Mobile (WebSocket client) → Relay (WS server + libp2p dial) → Home Node
 *
 * This is the most comprehensive integration test — it covers the layer where
 * production failures have been observed ("Protocol selection failed").
 *
 * Architecture:
 *   - Home node: real libp2p node with CLIENT_PROXY_PROTOCOL handler
 *   - Relay node: real libp2p node + real WebSocket server (ws package)
 *   - Mobile client: WebSocket client (ws package) connecting to relay
 *
 * The relay's WS→libp2p bridge mirrors apps/relay/src/index.ts handleProxyConnection:
 *   1. Accept WS connection, extract target peer ID + token
 *   2. dialProtocol(homePeerId, CLIENT_PROXY_PROTOCOL)
 *   3. Send proxy-connect handshake, read proxy-accept
 *   4. Send connected event to mobile
 *   5. Bridge messages bidirectionally
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { byteStream } from "@libp2p/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvoyMesh, CLIENT_PROXY_PROTOCOL } from "@envoymesh/network";
import { WebSocketServer, WebSocket } from "ws";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createClientProxyHandler } from "../src/client-proxy-handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Minimal relay bridge: WebSocket server that proxies to a home node via libp2p.
 * Mirrors the production handleProxyConnection in apps/relay/src/index.ts.
 */
function createRelayBridge(
  relayMesh: EnvoyMesh,
  homePeerId: string,
  homeMultiaddr: string,
  token: string,
  port: number,
): { wsUrl: string; stop: () => Promise<void> } {
  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });

  // Extract home peer ID from multiaddr for the target
  const targetPeerId = homePeerId;

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // Mirror production: read target from query params, with header fallback
    const hdr = (name: string): string | undefined => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    const target = (
      url.searchParams.get("target") ??
      hdr("x-target-peer-id") ??
      targetPeerId // fall back to configured home peer ID
    ).trim();
    const tok = (
      url.searchParams.get("token") ??
      hdr("x-pairing-token") ??
      token
    ).trim();

    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleProxyConnection(relayMesh, ws, target, tok);
    });
  });

  async function handleProxyConnection(
    mesh: EnvoyMesh,
    ws: WebSocket,
    target: string,
    tok: string,
  ): Promise<void> {
    // Early message buffering (mirrors production)
    const earlyBuffer: Uint8Array[] = [];
    let streamReady = false;
    let streamIo: ReturnType<typeof byteStream> | null = null;

    const rawToBytes = (raw: string | Buffer | ArrayBuffer | Buffer[]): Uint8Array => {
      if (typeof raw === "string") return new TextEncoder().encode(raw);
      if (raw instanceof Uint8Array) return raw;
      if (Array.isArray(raw)) return new Uint8Array(Buffer.concat(raw));
      return new Uint8Array(raw as ArrayBuffer);
    };

    // Register message handler IMMEDIATELY (before dial) to avoid dropped messages
    ws.on("message", (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const bytes = rawToBytes(raw);
        if (streamReady && streamIo) {
          void streamIo.write(bytes).catch(() => ws.close());
        } else {
          earlyBuffer.push(bytes);
        }
      } catch {
        ws.close();
      }
    });

    let libp2pStream: any = null;

    try {
      // === CRITICAL: dial home node using target peer ID ===
      // First ensure relay knows how to reach home node by connecting via multiaddr.
      // In production, this happens through circuit relay connections.
      // In tests, we need to dial once to populate the peer store.
      try {
        await mesh.dialProtocol(homeMultiaddr, CLIENT_PROXY_PROTOCOL);
      } catch {
        // This dial might fail if handler only accepts one stream at a time
        // or if we haven't dialed before. The actual proxy dial below is what matters.
      }

      // Now dial using JUST the peer ID — this is exactly what production does
      libp2pStream = await mesh.dialProtocol(target, CLIENT_PROXY_PROTOCOL);
      streamIo = byteStream(libp2pStream);

      // Send handshake
      await streamIo.write(
        new TextEncoder().encode(JSON.stringify({ type: "proxy-connect", token: tok })),
      );

      // Read handshake response
      const responseBytes = await streamIo.read();
      if (!responseBytes) {
        ws.close(1011, "home node closed stream");
        return;
      }
      const response = JSON.parse(new TextDecoder().decode(responseBytes.subarray()));
      if (response.type !== "proxy-accept") {
        ws.close(1011, response.reason ?? "home node rejected proxy");
        return;
      }

      // Flush early buffered messages
      streamReady = true;
      if (earlyBuffer.length > 0) {
        for (const bytes of earlyBuffer) {
          await streamIo.write(bytes);
        }
        earlyBuffer.length = 0;
      }

      // Send connected event (relay-side, not home-side — avoids concatenation bug)
      ws.send(JSON.stringify({ event: "connected", data: { relayProxied: true } }));

      // Bridge: libp2p → WebSocket
      void (async () => {
        const decoder = new TextDecoder();
        try {
          while (ws.readyState === WebSocket.OPEN) {
            const bytes = await streamIo!.read();
            if (!bytes) {
              ws.close();
              break;
            }
            ws.send(decoder.decode(bytes.subarray()));
          }
        } catch {
          try { ws.close(); } catch { /* ignore */ }
        }
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, msg);
      }
    }

    ws.on("close", () => {
      if (libp2pStream) {
        try { libp2pStream.close(); } catch { /* ignore */ }
      }
    });

    ws.on("error", () => {
      ws.close();
    });
  }

  return new Promise((resolve, reject) => {
    httpServer.listen(port, "127.0.0.1", () => {
      const addr = httpServer.address() as AddressInfo;
      const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
      resolve({
        wsUrl,
        stop: async () => {
          wss.close();
          await new Promise<void>((res) => httpServer.close(() => res()));
        },
      });
    });
    httpServer.on("error", reject);
  });
}

/** Wait for a WebSocket to reach a specific readyState */
function waitForOpen(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    const timer = setTimeout(() => reject(new Error("WebSocket open timed out")), timeoutMs);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Read one text message from a WebSocket */
function readWsMessage(ws: WebSocket, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WS read timed out")), timeoutMs);
    const handler = (data: Buffer | ArrayBuffer | Buffer[]) => {
      clearTimeout(timer);
      ws.off("message", handler);
      // ws@8 sends Buffer by default
      if (data instanceof Uint8Array) {
        resolve(new TextDecoder().decode(data));
      } else if (typeof data === "string") {
        resolve(data);
      } else {
        resolve(new TextDecoder().decode(new Uint8Array(data as ArrayBuffer)));
      }
    };
    ws.on("message", handler);
  });
}

/** Send a JSON message over WebSocket */
function sendWsJson(ws: WebSocket, obj: unknown): void {
  ws.send(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Relay WebSocket bridge E2E", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-ws-bridge-e2e-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it(
    "full flow: WebSocket client → relay bridge → home node (proxy-connect → proxy-accept → connected → RPC)",
    async () => {
      // --- Setup ---
      const home = await startMesh();
      const relay = await startMesh();
      const svc = makeNodeService(profileDir, home);

      // Generate pairing token
      const payload = await svc.getPairingPayload();
      const token = payload.token!;
      expect(token).toBeTruthy();

      // Register client-proxy handler on home node
      await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

      // First, establish a basic libp2p connection from relay to home node.
      // This populates the relay's peer store so dialProtocol with bare peer ID works.
      // In production, this happens via circuit relay connections.
      const homeAddr = home.multiaddrs[0];
      const connStream = await relay.dialProtocol(homeAddr, CLIENT_PROXY_PROTOCOL);
      await connStream.close();

      // --- Start relay bridge (WebSocket server) ---
      const bridge = await createRelayBridge(
        relay,
        home.peerId,
        homeAddr,
        token,
        0, // random port
      );

      // --- Mobile client connects via WebSocket ---
      const wsUrl = `${bridge.wsUrl}?target=${encodeURIComponent(home.peerId)}&token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      await waitForOpen(ws);

      // --- Step 1: Read connected event ---
      const connectedMsg = await readWsMessage(ws);
      const connected = JSON.parse(connectedMsg);
      expect(connected.event).toBe("connected");
      expect(connected.data.relayProxied).toBe(true);

      // --- Step 2: Send RPC - getNodeConfig ---
      sendWsJson(ws, { id: "1", method: "getNodeConfig", params: {} });
      const rpcResp1 = JSON.parse(await readWsMessage(ws));
      expect(rpcResp1.id).toBe("1");
      expect(rpcResp1.result).toBeDefined();
      expect(rpcResp1.result.relayEnabled).toBe(true);

      // --- Step 3: Send RPC - getNodeStatus ---
      sendWsJson(ws, { id: "2", method: "getNodeStatus", params: {} });
      const rpcResp2 = JSON.parse(await readWsMessage(ws));
      expect(rpcResp2.id).toBe("2");
      expect(rpcResp2.result.status).toBe("running");

      // --- Step 4: Send RPC - getBonds ---
      sendWsJson(ws, { id: "3", method: "getBonds", params: {} });
      const rpcResp3 = JSON.parse(await readWsMessage(ws));
      expect(rpcResp3.id).toBe("3");
      expect(rpcResp3.result).toBeDefined();

      // --- Cleanup ---
      ws.close();
      await bridge.stop();
    },
    15000,
  );

  it("full flow with query params extracted from wsUrl (no headers)", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    // Populate peer store
    const homeAddr = home.multiaddrs[0];
    const connStream = await relay.dialProtocol(homeAddr, CLIENT_PROXY_PROTOCOL);
    await connStream.close();

    const bridge = await createRelayBridge(relay, home.peerId, homeAddr, token, 0);

    // Connect with query params (how mobile app QR codes work)
    const wsUrl = `${bridge.wsUrl}?target=${encodeURIComponent(home.peerId)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    await waitForOpen(ws);

    const connected = JSON.parse(await readWsMessage(ws));
    expect(connected.event).toBe("connected");

    sendWsJson(ws, { id: "1", method: "getNodeConfig", params: {} });
    const resp = JSON.parse(await readWsMessage(ws));
    expect(resp.result).toBeDefined();

    ws.close();
    await bridge.stop();
  }, 10000);

  it("invalid token in relay proxy gets proxy-reject and WS close", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    // Generate valid token so NodeServiceImpl state is initialized
    await svc.getPairingPayload();

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const homeAddr = home.multiaddrs[0];
    const connStream = await relay.dialProtocol(homeAddr, CLIENT_PROXY_PROTOCOL);
    await connStream.close();

    const bridge = await createRelayBridge(relay, home.peerId, homeAddr, "wrong-token", 0);

    const wsUrl = `${bridge.wsUrl}?target=${encodeURIComponent(home.peerId)}&token=wrong-token`;
    const ws = new WebSocket(wsUrl);

    // WS should be closed by relay with code 1011 (proxy-reject)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS close timed out")), 5000);
      ws.on("close", (code) => {
        clearTimeout(timer);
        expect(code).toBe(1011);
        resolve();
      });
      ws.on("error", () => {
        clearTimeout(timer);
        resolve(); // error is expected
      });
    });

    await bridge.stop();
  }, 10000);

  it("multiple sequential RPCs over WebSocket bridge", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const homeAddr = home.multiaddrs[0];
    const connStream = await relay.dialProtocol(homeAddr, CLIENT_PROXY_PROTOCOL);
    await connStream.close();

    const bridge = await createRelayBridge(relay, home.peerId, homeAddr, token, 0);

    const wsUrl = `${bridge.wsUrl}?target=${encodeURIComponent(home.peerId)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    await waitForOpen(ws);

    // Consume connected event
    const connected = JSON.parse(await readWsMessage(ws));
    expect(connected.event).toBe("connected");

    // Send 5 sequential RPCs
    const methods = ["getNodeConfig", "getNodeStatus", "getConnectionStatus", "getBridgeStatus", "getBonds"];
    for (let i = 0; i < methods.length; i++) {
      sendWsJson(ws, { id: String(i), method: methods[i], params: {} });
      const resp = JSON.parse(await readWsMessage(ws));
      expect(resp.id).toBe(String(i));
      expect(resp.error).toBeUndefined();
      expect(resp.result).toBeDefined();
    }

    ws.close();
    await bridge.stop();
  }, 15000);

  it("early RPC probe (before handshake completes) is not dropped", async () => {
    // This tests the critical early-buffer behavior:
    // Mobile may send JSON-RPC probes immediately after WebSocket connect,
    // before the relay finishes dialProtocol + handshake.
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const homeAddr = home.multiaddrs[0];
    const connStream = await relay.dialProtocol(homeAddr, CLIENT_PROXY_PROTOCOL);
    await connStream.close();

    const bridge = await createRelayBridge(relay, home.peerId, homeAddr, token, 0);

    const wsUrl = `${bridge.wsUrl}?target=${encodeURIComponent(home.peerId)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    // Send RPC IMMEDIATELY on open — this races with the relay's dialProtocol
    ws.on("open", () => {
      sendWsJson(ws, { id: "early", method: "getNodeStatus", params: {} });
    });

    // Read connected event first
    const msg1 = JSON.parse(await readWsMessage(ws));
    expect(msg1.event).toBe("connected");

    // Then read RPC response (should NOT be dropped)
    const msg2 = JSON.parse(await readWsMessage(ws));
    expect(msg2.id).toBe("early");
    expect(msg2.result).toBeDefined();
    expect(msg2.result.status).toBe("running");

    ws.close();
    await bridge.stop();
  }, 15000);

  it("multiple parallel WebSocket connections to same home node", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const homeAddr = home.multiaddrs[0];
    const connStream = await relay.dialProtocol(homeAddr, CLIENT_PROXY_PROTOCOL);
    await connStream.close();

    const bridge = await createRelayBridge(relay, home.peerId, homeAddr, token, 0);

    // Open 3 parallel WebSocket connections
    const wsUrl = `${bridge.wsUrl}?target=${encodeURIComponent(home.peerId)}&token=${encodeURIComponent(token)}`;
    const clients: WebSocket[] = [];

    for (let i = 0; i < 3; i++) {
      const ws = new WebSocket(wsUrl);
      await waitForOpen(ws);
      clients.push(ws);

      // Read connected event
      const connected = JSON.parse(await readWsMessage(ws));
      expect(connected.event).toBe("connected");
    }

    // Send RPC on each
    for (let i = 0; i < clients.length; i++) {
      sendWsJson(clients[i], { id: String(i), method: "getNodeStatus", params: {} });
      const resp = JSON.parse(await readWsMessage(clients[i]));
      expect(resp.id).toBe(String(i));
      expect(resp.result.status).toBe("running");
    }

    for (const ws of clients) {
      ws.close();
    }
    await bridge.stop();
  }, 20000);

  it("home node RPC error propagates through relay to WebSocket client", async () => {
    const home = await startMesh();
    const relay = await startMesh();
    const svc = makeNodeService(profileDir, home);

    const payload = await svc.getPairingPayload();
    const token = payload.token!;

    await home.handleRawProtocol(CLIENT_PROXY_PROTOCOL, createClientProxyHandler(svc));

    const homeAddr = home.multiaddrs[0];
    const connStream = await relay.dialProtocol(homeAddr, CLIENT_PROXY_PROTOCOL);
    await connStream.close();

    const bridge = await createRelayBridge(relay, home.peerId, homeAddr, token, 0);

    const wsUrl = `${bridge.wsUrl}?target=${encodeURIComponent(home.peerId)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    await waitForOpen(ws);

    // Consume connected
    await readWsMessage(ws);

    // Send unknown method → should get error response
    sendWsJson(ws, { id: "err-1", method: "nonexistent_method_xyz", params: {} });
    const errResp = JSON.parse(await readWsMessage(ws));
    expect(errResp.id).toBe("err-1");
    expect(errResp.error).toBeDefined();
    expect(errResp.error.message).toContain("Unknown method");

    // Stream should still be usable
    sendWsJson(ws, { id: "ok-1", method: "getNodeStatus", params: {} });
    const okResp = JSON.parse(await readWsMessage(ws));
    expect(okResp.id).toBe("ok-1");
    expect(okResp.result).toBeDefined();

    ws.close();
    await bridge.stop();
  }, 10000);
});
