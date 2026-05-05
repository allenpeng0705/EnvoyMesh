/**
 * EnvoyMesh Standalone Relay Server
 *
 * A minimal P2P circuit relay server with optional rendezvous capability registry.
 * Handles relay traffic routing between peers and optionally registers peer capabilities.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "node:crypto";
import { CapabilityRegistry, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME, EnvoyMesh } from "@envoymesh/network";
import { parseRelayArgs } from "./args.js";
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

async function shutdown(): Promise<void> {
  console.log("[relay] Shutting down...");
  if (rendezvousSweeper) {
    clearInterval(rendezvousSweeper);
    rendezvousSweeper = undefined;
  }
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = undefined;
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
          }),
        );
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
    const intent = message.envelope.intent;
    if (intent !== "rendezvous.register" && intent !== "rendezvous.query") {
      return;
    }

    const ack = async (matches: Parameters<typeof createRendezvousResponsePayload>[0]["matches"]) => {
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
  });
} catch (error) {
  console.error(`[relay] Failed to start:`, error);
  process.exit(1);
}
