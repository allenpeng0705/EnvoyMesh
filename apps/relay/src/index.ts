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
import { byteStream } from "@libp2p/utils";
import { CapabilityRegistry, CLIENT_PROXY_PROTOCOL, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME, EnvoyMesh } from "@envoymesh/network";
import { parseRelayArgs } from "./args.js";
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

const libp2pPrivateKeyPath = join(args.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME);

// Maximum payload size to prevent memory exhaustion (1MB)
const MAX_ENVELOPE_BYTES = 1 * 1024 * 1024;

// Maximum fan-out targets to prevent resource exhaustion
const MAX_FANOUT_TARGETS = 500;

// Maximum forward targets for task.cancel
const MAX_FORWARD_TARGETS = 100;

// Maximum concurrent client-proxy connections (mobile → relay → home node)
const MAX_PROXY_CONNECTIONS = 50;
const MAX_PROXY_CONNS_PER_TARGET = 10;

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
  libp2pPrivateKeyPath,
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
    const now = Date.now();
    let oldest: string | null = null;
    let oldestExpiry = Infinity;
    for (const [id, entry] of peerRegistrationCount) {
      if (entry.resetAt < now && entry.resetAt < oldestExpiry) {
        oldest = id;
        oldestExpiry = entry.resetAt;
      }
    }
    if (oldest) {
      peerRegistrationCount.delete(oldest);
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
const seenMessageIds = new Set<string>();
const MAX_SEEN_MESSAGE_IDS = 100_000;

function isMessageSeen(messageId: string): boolean {
  // Guard against invalid input
  if (!messageId || typeof messageId !== "string") {
    return true; // Treat invalid IDs as "seen" to reject them
  }
  return seenMessageIds.has(messageId);
}

function markMessageSeen(messageId: string): void {
  // Guard against invalid input
  if (!messageId || typeof messageId !== "string") {
    return;
  }

  // Evict oldest entries if we're at capacity
  if (seenMessageIds.size >= MAX_SEEN_MESSAGE_IDS) {
    // Remove oldest 10% to avoid frequent eviction
    const targetSize = Math.floor(MAX_SEEN_MESSAGE_IDS * 0.1);
    let removed = 0;
    for (const id of seenMessageIds) {
      if (removed >= targetSize) break;
      seenMessageIds.delete(id);
      removed++;
    }
  }
  seenMessageIds.add(messageId);
}

// ============================================================================
// PERIODIC CLEANUP: Rate limit map
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

    // WebSocket proxy for mobile client connections (Phase 10A relay bridge)
    const wss = new WebSocketServer({ noServer: true });
    const proxyConnByTarget = new Map<string, Set<WebSocket>>();
    let proxyConnTotal = 0;

    httpServer.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
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
        void handleProxyConnection(ws, targetPeerId, token);
      });
    });

    async function handleProxyConnection(ws: WebSocket, targetPeerId: string, token: string): Promise<void> {
      // Rate limit
      if (proxyConnTotal >= MAX_PROXY_CONNECTIONS) {
        console.warn(`[relay] client-proxy: rejected — max total connections ${MAX_PROXY_CONNECTIONS}`);
        ws.close(1013, "relay proxy connections full");
        return;
      }
      const targetSet = proxyConnByTarget.get(targetPeerId);
      if (targetSet && targetSet.size >= MAX_PROXY_CONNS_PER_TARGET) {
        console.warn(`[relay] client-proxy: rejected — max connections per target ${MAX_PROXY_CONNS_PER_TARGET}`);
        ws.close(1013, "too many connections to target");
        return;
      }

      proxyConnTotal++;
      const conns = proxyConnByTarget.get(targetPeerId) ?? new Set();
      conns.add(ws);
      proxyConnByTarget.set(targetPeerId, conns);
      console.log(`[relay] client-proxy: connecting to ${targetPeerId.slice(0, 12)}… (total=${proxyConnTotal})`);

      let libp2pStream: any = null;

      try {
        libp2pStream = await mesh.dialProtocol(targetPeerId, CLIENT_PROXY_PROTOCOL);
        const streamIo = byteStream(libp2pStream);

        // Send handshake with pairing token
        const handshake = JSON.stringify({ type: "proxy-connect", token });
        await streamIo.write(new TextEncoder().encode(handshake));

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

        // Bridge: WebSocket → libp2p stream
        // Mobile clients may send text frames (JSON-RPC strings) or binary frames.
        ws.on("message", async (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
          try {
            let bytes: Uint8Array;
            if (typeof raw === "string") {
              bytes = new TextEncoder().encode(raw);
            } else if (raw instanceof Uint8Array) {
              bytes = raw;
            } else if (Array.isArray(raw)) {
              bytes = new Uint8Array(Buffer.concat(raw));
            } else {
              bytes = new Uint8Array(raw as ArrayBuffer);
            }
            await streamIo.write(bytes);
          } catch (err) {
            console.error("[relay] client-proxy: write error:", err);
            ws.close();
          }
        });

        // Bridge: libp2p stream → WebSocket (send as text frames — mobile client expects text)
        void (async () => {
          const decoder = new TextDecoder();
          try {
            while (ws.readyState === WebSocket.OPEN) {
              const bytes = await streamIo.read();
              if (!bytes) {
                ws.close();
                break;
              }
              ws.send(decoder.decode(bytes.subarray()));
            }
          } catch (err) {
            // stream closed — clean up
          }
        })();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[relay] client-proxy: failed to connect to ${targetPeerId.slice(0, 12)}…: ${msg}`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1011, "unable to reach home node");
        }
      }

      ws.on("close", () => {
        proxyConnTotal--;
        const s = proxyConnByTarget.get(targetPeerId);
        if (s) {
          s.delete(ws);
          if (s.size === 0) proxyConnByTarget.delete(targetPeerId);
        }
        if (libp2pStream) {
          try { libp2pStream.close(); } catch { /* ignore */ }
        }
        console.log(`[relay] client-proxy: disconnected from ${targetPeerId.slice(0, 12)}… (total=${proxyConnTotal})`);
      });

      ws.on("error", () => {
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
