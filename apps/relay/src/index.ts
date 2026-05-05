/**
 * EnvoyMesh Standalone Relay Server
 *
 * A minimal P2P circuit relay server with optional rendezvous capability registry.
 * Handles relay traffic routing between peers and optionally registers peer capabilities.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { EnvoyMesh } from "@envoymesh/network";
import { DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME } from "@envoymesh/network";
import { join } from "path";
import { mkdirSync } from "fs";
import { randomUUID } from "node:crypto";
import { parseRelayArgs } from "./args.js";
import { CapabilityRegistry } from "./capability-registry.js";
import {
  parseRendezvousRegisterPayload,
  parseRendezvousQueryPayload,
  createRendezvousResponsePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";

const args = parseRelayArgs(process.argv.slice(2));

// Ensure profile directory exists
mkdirSync(args.profileDir, { recursive: true });

const libp2pPrivateKeyPath = join(args.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME);

console.log(`[relay] Starting EnvoyMesh Relay Server`);
console.log(`[relay] Profile: ${args.profileDir}`);
console.log(`[relay] Listen: ${args.listen.join(", ")}`);
console.log(`[relay] DHT: ${args.enableDht ? (args.dhtClientMode ? "client mode" : "server mode") : "disabled"}`);
console.log(`[relay] Rendezvous: ${args.enableRendezvous ? "enabled" : "disabled"}`);
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
    const relays = mesh.getConnectedRelayPeerIds();
    if (relays.length > 0) {
      console.log(`[relay] Relay connections: ${relays.length} (${relays.join(", ")})`);
    }
    if (capabilityRegistry) {
      const stats = capabilityRegistry.stats();
      console.log(`[relay] Registry stats: ${stats.totalEntries} entries, ${stats.tagIndexSize} tags, ${stats.typeIndexSize} types`);
    }
  }, 60_000);

  // Start rendezvous capability registry if enabled
  let capabilityRegistry: CapabilityRegistry | undefined;
  if (args.enableRendezvous) {
    capabilityRegistry = new CapabilityRegistry();
    capabilityRegistry.startSweeper();

    // Register message handler for rendezvous intents
    mesh.onMessage(async (message) => {
      const intent = message.envelope.intent;

      /** Clients use sendExpectReply — they block until one reply is written on the same stream. */
      const ackRegister = async (matches: Parameters<typeof createRendezvousResponsePayload>[0]["matches"]) => {
        if (!message.replyWithEnvelope) {
          return;
        }
        const responsePayload = createRendezvousResponsePayload({ matches });
        await message.replyWithEnvelope({
          version: "0.1",
          messageId: randomUUID(),
          createdAt: new Date().toISOString(),
          senderPeerId: mesh.peerId,
          senderPublicKey: "",
          senderRole: "agent",
          recipientPeerId: message.envelope.senderPeerId,
          recipientRole: "agent",
          intent: "rendezvous.response",
          signature: "",
          payload: responsePayload,
        } as EnvoyEnvelope);
      };

      if (intent === "rendezvous.register") {
        try {
          const payload = parseRendezvousRegisterPayload(message.envelope.payload);
          capabilityRegistry!.register(payload);
          console.log(`[relay] Registered capabilities for ${payload.peerId}`);
          await ackRegister([]);
        } catch (error) {
          console.error("[relay] Failed to parse rendezvous.register:", error);
          try {
            await ackRegister([]);
          } catch (replyErr) {
            console.error("[relay] Failed to ACK rendezvous.register:", replyErr);
          }
        }
      } else if (intent === "rendezvous.query") {
        try {
          const queryPayload = parseRendezvousQueryPayload(message.envelope.payload);
          const matches = capabilityRegistry!.query(queryPayload);
          await ackRegister(matches);
        } catch (error) {
          console.error("[relay] Failed to parse rendezvous.query:", error);
          try {
            await ackRegister([]);
          } catch (replyErr) {
            console.error("[relay] Failed to ACK rendezvous.query:", replyErr);
          }
        }
      }
    });

    console.log("[relay] Rendezvous capability registry enabled");
  }

} catch (error) {
  console.error(`[relay] Failed to start:`, error);
  process.exit(1);
}