/**
 * EnvoyMesh Standalone Relay Server
 *
 * A minimal P2P circuit relay server with no application logic.
 * Handles only relay traffic routing between peers.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { EnvoyMesh } from "@envoymesh/network";
import { DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME } from "@envoymesh/network";
import { join } from "path";
import { mkdirSync } from "fs";
import { parseRelayArgs } from "./args.js";

const args = parseRelayArgs(process.argv.slice(2));

// Ensure profile directory exists
mkdirSync(args.profileDir, { recursive: true });

const libp2pPrivateKeyPath = join(args.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME);

console.log(`[relay] Starting EnvoyMesh Relay Server`);
console.log(`[relay] Profile: ${args.profileDir}`);
console.log(`[relay] Listen: ${args.listen.join(", ")}`);
console.log(`[relay] DHT: ${args.enableDht ? (args.dhtClientMode ? "client mode" : "server mode") : "disabled"}`);
if (args.httpPort) {
  console.log(`[relay] HTTP info endpoint: enabled (port ${args.httpPort})`);
} else {
  console.log(`[relay] HTTP info endpoint: disabled`);
}

// Create minimal EnvoyMesh for relay-only operation
const mesh = new EnvoyMesh({
  listen: args.listen,
  // Relay server - core functionality
  enableRelayServer: true,
  // Enable relay client functionality so this relay can connect to other relays
  enableRelay: true,
  // AutoNAT for NAT traversal detection
  enableAutoNat: true,
  // DCUtR for NAT hole punching
  enableDcutr: true,
  // DHT for peer discovery (important for relay to find other relays)
  enableDht: args.enableDht,
  dhtClientMode: args.dhtClientMode,
  // Bootstrap peers for discovery
  bootstrapPeers: args.bootstrapPeers,
  // Persistent key for stable peer ID
  libp2pPrivateKeyPath,
});

let started = false;
let httpServer: ReturnType<typeof createServer> | null = null;

async function shutdown(): Promise<void> {
  console.log("[relay] Shutting down...");
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

try {
  await mesh.start();
  started = true;

  const listenAddrs = mesh.multiaddrs;
  console.log(`[relay] Relay server started.`);
  console.log(`[relay] Listen addresses: ${listenAddrs.join(", ")}`);
  console.log(`[relay] Peer ID: ${mesh.peerId}`);
  console.log(`[relay] Ready to accept relay connections.`);

  // Start HTTP info endpoint if configured
  if (args.httpPort) {
    httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/info") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          peerId: mesh.peerId,
          addrs: mesh.multiaddrs,
        }));
      } else if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    httpServer.listen(args.httpPort, "0.0.0.0", () => {
      console.log(`[relay] HTTP info server listening on port ${args.httpPort}`);
    });
  }

  // Log connected peers periodically
  setInterval(() => {
    const relayPeers = mesh.getConnectedRelayPeerIds();
    if (relayPeers.length > 0) {
      console.log(`[relay] Relay connections: ${relayPeers.length} (${relayPeers.join(", ")})`);
    }
  }, 60_000);

} catch (error) {
  console.error(`[relay] Failed to start:`, error);
  process.exit(1);
}