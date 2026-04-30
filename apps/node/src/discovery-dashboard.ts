#!/usr/bin/env node
import { loadOrCreateNodeProfile } from "@envoymesh/local-store";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import { EnvoyMesh, type DiscoveredMeshPeer } from "@envoymesh/network";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { parseNodeArgs, printHelp } from "./args.js";

const CLEAR = "\x1b[2J\x1b[H";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function color(badge: "ok" | "warn" | "start" | "err"): string {
  switch (badge) {
    case "ok": return GREEN;
    case "warn": return YELLOW;
    case "start": return CYAN;
    case "err": return RED;
  }
}

interface PeerInfo {
  peerId: string;
  addrs: string[];
  discoveredAt: number;
  relayed: boolean;
}

function parseArgs(argv: string[]): {
  profileDir: string;
  discoveryProfile: "lan-fast" | "wan-default";
  bootstrapPeers: string[];
  enableMdns: boolean;
  enableDht: boolean;
  enableRelay: boolean;
  enableAutoNat: boolean;
  enableDcutr: boolean;
  p2pDebug: boolean;
  autoRelayPeersQuery: boolean;
} {
  const nodeArgs = parseNodeArgs(argv);

  return {
    profileDir: nodeArgs.profileDir,
    discoveryProfile: nodeArgs.discoveryProfile,
    bootstrapPeers: nodeArgs.bootstrapPeers,
    enableMdns: nodeArgs.enableMdns,
    enableDht: nodeArgs.enableDht,
    enableRelay: nodeArgs.enableRelay,
    enableAutoNat: nodeArgs.enableAutoNat,
    enableDcutr: nodeArgs.enableDcutr,
    p2pDebug: nodeArgs.p2pDebug,
    autoRelayPeersQuery: argv.includes("--auto-relay-peers-query"),
  };
}

async function main(argv: string[]): Promise<void> {
  const helpArg = argv.includes("--help") || argv.includes("-h");
  if (helpArg) {
    console.log(`EnvoyMesh Discovery Dashboard

Usage:
  npm run discovery:dashboard -- [options]

Options:
  --profile <dir>              Profile directory. Default: ./data/default
  --discovery-profile <p>     Discovery mode: lan-fast|wan-default. Default: lan-fast
  --bootstrap <multiaddr>      Add bootstrap peer. Repeatable.
  --bootstrap-preset <preset>  Use bootstrap preset (public-libp2p, public-libp2p-am6, public-libp2p-am7)
  --no-mdns                    Disable mDNS discovery
  --p2p-debug                  Enable P2P debug tracing

Examples:
  # LAN mDNS discovery (same network)
  npm run discovery:dashboard -- --profile ~/envoymesh/mac_node

  # WAN discovery with bootstrap
  npm run discovery:dashboard -- --profile ~/envoymesh/mac_wan --discovery-profile wan-default --bootstrap-preset public-libp2p

  # Windows
  npm run discovery:dashboard -- --profile "%USERPROFILE%\\envoymesh\\win_node"

  # Cross-network with explicit bootstrap
  npm run discovery:dashboard -- --discovery-profile wan-default --bootstrap "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN"
`);
    return;
  }

  const args = parseArgs(argv);
  const profile = await loadOrCreateNodeProfile(args.profileDir);

  const peers = new Map<string, PeerInfo>();
  let relayCount = 0;
  let lastEventAt = Date.now();
  let startedAt = Date.now();

  const mesh = new EnvoyMesh({
    listen: ["/ip4/0.0.0.0/tcp/0"],
    enableMdns: args.enableMdns,
    enableDht: args.enableDht,
    dhtClientMode: args.discoveryProfile === "wan-default" ? true : undefined,
    bootstrapPeers: args.bootstrapPeers,
    enableRelay: args.enableRelay || args.discoveryProfile === "wan-default",
    enableAutoNat: args.enableAutoNat || args.discoveryProfile === "wan-default",
    enableDcutr: args.enableDcutr || args.discoveryProfile === "wan-default",
    enableP2pDebug: args.p2pDebug,
    onP2pDebug: (event) => {
      // Suppress debug output to keep dashboard clean
    },
  });

  mesh.onPeerDiscovered((peer: DiscoveredMeshPeer) => {
    const isRelayed = peer.multiaddrs.some((a) => a.includes("/p2p-circuit"));
    peers.set(peer.peerId, {
      peerId: peer.peerId,
      addrs: peer.multiaddrs.map((a) => a.toString()),
      discoveredAt: Date.now(),
      relayed: isRelayed,
    });
    if (isRelayed) relayCount++;
    lastEventAt = Date.now();
  });

  // Handle relay.peers.response - add peers from relay query
  mesh.onMessage(async ({ envelope }) => {
    if (envelope.intent === "relay.peers.response") {
      const { parseRelayPeersResponsePayload } = await import("@envoymesh/protocol");
      const payload = parseRelayPeersResponsePayload(envelope.payload);
      console.log(`[auto-relay-query] received relay.peers.response with ${payload.peers.length} peers`);
      for (const relayPeer of payload.peers) {
        peers.set(relayPeer.peerId, {
          peerId: relayPeer.peerId,
          addrs: relayPeer.multiaddrs,
          discoveredAt: Date.now(),
          relayed: true, // These are relay-discovered peers
        });
        relayCount++;
        lastEventAt = Date.now();
      }
    }
  });

  await mesh.start();
  startedAt = Date.now();

  const selfMultiaddrs = mesh.multiaddrs.map((a) => a.toString());
  const hasRelay = selfMultiaddrs.some((a) => a.includes("/p2p-circuit"));
  const hasDht = args.enableDht;

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    process.stdout.write("\n");
    mesh.stop().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    process.stdout.write("\n");
    mesh.stop().then(() => process.exit(0));
  });

  // Initial render
  renderDashboard({ mesh, peers, relayCount, lastEventAt, startedAt, selfMultiaddrs, hasRelay, hasDht, args });

  // Make explicit circuit relay connections to bootstrap peers
  // This ensures we have relay reservations and can discover peers via relay.peers.request
  if (args.enableRelay && args.bootstrapPeers.length > 0) {
    setTimeout(async () => {
      console.log(`[relay-dial] starting relay dial attempts...`);
      for (const bootstrapPeer of args.bootstrapPeers) {
        try {
          // Transform /ip4/x/tcp/y/p2p/PEERID to /ip4/x/tcp/y/p2p-circuit/p2p/PEERID
          const circuitAddr = bootstrapPeer.replace("/p2p/", "/p2p-circuit/p2p/");
          console.log(`[relay-dial] dialing circuit address: ${circuitAddr}`);
          const conn = await mesh.dial(circuitAddr);
          console.log(`[relay-dial] successfully connected via circuit relay: ${conn}`);
        } catch (err: any) {
          console.error(`[relay-dial] failed: ${err?.message ?? err}`);
        }
      }
    }, 5000); // Wait 5 seconds for initial bootstrap to complete
  }

  // Auto query relay for peers if enabled
  if (args.autoRelayPeersQuery && args.bootstrapPeers.length > 0) {
    setInterval(async () => {
      for (const bootstrapPeer of args.bootstrapPeers) {
        try {
          console.log(`[auto-relay-query] attempting to send relay.peers.request to ${bootstrapPeer}`);
          const unsignedEnvelope = createUnsignedEnvelope({
            senderPeerId: mesh.peerId,
            senderPublicKey: profile.device.publicKeyPem,
            senderRole: "system",
            recipientPeerId: bootstrapPeer.startsWith("/") ? bootstrapPeer : undefined,
            intent: "relay.peers.request",
            payload: {},
          });
          const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, profile.device.privateKeyPem);
          await mesh.send(bootstrapPeer, signedEnvelope);
          console.log(`[auto-relay-query] sent relay.peers.request to ${bootstrapPeer}`);
        } catch (err) {
          console.log(`[auto-relay-query] ERROR: ${err}`);
        }
      }
    }, 10_000); // Query every 10 seconds
  }

  // Update every 2 seconds
  const interval = setInterval(() => {
    renderDashboard({ mesh, peers, relayCount, lastEventAt, startedAt, selfMultiaddrs, hasRelay, hasDht, args });
  }, 2000);

  // Keep process alive
  await new Promise(() => {});
}

function renderDashboard(ctx: {
  mesh: EnvoyMesh;
  peers: Map<string, PeerInfo>;
  relayCount: number;
  lastEventAt: number;
  startedAt: number;
  selfMultiaddrs: string[];
  hasRelay: boolean;
  hasDht: boolean;
  args: ReturnType<typeof parseArgs>;
}): void {
  const peerList = Array.from(ctx.peers.values());
  const upSec = Math.floor((Date.now() - ctx.startedAt) / 1000);
  const idleSec = Math.floor((Date.now() - ctx.lastEventAt) / 1000);

  const peerBadge = peerList.length === 0
    ? { text: "0", cls: "start" as const }
    : { text: String(peerList.length), cls: "ok" as const };

  const relayBadge = ctx.hasRelay
    ? { text: "YES", cls: "ok" as const }
    : { text: "NO", cls: "warn" as const };

  const dhtBadge = ctx.hasDht
    ? { text: "ON", cls: "ok" as const }
    : { text: "OFF", cls: "warn" as const };

  const statusBadge = peerList.length === 0 && idleSec > 30
    ? { text: "SEARCHING", cls: "start" as const }
    : peerList.length > 0
      ? { text: "CONNECTED", cls: "ok" as const }
      : { text: "STARTING", cls: "start" as const };

  const lines: string[] = [];

  lines.push(CLEAR);
  lines.push(`${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════╗${RESET}`);
  lines.push(`${BOLD}${CYAN}║          EnvoyMesh Discovery Dashboard                         ║${RESET}`);
  lines.push(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════╝${RESET}`);
  lines.push("");
  lines.push(`  ${BOLD}Status:${RESET}    ${color(statusBadge.cls)}${BOLD}[${statusBadge.text}]${RESET}${RESET}  ${DIM}(updated ${idleSec}s ago)${RESET}`);
  lines.push(`  ${BOLD}Uptime:${RESET}    ${upSec}s`);
  lines.push("");
  lines.push(`  ${BOLD}Discovery:${RESET}  ${dhtBadge.cls === "ok" ? GREEN : YELLOW}[DHT ${dhtBadge.text}]${RESET}  ${ctx.args.enableMdns ? GREEN : DIM}[mDNS]${RESET}`);
  lines.push(`  ${BOLD}Relay:${RESET}     ${relayBadge.cls === "ok" ? GREEN : YELLOW}[${relayBadge.text}]${RESET}  ${BOLD}Peers:${RESET} ${peerBadge.cls === "ok" ? GREEN : CYAN}[${peerBadge.text}]${RESET}`);
  lines.push("");
  lines.push(`${BOLD}  My PeerID:${RESET} ${GREEN}${ctx.mesh.peerId}${RESET}`);
  lines.push(`${BOLD}  Listen:${RESET}`);

  for (const addr of ctx.selfMultiaddrs.slice(0, 4)) {
    lines.push(`    ${DIM}${addr}${RESET}`);
  }
  if (ctx.selfMultiaddrs.length > 4) {
    lines.push(`    ${DIM}... and ${ctx.selfMultiaddrs.length - 4} more${RESET}`);
  }

  lines.push("");
  lines.push(`${BOLD}  Discovered Peers (${peerList.length}):${RESET}`);

  if (peerList.length === 0) {
    lines.push(`    ${DIM}Waiting for peers...${RESET}`);
  } else {
    for (const peer of peerList.slice(0, 10)) {
      const relayTag = peer.relayed ? ` ${YELLOW}[relay]${RESET}` : "";
      const age = Math.floor((Date.now() - peer.discoveredAt) / 1000);
      lines.push(`    ${GREEN}●${RESET} ${peer.peerId.slice(0, 16)}...${relayTag} ${DIM}(${age}s ago)${RESET}`);
    }
    if (peerList.length > 10) {
      lines.push(`    ${DIM}... and ${peerList.length - 10} more${RESET}`);
    }
  }

  lines.push("");
  lines.push(`${DIM}  Press Ctrl+C to stop${RESET}`);

  process.stdout.write(lines.join("\n") + "\n");
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});