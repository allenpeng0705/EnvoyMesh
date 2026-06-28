/**
 * EnvoyMesh Standalone Relay Server
 *
 * A minimal P2P circuit relay server with optional rendezvous capability registry.
 * Handles relay traffic routing between peers and optionally registers peer capabilities.
 *
 * DESIGN PRINCIPLES FOR LONG-RUNNING RELAY:
 * - Never crash: all async operations wrapped in try-catch
 * - Never run out of memory: bounded data structures with eviction
 * - Never block the event loop: async operations, bounded concurrency
 * - Graceful degradation: reject abuse, log issues, continue serving
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { CapabilityRegistry, EnvoyMesh } from "@envoymesh/network";
import { createLibp2pClientProxyHandler } from "./libp2p-client-proxy.js";
import { parseRelayArgs } from "./args.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key-loader.js";
import { createHomeTunnelProxy, type HomeTunnelProxy } from "./home-tunnel-proxy.js";
import { createWsRelayRoster } from "./ws-relay-roster.js";
import { handleWsRelayControlEnvelope } from "./ws-relay-control.js";
import {
  createInitialStandaloneRelayHealthState,
  evaluateStandaloneRelayHealth,
  type StandaloneRelayHealthSnapshot,
  type StandaloneRelayHealthState,
} from "./relay-health.js";
import {
  parseRendezvousRegisterPayload,
  parseRendezvousQueryPayload,
  createRendezvousResponsePayload,
  parseBroadcastRequestPayload,
  parseBroadcastCancelPayload,
  createBroadcastCancelPayload,
  parseTaskCancelPayload,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const args = parseRelayArgs(process.argv.slice(2));
const startedAtMs = Date.now();

// Ensure profile directory exists
mkdirSync(args.profileDir, { recursive: true });

const libp2pPrivateKey = await loadOrCreateLibp2pPrivateKey(
  join(args.profileDir, "libp2p-private.key"),
);

// Maximum payload size to prevent memory exhaustion (1MB)
const MAX_ENVELOPE_BYTES = 1 * 1024 * 1024;

// Maximum fan-out targets to prevent resource exhaustion
const MAX_FANOUT_TARGETS = 500;

// Maximum forward targets for task.cancel
const MAX_FORWARD_TARGETS = 100;

// Maximum concurrent client-proxy connections (mobile → relay → home node)
const MAX_PROXY_CONNECTIONS = 50;
const MAX_PROXY_CONNS_PER_TARGET = 10;
/** Cap early RPC frames buffered while libp2p client-proxy dials the home node. */
const MAX_LIBP2P_PROXY_EARLY_BUFFER = 100;

// Maximum bytes of a single `data` payload inside a home-tunnel frame.
// The home now chunks PTY output into ~64KB pieces; base64 inflates
// by ~33% so a 128KB cap gives ample headroom while still bounding
// memory + WebSocket text-frame size on the relay hop.
const MAX_HOME_TUNNEL_DATA_BYTES = 128 * 1024;

// Maximum concurrent deliveries per fan-out batch
const CONCURRENCY_LIMIT = 50;

const RELAY_HEALTH_INTERVAL_MS = 30_000;
const EVENT_LOOP_LAG_SAMPLE_MS = 1_000;
const MAX_RECORDED_FATAL_ERRORS = 20;

// ============================================================================
// CRASH PREVENTION: Global error handlers
// ============================================================================

const recentFatalErrors: Array<{ at: number; message: string }> = [];

function recordFatalError(label: string, reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason);
  recentFatalErrors.push({ at: Date.now(), message: `${label}: ${message}` });
  if (recentFatalErrors.length > MAX_RECORDED_FATAL_ERRORS) {
    recentFatalErrors.splice(0, recentFatalErrors.length - MAX_RECORDED_FATAL_ERRORS);
  }
}

// Record uncaught synchronous exceptions and let the watchdog decide when a clean restart is safer.
process.on("uncaughtException", (error: Error) => {
  recordFatalError("uncaughtException", error);
  console.error("[relay] UNCAUGHT EXCEPTION — recorded for health watchdog:", error.message, error.stack);
});

// Record unhandled promise rejections and let the watchdog decide when to exit for the supervisor.
process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  recordFatalError("unhandledRejection", reason);
  console.error("[relay] UNHANDLED REJECTION — recorded for health watchdog:", msg);
});

// ============================================================================
// MESH & STATE
// ============================================================================

console.log(`[relay] Starting EnvoyMesh Relay Server`);
console.log(`[relay] Profile: ${args.profileDir}`);
console.log(`[relay] Listen: ${args.listen.join(", ")}`);
console.log(`[relay] DHT: ${args.enableDht ? (args.dhtClientMode ? "client mode" : "server mode") : "disabled"}`);
console.log(`[relay] Rendezvous: ${args.enableRendezvous ? "enabled" : "disabled (empty ACKs only)"}`);
if (args.advertiseAddrs.length > 0) {
  console.log(`[relay] Advertise (append to libp2p announce): ${args.advertiseAddrs.join(", ")}`);
}
if (args.httpPort) {
  console.log(`[relay] HTTP info endpoint: enabled (port ${args.httpPort})`);
  console.log(`[relay] WebSocket endpoints: /ws (mobile client-proxy), /ws/home (home node tunnel), /ws/client (direct client)`);
} else {
  console.log(`[relay] HTTP info endpoint: disabled`);
}

// Create minimal EnvoyMesh for relay-only operation
const mesh = new EnvoyMesh({
  listen: args.listen,
  advertiseAddrs: args.advertiseAddrs,
  enableRelayServer: true,
  enableRelay: true,
  enableAutoNat: true,
  enableDcutr: true,
  enableDht: args.enableDht,
  dhtClientMode: args.dhtClientMode,
  bootstrapPeers: args.bootstrapPeers,
  libp2pPrivateKey,
});

let started = false;
let httpServer: ReturnType<typeof createServer> | null = null;
let capabilityRegistry: CapabilityRegistry | undefined;
let rendezvousSweeper: ReturnType<typeof setInterval> | undefined;
let statsInterval: ReturnType<typeof setInterval> | undefined;
let rateLimitCleanupInterval: ReturnType<typeof setInterval> | undefined;
let relayHealthTimer: ReturnType<typeof setInterval> | undefined;
let eventLoopLagTimer: ReturnType<typeof setInterval> | undefined;
let relayHealthState: StandaloneRelayHealthState = createInitialStandaloneRelayHealthState();
let relayHealthSnapshot: StandaloneRelayHealthSnapshot | undefined;
let lastEventLoopLagMs = 0;
let relayRepairInProgress = false;
/** Set when HTTP WS endpoints are active; used for graceful shutdown. */
let homeTunnelProxyRef: HomeTunnelProxy | null = null;
const wsRelayRoster = createWsRelayRoster();

// ============================================================================
// RATE LIMITING: Track registrations per peer to prevent abuse
// ============================================================================
const peerRegistrationCount = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window
const RATE_LIMIT_MAX_REGISTRATIONS = 10; // max registrations per peer per window
const MAX_RATE_LIMIT_ENTRIES = 10_000; // Prevent memory exhaustion

function checkRegistrationRateLimit(peerId: string): boolean {
  // Guard against invalid input
  if (!peerId || typeof peerId !== "string") {
    return false;
  }

  // Prevent memory exhaustion - evict oldest if at capacity
  if (peerRegistrationCount.size >= MAX_RATE_LIMIT_ENTRIES) {
    let oldest: string | null = null;
    let oldestExpiry = Infinity;
    for (const [id, entry] of peerRegistrationCount) {
      if (entry.resetAt < oldestExpiry) {
        oldest = id;
        oldestExpiry = entry.resetAt;
      }
    }
    if (oldest) {
      peerRegistrationCount.delete(oldest);
    } else {
      const first = peerRegistrationCount.keys().next().value;
      if (first) peerRegistrationCount.delete(first);
    }
  }

  const now = Date.now();
  const entry = peerRegistrationCount.get(peerId);

  if (!entry || entry.resetAt < now) {
    peerRegistrationCount.set(peerId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REGISTRATIONS) {
    return false;
  }

  entry.count++;
  return true;
}

// ============================================================================
// MESSAGE DEDUPLICATION: Prevent processing the same message ID twice
// ============================================================================
const seenMessageIds = new Map<string, number>(); // messageId → timestamp
const MAX_SEEN_MESSAGE_IDS = 100_000;
const SEEN_MESSAGE_ID_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isMessageSeen(messageId: string): boolean {
  // Guard against invalid input
  if (!messageId || typeof messageId !== "string") {
    return true; // Treat invalid IDs as "seen" to reject them
  }
  const ts = seenMessageIds.get(messageId);
  if (!ts) return false;
  if (Date.now() - ts > SEEN_MESSAGE_ID_TTL_MS) {
    seenMessageIds.delete(messageId);
    return false;
  }
  return true;
}

function markMessageSeen(messageId: string): void {
  // Guard against invalid input
  if (!messageId || typeof messageId !== "string") {
    return;
  }

  // Evict oldest and expired entries if we're at capacity
  if (seenMessageIds.size >= MAX_SEEN_MESSAGE_IDS) {
    const targetSize = Math.floor(MAX_SEEN_MESSAGE_IDS * 0.1);
    const now = Date.now();
    let removed = 0;
    // Sort by timestamp ascending and evict the oldest expired ones first
    const entries = Array.from(seenMessageIds.entries())
      .sort(([, a], [, b]) => a - b);
    for (const [id, ts] of entries) {
      if (removed >= targetSize) break;
      if (now - ts > SEEN_MESSAGE_ID_TTL_MS || removed < targetSize) {
        seenMessageIds.delete(id);
        removed++;
      }
    }
  }
  seenMessageIds.set(messageId, Date.now());
}

// ============================================================================
// PERIODIC CLEANUP: Rate limit map and seen message IDs
// ============================================================================
rateLimitCleanupInterval = setInterval(() => {
  try {
    const now = Date.now();
    let cleaned = 0;
    for (const [peerId, entry] of peerRegistrationCount.entries()) {
      if (entry.resetAt < now) {
        peerRegistrationCount.delete(peerId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[relay] Rate limit cleanup: removed ${cleaned} expired entries`);
    }
  } catch (err) {
    console.error("[relay] Rate limit cleanup error:", err);
  }

  // Clean up expired seenMessageIds entries (TTL-based)
  try {
    const cutoff = Date.now() - SEEN_MESSAGE_ID_TTL_MS;
    let cleaned = 0;
    for (const [id, ts] of seenMessageIds) {
      if (ts < cutoff) {
        seenMessageIds.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[relay] Seen message IDs cleanup: removed ${cleaned} expired entries`);
    }
  } catch (err) {
    console.error("[relay] Seen message IDs cleanup error:", err);
  }
}, 60_000);

async function shutdown(): Promise<void> {
  console.log("[relay] Shutting down...");
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = undefined;
  }
  if (rendezvousSweeper) {
    clearInterval(rendezvousSweeper);
    rendezvousSweeper = undefined;
  }
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = undefined;
  }
  if (relayHealthTimer) {
    clearInterval(relayHealthTimer);
    relayHealthTimer = undefined;
  }
  if (eventLoopLagTimer) {
    clearInterval(eventLoopLagTimer);
    eventLoopLagTimer = undefined;
  }
  if (homeTunnelProxyRef) {
    await homeTunnelProxyRef.shutdown();
    homeTunnelProxyRef = null;
  }
  if (httpServer) {
    httpServer.close();
  }
  if (started) {
    await mesh.stop();
  }
  console.log("[relay] Stopped.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function startEventLoopLagMonitor(): void {
  let expectedAt = Date.now() + EVENT_LOOP_LAG_SAMPLE_MS;
  eventLoopLagTimer = setInterval(() => {
    const now = Date.now();
    lastEventLoopLagMs = Math.max(0, now - expectedAt);
    expectedAt = now + EVENT_LOOP_LAG_SAMPLE_MS;
  }, EVENT_LOOP_LAG_SAMPLE_MS);
}

function startRelayHealthWatchdog(): void {
  relayHealthTimer = setInterval(() => {
    void runRelayHealthCycle("periodic").catch((error) => {
      recordFatalError("relayHealthWatchdog", error);
      console.error("[relay] Health watchdog failed:", error);
    });
  }, RELAY_HEALTH_INTERVAL_MS);
}

async function runRelayHealthCycle(source: "startup" | "periodic"): Promise<void> {
  const result = evaluateStandaloneRelayHealth({
    startedAtMs,
    listenAddrs: started ? mesh.multiaddrs : [],
    connectedRelayPeerCount: started ? mesh.getConnectedRelayPeerIds().length : 0,
    httpEnabled: args.httpPort != null,
    httpListening: args.httpPort == null || httpServer?.listening === true || (source === "startup" && httpServer != null),
    eventLoopLagMs: lastEventLoopLagMs,
    rssBytes: process.memoryUsage().rss,
    recentFatalErrors,
    previous: relayHealthState,
  });
  relayHealthState = result.state;
  relayHealthSnapshot = result.snapshot;

  const reasonText = result.snapshot.reasons.join("; ") || "-";
  console.log(
    `[relay] Health ${result.snapshot.status} source=${source} actions=${result.snapshot.actions.join(",")} reasons=${reasonText}`,
  );

  if (result.snapshot.actions.includes("exit-for-supervisor")) {
    await exitForSupervisor(reasonText);
    return;
  }

  if (result.snapshot.actions.includes("restart-libp2p")) {
    await restartLibp2pForHealth(reasonText);
  }
}

async function restartLibp2pForHealth(reason: string): Promise<void> {
  if (relayRepairInProgress) {
    return;
  }
  relayRepairInProgress = true;
  try {
    console.warn(`[relay] Health requested libp2p restart: ${reason}`);
    if (started) {
      await mesh.stop();
      started = false;
    }
    await mesh.start();
    started = true;
    console.warn("[relay] Libp2p restart completed.");
  } catch (error) {
    recordFatalError("libp2pRestart", error);
    console.error("[relay] Libp2p restart failed; exiting for supervisor:", error);
    await exitForSupervisor("libp2p restart failed");
  } finally {
    relayRepairInProgress = false;
  }
}

async function exitForSupervisor(reason: string): Promise<void> {
  console.error(`[relay] Critical health state; exiting for supervisor restart: ${reason}`);
  try {
    if (started) {
      await mesh.stop();
      started = false;
    }
  } catch (error) {
    console.error("[relay] Failed to stop cleanly before supervisor exit:", error);
  } finally {
    process.exit(2);
  }
}

try {
  await mesh.start();
  started = true;

  const listenAddrs = mesh.multiaddrs;
  console.log(`[relay] Relay server started.`);
  console.log(`[relay] Listen addresses: ${listenAddrs.join(", ")}`);
  console.log(`[relay] Peer ID: ${mesh.peerId}`);
  console.log(`[relay] Ready to accept relay connections.`);

  if (args.enableRendezvous) {
    capabilityRegistry = new CapabilityRegistry({ verbosity: "full", logPrefix: "[registry]" });
    rendezvousSweeper = capabilityRegistry.startSweeper();
    console.log("[relay] Rendezvous capability registry enabled (TTL + indexes)");
  } else {
    console.warn(
      "[relay] Rendezvous storage disabled; rendezvous.register/query still get empty/query-less ACKs so clients using sendExpectReply do not hang.",
    );
  }

  if (args.httpPort) {
    httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/info") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            peerId: mesh.peerId,
            addrs: mesh.multiaddrs,
            rendezvous: args.enableRendezvous,
            clientProxy: true,
          }),
        );
      } else if (req.url === "/health") {
        const snapshot = relayHealthSnapshot ?? {
          status: started ? "healthy" : "starting",
          checkedAt: new Date().toISOString(),
          uptimeMs: Date.now() - startedAtMs,
          reasons: started ? [] : ["relay is starting"],
        };
        const statusCode =
          snapshot.status === "critical" || snapshot.status === "unhealthy" || snapshot.status === "starting"
            ? 503
            : 200;
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snapshot));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Direct client WebSocket connections (mobile → relay direct envelope routing)
    const directWss = new WebSocketServer({ noServer: true });
    const directClients = new Map<WebSocket, string>(); // ws → peerId
    const MAX_DIRECT_CLIENTS = 200;

    // WebSocket proxy for mobile client connections (Phase 10A relay bridge)
    const wss = new WebSocketServer({ noServer: true });
    const proxyConnByTarget = new Map<string, Set<WebSocket>>();
    let proxyConnTotal = 0;

    // ------------------------------------------------------------------------
    // Home-tunnel-proxy (TURN-like, for NAT-traversing pairing)
    // ------------------------------------------------------------------------
    // Home nodes behind NAT cannot be reached directly by libp2p. They
    // maintain a persistent outbound WebSocket to
    // /ws/home?peerId=<homePeerId>. When a mobile client arrives at
    // /ws?target=<homePeerId>&token=... and the target has a registered
    // tunnel, traffic is forwarded through the tunnel instead of a
    // libp2p dial. This makes pairing work regardless of NAT.
    //
    // The full state machine (channel tracking, orphan detection,
    // re-claim on new tunnel) lives in `./home-tunnel-proxy.ts` so it
    // can be unit-tested in isolation.
    const MAX_HOME_TUNNELS = 200;
    const sharedProxyBudget = { total: 0, max: MAX_PROXY_CONNECTIONS };
    const homeTunnelProxy = createHomeTunnelProxy({
      maxHomeTunnels: MAX_HOME_TUNNELS,
      maxProxyConnections: MAX_PROXY_CONNECTIONS,
      maxHomeTunnelDataBytes: MAX_HOME_TUNNEL_DATA_BYTES,
      sharedProxyBudget,
      logPrefix: "[relay]",
      onHomeControlEnvelope: ({ ws, peerId, envelope }) => {
        handleWsRelayControlEnvelope({
          ws,
          envelope,
          roster: wsRelayRoster,
          relayPeerId: mesh.peerId,
          meshMultiaddrs: mesh.multiaddrs,
          advertiseAddrs: args.advertiseAddrs,
          log: (msg) => console.log(msg),
        });
      },
    });
    homeTunnelProxyRef = homeTunnelProxy;

    httpServer.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      // ---- /ws/client — direct client envelope routing (mobile standalone) ----
      if (url.pathname === "/ws/client") {
        // Optional auth token check
        if (args.wsAuthToken) {
          const token = url.searchParams.get("token") ?? "";
          if (token !== args.wsAuthToken) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\nInvalid or missing token");
            socket.destroy();
            return;
          }
        }
        if (directClients.size >= MAX_DIRECT_CLIENTS) {
          socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\nToo many direct clients");
          socket.destroy();
          return;
        }
        directWss.handleUpgrade(req, socket, head, (ws) => {
          handleDirectClientConnection(ws);
        });
        return;
      }

      // ---- /ws/home — home node registers a persistent tunnel ----
      if (url.pathname === "/ws/home") {
        const peerId = (url.searchParams.get("peerId") ?? "").trim();
        void homeTunnelProxy.handleHomeUpgrade(req, socket, head, peerId);
        return;
      }

      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      // Read target / token from query params first, fall back to HTTP headers.
      // Mobile clients (HomeClawApp) may send these as upgrade headers (e.g.
      // x-pairing-token, x-target-peer-id, or sec-websocket-protocol).
      const hdr = (name: string): string | undefined => {
        const v = req.headers[name];
        return Array.isArray(v) ? v[0] : v;
      };
      const targetPeerId = (
        url.searchParams.get("target") ??
        hdr("x-target-peer-id") ??
        ""
      ).trim();
      if (!targetPeerId) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\nMissing target peer ID");
        socket.destroy();
        return;
      }
      const token = (
        url.searchParams.get("token") ??
        hdr("x-pairing-token") ??
        hdr("sec-websocket-protocol") ??
        ""
      ).trim();

      wss.handleUpgrade(req, socket, head, (ws) => {
        // Prefer the home tunnel if registered. Falls back to libp2p dial
        // automatically if the tunnel isn't there yet.
        homeTunnelProxy.attachMobileProxy(ws, targetPeerId, token, (fallbackWs) => {
          void handleProxyConnection(fallbackWs, targetPeerId, token);
        });
      });
    });

    const handleProxyConnection = createLibp2pClientProxyHandler({
      sharedProxyBudget,
      proxyConnByTarget,
      maxConnsPerTarget: MAX_PROXY_CONNS_PER_TARGET,
      maxEarlyBuffer: MAX_LIBP2P_PROXY_EARLY_BUFFER,
      dialProtocol: (targetPeerId, protocol) => mesh.dialProtocol(targetPeerId, protocol),
      onConnTotalChange: (total) => {
        proxyConnTotal = total;
      },
      logPrefix: "[relay]",
    });

    /**
     * Handle a direct client WebSocket connection (mobile standalone mode).
     *
     * The client sends EnvoyEnvelopes as JSON text frames. This handler routes
     * them by intent — rendezvous.register, rendezvous.query, and relay.checkin.
     * Responses are sent back as JSON on the same WebSocket.
     */
    function handleDirectClientConnection(ws: WebSocket): void {
      let peerId = "";
      directClients.set(ws, peerId);
      const maxDirectClientConnections = MAX_DIRECT_CLIENTS;
      console.log(`[relay] direct-client: connected (total=${directClients.size}/${maxDirectClientConnections})`);

      ws.on("message", (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf-8") :
            Array.isArray(raw) ? Buffer.concat(raw).toString("utf-8") : new TextDecoder().decode(new Uint8Array(raw as ArrayBuffer));
          const envelope = JSON.parse(text) as Record<string, unknown>;

          // Size guard
          if (text.length > MAX_ENVELOPE_BYTES) {
            console.warn(`[relay] direct-client: payload too large ${text.length} > ${MAX_ENVELOPE_BYTES}`);
            return;
          }

          const intent = envelope.intent as string;
          const payload = (envelope.payload as Record<string, unknown>) ?? {};

          if (
            handleWsRelayControlEnvelope({
              ws,
              envelope,
              roster: wsRelayRoster,
              relayPeerId: mesh.peerId,
              meshMultiaddrs: mesh.multiaddrs,
              advertiseAddrs: args.advertiseAddrs,
              log: (msg) => console.log(msg),
            })
          ) {
            const senderPeerId = (envelope.senderPeerId as string) ?? "";
            if (senderPeerId) {
              peerId = senderPeerId;
              directClients.set(ws, peerId);
            }
            return;
          }

          // Track peer ID from envelope
          const senderPeerId = (envelope.senderPeerId as string) ?? "";
          if (senderPeerId && peerId !== senderPeerId) {
            peerId = senderPeerId;
            directClients.set(ws, peerId);
          }

          // ---- rendezvous.register — register capabilities ----
          if (intent === "rendezvous.register") {
            if (!checkRegistrationRateLimit(senderPeerId)) {
              console.warn(`[relay] direct-client: rendezvous.register rate limited for ${senderPeerId}`);
              return;
            }
            try {
              const regPayload = parseRendezvousRegisterPayload(payload);
              if (capabilityRegistry) {
                capabilityRegistry.register(regPayload);
              }
              console.log(`[relay] direct-client: rendezvous.register from ${senderPeerId}`);
            } catch (err) {
              console.error(`[relay] direct-client: failed to parse rendezvous.register:`, err);
            }
            return;
          }

          // ---- rendezvous.query — search capabilities ----
          if (intent === "rendezvous.query") {
            const handleQuery = async () => {
              try {
                const queryPayload = parseRendezvousQueryPayload(payload);
                const matches: Array<{ peerId: string; multiaddr: string; capabilities: Array<{ tag: string }> }> = [];

                // 1. Search local rendezvous registry
                if (capabilityRegistry) {
                  const localMatches = capabilityRegistry.query(queryPayload);
                  for (const m of localMatches) {
                    matches.push({
                      peerId: m.peerId,
                      multiaddr: m.multiaddr,
                      capabilities: m.capabilities as Array<{ tag: string }>,
                    });
                  }
                }

                // 2. Search DHT for the tag (public libp2p network discovery)
                const searchTag = ("tag" in queryPayload.match) ? queryPayload.match.tag : undefined;
                if (searchTag && args.enableDht) {
                  // Search for the exact tag topic and username variant
                  const topics = [searchTag, `username:${searchTag}`];
                  for (const topic of topics) {
                    try {
                      const dhtPeers = await mesh.findCapabilityTopicProviders(topic, {
                        limit: queryPayload.maxResults ?? 10,
                        queryTimeoutMs: 3000,
                      });
                      for (const p of dhtPeers) {
                        // Skip if already in results
                        if (matches.some((m) => m.peerId === p.peerId)) continue;
                        matches.push({
                          peerId: p.peerId,
                          multiaddr: p.multiaddrs[0] ?? `/p2p/${p.peerId}`,
                          capabilities: [{ tag: topic }],
                        });
                      }
                    } catch { /* DHT search timeout or unavailable — continue */ }
                  }
                }

                const responsePayload = createRendezvousResponsePayload({ matches });
                const correlationId = (envelope.correlationId as string) ?? "";
                const response = {
                  version: "0.1",
                  messageId: randomUUID(),
                  correlationId,
                  createdAt: new Date().toISOString(),
                  senderPeerId: mesh.peerId,
                  senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
                  senderRole: "agent",
                  recipientPeerId: senderPeerId,
                  recipientRole: "agent",
                  intent: "rendezvous.response",
                  signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
                  payload: responsePayload,
                };
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify(response));
                }
                console.log(`[relay] direct-client: rendezvous.query from ${senderPeerId} → ${matches.length} matches (registry + DHT)`);
              } catch (err) {
                console.error(`[relay] direct-client: failed to handle rendezvous.query:`, err);
                try {
                  const responsePayload = createRendezvousResponsePayload({ matches: [] });
                  const response = {
                    version: "0.1",
                    messageId: randomUUID(),
                    correlationId: (envelope.correlationId as string) ?? "",
                    createdAt: new Date().toISOString(),
                    senderPeerId: mesh.peerId,
                    senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
                    senderRole: "agent",
                    recipientPeerId: senderPeerId,
                    recipientRole: "agent",
                    intent: "rendezvous.response",
                    signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
                    payload: responsePayload,
                  };
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(response));
                  }
                } catch { /* ignore */ }
              }
            };
            handleQuery();
            return;
          }
        } catch (err) {
          console.warn(`[relay] direct-client: failed to parse message:`, err);
        }
      });

      ws.on("close", () => {
        directClients.delete(ws);
        console.log(`[relay] direct-client: disconnected ${peerId ? peerId.slice(0, 12) + "..." : ""} (total=${directClients.size})`);
      });

      ws.on("error", () => {
        directClients.delete(ws);
        ws.close();
      });
    }

    httpServer.on("error", (error) => {
      recordFatalError("httpServer", error);
      console.error("[relay] HTTP info server error:", error);
    });

    httpServer.listen(args.httpPort, "0.0.0.0", () => {
      console.log(`[relay] HTTP info + WebSocket proxy listening on port ${args.httpPort}`);
    });
  }

  statsInterval = setInterval(() => {
    const relays = mesh.getConnectedRelayPeerIds();
    if (relays.length > 0) {
      console.log(`[relay] Relay connections: ${relays.length} (${relays.join(", ")})`);
    }
    if (capabilityRegistry) {
      const stats = capabilityRegistry.stats();
      console.log(
        `[relay] Registry stats: ${stats.totalEntries} entries, ${stats.tagIndexSize} tags, ${stats.typeIndexSize} types`,
      );
    }
  }, 60_000);

  /**
   * Clients use sendExpectReply — one reply is required on the same stream.
   * Always handle rendezvous intents; when storage is off, ACK with empty matches only.
   */
  mesh.onMessage(async (message) => {
    try {
      const intent = message.envelope.intent;

      // Guard: payload size limit to prevent memory exhaustion
      try {
        const payloadBytes = JSON.stringify(message.envelope.payload).length;
        if (payloadBytes > MAX_ENVELOPE_BYTES) {
          console.warn(`[relay] payload too large ${payloadBytes} > ${MAX_ENVELOPE_BYTES} bytes, dropping`);
          return;
        }
      } catch {
        console.warn(`[relay] failed to measure payload size, dropping`);
        return;
      }

      // Handle rendezvous intents
      if (intent === "rendezvous.register" || intent === "rendezvous.query") {
        const ack = async (matches: Parameters<typeof createRendezvousResponsePayload>[0]["matches"]) => {
          try {
            if (!message.replyWithEnvelope) {
              console.warn(`[relay] rendezvous ${intent}: no replyWithEnvelope (unexpected)`);
              return;
            }
            const responsePayload = createRendezvousResponsePayload({ matches });
            await message.replyWithEnvelope({
              version: "0.1",
              messageId: randomUUID(),
              createdAt: new Date().toISOString(),
              senderPeerId: mesh.peerId,
              senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
              senderRole: "agent",
              recipientPeerId: message.envelope.senderPeerId,
              recipientRole: "agent",
              intent: "rendezvous.response",
              signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
              payload: responsePayload,
            } as EnvoyEnvelope);
          } catch (ackErr) {
            console.error("[relay] Failed to send rendezvous ACK:", ackErr);
          }
        };

      if (intent === "rendezvous.register") {
        try {
          const payload = parseRendezvousRegisterPayload(message.envelope.payload);

          // Rate limit check
          if (!checkRegistrationRateLimit(message.envelope.senderPeerId)) {
            console.warn(`[relay] rendezvous.register rate limited for ${message.envelope.senderPeerId}`);
            await ack([]);
            return;
          }

          if (capabilityRegistry) {
            capabilityRegistry.register(payload);
          }
          await ack([]);
        } catch (error) {
          console.error("[relay] Failed to handle rendezvous.register:", error);
          try {
            await ack([]);
          } catch (replyErr) {
            console.error("[relay] Failed to ACK rendezvous.register:", replyErr);
          }
        }
        return;
      }

      if (intent === "rendezvous.query") {
        try {
          const queryPayload = parseRendezvousQueryPayload(message.envelope.payload);
          const matches = capabilityRegistry ? capabilityRegistry.query(queryPayload) : [];
          await ack(matches);
        } catch (error) {
          console.error("[relay] Failed to handle rendezvous.query:", error);
          try {
            await ack([]);
          } catch (replyErr) {
            console.error("[relay] Failed to ACK rendezvous.query:", replyErr);
          }
        }
      }
      return;
    }

    // Handle broadcast.request — fan out to all connected peers (except sender)
    if (intent === "broadcast.request") {
      try {
        // Deduplicate: skip if we've already processed this message ID
        if (isMessageSeen(message.envelope.messageId)) {
          return;
        }
        markMessageSeen(message.envelope.messageId);

        const payload = parseBroadcastRequestPayload(message.envelope.payload);
        const connectedPeers = mesh.getConnectedRelayPeerIds();
        const senderPeerId = message.envelope.senderPeerId;
        const targets = connectedPeers.filter((pid) => pid !== senderPeerId);

        // Guard: limit fan-out targets to prevent resource exhaustion
        if (targets.length > MAX_FANOUT_TARGETS) {
          console.warn(
            `[relay] broadcast.request queryId=${payload.queryId}: too many targets ${targets.length} > ${MAX_FANOUT_TARGETS}, truncating`,
          );
          targets.length = MAX_FANOUT_TARGETS;
        }

        if (targets.length === 0) {
          console.log(`[relay] broadcast.request queryId=${payload.queryId}: no peers to fan out to`);
          return;
        }

        // Decrement TTL before forwarding
        const nextTtl = payload.ttl - 1;
        if (nextTtl < 0) {
          console.log(`[relay] broadcast.request queryId=${payload.queryId}: TTL expired, not forwarding`);
          return;
        }

        const forwardEnvelope: EnvoyEnvelope = {
          ...message.envelope,
          messageId: randomUUID(),
          recipientPeerId: undefined,
          payload: { ...payload, ttl: nextTtl },
        } as EnvoyEnvelope;

        // Fan out with bounded concurrency
        let delivered = 0;
        const CONCURRENCY_LIMIT = 50;
        for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
          const batch = targets.slice(i, i + CONCURRENCY_LIMIT);
          await Promise.allSettled(
            batch.map(async (targetPeer) => {
              try {
                await mesh.send(targetPeer, forwardEnvelope);
                delivered++;
              } catch (err) {
                console.warn(`[relay] broadcast.request fanout to ${targetPeer}: ${err}`);
              }
            }),
          );
        }
        console.log(
          `[relay] broadcast.request queryId=${payload.queryId} ttl=${payload.ttl}→${nextTtl}: delivered to ${delivered}/${targets.length} peers`,
        );
      } catch (error) {
        console.error("[relay] Failed to handle broadcast.request:", error);
      }
      return;
    }

    // Handle broadcast.cancel — log and silently ignore (relay doesn't track state)
    if (intent === "broadcast.cancel") {
      try {
        const payload = parseBroadcastCancelPayload(message.envelope.payload);
        console.log(`[relay] broadcast.cancel queryId=${payload.queryId} reason=${payload.reason}`);
      } catch (error) {
        console.error("[relay] Failed to handle broadcast.cancel:", error);
      }
      return;
    }

    // Handle task.cancel — fan out to forwardToPeerIds (if hops remain)
    // NOTE: We do NOT modify relayRemainingHops or forwardToPeerIds in the payload.
    // The signature covers the original payload, so we must not modify it.
    // Recipients verify using the ORIGINAL sender's signature (relay is just transport).
    if (intent === "task.cancel") {
      try {
        // Deduplicate: skip if we've already processed this message ID
        if (isMessageSeen(message.envelope.messageId)) {
          return;
        }
        markMessageSeen(message.envelope.messageId);

        const payload = parseTaskCancelPayload(message.envelope.payload);
        const hops = payload.relayRemainingHops ?? 0;
        const allForwards = payload.forwardToPeerIds ?? [];

        if (allForwards.length === 0 || hops <= 0) {
          return;
        }

        // Filter out sender from forward list (don't send cancel back to originator)
        const senderPeerId = message.envelope.senderPeerId;
        const forwards = allForwards.filter((pid) => pid !== senderPeerId);

        // Guard: limit forward targets to prevent resource exhaustion
        if (forwards.length > MAX_FORWARD_TARGETS) {
          console.warn(
            `[relay] task.cancel taskId=${payload.taskId}: too many forwards ${forwards.length} > ${MAX_FORWARD_TARGETS}, truncating`,
          );
          forwards.length = MAX_FORWARD_TARGETS;
        }

        if (forwards.length === 0) {
          return;
        }

        // Decrement hops for next relay, but keep original payload intact for signature
        const nextHops = hops - 1;

        // Fan out with bounded concurrency
        let delivered = 0;
        const CONCURRENCY_LIMIT = 50;
        for (let i = 0; i < forwards.length; i += CONCURRENCY_LIMIT) {
          const batch = forwards.slice(i, i + CONCURRENCY_LIMIT);
          await Promise.allSettled(
            batch.map(async (targetPeer) => {
              try {
                const forwardEnvelope: EnvoyEnvelope = {
                  ...message.envelope,
                  messageId: randomUUID(),
                  recipientPeerId: targetPeer,
                  // Keep original payload — signature must remain valid!
                } as EnvoyEnvelope;
                await mesh.send(targetPeer, forwardEnvelope);
                delivered++;
              } catch (err) {
                console.warn(`[relay] task.cancel fanout to ${targetPeer}: ${err}`);
              }
            }),
          );
        }
        console.log(
          `[relay] task.cancel taskId=${payload.taskId} hops=${hops}→${nextHops}: delivered to ${delivered}/${forwards.length} peers`,
        );
      } catch (error) {
        console.error("[relay] Failed to handle task.cancel:", error);
      }
      return;
    }
    } catch (error) {
      // Guard: catch-all for any unexpected errors in message handling
      console.error("[relay] Unexpected error in message handler:", error);
    }
  });

  startEventLoopLagMonitor();
  await runRelayHealthCycle("startup");
  startRelayHealthWatchdog();
} catch (error) {
  console.error(`[relay] Failed to start:`, error);
  process.exit(1);
}
